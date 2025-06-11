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
              shared.username.toLowerCase() === reporter.username.toLowerCase()
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

      // If report count reaches the threshold, restrict sharing
      if (reportCount >= this.maxReportsBeforeBan) {
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

    // If report count is now below the threshold, remove restriction
    if (reportCount < this.maxReportsBeforeBan) {
      await this.userModel.updateOne(
        { telegramId: report.reportedTelegramId },
        { sharingRestricted: false },
      );
    }

    return updatedReport;
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
