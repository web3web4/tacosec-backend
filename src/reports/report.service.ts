import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ReportUserDto } from './dto/report-user.dto';
import { ConfigService } from '@nestjs/config';
import {
  Password,
  PasswordDocument,
} from '../passwords/schemas/password.schema';

@Injectable()
export class ReportService {
  private readonly maxReportsBeforeBan: number;
  private readonly maxPercentageOfReportsRequiredForBan: number;

  constructor(
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Password.name)
    private passwordModel: Model<PasswordDocument>,
    private configService: ConfigService,
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
   * @param reporterTelegramId The Telegram ID of the user making the report
   * @param reportData The report data containing reported username and reason
   * @returns The created report
   */
  async reportUser(
    reporterTelegramId: string,
    reportData: ReportUserDto,
  ): Promise<Report> {
    try {
      // Check if reporter exists
      const reporter = await this.userModel.findOne({
        telegramId: reporterTelegramId,
        isActive: true,
      });
      if (!reporter) {
        throw new HttpException('Reporter not found', HttpStatus.NOT_FOUND);
      }

      // Check if reported user exists by username
      const reportedUser = await this.userModel.findOne({
        username: {
          $regex: new RegExp(`^${reportData.reportedUsername}$`, 'i'),
        }, // case insensitive
        isActive: true,
      });
      if (!reportedUser) {
        throw new HttpException(
          'Reported user not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // Get the telegramId of the reported user
      const reportedTelegramId = reportedUser.telegramId;

      // Prevent self-reporting
      if (reporterTelegramId === reportedTelegramId) {
        throw new HttpException(
          'You cannot report yourself',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if this user has already reported the same user
      const existingReport = await this.reportModel.findOne({
        reporterTelegramId,
        reportedTelegramId,
        resolved: false,
      });

      if (existingReport) {
        throw new HttpException(
          'You have already reported this user',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Verify that the reported user has shared a password with the reporter
      // Find all passwords belonging to the reported user
      const reportedUserPasswords = await this.passwordModel.find({
        userId: reportedUser._id,
        isActive: true,
      });

      // Check if any of the reported user's passwords have been shared with the reporter
      const hasSharedPassword = reportedUserPasswords.some((password) => {
        // Check if the sharedWith array exists and contains the reporter's username
        return (
          password.sharedWith &&
          password.sharedWith.some(
            (shared) =>
              shared.username.toLowerCase() === reporter.username.toLowerCase(),
          )
        );
      });

      // If no passwords have been shared with the reporter, throw an error
      if (!hasSharedPassword) {
        throw new HttpException(
          'You can only report users who have shared their passwords with you',
          HttpStatus.FORBIDDEN,
        );
      }

      // Create the report
      const report = new this.reportModel({
        reporterTelegramId,
        reportedTelegramId,
        reason: reportData.reason,
      });

      const savedReport = await report.save();

      // Count total unresolved reports for this user
      const reportCount = await this.reportModel.countDocuments({
        reportedTelegramId,
        resolved: false,
      });

      // Update the reported user's report count
      await this.userModel.updateOne(
        { telegramId: reportedTelegramId },
        { reportCount },
      );

      // Check both ban conditions
      const shouldBanByCount = reportCount >= this.maxReportsBeforeBan;
      const shouldBanByPercentage = await this.checkPercentageBanCondition(
        reportedTelegramId,
        reportCount,
      );

      // If either condition is met, restrict sharing
      if (shouldBanByCount || shouldBanByPercentage) {
        await this.userModel.updateOne(
          { telegramId: reportedTelegramId },
          { sharingRestricted: true },
        );
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
   * @param telegramId The Telegram ID of the reported user
   * @returns List of reports
   */
  async getReportsByUser(telegramId: string): Promise<Report[]> {
    return this.reportModel
      .find({ reportedTelegramId: telegramId })
      .sort({ createdAt: -1 })
      .exec();
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
   * @param telegramId The Telegram ID of the user to check
   * @returns Boolean indicating if the user is restricted
   */
  async isUserRestricted(telegramId: string): Promise<boolean> {
    const user = await this.userModel.findOne({ telegramId, isActive: true });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return user.sharingRestricted || false;
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

    // Recalculate the report count for the user
    const reportCount = await this.reportModel.countDocuments({
      reportedTelegramId: report.reportedTelegramId,
      resolved: false,
    });

    // Update the user's report count
    await this.userModel.updateOne(
      { telegramId: report.reportedTelegramId },
      { reportCount },
    );

    // Check if user should still be banned after resolving this report
    const shouldStillBanByCount = reportCount >= this.maxReportsBeforeBan;
    const shouldStillBanByPercentage = await this.checkPercentageBanCondition(
      report.reportedTelegramId,
      reportCount,
    );

    // If neither condition is met, remove restriction
    if (!shouldStillBanByCount && !shouldStillBanByPercentage) {
      await this.userModel.updateOne(
        { telegramId: report.reportedTelegramId },
        { sharingRestricted: false },
      );
    }

    return updatedReport;
  }

  /**
   * Check if user should be banned based on percentage of reports
   * @param reportedTelegramId The Telegram ID of the reported user
   * @param reportCount Current number of unresolved reports
   * @returns Boolean indicating if user should be banned based on percentage
   */
  private async checkPercentageBanCondition(
    reportedTelegramId: string,
    reportCount: number,
  ): Promise<boolean> {
    try {
      // Find the reported user
      const reportedUser = await this.userModel.findOne({
        telegramId: reportedTelegramId,
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
   * @returns Object containing count of reported users and their details
   */
  async getAllReportedUsers() {
    try {
      // Find all unique reportedTelegramIds from reports
      const reportedTelegramIds =
        await this.reportModel.distinct('reportedTelegramId');

      // If no reports exist, return empty result
      if (!reportedTelegramIds.length) {
        return {
          count: 0,
          users: [],
        };
      }

      // Get all reported users
      const reportedUsers = await this.userModel.find({
        telegramId: { $in: reportedTelegramIds },
        isActive: true,
      });

      // Prepare the result with detailed information for each user
      const usersWithReports = await Promise.all(
        reportedUsers.map(async (user) => {
          // Get all reports for this user
          const reports = await this.reportModel
            .find({ reportedTelegramId: user.telegramId })
            .sort({ createdAt: -1 })
            .exec();

          // Count unresolved reports
          const unresolvedReports = reports.filter((r) => !r.resolved).length;

          return {
            username: user.username,
            telegramId: user.telegramId,
            reportCount: unresolvedReports,
            sharingRestricted: user.sharingRestricted || false,
            reports: reports.map((report) => ({
              id: report._id,
              reason: report.reason,
              reporterTelegramId: report.reporterTelegramId,
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
}
