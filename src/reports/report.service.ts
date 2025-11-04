import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ReportUserDto, ReportType } from './dto/report-user.dto';
import { ReportPriority } from './enums/report-priority.enum';
import { ResolvedFilterEnum } from './enums/resolved-filter.enum';
import { ConfigService } from '@nestjs/config';
import {
  Password,
  PasswordDocument,
} from '../passwords/schemas/password.schema';
import { PublicAddressesService } from '../public-addresses/public-addresses.service';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../public-addresses/schemas/public-address.schema';
import { UserFinderUtil } from '../utils/user-finder.util';
import { AddressDetectorUtil } from '../utils/address-detector.util';
import { Types } from 'mongoose';
import { TelegramService } from '../telegram/telegram.service';
import {
  NotificationsService,
  NotificationLogData,
} from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { LoggerService } from '../logger/logger.service';
import { LogEvent } from '../logger/dto/log-event.enum';

@Injectable()
export class ReportService {
  private readonly maxReportsBeforeBan: number;
  private readonly maxPercentageOfReportsRequiredForBan: number;

  constructor(
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Password.name)
    private passwordModel: Model<PasswordDocument>,
    @InjectModel(PublicAddress.name)
    private publicAddressModel: Model<PublicAddressDocument>,
    private configService: ConfigService,
    private publicAddressesService: PublicAddressesService,
    private telegramService: TelegramService,
    private notificationsService: NotificationsService,
    private loggerService: LoggerService,
  ) {
    // Get the maximum number of reports before ban from environment variables
    // Default to 10 if not specified
    this.maxReportsBeforeBan = parseInt(
      this.configService.get<string>('MAX_REPORTS_BEFORE_BAN', '10'),
      10,
    );

    // Get the maximum percentage of reports required for ban from environment variables
    // Default to 0.5 (50%) if not specified
    this.maxPercentageOfReportsRequiredForBan = parseFloat(
      this.configService.get<string>(
        'MAX_PERCENTAGE_OF_REPORTS_REQUIRED_FOR_BAN',
        '0.5',
      ),
    );
  }

  /**
   * Report a user for inappropriate behavior
   * Only allows reporting users who have shared their passwords with the reporter
   * @param reporterUserId The userId of the user making the report
   * @param reportData The report data containing reported username, secret_id, report_type and optional reason
   * @returns The created report
   */
  async reportUser(
    reporterUserId: string,
    reportData: ReportUserDto,
  ): Promise<Report> {
    try {
      // Find reporter by userId
      const reporter = await this.userModel.findOne({
        _id: reporterUserId,
        isActive: true,
      });

      if (!reporter) {
        throw new HttpException('Reporter not found', HttpStatus.NOT_FOUND);
      }

      // Validate the secret_id (password) exists and is active
      const password = await this.passwordModel.findOne({
        _id: reportData.secret_id,
        isActive: true,
      });
      if (!password) {
        throw new HttpException(
          'Password not found or inactive',
          HttpStatus.NOT_FOUND,
        );
      }

      // Get the owner of the password
      const passwordOwner = await this.userModel.findOne({
        _id: password.userId,
        isActive: true,
      });
      if (!passwordOwner) {
        throw new HttpException(
          'Password owner not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // Find reported user using the new flexible user field
      // First, determine what type of identifier was provided
      const userIdentifier = reportData.user.trim();
      let reportedUser: UserDocument | null = null;

      // Detect identifier type and search accordingly
      if (Types.ObjectId.isValid(userIdentifier)) {
        // It's a valid ObjectId (userId)
        const userInfo = await UserFinderUtil.findUserByAnyInfo(
          { userId: userIdentifier },
          this.userModel,
          this.publicAddressModel,
        );
        if (userInfo) {
          reportedUser = await this.userModel.findOne({
            _id: userInfo.userId,
            isActive: true,
          });
        }
      } else if (AddressDetectorUtil.isPublicAddress(userIdentifier)) {
        // It's a public address
        const userInfo = await UserFinderUtil.findUserByAnyInfo(
          { publicAddress: userIdentifier },
          this.userModel,
          this.publicAddressModel,
        );
        if (userInfo) {
          reportedUser = await this.userModel.findOne({
            _id: userInfo.userId,
            isActive: true,
          });
        }
      } else {
        // It's a username
        const userInfo = await UserFinderUtil.findUserByAnyInfo(
          { username: userIdentifier },
          this.userModel,
          this.publicAddressModel,
        );
        if (userInfo) {
          reportedUser = await this.userModel.findOne({
            _id: userInfo.userId,
            isActive: true,
          });
        }
      }

      if (!reportedUser) {
        throw new HttpException(
          'Reported user not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // Verify that the reported user is the owner of the password
      if (reportedUser._id.toString() !== passwordOwner._id.toString()) {
        throw new HttpException(
          'The reported user is not the owner of the specified secret',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Prevent self-reporting - compare user IDs instead of telegram IDs
      if (reporter._id.toString() === reportedUser._id.toString()) {
        throw new HttpException(
          'You cannot report yourself',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Verify that the password has been shared with the reporter
      const isPasswordSharedWithReporter =
        password.sharedWith &&
        password.sharedWith.some(
          (shared) =>
            shared.username.toLowerCase() === reporter.username.toLowerCase(),
        );

      if (!isPasswordSharedWithReporter) {
        throw new HttpException(
          'You can only report secrets that have been shared with you',
          HttpStatus.FORBIDDEN,
        );
      }

      // Check if this user has already reported the same password
      const existingReport = await this.reportModel.findOne({
        'reporterInfo.userId': reporter._id.toString(),
        secret_id: reportData.secret_id,
        resolved: false,
      });

      if (existingReport) {
        throw new HttpException(
          'You have already reported this secret',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Handle reason field based on report_type
      let finalReason: string | null = null;

      // For OTHER type, reason is required
      if (reportData.report_type === ReportType.OTHER) {
        if (!reportData.reason || reportData.reason.trim() === '') {
          throw new HttpException(
            'Reason is required when report type is Other',
            HttpStatus.BAD_REQUEST,
          );
        }
        finalReason = reportData.reason.trim();
      } else {
        // For all other types, reason is optional but if provided, save it
        if (reportData.reason && reportData.reason.trim() !== '') {
          finalReason = reportData.reason.trim();
        }
      }

      // Get reporter's latest public address
      let reporterLatestPublicAddress: string | undefined;
      try {
        if (reporter.telegramId) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByTelegramId(
              reporter.telegramId,
            );
          if (addressResponse.success && addressResponse.data) {
            reporterLatestPublicAddress = addressResponse.data.publicKey;
          }
        }

        // If no address found by telegramId, try by userId
        if (!reporterLatestPublicAddress) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByUserId(
              reporter._id.toString(),
            );
          if (addressResponse.success && addressResponse.data) {
            reporterLatestPublicAddress = addressResponse.data.publicKey;
          }
        }
      } catch (error) {
        // If no address found, reporterLatestPublicAddress remains undefined
        reporterLatestPublicAddress = undefined;
      }

      // Get reported user's latest public address
      let reportedUserLatestPublicAddress: string | undefined;
      try {
        if (reportedUser.telegramId) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByTelegramId(
              reportedUser.telegramId,
            );
          if (addressResponse.success && addressResponse.data) {
            reportedUserLatestPublicAddress = addressResponse.data.publicKey;
          }
        }

        // If no address found by telegramId, try by userId
        if (!reportedUserLatestPublicAddress) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByUserId(
              reportedUser._id.toString(),
            );
          if (addressResponse.success && addressResponse.data) {
            reportedUserLatestPublicAddress = addressResponse.data.publicKey;
          }
        }
      } catch (error) {
        // If no address found, reportedUserLatestPublicAddress remains undefined
        reportedUserLatestPublicAddress = undefined;
      }

      // Create the report with comprehensive information
      const report = new this.reportModel({
        // Legacy fields for backward compatibility
        // reporterTelegramId: reporter.telegramId,
        // reportedTelegramId: reportedUser.telegramId,
        // New comprehensive information fields
        reporterInfo: {
          username: reporter.username,
          userId: reporter._id,
          telegramId: reporter.telegramId,
          latestPublicAddress: reporterLatestPublicAddress,
        },
        reportedUserInfo: {
          username: reportedUser.username,
          userId: reportedUser._id,
          telegramId: reportedUser.telegramId,
          latestPublicAddress: reportedUserLatestPublicAddress,
        },
        secret_id: reportData.secret_id,
        report_type: reportData.report_type,
        reason: finalReason,
        // Default to MEDIUM priority when not provided
        priority: reportData.priority ?? ReportPriority.MEDIUM,
      });

      const savedReport = await report.save();

      // Log report creation into logger table
      try {
        await this.loggerService.saveSystemLog(
          {
            event: LogEvent.ReportCreated,
            message: 'New report created',
            reportType: reportData.report_type,
            reason: finalReason,
            secretId: reportData.secret_id,
            reportedUserId: String(reportedUser._id),
            reporterUserId: String(reporter._id),
          },
          {
            userId: String(reporter._id),
            telegramId: reporter.telegramId,
            username: reporter.username,
          },
        );
      } catch (e) {
        console.error('Failed to log report creation', e);
      }

      // Count total unresolved reports for this user using userId only
      const reportCount = await this.reportModel.countDocuments({
        'reportedUserInfo.userId': reportedUser._id,
        resolved: false,
      });

      // Update the reported user's report count
      await this.userModel.updateOne(
        { _id: reportedUser._id },
        { reportCount },
      );

      // Check both ban conditions using user ID instead of telegram ID
      const shouldBanByCount = reportCount >= this.maxReportsBeforeBan;
      const shouldBanByPercentage = await this.checkPercentageBanCondition(
        reportedUser._id.toString(),
        reportCount,
      );

      // If either condition is met, restrict sharing
      if (shouldBanByCount || shouldBanByPercentage) {
        await this.userModel.updateOne(
          { _id: reportedUser._id },
          { sharingRestricted: true },
        );
      }

      // Send Telegram notification to the reported user if they have a Telegram account
      if (reportedUser.telegramId) {
        try {
          const notificationMessage = `⚠️ <b>Report Notification</b>

You have received a report regarding your shared content. Please review your shared information to ensure it complies with our community guidelines.

📋 <b>Report Type:</b> ${reportData.report_type}
${finalReason ? `💬 <b>Reason:</b> ${finalReason}\n` : ''}⏰ <b>Date:</b> ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })}

If you believe this report was made in error, please contact our support team.`;

          await this.telegramService.sendMessage(
            Number(reportedUser.telegramId),
            notificationMessage,
            3,
            undefined,
            {
              type: NotificationType.REPORT_NOTIFICATION,
              recipientUserId: reportedUser._id as Types.ObjectId,
              recipientUsername: reportedUser.username,
              senderUserId: reporter._id as Types.ObjectId,
              senderUsername: reporter.username,
              reason: 'User report notification',
              subject: `Report: ${reportData.report_type}`,
              relatedEntityType: 'report',
              relatedEntityId: savedReport._id as Types.ObjectId,
              metadata: {
                reportType: reportData.report_type,
                reportReason: finalReason,
                secretId: reportData.secret_id,
                reportDate: new Date(),
              },
            },
          );

          console.log(
            `Report notification sent to user ${reportedUser.telegramId}`,
          );
        } catch (telegramError) {
          console.error(
            `Failed to send Telegram notification to user ${reportedUser.telegramId}:`,
            telegramError,
          );
          // Don't throw error here as the report was still created successfully
        }
      } else {
        // Fallback: log a parallel notification when reported user has no Telegram
        try {
          const fallbackMessage = `Report notification.\n\nYou have received a report regarding your shared content. Please review your shared information to ensure it complies with our community guidelines.\n\nReport type: ${reportData.report_type}\n${
            finalReason ? `Reason: ${finalReason}\n` : ''
          }Date: ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })}\n\nReporter: [id: ${String(
            reporter._id,
          )}, publicAddress: ${
            reporterLatestPublicAddress || 'N/A'
          }]\nReported user: [id: ${String(
            reportedUser._id,
          )}, publicAddress: ${reportedUserLatestPublicAddress || 'N/A'}]`;

          await this.notificationsService.logNotificationWithResult(
            {
              message: fallbackMessage,
              type: NotificationType.REPORT_NOTIFICATION,
              recipientUserId: reportedUser._id as Types.ObjectId,
              recipientUsername: reportedUser.username,
              senderUserId: reporter._id as Types.ObjectId,
              senderUsername: reporter.username,
              reason: 'Telegram unavailable: reported user has no Telegram ID',
              subject: `Report: ${reportData.report_type}`,
              relatedEntityType: 'report',
              relatedEntityId: savedReport._id as Types.ObjectId,
              metadata: {
                reportType: reportData.report_type,
                reportReason: finalReason,
                secretId: reportData.secret_id,
                reportDate: new Date(),
                reporterPublicAddress: reporterLatestPublicAddress,
                reportedUserPublicAddress: reportedUserLatestPublicAddress,
                telegramSent: false,
              },
            },
            {
              success: false,
              errorMessage: 'Recipient has no Telegram account',
            },
          );
        } catch (logError) {
          console.error(
            'Failed to log fallback notification for reported user without Telegram:',
            logError,
          );
        }
      }

      return savedReport;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get all reports for a specific user
   * @param userIdentifier The user identifier (can be userId, telegramId, or publicAddress)
   * @returns List of reports
   */
  async getReportsByUser(userIdentifier: string): Promise<Report[]> {
    try {
      // First, find the user using any available identifier
      const userInfo = await UserFinderUtil.findUserByAnyInfo(
        {
          userId: userIdentifier,
          telegramId: userIdentifier,
          publicAddress: userIdentifier,
        },
        this.userModel,
        this.publicAddressModel,
      );

      if (!userInfo) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Search for reports using both userId and telegramId to find all reports
      // This ensures we find both new reports (with userId) and legacy reports (with telegramId only)
      const reports = await this.reportModel
        .find({
          $or: [
            { 'reportedUserInfo.userId': userInfo.userId },
            { reportedTelegramId: userInfo.telegramId },
          ],
        })
        .sort({ createdAt: -1 })
        .exec();

      return reports;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error retrieving reports',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get the count of users who can report a specific user
   * (users who have shared passwords with the target user)
   * @param reportedUserId The user ID of the reported user
   * @returns Number of users who can report this user
   */
  private async getEligibleReportersCount(
    reportedUserId: string,
  ): Promise<number> {
    // Find all passwords belonging to the reported user
    const reportedUserPasswords = await this.passwordModel.find({
      userId: reportedUserId,
      isActive: true,
    });

    // Extract unique usernames from sharedWith arrays
    const eligibleReporters = new Set<string>();

    reportedUserPasswords.forEach((password) => {
      if (password.sharedWith && password.sharedWith.length > 0) {
        password.sharedWith.forEach((shared) => {
          if (shared.username) {
            eligibleReporters.add(shared.username.toLowerCase());
          }
        });
      }
    });

    return eligibleReporters.size;
  }

  /**
   * Check if a user should be banned based on percentage of reports
   * @param reportedTelegramId The Telegram ID of the reported user
   * @param currentReportCount Current number of unresolved reports
   * @returns Boolean indicating if the user should be banned
   */
  private async shouldBanUserByPercentage(
    reportedTelegramId: string,
    currentReportCount: number,
  ): Promise<boolean> {
    // Get the reported user
    const reportedUser = await this.userModel.findOne({
      telegramId: reportedTelegramId,
      isActive: true,
    });

    if (!reportedUser) {
      return false;
    }

    // Get the count of eligible reporters
    const eligibleReportersCount = await this.getEligibleReportersCount(
      reportedUser._id.toString(),
    );

    // If no one can report this user, don't ban
    if (eligibleReportersCount === 0) {
      return false;
    }

    // Calculate the percentage of reports
    const reportPercentage = currentReportCount / eligibleReportersCount;

    // Check if percentage exceeds the threshold
    return reportPercentage >= this.maxPercentageOfReportsRequiredForBan;
  }

  /**
   * Check if a user is restricted from sharing passwords
   * @param userIdentifier The user identifier (can be userId, telegramId, or publicAddress)
   * @returns Boolean indicating if the user is restricted
   */
  async isUserRestricted(userIdentifier: string): Promise<boolean> {
    try {
      // First, find the user using any available identifier
      const userInfo = await UserFinderUtil.findUserByAnyInfo(
        {
          userId: userIdentifier,
          telegramId: userIdentifier,
          publicAddress: userIdentifier,
        },
        this.userModel,
        this.publicAddressModel,
      );

      if (!userInfo) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Find the user in the database to check restriction status
      const user = await this.userModel.findOne({
        _id: userInfo.userId,
        isActive: true,
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const isRestricted = user.sharingRestricted || false;

      return isRestricted;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error checking user restriction status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Resolve a report (admin function)
   * @param reportId The ID of the report to resolve
   * @returns The updated report
   */
  async resolveReport(reportId: string): Promise<Report> {
    const report = await this.reportModel.findById(reportId);
    if (!report) {
      throw new HttpException('Report not found', HttpStatus.NOT_FOUND);
    }

    report.resolved = true;
    report.resolvedAt = new Date();
    const updatedReport = await report.save();

    // Get the reported user ID from the report
    let reportedUserId: string;
    if (report.reportedUserInfo && report.reportedUserInfo.userId) {
      reportedUserId = report.reportedUserInfo.userId.toString();
    } else if (report.reportedTelegramId) {
      // Fallback to finding user by telegram ID
      const user = await this.userModel.findOne({
        telegramId: report.reportedTelegramId,
      });
      if (!user) {
        throw new HttpException(
          'Reported user not found',
          HttpStatus.NOT_FOUND,
        );
      }
      reportedUserId = user._id.toString();
    } else {
      throw new HttpException(
        'Cannot identify reported user',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Recalculate the report count for the user using both legacy and new fields
    const reportCount = await this.reportModel.countDocuments({
      $or: [
        { reportedTelegramId: report.reportedTelegramId },
        { 'reportedUserInfo.userId': reportedUserId },
      ],
      resolved: false,
    });

    // Update the user's report count
    await this.userModel.updateOne({ _id: reportedUserId }, { reportCount });

    // Check if user should still be banned after resolving this report
    const shouldStillBanByCount = reportCount >= this.maxReportsBeforeBan;
    const shouldStillBanByPercentage = await this.checkPercentageBanCondition(
      reportedUserId,
      reportCount,
    );

    // If neither condition is met, remove restriction
    if (!shouldStillBanByCount && !shouldStillBanByPercentage) {
      await this.userModel.updateOne(
        { _id: reportedUserId },
        { sharingRestricted: false },
      );
    }

    return updatedReport;
  }

  /**
   * Check if user should be banned based on percentage of reports
   * @param reportedUserId The user ID of the reported user
   * @param reportCount Current number of unresolved reports
   * @returns Boolean indicating if user should be banned based on percentage
   */
  private async checkPercentageBanCondition(
    reportedUserId: string,
    reportCount: number,
  ): Promise<boolean> {
    try {
      // Find the reported user by ID
      const reportedUser = await this.userModel.findOne({
        _id: reportedUserId,
        isActive: true,
      });

      if (!reportedUser) {
        return false;
      }

      // Find all passwords belonging to the reported user
      const reportedUserPasswords = await this.passwordModel.find({
        userId: reportedUser._id,
        isActive: true,
      });

      // Get all unique users who can report this user (users who have shared passwords with them)
      const usersWhoCanReport = new Set<string>();

      for (const password of reportedUserPasswords) {
        if (password.sharedWith && password.sharedWith.length > 0) {
          password.sharedWith.forEach((shared) => {
            if (shared.username) {
              usersWhoCanReport.add(shared.username.toLowerCase());
            }
          });
        }
      }

      const totalUsersWhoCanReport = usersWhoCanReport.size;

      // If no users can report, return false
      if (totalUsersWhoCanReport === 0) {
        return false;
      }

      // Calculate the percentage of reports
      const reportPercentage = reportCount / totalUsersWhoCanReport;

      // Check if percentage exceeds the threshold
      return reportPercentage >= this.maxPercentageOfReportsRequiredForBan;
    } catch (error) {
      // Log error but don't throw to avoid breaking the main flow
      console.error('Error checking percentage ban condition:', error);
      return false;
    }
  }

  /**
   * Get all reported users with their reports (Admin only)
   * Returns a list of all users who have been reported, along with their report counts,
   * sharing restriction status, and the reports associated with them
   * Searches using both legacy telegramId and modern userId fields
   * @param filters Optional filters for reporterUserId, reportedUserId, and secret_id
   * @returns Object containing count of reported users and their details
   */
  async getAllReportedUsers(filters?: {
    reporterUserId?: string;
    reportedUserId?: string;
    secret_id?: string;
    priority?: ReportPriority;
    resolved?: ResolvedFilterEnum;
    report_type?: ReportType;
  }) {
    try {
      // Normalize resolved filter from enum string ('true' | 'false') or boolean to a boolean
      // console.log('DEBUG filters.resolved (raw):', filters?.resolved, typeof filters?.resolved);
      const normalizedResolved: boolean | undefined = (() => {
        const v: any = filters?.resolved;
        if (v === ResolvedFilterEnum.TRUE) return true;
        if (v === ResolvedFilterEnum.FALSE) return false;
        if (v === true) return true;
        if (v === false) return false;
        if (typeof v === 'string') {
          const s = v.trim().toLowerCase();
          if (s === 'true' || s === '1') return true;
          if (s === 'false' || s === '0') return false;
        }
        return undefined;
      })();
      console.log('DEBUG normalizedResolved:', normalizedResolved);
      // Build the base query for finding reports (only modern fields)
      const reportQuery: any = {};

      // Apply filters if provided - only use modern fields
      if (filters?.reporterUserId) {
        reportQuery['reporterInfo.userId'] = new Types.ObjectId(
          filters.reporterUserId,
        );
      }

      if (filters?.reportedUserId) {
        reportQuery['reportedUserInfo.userId'] = new Types.ObjectId(
          filters.reportedUserId,
        );
      }

      if (filters?.secret_id) {
        reportQuery['secret_id'] = filters.secret_id;
      }

      if (filters?.priority) {
        reportQuery['priority'] = filters.priority;
      }

      if (normalizedResolved !== undefined) {
        if (normalizedResolved === true) {
          // Include records where resolved is true (boolean) or legacy string 'true'
          reportQuery['$or'] = [{ resolved: true }, { resolved: 'true' }];
        } else {
          // Match unresolved reports: boolean false OR string 'false' OR missing resolved field (legacy)
          reportQuery['$or'] = [
            { resolved: false },
            { resolved: 'false' },
            { resolved: { $exists: false } },
          ];
        }
      }

      if (filters?.report_type) {
        reportQuery['report_type'] = filters.report_type;
      }

      // Find all unique userIds from modern reports only
      const reportedUserIds = await this.reportModel.distinct(
        'reportedUserInfo.userId',
        reportQuery,
      );

      // If no reports exist, return empty result
      if (!reportedUserIds.length) {
        return {
          count: 0,
          users: [],
        };
      }

      // Get all reported users using modern userId only
      const reportedUsers = await this.userModel.find({
        _id: { $in: reportedUserIds },
        isActive: true,
      });

      // Prepare the result with detailed information for each user
      const usersWithReports = await Promise.all(
        reportedUsers.map(async (user) => {
          // Build query for this specific user's reports (only modern fields)
          const userReportQuery: any = {
            'reportedUserInfo.userId': user._id, // Only use modern field
          };

          // Apply reporter filter if provided
          if (filters?.reporterUserId) {
            userReportQuery['reporterInfo.userId'] = new Types.ObjectId(
              filters.reporterUserId,
            );
          }

          // Apply secret_id filter if provided
          if (filters?.secret_id) {
            userReportQuery['secret_id'] = filters.secret_id;
          }

          // Apply priority filter if provided
          if (filters?.priority) {
            userReportQuery['priority'] = filters.priority;
          }

          if (normalizedResolved !== undefined) {
            if (normalizedResolved === true) {
              // Include records where resolved is true (boolean) or legacy string 'true'
              userReportQuery['$or'] = [{ resolved: true }, { resolved: 'true' }];
            } else {
              userReportQuery['$or'] = [
                { resolved: false },
                { resolved: 'false' },
                { resolved: { $exists: false } },
              ];
            }
          }

          // Temporary debug log to verify the query being executed
          // console.log('DEBUG userReportQuery:', JSON.stringify(userReportQuery, null, 2));

          if (filters?.report_type) {
            userReportQuery['report_type'] = filters.report_type;
          }

          // Get all reports for this user
          const reports = await this.reportModel
            .find(userReportQuery)
            .sort({ createdAt: -1 })
            .exec();

          // Count unresolved reports
          const unresolvedReports = reports.filter((r) => !r.resolved).length;
          // If resolved filter is provided, count matching reports. If not provided, return all (count all reports).
          const reportCount = reports.length;

          return {
            username: user.username,
            telegramId: user.telegramId,
            userId: user._id,
            reportCount,
            sharingRestricted: user.sharingRestricted || false,
            reports: reports.map((report) => ({
              id: report._id,
              secret_id: report.secret_id,
              report_type: report.report_type,
              reason: report.reason,
              reporterTelegramId: report.reporterTelegramId,
              reporterInfo: report.reporterInfo,
              reportedTelegramId: report.reportedTelegramId,
              reportedUserInfo: report.reportedUserInfo,
              priority: report.priority,
              createdAt: report.createdAt,
              resolved: report.resolved,
              resolvedAt: report.resolvedAt,
            })),
          };
        }),
      );

      return {
        count: usersWithReports.length,
        users: usersWithReports,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get a specific report by its ID (Admin only)
   * @param reportId The ID of the report to retrieve
   * @returns The report with full details
   */
  async getReportById(reportId: string): Promise<Report> {
    try {
      // Validate the reportId format
      if (!Types.ObjectId.isValid(reportId)) {
        throw new HttpException(
          'Invalid report ID format',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Find the report by ID
      const report = await this.reportModel.findById(reportId).exec();

      if (!report) {
        throw new HttpException('Report not found', HttpStatus.NOT_FOUND);
      }

      return report;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error retrieving report',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
