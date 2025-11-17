import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Request } from 'express';

// Extend Request interface to include user property
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    telegramId: string;
    username: string;
    firstName: string;
    lastName: string;
    publicAddress?: string;
  };
}
import { Password, PasswordDocument } from './schemas/password.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Report, ReportDocument } from '../reports/schemas/report.schema';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../public-addresses/schemas/public-address.schema';
import * as bcrypt from 'bcrypt';

import { SharedWithMeResponse } from '../types/share-with-me-pass.types';
import {
  passwordReturns,
  PasswordReportInfo,
} from '../types/password-returns.types';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';
import { SharedWithDto } from './dto/shared-with.dto';
import { PaginatedResponse } from './dto/pagination.dto';
import { AdminSecretsFilterDto } from './dto/admin-secrets-filter.dto';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { ConfigService } from '@nestjs/config';
import { PublicAddressesService } from '../public-addresses/public-addresses.service';
import { UserFinderUtil } from '../utils/user-finder.util';
import {
  NotificationsService,
  NotificationLogData,
} from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { LoggerService } from '../logger/logger.service';
import { LogEvent } from '../logger/dto/log-event.enum';
@Injectable()
export class PasswordService {
  constructor(
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(PublicAddress.name)
    private publicAddressModel: Model<PublicAddressDocument>,
    private readonly telegramService: TelegramService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
    private readonly configService: ConfigService,
    private readonly publicAddressesService: PublicAddressesService,
    private readonly notificationsService: NotificationsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Extract and validate user authentication data from request
   * @param req - The authenticated request object
   * @returns User authentication data including userId, telegramId, username, and latest wallet address
   */
  async extractUserAuthData(req: AuthenticatedRequest): Promise<{
    userId: string;
    telegramId: string;
    username: string;
    publicAddress?: string;
  }> {
    let telegramId: string = '';
    let username: string = '';
    let userId: string = '';

    // Priority 1: JWT authentication - extract user info from req.user
    if (req?.user?.id) {
      telegramId = req.user.telegramId || '';
      username = req.user.username || '';
      userId = req.user.id;
    }
    // Priority 2: Telegram authentication - extract from header
    else if (req?.headers?.['x-telegram-init-data']) {
      const telegramInitData = req.headers['x-telegram-init-data'] as string;

      if (!telegramInitData) {
        throw new HttpException(
          'Authentication required: provide either JWT token or Telegram init data',
          HttpStatus.BAD_REQUEST,
        );
      }

      try {
        // Parse telegram init data to extract telegramId and username
        const parsedData =
          this.telegramDtoAuthGuard.parseTelegramInitData(telegramInitData);
        telegramId = parsedData.telegramId || '';
        username = parsedData.username || '';

        // Get userId from database using telegramId if available
        if (telegramId) {
          const user = await this.userModel
            .findOne({ telegramId })
            .select('_id')
            .exec();

          if (user) {
            userId = user._id.toString();
          }
        }
      } catch (error) {
        // If parsing fails, continue with empty values
        telegramId = '';
        username = '';
        userId = '';
      }
    }

    // If no authentication method provided or failed, allow with empty values
    // This ensures views can be recorded even for unauthenticated users

    // Get the latest wallet address for the user
    let publicAddress: string | undefined;
    try {
      // First try to get address by telegramId if available
      if (telegramId) {
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByTelegramId(
            telegramId,
          );
        if (addressResponse.success && addressResponse.data) {
          publicAddress = addressResponse.data.publicKey;
        }
      }

      // If no address found by telegramId or telegramId is empty, try by userId
      if (!publicAddress && userId) {
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByUserId(userId);
        if (addressResponse.success && addressResponse.data) {
          publicAddress = addressResponse.data.publicKey;
        }
      }
    } catch (error) {
      // If no address found, publicAddress remains undefined
      publicAddress = undefined;
    }

    return {
      userId,
      telegramId,
      username,
      publicAddress,
    };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return bcrypt.hash(password, salt);
  }

  async findOne(filter: Partial<Password>): Promise<Password> {
    return this.passwordModel.findOne(filter).exec();
  }

  async findById(id: string): Promise<Password> {
    return this.passwordModel.findById(id).exec();
  }

  async findByUserObjectId(userId: Types.ObjectId): Promise<Password[]> {
    return this.passwordModel.find({ userId, isActive: true }).exec();
  }

  async findByUserId(userId: string): Promise<passwordReturns[]> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const user = await this.userModel
        .findOne({ _id: userId, isActive: true })
        .exec();
      if (!user) {
        throw new Error('userId is not valid');
      }

      // Find passwords that are active, either not hidden or hidden field doesn't exist, and are parent passwords (no parent_secret_id)
      const passwords = await this.passwordModel
        .find({
          userId: user._id,
          isActive: true,
          $and: [
            { $or: [{ hidden: false }, { hidden: { $exists: false } }] },
            {
              $or: [
                { parent_secret_id: { $exists: false } },
                { parent_secret_id: null },
              ],
            },
          ],
        })
        .select(
          'key value description updatedAt createdAt sharedWith type hidden publicAddress secretViews',
        )
        .sort({ createdAt: -1 })
        .exec();

      const passwordWithSharedWithAsUsernames = await Promise.all(
        passwords.map(async (password) => {
          // Fetch unresolved reports for this password
          const reports = await this.reportModel
            .find({
              $or: [
                { secret_id: password._id },
                { secret_id: password._id.toString() },
              ],
              resolved: false,
            })
            .exec();

          // Transform reports to include reporter username
          // const reportInfo: PasswordReportInfo[] = await Promise.all(
          //   reports.map(async (report) => {
          //     // Get reporter user info
          //     const reporter = await this.userModel
          //       .findOne({ telegramId: report.reporterTelegramId })
          //       .select('username')
          //       .exec();

          //     return {
          //       reporterUsername: reporter ? reporter.username : 'Unknown',
          //       report_type: report.report_type,
          //       reason: report.reason,
          //       createdAt: report.createdAt,
          //     };
          //   }),
          // );

          const secretViews = password.secretViews || [];
          return {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            updatedAt: password.updatedAt,
            createdAt: password.createdAt,
            hidden: password.hidden || false,
            publicAddress: password.publicAddress,
            reports: reports, // Include complete reports data as stored in MongoDB
            viewsCount: secretViews.length,
            secretViews: secretViews,
          };
        }),
      );
      return passwordWithSharedWithAsUsernames;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findByUserTelegramId(telegramId: string): Promise<passwordReturns[]> {
    try {
      if (!telegramId) {
        throw new Error('Telegram ID is required');
      }
      const user = await this.userModel
        .findOne({ telegramId, isActive: true })
        .exec();
      if (!user) {
        throw new Error('telegramId is not valid');
      }

      // Find passwords that are active, either not hidden or hidden field doesn't exist, and are parent passwords (no parent_secret_id)
      const passwords = await this.passwordModel
        .find({
          userId: user._id,
          isActive: true,
          $and: [
            { $or: [{ hidden: false }, { hidden: { $exists: false } }] },
            {
              $or: [
                { parent_secret_id: { $exists: false } },
                { parent_secret_id: null },
              ],
            },
          ],
        })
        .select(
          'key value description updatedAt createdAt sharedWith type hidden publicAddress secretViews',
        )
        .sort({ createdAt: -1 })
        .exec();

      const passwordWithSharedWithAsUsernames = await Promise.all(
        passwords.map(async (password) => {
          // Fetch unresolved reports for this password
          // Handle both ObjectId and string formats for secret_id
          const reports = await this.reportModel
            .find({
              $or: [
                { secret_id: password._id },
                { secret_id: password._id.toString() },
              ],
              resolved: false,
            })
            .exec();

          // Transform reports to include reporter username
          // const reportInfo: PasswordReportInfo[] = await Promise.all(
          //   reports.map(async (report) => {
          //     // Get reporter user info
          //     const reporter = await this.userModel
          //       .findOne({ telegramId: report.reporterTelegramId })
          //       .select('username')
          //       .exec();

          //     return {
          //       reporterUsername: reporter ? reporter.username : 'Unknown',
          //       report_type: report.report_type,
          //       reason: report.reason,
          //       createdAt: report.createdAt,
          //     };
          //   }),
          // );

          const secretViews = password.secretViews || [];
          return {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            updatedAt: password.updatedAt,
            createdAt: password.createdAt,
            hidden: password.hidden || false,
            publicAddress: password.publicAddress,
            reports: reports, // Include complete reports data as stored in MongoDB
            viewsCount: secretViews.length,
            secretViews: secretViews,
          };
        }),
      );
      console.log(
        'passwordWithSharedWithAsUsernames',
        passwordWithSharedWithAsUsernames,
      );
      return passwordWithSharedWithAsUsernames;
    } catch (error) {
      // If the error is already an HttpException, preserve its status code
      if (error instanceof HttpException) {
        throw error;
      }
      // For other errors, use BAD_REQUEST as default
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findSharedWithByTelegramId(
    telegramId: string,
    key: string,
  ): Promise<SharedWithDto[]> {
    try {
      if (!telegramId) {
        throw new Error('Telegram ID is required');
      }
      const user = await this.userModel.findOne({
        telegramId,
        isActive: true,
      });
      if (!user) {
        throw new Error('telegramId is not valid');
      }
      if (!key) {
        throw new Error('Key is required');
      }
      const passwordKey = await this.passwordModel.findOne({
        key,
        isActive: true,
      });
      if (!passwordKey) {
        throw new Error('Key is not found');
      }
      const sharedWith = await this.passwordModel
        .find({
          userId: user._id,
          isActive: true,
          key: key,
        })
        .select('sharedWith -_id')
        .exec();
      return sharedWith.length > 0 ? sharedWith[0].sharedWith : null;
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findPasswordsSharedWithMe(
    username: string,
    userId?: string,
    currentUserTelegramId?: string,
    currentUserPrivacyMode?: boolean,
    publicAddress?: string,
  ): Promise<SharedWithMeResponse> {
    try {
      if (!username && !userId && !publicAddress) {
        throw new Error('Username, userId, or publicAddress is required');
      }

      // Try to find userId from username if not provided
      let finalUserId = userId;
      if (!finalUserId && username) {
        const user = await this.userModel
          .findOne({
            username: username.toLowerCase(),
            isActive: true,
          })
          .exec();
        if (user) {
          finalUserId = user._id ? String(user._id) : '';
        }
      }

      const sharedWithMe = await this.getSharedWithMe(
        username,
        finalUserId,
        currentUserTelegramId,
        currentUserPrivacyMode,
        publicAddress,
      );
      return sharedWithMe;
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Find passwords by publicAddress with optional pagination
   * @param publicAddress The public address to search for
   * @param page Optional page number for pagination
   * @param limit Optional limit for pagination
   * @returns Either paginated response or simple array based on parameters
   */
  async findByPublicAddressWithPagination(
    publicAddress: string,
    page?: number,
    limit?: number,
  ): Promise<passwordReturns[] | PaginatedResponse<passwordReturns>> {
    try {
      if (!publicAddress) {
        throw new Error('Public address is required');
      }

      // If pagination parameters are not provided or incomplete, return original response
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        // Find passwords by publicAddress without pagination
        const passwords = await this.passwordModel
          .find({
            publicAddress: publicAddress,
            isActive: true,
            $and: [
              { $or: [{ hidden: false }, { hidden: { $exists: false } }] },
              {
                $or: [
                  { parent_secret_id: { $exists: false } },
                  { parent_secret_id: null },
                ],
              },
            ],
          })
          .select(
            'key value description updatedAt createdAt sharedWith type hidden publicAddress',
          )
          .sort({ createdAt: -1 })
          .exec();

        // Transform passwords with reports
        const passwordWithSharedWithAsUsernames = await Promise.all(
          passwords.map(async (password) => {
            // Fetch unresolved reports for this password
            const reports = await this.reportModel
              .find({
                $or: [
                  { secret_id: password._id },
                  { secret_id: password._id.toString() },
                ],
                resolved: false,
              })
              .exec();

            // Transform reports to include reporter username
            const reportInfo: PasswordReportInfo[] = await Promise.all(
              reports.map(async (report) => {
                // Get reporter user info
                const reporter = await this.userModel
                  .findOne({ telegramId: report.reporterTelegramId })
                  .select('username')
                  .exec();

                return {
                  reporterUsername: reporter ? reporter.username : 'Unknown',
                  report_type: report.report_type,
                  reason: report.reason,
                  createdAt: report.createdAt,
                };
              }),
            );

            const secretViews = password.secretViews || [];
            return {
              _id: password._id,
              key: password.key,
              value: password.value,
              description: password.description,
              type: password.type,
              sharedWith: password.sharedWith,
              updatedAt: password.updatedAt,
              createdAt: password.createdAt,
              hidden: password.hidden || false,
              publicAddress: password.publicAddress,
              reports: reportInfo,
              viewsCount: secretViews.length,
              secretViews: secretViews,
            };
          }),
        );

        return passwordWithSharedWithAsUsernames;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Base query for finding passwords by publicAddress
      const baseQuery = {
        publicAddress: publicAddress,
        isActive: true,
        $and: [
          { $or: [{ hidden: false }, { hidden: { $exists: false } }] },
          {
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          },
        ],
      };

      // Get total count for pagination
      const totalCount = await this.passwordModel
        .countDocuments(baseQuery)
        .exec();

      // Find passwords with pagination
      const passwords = await this.passwordModel
        .find(baseQuery)
        .select(
          'key value description updatedAt createdAt sharedWith type hidden publicAddress',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Transform passwords with reports
      const passwordWithSharedWithAsUsernames = await Promise.all(
        passwords.map(async (password) => {
          // Fetch unresolved reports for this password
          const reports = await this.reportModel
            .find({
              $or: [
                { secret_id: password._id },
                { secret_id: password._id.toString() },
              ],
              resolved: false,
            })
            .exec();

          // Transform reports to include reporter username
          const reportInfo: PasswordReportInfo[] = await Promise.all(
            reports.map(async (report) => {
              // Get reporter user info
              const reporter = await this.userModel
                .findOne({ telegramId: report.reporterTelegramId })
                .select('username')
                .exec();

              return {
                reporterUsername: reporter ? reporter.username : 'Unknown',
                report_type: report.report_type,
                reason: report.reason,
                createdAt: report.createdAt,
              };
            }),
          );

          const secretViews = password.secretViews || [];
          return {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            updatedAt: password.updatedAt,
            createdAt: password.createdAt,
            hidden: password.hidden || false,
            publicAddress: password.publicAddress,
            reports: reportInfo,
            viewsCount: secretViews.length,
            secretViews: secretViews,
          };
        }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        data: passwordWithSharedWithAsUsernames,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Helper function to find user information using any available data
   * @param userInfo Object containing any combination of username, userId, telegramId, or publicAddress
   * @returns Complete user information or null if not found
   */

  async getSharedWithMe(
    username: string,
    userId?: string,
    currentUserTelegramId?: string,
    currentUserPrivacyMode?: boolean,
    publicAddress?: string,
  ): Promise<SharedWithMeResponse> {
    try {
      if (!username && !userId && !publicAddress) {
        throw new Error('Username, userId, or publicAddress is required');
      }

      let allSharedPasswords: any[] = [];
      const passwordIds = new Set<string>(); // To track unique password IDs for deduplication

      // Search by userId if available
      if (userId) {
        const userIdResults = await this.passwordModel
          .find({
            'sharedWith.userId': userId,
            isActive: true,
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          })
          .select(
            ' _id key value description initData.username sharedWith createdAt updatedAt userId secretViews ',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        // Add unique results to the collection
        userIdResults.forEach((password) => {
          const passwordId = password._id.toString();
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });
      }

      // Search by username if available
      if (username) {
        const usernameResults = await this.passwordModel
          .find({
            'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') }, //case insensitive
            isActive: true,
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          })
          .select(
            ' _id key value description initData.username sharedWith createdAt updatedAt userId secretViews ',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        // Add unique results to the collection
        usernameResults.forEach((password) => {
          const passwordId = password._id.toString();
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });
      }

      // Search by publicAddress if available
      if (publicAddress) {
        const publicAddressResults = await this.passwordModel
          .find({
            'sharedWith.publicAddress': publicAddress,
            isActive: true,
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          })
          .select(
            ' _id key value description initData.username sharedWith createdAt updatedAt userId secretViews ',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        // Add unique results to the collection
        publicAddressResults.forEach((password) => {
          const passwordId = password._id.toString();
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });
      }

      // Sort the combined results by creation date (newest first)
      const sharedPasswords = allSharedPasswords.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      if (!sharedPasswords?.length) {
        return { sharedWithMe: [], userCount: 0 };
      }

      // Get all secret owners to check their privacy mode
      const secretOwnerIds = [
        ...new Set(
          sharedPasswords
            .map((p) => (p.userId ? String(p.userId) : ''))
            .filter((id) => id),
        ),
      ];
      const secretOwners = await this.userModel
        .find({ _id: { $in: secretOwnerIds } })
        .exec();
      const ownerPrivacyMap = new Map(
        secretOwners.map((owner) => [
          owner._id ? String(owner._id) : '',
          owner.privacyMode,
        ]),
      );
      const ownerUsernameMap = new Map(
        secretOwners.map((owner) => [
          owner._id ? String(owner._id) : '',
          owner.username,
        ]),
      );
      const ownerTelegramIdMap = new Map(
        secretOwners.map((owner) => [
          owner._id ? String(owner._id) : '',
          owner.telegramId,
        ]),
      );

      const resolvedPasswords = await Promise.all(
        sharedPasswords
          .filter((password) => password.userId) // Filter out passwords without userId
          .map(async (password) => {
            // Find unresolved reports for this password
            // Handle both ObjectId and string formats for secret_id
            const reports = await this.reportModel
              .find({
                $or: [
                  { secret_id: password._id },
                  { secret_id: password._id.toString() },
                ],
                resolved: false,
              })
              .exec();

            // Check owner's privacy mode
            const passwordUserId = password.userId
              ? String(password.userId)
              : '';
            const ownerPrivacyMode =
              ownerPrivacyMap.get(passwordUserId) || false;
            const ownerTelegramId = ownerTelegramIdMap.get(passwordUserId);
            const ownerUsername = ownerUsernameMap.get(passwordUserId);
            const isOwner = currentUserTelegramId === ownerTelegramId;
            const secretViews = password.secretViews || [];

            const baseData = {
              id: password._id.toString(),
              key: password.key,
              value: password.value,
              description: password.description,
              username: ownerUsername || password.initData.username,
              sharedWith: password.sharedWith || [], // Include sharedWith field in response
              reports: reports, // Include complete reports data as stored in MongoDB
              updatedAt: password.updatedAt,
            };

            // If current user has privacy mode enabled, don't include createdAt and view info
            if (currentUserPrivacyMode) {
              return baseData as {
                id: string;
                key: string;
                value: string;
                description: string;
                username: string;
                sharedWith: any[];
                reports: any[];
                updatedAt: Date;
              };
            }

            // If current user has privacy mode disabled, check owner's privacy mode for each secret
            if (!ownerPrivacyMode || isOwner) {
              const result: any = {
                ...baseData,
                createdAt: password.createdAt,
                viewsCount: secretViews.length,
                secretViews: secretViews,
              };

              return result;
            }

            // Owner has privacy mode enabled, don't include createdAt and view info
            return baseData as {
              id: string;
              key: string;
              value: string;
              description: string;
              username: string;
              sharedWith: any[];
              reports: any[];
              updatedAt: Date;
            };
          }),
      );

      // Group passwords by userId instead of username
      const groupedByOwner = resolvedPasswords.reduce(
        (
          acc: Record<
            string,
            Array<{
              id: string;
              key: string;
              value: string;
              description: string;
              sharedWith: any[];
              reports: any[];
              createdAt?: Date;
              updatedAt: Date;
              secretViews?: any[];
            }>
          >,
          password: {
            id: string;
            key: string;
            value: string;
            description: string;
            username: string;
            sharedWith: any[];
            reports: any[];
            createdAt?: Date;
            updatedAt: Date;
            secretViews?: any[];
          },
        ) => {
          // Get the actual userId from the original password data
          const originalPassword = sharedPasswords.find(
            (sp) => sp._id.toString() === password.id,
          );
          const ownerUserId = originalPassword
            ? String(originalPassword.userId)
            : '';

          if (!acc[ownerUserId]) {
            acc[ownerUserId] = [];
          }

          if (password.key && password.value) {
            const passwordData: any = {
              id: password.id,
              key: password.key,
              value: password.value,
              description: password.description,
              updatedAt: password.updatedAt,
              sharedWith: password.sharedWith || [],
              reports: password.reports,
            };

            // Add optional fields if they exist
            if (password.createdAt) {
              passwordData.createdAt = password.createdAt;
            }
            if (password.secretViews) {
              passwordData.secretViews = password.secretViews;
            }
            passwordData.viewsCount = password.secretViews?.length || 0;

            acc[ownerUserId].push(passwordData);
          }

          return acc;
        },
        {},
      );

      // Get owner information using the new search approach
      const ownerInfoMapByUserId = new Map<string, any>();

      // Extract unique owner userIds from passwords
      const ownerUserIds = [
        ...new Set(
          resolvedPasswords
            .map((p) => {
              const passwordUserId = String(
                sharedPasswords.find((sp) => sp._id.toString() === p.id)
                  ?.userId || '',
              );
              return passwordUserId;
            })
            .filter((id) => id && id !== ''),
        ),
      ];

      // Fetch owner information for each unique userId
      for (const ownerId of ownerUserIds) {
        if (ownerId) {
          console.log(`Looking up owner info for userId: ${ownerId}`);

          // Search for the actual owner user by userId first
          let ownerInfo = await UserFinderUtil.findUserByAnyInfo(
            { userId: ownerId },
            this.userModel,
            this.publicAddressModel,
          );

          // If not found by userId, try to find the owner using other available information
          if (!ownerInfo) {
            console.log(
              `User not found by userId ${ownerId}, trying alternative search methods...`,
            );

            // Find passwords owned by this userId to get additional owner information
            const ownerPasswords = sharedPasswords.filter(
              (p) => String(p.userId) === ownerId,
            );

            // Try to find owner information from the password's user data
            for (const password of ownerPasswords) {
              // If password has username, try searching by username
              if (password.username) {
                ownerInfo = await UserFinderUtil.findUserByAnyInfo(
                  { username: password.username },
                  this.userModel,
                  this.publicAddressModel,
                );
                if (ownerInfo) break;
              }

              // If password has telegramId, try searching by telegramId
              if (password.telegramId) {
                ownerInfo = await UserFinderUtil.findUserByAnyInfo(
                  { telegramId: password.telegramId },
                  this.userModel,
                  this.publicAddressModel,
                );
                if (ownerInfo) break;
              }
            }
          }

          console.log(`Owner info result for userId ${ownerId}:`, ownerInfo);

          if (ownerInfo) {
            ownerInfoMapByUserId.set(ownerId, {
              userId: ownerInfo.userId,
              username: ownerInfo.username || '',
              telegramId: ownerInfo.telegramId || '',
              publicAddress: ownerInfo.publicAddress || '',
            });
          } else {
            console.log(`No owner info found for userId: ${ownerId}`);
            // Store minimal info if no user found
            ownerInfoMapByUserId.set(ownerId, {
              userId: ownerId,
              username: '',
              telegramId: '',
              publicAddress: '',
            });
          }
        }
      }

      const result = Object.entries(groupedByOwner)
        .filter(([userId]) => userId && userId !== '')
        .map(([userId, passwords]) => {
          const ownerInfo = ownerInfoMapByUserId.get(userId);

          return {
            sharedBy: {
              userId: ownerInfo?.userId || userId,
              username: ownerInfo?.username || '',
              telegramId: ownerInfo?.telegramId || null,
              publicAddress: ownerInfo?.publicAddress || null,
            },
            passwords: (passwords as any[]).map((p) => {
              const passwordData: any = {
                id: p.id,
                key: p.key,
                value: p.value,
                description: p.description,
                updatedAt: p.updatedAt,
                sharedWith: p.sharedWith,
                reports: p.reports,
              };

              // Add optional fields if they exist (they were already filtered based on privacy settings)
              if (p.createdAt) {
                passwordData.createdAt = p.createdAt;
              }
              if (p.secretViews) {
                passwordData.secretViews = p.secretViews;
                passwordData.viewsCount = p.secretViews.length;
              } else {
                passwordData.viewsCount = 0;
              }

              return passwordData;
            }),
            count: (passwords as any[]).length,
          };
        });

      result.sort((a, b) => b.count - a.count);

      return { sharedWithMe: result, userCount: result.length };
    } catch (error) {
      // If the error is already an HttpException, preserve its status code
      if (error instanceof HttpException) {
        throw error;
      }
      // For other errors, use BAD_REQUEST as default
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findOneAndUpdate(
    filter: Partial<Password>,
    update: Partial<Password>,
  ): Promise<Password> {
    return this.passwordModel
      .findOneAndUpdate(filter, update, { new: true })
      .exec();
  }

  async updatePasswordWithAuth(
    id: string,
    update: Partial<Password>,
    req?: AuthenticatedRequest,
  ): Promise<Password> {
    const password = await this.passwordModel.findById(id).exec();
    if (!password) {
      throw new HttpException('Password not found', HttpStatus.NOT_FOUND);
    }

    // Validate user authentication with priority for JWT token
    let user;
    let initData: any;

    // Priority 1: JWT token authentication
    if (req?.user && req.user.id) {
      user = await this.userModel
        .findOne({
          _id: req.user.id,
          isActive: true,
        })
        .exec();

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Check if the user is the owner of the password
      if (
        (password.userId ? String(password.userId) : '') !==
        (user._id ? String(user._id) : '')
      ) {
        throw new HttpException(
          'You are not authorized to update this password',
          HttpStatus.FORBIDDEN,
        );
      }

      // Create initData from JWT user info
      initData = {
        telegramId: req.user.telegramId || '',
        username: req.user.username || user.username || '',
        firstName: req.user.firstName || user.firstName || '',
        lastName: req.user.lastName || user.lastName || '',
        authDate: Math.floor(Date.now() / 1000), // Current timestamp
      };
    }
    // Priority 2: Telegram authentication (only if no JWT token)
    else {
      // Only use X-Telegram-Init-Data header when no JWT token is present
      if (!req?.headers?.['x-telegram-init-data']) {
        throw new HttpException(
          'No authentication data provided',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
      const telegramId = parsedData.telegramId;

      user = await this.userModel
        .findOne({
          telegramId: telegramId,
          isActive: true,
        })
        .exec();

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      initData = parsedData;
    }

    // Process sharedWith array to ensure both userId and username are present using enhanced lookup
    const processedUpdate = { ...update };
    if (update.sharedWith?.length > 0) {
      processedUpdate.sharedWith = await Promise.all(
        update.sharedWith.map(async (shared) => {
          // Use the enhanced user lookup function to find complete user information
          const userInfo = await UserFinderUtil.findUserByAnyInfo(
            {
              username: shared.username,
              userId: shared.userId,
              publicAddress: shared.publicAddress,
            },
            this.userModel,
            this.publicAddressModel,
          );

          if (userInfo) {
            // If user found, use complete information
            return {
              ...shared,
              username: userInfo.username.toLowerCase(),
              userId: userInfo.userId,
              publicAddress: shared.publicAddress || userInfo.publicAddress,
            };
          } else {
            // If no user found, keep only the available information
            return {
              ...shared,
              username: shared.username
                ? shared.username.toLowerCase()
                : undefined,
              userId: shared.userId || undefined,
              publicAddress: shared.publicAddress || undefined,
            };
          }
        }),
      );
    }

    // If sharedWith is being updated, check for sharing restrictions
    if (processedUpdate.sharedWith && processedUpdate.sharedWith.length > 0) {
      const user = await this.userModel.findById(password.userId).exec();

      if (user && user.sharingRestricted) {
        await this.validateSharingRestrictions(
          user,
          processedUpdate.sharedWith,
        );
      }
    }

    // Ensure hidden field is maintained or set to false if it doesn't exist
    if (processedUpdate.hidden === undefined) {
      processedUpdate.hidden = password.hidden || false;
    }

    // Always update initData with the correct authentication data
    // This ensures initData reflects the current authentication method
    const authDate = this.getValidAuthDate(initData.authDate);
    processedUpdate.initData = { ...initData, authDate };

    const updatedPassword = await this.passwordModel
      .findByIdAndUpdate(id, processedUpdate, { new: true })
      .exec();
    if (updatedPassword) {
      await this.sendMessageToUsersBySharedWith(updatedPassword);
      // Log secret update with share count
      try {
        await this.loggerService.saveSystemLog(
          {
            event: LogEvent.SecretUpdated,
            message: 'Secret updated',
            key: updatedPassword?.key,
            type: (updatedPassword as any)?.type,
            secretId: String(updatedPassword?._id),
            sharedRecipientsCount: Array.isArray(updatedPassword?.sharedWith)
              ? updatedPassword.sharedWith.length
              : 0,
          },
          {
            userId: updatedPassword?.userId
              ? String(updatedPassword.userId)
              : undefined,
          },
        );
      } catch (e) {
        console.error('Failed to log secret update', e);
      }
    }
    return updatedPassword;
  }

  async findByIdAndUpdate(
    id: string,
    update: Partial<Password>,
  ): Promise<Password> {
    const password = await this.passwordModel.findById(id).exec();
    if (!password) {
      throw new HttpException('Password not found', HttpStatus.NOT_FOUND);
    }

    // If sharedWith is being updated, check for sharing restrictions
    if (update.sharedWith && update.sharedWith.length > 0) {
      const user = await this.userModel.findById(password.userId).exec();

      if (user && user.sharingRestricted) {
        await this.validateSharingRestrictions(user, update.sharedWith);
      }
    }

    // Ensure hidden field is maintained or set to false if it doesn't exist
    if (update.hidden === undefined) {
      update.hidden = password.hidden || false;
    }

    const updatedPassword = await this.passwordModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
    if (updatedPassword) {
      await this.sendMessageToUsersBySharedWith(updatedPassword);
      // Log secret update with share count
      try {
        await this.loggerService.saveSystemLog(
          {
            event: LogEvent.SecretUpdated,
            message: 'Secret updated',
            key: updatedPassword?.key,
            type: (updatedPassword as any)?.type,
            secretId: String(updatedPassword?._id),
            sharedRecipientsCount: Array.isArray(updatedPassword?.sharedWith)
              ? updatedPassword.sharedWith.length
              : 0,
          },
          {
            userId: updatedPassword?.userId
              ? String(updatedPassword.userId)
              : undefined,
          },
        );
      } catch (e) {
        console.error('Failed to log secret update', e);
      }
    }
    return updatedPassword;
  }

  async findOneAndDelete(filter: Partial<Password>): Promise<Password> {
    return this.passwordModel.findOneAndDelete(filter).exec();
  }

  async findByIdAndDelete(id: string): Promise<Password> {
    return this.passwordModel.findByIdAndDelete(id).exec();
  }

  async update(
    id: string,
    updatePasswordDto: Partial<Password>,
  ): Promise<Password> {
    try {
      const password = await this.passwordModel.findById(id).exec();
      if (!password) {
        throw new HttpException('Password not found', HttpStatus.NOT_FOUND);
      }

      // Ensure hidden field is maintained or set to false if it doesn't exist
      if (updatePasswordDto.hidden === undefined) {
        updatePasswordDto.hidden = password.hidden || false;
      }

      const updatedPassword = await this.passwordModel
        .findByIdAndUpdate(id, updatePasswordDto, { new: true })
        .exec();
      // Log secret update with share count
      try {
        if (updatedPassword) {
          await this.loggerService.saveSystemLog(
            {
              event: LogEvent.SecretUpdated,
              message: 'Secret updated',
              key: updatedPassword?.key,
              type: (updatedPassword as any)?.type,
              secretId: String(updatedPassword?._id),
              sharedRecipientsCount: Array.isArray(updatedPassword?.sharedWith)
                ? updatedPassword.sharedWith.length
                : 0,
            },
            {
              userId: updatedPassword?.userId
                ? String(updatedPassword.userId)
                : undefined,
            },
          );
        }
      } catch (e) {
        console.error('Failed to log secret update', e);
      }
      return updatedPassword;
    } catch (error) {
      // If the error is already an HttpException, preserve its status code
      if (error instanceof HttpException) {
        throw error;
      }
      // For other errors, use BAD_REQUEST as default
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async delete(id: string): Promise<Password> {
    try {
      const password = await this.findByIdAndDelete(id);
      if (!password) {
        throw new HttpException('Password not found', HttpStatus.NOT_FOUND);
      }
      return password;
    } catch (error) {
      // If the error is already an HttpException, preserve its status code
      if (error instanceof HttpException) {
        throw error;
      }
      // For other errors, use BAD_REQUEST as default
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async verifyPassword(
    hashedPassword: string,
    plainPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async createOrUpdatePassword(
    passwordData: Partial<Password>,
  ): Promise<Password> {
    const existingPassword = await this.findOne({
      userId: passwordData.userId,
      key: passwordData.key,
    });
    if (existingPassword) {
      return this.findByIdAndUpdate(
        existingPassword._id.toString(),
        passwordData,
      );
    }

    // Ensure hidden field is set to false when creating a new password
    if (passwordData.hidden === undefined) {
      passwordData.hidden = false;
    }

    const newPassword = new this.passwordModel(passwordData);
    const savedPassword = await newPassword.save();
    // Log secret creation into logger table
    try {
      let user: User | null = null;
      try {
        if (savedPassword?.userId) {
          user = await this.userModel.findById(savedPassword.userId).exec();
        }
      } catch (e) {
        // ignore fetching user errors
      }
      await this.loggerService.saveSystemLog(
        {
          event: LogEvent.SecretCreated,
          message: 'New secret created',
          key: savedPassword?.key,
          type: (savedPassword as any)?.type,
          secretId: String(savedPassword?._id),
          sharedRecipientsCount: Array.isArray(savedPassword?.sharedWith)
            ? savedPassword.sharedWith.length
            : 0,
        },
        {
          userId: savedPassword?.userId
            ? String(savedPassword.userId)
            : undefined,
          telegramId: user?.telegramId,
          username: user?.username,
        },
      );
    } catch (e) {
      console.error('Failed to log secret creation', e);
    }
    if (savedPassword) {
      console.log('sending message to users by shared with');
      await this.sendMessageToUsersBySharedWith(savedPassword);
    }
    return savedPassword;
  }

  // Moved from UsersService
  /**
   * Helper method to extract user ID from request
   * Priority: JWT token user.id -> fallback to telegramId
   */
  extractUserIdFromRequest(req: AuthenticatedRequest): string {
    // If JWT token exists, use user.id and ignore X-Telegram-Init-Data completely
    if (req?.user && req.user.id) {
      return req.user.id;
    }
    // If no JWT token, fallback to telegramId from X-Telegram-Init-Data header
    else if (req?.headers?.['x-telegram-init-data']) {
      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
      return parsedData.telegramId;
    } else {
      throw new HttpException(
        'No authentication data provided',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Helper method to extract telegramId from request
   * Priority: JWT token -> X-Telegram-Init-Data header (only if no JWT token)
   */
  extractTelegramIdFromRequest(req: AuthenticatedRequest): string {
    // If JWT token exists, use it and ignore X-Telegram-Init-Data completely
    if (req?.user && req.user.id) {
      return req.user.telegramId || '';
    }
    // Only use X-Telegram-Init-Data header if no JWT token
    else if (req?.headers?.['x-telegram-init-data']) {
      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
      return parsedData.telegramId;
    } else {
      throw new HttpException(
        'No authentication data provided',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Helper method to extract username from request
   * Priority: JWT token -> X-Telegram-Init-Data header (only if no JWT token)
   */
  extractUsernameFromRequest(req: AuthenticatedRequest): string {
    // If JWT token exists, use it and ignore X-Telegram-Init-Data completely
    if (req?.user && req.user.id) {
      return req.user.username || '';
    }
    // Only use X-Telegram-Init-Data header if no JWT token
    else if (req?.headers?.['x-telegram-init-data']) {
      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
      return parsedData.username;
    } else {
      throw new HttpException(
        'No authentication data provided',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Helper method to extract telegramId and initData from Telegram sources only
   * This method should only be called when no JWT token is present
   * Priority: request body -> X-Telegram-Init-Data header
   */
  private extractTelegramDataFromRequest(
    req?: AuthenticatedRequest,
    bodyInitData?: any,
  ): { telegramId: string; initData: any } {
    let telegramId: string;
    let initData: any;

    // Try request body initData first (only for addPassword)
    if (bodyInitData) {
      telegramId = bodyInitData.telegramId;
      initData = bodyInitData;
    }
    // Use X-Telegram-Init-Data header
    else if (req?.headers?.['x-telegram-init-data']) {
      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
      telegramId = parsedData.telegramId;
      initData = parsedData;
    } else {
      throw new HttpException(
        'No Telegram authentication data provided',
        HttpStatus.BAD_REQUEST,
      );
    }

    return { telegramId, initData };
  }

  async addPassword(
    passwordData: CreatePasswordRequestDto,
    req?: AuthenticatedRequest,
  ) {
    try {
      let user;
      let initData: any;
      let latestPublicAddress: string | null = null;

      // Priority 1: JWT token authentication
      if (req?.user && req.user.id) {
        user = await this.userModel
          .findOne({
            _id: req.user.id,
            isActive: true,
          })
          .exec();

        if (!user) {
          throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        // Create initData from JWT user info
        initData = {
          telegramId: req.user.telegramId || '',
          username: req.user.username || user.username || '',
          firstName: req.user.firstName || user.firstName || '',
          lastName: req.user.lastName || user.lastName || '',
          authDate: Math.floor(Date.now() / 1000), // Current timestamp
        };
      }
      // Priority 2: Telegram authentication (only if no JWT token)
      else {
        const { telegramId, initData: extractedInitData } =
          this.extractTelegramDataFromRequest(req, passwordData.initData);

        user = await this.userModel
          .findOne({
            telegramId: telegramId,
            isActive: true,
          })
          .exec();

        if (!user) {
          throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        initData = extractedInitData;

        // Check if X-Telegram-Init-Data is provided in headers (without JWT token)
        if (req?.headers && req.headers['x-telegram-init-data']) {
          try {
            // Get the latest publicAddress for this telegramId
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              latestPublicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            console.log(
              'Error fetching latest publicAddress for telegramId:',
              telegramId,
              error,
            );
            // Continue without publicAddress if there's an error
            latestPublicAddress = null;
          }
        }
      }

      // Process sharedWith array to ensure both userId and username are present
      let processedSharedWith = passwordData.sharedWith;
      if (passwordData.sharedWith?.length > 0) {
        processedSharedWith = await Promise.all(
          passwordData.sharedWith.map(async (shared) => {
            let shouldSendTelegramNotification = false;

            // Use the enhanced user lookup function to find complete user information
            const userInfo = await UserFinderUtil.findUserByAnyInfo(
              {
                username: shared.username,
                userId: shared.userId,
                publicAddress: shared.publicAddress,
              },
              this.userModel,
              this.publicAddressModel,
            );

            if (userInfo) {
              // If user found, use complete information
              shouldSendTelegramNotification = !!userInfo.telegramId;

              return {
                ...shared,
                username: userInfo.username.toLowerCase(),
                userId: userInfo.userId,
                publicAddress: shared.publicAddress || userInfo.publicAddress,
                shouldSendTelegramNotification,
              };
            } else {
              // If no user found but username provided, treat as Telegram username
              if (shared.username) {
                shouldSendTelegramNotification = true;
                return {
                  ...shared,
                  username: shared.username.toLowerCase(),
                  userId: undefined,
                  publicAddress: shared.publicAddress,
                  shouldSendTelegramNotification,
                };
              }

              // If only publicAddress provided and no user found, keep only the public address
              return {
                ...shared,
                username: undefined,
                userId: undefined,
                publicAddress: shared.publicAddress,
                shouldSendTelegramNotification: false,
              };
            }
          }),
        );

        // Filter out null entries (ignored public addresses)
        processedSharedWith = processedSharedWith.filter(
          (item) => item !== null,
        );
      }

      // Check if user is restricted from sharing passwords
      if (user.sharingRestricted && processedSharedWith?.length > 0) {
        // If user is restricted, we need to validate each user they're trying to share with
        await this.validateSharingRestrictions(user, processedSharedWith);
      }

      // Validate parent_secret_id if provided
      let parentSecretId: Types.ObjectId | undefined;
      if (passwordData.parent_secret_id) {
        const parentSecret = await this.passwordModel
          .findById(passwordData.parent_secret_id)
          .exec();

        if (!parentSecret) {
          throw new HttpException(
            'Parent secret not found',
            HttpStatus.NOT_FOUND,
          );
        }

        // Check if parent secret is already a child (has parent_secret_id)
        if (parentSecret.parent_secret_id) {
          throw new HttpException(
            'Parent secret cannot be a child secret itself',
            HttpStatus.BAD_REQUEST,
          );
        }

        parentSecretId = new Types.ObjectId(passwordData.parent_secret_id);
      }

      // get valid auth date
      const authDate = this.getValidAuthDate(initData.authDate);

      // create password
      const password = await this.createOrUpdatePassword({
        userId: (user as UserDocument)._id as Types.ObjectId,
        key: passwordData.key,
        value: passwordData.value,
        description: passwordData.description,
        isActive: true,
        type: passwordData.type,
        sharedWith: processedSharedWith,
        hidden: false, // Explicitly set hidden to false
        parent_secret_id: parentSecretId,
        initData: { ...initData, authDate },
        publicAddress: req?.user?.publicAddress || latestPublicAddress || '', // Use JWT publicAddress or latest publicAddress from Telegram auth
      });

      // Get the full password object including _id
      const passwordObj = (password as PasswordDocument).toObject();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { userId: _, ...passwordWithId } = passwordObj;

      // Send notification to parent password owner if this is a child password
      if (passwordData.parent_secret_id) {
        await this.sendChildPasswordNotificationToParentOwner(
          passwordData.parent_secret_id,
          user,
          passwordData.key,
          passwordObj._id,
        );

        // Send notification to users who have the parent secret shared with them
        await this.sendChildPasswordNotificationToSharedUsers(
          passwordData.parent_secret_id,
          user,
          passwordData.key,
          passwordObj._id,
        );
      }

      return passwordWithId;
    } catch (error) {
      // If the error is already an HttpException, preserve its status code
      if (error instanceof HttpException) {
        throw error;
      }
      // For other errors, use BAD_REQUEST as default
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Validates if a restricted user can share passwords with specific users
   * A restricted user can only share with users who have shared passwords with them
   * @param user The user who wants to share passwords
   * @param sharedWith Array of users to share with
   * @throws HttpException if sharing is not allowed
   */
  private async validateSharingRestrictions(
    user: UserDocument,
    sharedWith: { username: string }[],
  ): Promise<void> {
    // Get all passwords shared with this user
    const passwordsSharedWithUser = await this.passwordModel.find({
      'sharedWith.username': user.username,
      isActive: true,
    });

    // Extract unique usernames of people who shared passwords with this user
    const usersWhoSharedWithThisUser = new Set(
      passwordsSharedWithUser
        .map((p) => p.initData?.username?.toLowerCase())
        .filter(Boolean),
    );

    // Check each user they're trying to share with
    for (const shareTarget of sharedWith) {
      const targetUsername = shareTarget.username.toLowerCase();

      // If this user doesn't have any passwords shared with the restricted user,
      // then the restricted user cannot share with them
      if (!usersWhoSharedWithThisUser.has(targetUsername)) {
        throw new HttpException(
          `Due to sharing restrictions, you can only share passwords with users who have shared passwords with you. User ${shareTarget.username} has not shared any passwords with you.`,
          HttpStatus.FORBIDDEN,
        );
      }
    }
  }

  async sendMessageToUsersBySharedWith(passwordUser: Password) {
    try {
      console.log('sending message to users by shared with internally');

      // Skip sending shared notifications for child secrets
      if (passwordUser.parent_secret_id) {
        console.log('Skipping shared notifications for child secret');
        return;
      }

      const user = await this.userModel.findById(passwordUser.userId).exec();

      if (!user) {
        console.error(
          'User not found when trying to send shared password messages',
        );
        return; // Don't throw exception, just return to prevent breaking the main flow
      }

      // Do NOT short‑circuit when the sender has no Telegram ID.
      // We still need to create notifications (fallback) and we can send Telegram messages to recipients who DO have Telegram.
      if (!user.telegramId || user.telegramId === '') {
        console.log(
          'Sender has no Telegram ID — proceeding with fallback and recipient-specific notifications',
        );
      }

      if (!passwordUser.sharedWith || passwordUser.sharedWith.length === 0) {
        console.log('No shared with users to notify');
        return;
      }

      console.log(
        `Attempting to send messages to ${passwordUser.sharedWith.length} users`,
      );

      // Use Promise.all to properly wait for all messages and handle errors
      const messagePromises = passwordUser.sharedWith.map(
        async (sharedWith) => {
          try {
            // Find recipient using ANY available identifier (userId, username, publicAddress, telegramId)
            const sharedWithInfo = await UserFinderUtil.findUserByAnyInfo(
              {
                username: sharedWith.username,
                userId: (sharedWith as any)?.userId,
                publicAddress: (sharedWith as any)?.publicAddress,
                telegramId: (sharedWith as any)?.telegramId,
              },
              this.userModel,
              this.publicAddressModel,
            );

            if (!sharedWithInfo) {
              console.log(
                'Skipping notification - shared recipient not found by any identifier',
              );
              return;
            }

            const sharedWithUserId = new Types.ObjectId(sharedWithInfo.userId);
            // Skip notification to self before any fallback logging
            if (
              (sharedWithUserId ? String(sharedWithUserId) : '') ===
              (user._id ? String(user._id) : '')
            ) {
              console.log(
                'Secret owner is the same as shared user, skipping notification',
              );
              return;
            }

            if (!sharedWithInfo.telegramId) {
              console.log(
                `Recipient ${sharedWithInfo.username || sharedWithInfo.userId} has no Telegram ID`,
              );
              // Fallback: log a parallel notification when recipient has no Telegram
              try {
                // Fetch latest public addresses for sender and recipient (if available)
                let senderPublicAddress: string | undefined;
                let recipientPublicAddress: string | undefined;

                try {
                  const senderAddrResp =
                    await this.publicAddressesService.getLatestAddressByUserId(
                      String(user._id),
                    );
                  senderPublicAddress = senderAddrResp?.data?.publicKey;
                } catch (e) {
                  senderPublicAddress = undefined;
                }

                try {
                  const recipientAddrResp =
                    await this.publicAddressesService.getLatestAddressByUserId(
                      String(sharedWithInfo.userId),
                    );
                  recipientPublicAddress = recipientAddrResp?.data?.publicKey;
                } catch (e) {
                  recipientPublicAddress = undefined;
                }

                const fallbackMessage = `Secret shared with you.
                 User ${user.username} [ User Public Address: ${senderPublicAddress || 'N/A'}] has shared a secret with you. 
                 You can view it under the "Shared with me" tab.`;

                await this.notificationsService.logNotificationWithResult(
                  {
                    message: fallbackMessage,
                    type: NotificationType.PASSWORD_SHARED,
                    recipientUserId: sharedWithUserId,
                    recipientUsername: sharedWithInfo.username,
                    senderUserId: user._id as Types.ObjectId,
                    senderUsername: user.username,
                    reason:
                      'Telegram unavailable: recipient has no Telegram ID',
                    subject: 'Secret Shared With You',
                    relatedEntityType: 'password',
                    relatedEntityId: passwordUser._id as Types.ObjectId,
                    parentId: undefined,
                    metadata: {
                      passwordKey: passwordUser.key,
                      sharedAt: new Date(),
                      senderPublicAddress,
                      recipientPublicAddress,
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
                  'Failed to log fallback notification for user without Telegram:',
                  logError,
                );
              }
              return;
            }

            console.log(
              `Sending notification to ${sharedWithInfo.username || sharedWithInfo.userId} (${sharedWithInfo.telegramId})`,
            );
            const userName =
              user.firstName && user.firstName.trim() !== ''
                ? user.firstName + ' ' + user.lastName
                : user.username;

            const message = `🔐 <b>Secret Shared With You</b> 

User <span class="tg-spoiler"><b>${userName}</b></span> has shared a secret with you 🔁.

You can view it under the <b>"Shared with me"</b> tab 📂.
`;

            const replyMarkup = {
              inline_keyboard: [
                [
                  {
                    text: 'Open Secret',
                    url: `${this.configService.get<string>('TELEGRAM_BOT_URL')}?startapp=${passwordUser._id}_shared_`,
                  },
                ],
              ],
            };

            const result = await this.telegramService.sendMessage(
              Number(sharedWithInfo.telegramId),
              message,
              3,
              replyMarkup,
              {
                type: NotificationType.PASSWORD_SHARED,
                recipientId: sharedWithUserId,
                recipientUsername: sharedWithInfo.username,
                senderUserId: user._id as Types.ObjectId,
                senderUsername: user.username,
                reason: 'Password shared notification',
                subject: 'Secret Shared With You',
                relatedEntityType: 'password',
                relatedEntityId: passwordUser._id as Types.ObjectId,
                parentId: undefined,
                metadata: {
                  passwordKey: passwordUser.key,
                  sharedAt: new Date(),
                },
              },
            );

            console.log(
              `Message to ${sharedWithInfo.username || sharedWithInfo.userId} sent result: ${result}`,
            );
            return result;
          } catch (error) {
            console.error(
              `Failed to send notification to ${sharedWith.username || (sharedWith as any)?.userId || (sharedWith as any)?.publicAddress}:`,
              error.message,
            );
            // Don't rethrow to prevent breaking other notifications
            return false;
          }
        },
      );

      // Wait for all messages to be sent, but don't fail if some fail
      await Promise.all(messagePromises);
      console.log('All notifications processed');
    } catch (error) {
      console.error('Error in sendMessageToUsersBySharedWith:', error.message);
      // Don't rethrow to prevent breaking the main operation
    }
  }

  /**
   * Send notification to parent password owner when a child password is created
   * @param parentSecretId The ID of the parent password
   * @param childUser The user who created the child password
   * @param childSecretName The name/key of the child password
   */
  private async sendChildPasswordNotificationToParentOwner(
    parentSecretId: string,
    childUser: UserDocument,
    childSecretName: string,
    childSecretId: string,
  ): Promise<void> {
    try {
      // Find the parent password
      const parentPassword = await this.passwordModel
        .findById(parentSecretId)
        .exec();

      if (!parentPassword) {
        console.error('Parent password not found for notification');
        return;
      }

      // Find the parent password owner
      const parentOwner = await this.userModel
        .findById(parentPassword.userId)
        .exec();

      if (!parentOwner) {
        console.error('Parent password owner not found');
        return;
      }

      // Check if child user is the same as parent owner - don't send notification to self
      if (
        (parentOwner._id ? String(parentOwner._id) : '') ===
        (childUser._id ? String(childUser._id) : '')
      ) {
        console.log(
          'Child password creator is the same as parent owner, skipping notification',
        );
        return;
      }

      // Check if parent owner has a valid telegramId before sending notification
      if (!parentOwner.telegramId || parentOwner.telegramId === '') {
        console.log(
          'Parent password owner has no valid Telegram ID, logging parallel notification',
        );
        // Fallback: log a parallel notification when parent owner has no Telegram
        try {
          let senderPublicAddress: string | undefined;
          let recipientPublicAddress: string | undefined;

          try {
            const senderAddrResp =
              await this.publicAddressesService.getLatestAddressByUserId(
                String(childUser._id),
              );
            senderPublicAddress = senderAddrResp?.data?.publicKey;
          } catch (e) {
            senderPublicAddress = undefined;
          }

          try {
            const recipientAddrResp =
              await this.publicAddressesService.getLatestAddressByUserId(
                String(parentOwner._id),
              );
            recipientPublicAddress = recipientAddrResp?.data?.publicKey;
          } catch (e) {
            recipientPublicAddress = undefined;
          }

          const fallbackMessage = `Child secret response.
          User ${childUser.username} [ User Public Address: ${senderPublicAddress || 'N/A'}] has responded to your secret with a new secret.`;

          await this.notificationsService.logNotificationWithResult(
            {
              message: fallbackMessage,
              type: NotificationType.PASSWORD_CHILD_RESPONSE,
              recipientUserId: parentOwner._id as Types.ObjectId,
              recipientUsername: parentOwner.username,
              senderUserId: childUser._id as Types.ObjectId,
              senderUsername: childUser.username,
              reason: 'Telegram unavailable: parent owner has no Telegram ID',
              subject: 'Child Secret Response',
              relatedEntityType: 'password',
              relatedEntityId: new Types.ObjectId(childSecretId),
              parentId: new Types.ObjectId(parentSecretId),
              metadata: {
                parentSecretId: parentSecretId,
                childSecretName: childSecretName,
                senderPublicAddress,
                recipientPublicAddress,
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
            'Failed to log fallback notification (parent owner without Telegram):',
            logError,
          );
        }
        return;
      }

      // Prepare user display name
      const childUserDisplayName =
        childUser.firstName && childUser.firstName.trim() !== ''
          ? `${childUser.firstName} ${childUser.lastName || ''}`.trim()
          : childUser.username;

      // Get current date and time
      const now = new Date();
      const dateTime = now.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });

      // Create the notification message
      const message = `🔐 <b>Child Secret Response</b>

User <span class="tg-spoiler"><b>${childUserDisplayName}</b></span> has responded to your secret with a new secret " 🔄

📅 <b>Response Date & Time:</b> ${dateTime}

You can view the response in your secrets list 📋.`;

      // Create the reply markup with inline keyboard
      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: 'Open Reply',
              url: `${this.configService.get<string>('TELEGRAM_BOT_URL')}?startapp=${parentSecretId}_mydata_${childSecretId}`,
            },
          ],
        ],
      };

      // Log the reply_markup structure and contents
      console.log(
        'Reply markup structure:',
        JSON.stringify(replyMarkup, null, 2),
      );

      console.log(
        `Sending child password notification to parent owner ${parentOwner.username} (${parentOwner.telegramId})`,
      );

      // Send the notification
      const result = await this.telegramService.sendMessage(
        Number(parentOwner.telegramId),
        message,
        3,
        replyMarkup,
        {
          type: NotificationType.PASSWORD_CHILD_RESPONSE,
          recipientId: parentOwner._id as Types.ObjectId,
          recipientUsername: parentOwner.username,
          senderUserId: childUser._id as Types.ObjectId,
          senderUsername: childUser.username,
          reason: 'Child password response notification',
          subject: 'Child Secret Response',
          relatedEntityType: 'password',
          relatedEntityId: new Types.ObjectId(childSecretId),
          parentId: new Types.ObjectId(parentSecretId),
          metadata: {
            parentSecretId: parentSecretId,
            childSecretName: childSecretName,
            responseDate: now,
          },
        },
      );

      console.log(
        `Child password notification sent to ${parentOwner.username}, result: ${result}`,
      );
    } catch (error) {
      console.error(
        'Error sending child password notification to parent owner:',
        error.message,
      );
      // Don't rethrow to prevent breaking the main operation
    }
  }

  private async sendChildPasswordNotificationToSharedUsers(
    parentSecretId: string,
    childUser: UserDocument,
    childSecretName: string,
    childSecretId: string,
  ): Promise<void> {
    try {
      // Find the parent password
      const parentPassword = await this.passwordModel
        .findById(parentSecretId)
        .exec();

      if (!parentPassword) {
        console.error('Parent password not found for shared user notification');
        return;
      }

      // Find the parent password owner
      const parentOwner = await this.userModel
        .findById(parentPassword.userId)
        .exec();

      if (!parentOwner) {
        console.error('Parent password owner not found');
        return;
      }

      // Get shared users from parent password
      const sharedWith = parentPassword.sharedWith || [];

      if (sharedWith.length === 0) {
        console.log('No shared users found for parent password');
        return;
      }

      // Prepare child user display name
      const childUserDisplayName =
        childUser.firstName && childUser.firstName.trim() !== ''
          ? `${childUser.firstName} ${childUser.lastName || ''}`.trim()
          : childUser.username;

      // Prepare parent owner display name
      const parentOwnerDisplayName =
        parentOwner.firstName && parentOwner.firstName.trim() !== ''
          ? `${parentOwner.firstName} ${parentOwner.lastName || ''}`.trim()
          : parentOwner.username;

      // Get current date and time
      const now = new Date();
      const dateTime = now.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });

      // Iterate through shared users and send notifications
      for (const sharedUser of sharedWith) {
        try {
          // Find the shared user by ANY available info (userId, username, publicAddress, telegramId)
          const sharedUserInfo = await UserFinderUtil.findUserByAnyInfo(
            {
              username: sharedUser.username,
              userId: (sharedUser as any)?.userId,
              publicAddress: (sharedUser as any)?.publicAddress,
              telegramId: (sharedUser as any)?.telegramId,
            },
            this.userModel,
            this.publicAddressModel,
          );

          if (!sharedUserInfo) {
            console.log(
              `Shared user not found by any identifier: ${sharedUser.username || (sharedUser as any)?.userId || (sharedUser as any)?.publicAddress}`,
            );
            continue;
          }
          const sharedUserId = new Types.ObjectId(sharedUserInfo.userId);

          // Check if shared user is the same as child user - don't send notification to self
          if (
            (sharedUserId ? String(sharedUserId) : '') ===
            (childUser._id ? String(childUser._id) : '')
          ) {
            console.log(
              'Child password creator is the same as shared user, skipping notification',
            );
            continue;
          }

          // Check if shared user has a valid telegramId
          if (!sharedUserInfo.telegramId || sharedUserInfo.telegramId === '') {
            console.log(
              `Shared user ${sharedUserInfo.username || sharedUserInfo.userId} has no valid Telegram ID, logging parallel notification`,
            );
            // Fallback: log a parallel notification when shared user has no Telegram
            try {
              let senderPublicAddress: string | undefined;
              let recipientPublicAddress: string | undefined;

              try {
                const senderAddrResp =
                  await this.publicAddressesService.getLatestAddressByUserId(
                    String(childUser._id),
                  );
                senderPublicAddress = senderAddrResp?.data?.publicKey;
              } catch (e) {
                senderPublicAddress = undefined;
              }

              try {
                const recipientAddrResp =
                  await this.publicAddressesService.getLatestAddressByUserId(
                    String(sharedUserInfo.userId),
                  );
                recipientPublicAddress = recipientAddrResp?.data?.publicKey;
              } catch (e) {
                recipientPublicAddress = undefined;
              }

              const fallbackMessage = `Reply to shared secret.\n\nUser [id: ${String(
                childUser._id,
              )}, publicAddress: ${senderPublicAddress || 'N/A'}] has replied to [id: ${String(
                parentOwner._id,
              )}, publicAddress: ${
                recipientPublicAddress || 'N/A'
              }] secret that was shared with you.`;

              await this.notificationsService.logNotificationWithResult(
                {
                  message: fallbackMessage,
                  type: NotificationType.PASSWORD_CHILD_RESPONSE,
                  recipientUserId: sharedUserId,
                  recipientUsername: sharedUserInfo.username,
                  senderUserId: childUser._id as Types.ObjectId,
                  senderUsername: childUser.username,
                  reason:
                    'Telegram unavailable: shared user has no Telegram ID',
                  subject: 'Reply to Shared Secret',
                  relatedEntityType: 'password',
                  relatedEntityId: new Types.ObjectId(childSecretId),
                  parentId: new Types.ObjectId(parentSecretId),
                  metadata: {
                    parentSecretId: parentSecretId,
                    childSecretName: childSecretName,
                    senderPublicAddress,
                    recipientPublicAddress,
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
                'Failed to log fallback notification (shared user without Telegram):',
                logError,
              );
            }
            continue;
          }

          // Create the notification message
          const message = `🔐 <b>Reply to Shared Secret</b>

User <span class="tg-spoiler"><b>${childUserDisplayName}</b></span> has replied to <b>${parentOwnerDisplayName}</b>'s secret that was shared with you 🔄

📅 <b>Reply Date & Time:</b> ${dateTime}

You can view the reply in your shared secrets list 📋.`;

          // Create the reply markup with inline keyboard
          const replyMarkup = {
            inline_keyboard: [
              [
                {
                  text: 'Open Reply',
                  url: `${this.configService.get<string>('TELEGRAM_BOT_URL')}?startapp=${parentSecretId}_shared_${childSecretId}`,
                },
              ],
            ],
          };

          console.log(
            `Sending child password notification to shared user ${sharedUserInfo.username || sharedUserInfo.userId} (${sharedUserInfo.telegramId})`,
          );

          // Send the notification
          const result = await this.telegramService.sendMessage(
            Number(sharedUserInfo.telegramId),
            message,
            3,
            replyMarkup,
            {
              type: NotificationType.PASSWORD_CHILD_RESPONSE,
              recipientUserId: sharedUserId,
              recipientUsername: sharedUserInfo.username,
              senderUserId: childUser._id as Types.ObjectId,
              senderUsername: childUser.username,
              reason: 'Child password response notification to shared user',
              subject: 'Reply to Shared Secret',
              relatedEntityType: 'password',
              relatedEntityId: new Types.ObjectId(childSecretId),
              parentId: new Types.ObjectId(parentSecretId),
              metadata: {
                parentSecretId: parentSecretId,
                childSecretName: childSecretName,
                parentOwnerUsername: parentOwner.username,
                responseDate: now,
              },
            },
          );

          console.log(
            `Child password notification sent to shared user ${sharedUserInfo.username || sharedUserInfo.userId}, result: ${result}`,
          );
        } catch (userError) {
          console.error(
            `Error sending notification to shared user ${sharedUser.username || (sharedUser as any)?.userId || (sharedUser as any)?.publicAddress}:`,
            userError.message,
          );
          // Continue with next user
        }
      }
    } catch (error) {
      console.error(
        'Error sending child password notification to shared users:',
        error.message,
      );
      // Don't rethrow to prevent breaking the main operation
    }
  }

  private getValidAuthDate(authDateInput: any): Date {
    // check if input is number (timestamp)
    if (typeof authDateInput === 'number') {
      return new Date(authDateInput * 1000); // convert timestamp to milliseconds
    }

    // check if input is string and try to convert it to number
    if (typeof authDateInput === 'string') {
      const timestamp = parseInt(authDateInput, 10);
      if (!isNaN(timestamp)) {
        return new Date(timestamp * 1000);
      }
      // try to parse as date string directly
      const date = new Date(authDateInput);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // if authDateInput is already a Date object
    if (authDateInput instanceof Date) {
      return authDateInput;
    }

    // fallback to current date
    return new Date();
  }

  /**
   * Delete a password only if the authenticated user is the owner
   * @param id The ID of the password to delete
   * @param telegramId The Telegram ID of the authenticated user
   * @returns The deleted password document
   * @throws HttpException if the password is not found or user is not the owner
   */
  async deletePasswordByOwner(
    id: string,
    telegramId: string,
  ): Promise<Password> {
    try {
      // Find the user by telegramId
      const user = await this.userModel
        .findOne({ telegramId, isActive: true })
        .exec();
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Find the password by ID
      const password = await this.passwordModel.findById(id).exec();

      // Check if password exists
      if (!password) {
        throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
      }

      // Check if the authenticated user is the owner of the password
      if (
        !password.userId.equals(
          new Types.ObjectId(user._id ? String(user._id) : ''),
        )
      ) {
        throw new HttpException(
          'You are not authorized to delete this secret',
          HttpStatus.FORBIDDEN,
        );
      }

      // Delete the password
      const deletedPassword = await this.passwordModel
        .findByIdAndDelete(id)
        .exec();
      return deletedPassword;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Set the hidden field of a password to true
   * Creates the field if it doesn't exist
   * Only the owner of the password can perform this action
   * @param id The ID of the password to hide
   * @param telegramId The Telegram ID of the authenticated user
   * @returns The updated password document
   * @throws HttpException if the password is not found or user is not the owner
   */
  async hidePassword(id: string, telegramId: string): Promise<Password> {
    try {
      // Find the user by telegramId
      const user = await this.userModel
        .findOne({ telegramId, isActive: true })
        .exec();
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Find the password by ID
      const password = await this.passwordModel.findById(id).exec();

      // Check if password exists
      if (!password) {
        throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
      }

      // Check if the authenticated user is the owner of the password
      if (
        !password.userId.equals(
          new Types.ObjectId(user._id ? String(user._id) : ''),
        )
      ) {
        throw new HttpException(
          'You are not authorized to modify this secret',
          HttpStatus.FORBIDDEN,
        );
      }

      // Set the hidden field to true
      const updatedPassword = await this.passwordModel
        .findByIdAndUpdate(id, { hidden: true }, { new: true })
        .exec();

      return updatedPassword;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get child passwords for a specific parent password with pagination
   * Only accessible by the owner of the parent password or users who own some child passwords
   * @param parentId The ID of the parent password
   * @param telegramId The Telegram ID of the authenticated user
   * @param page The page number (1-based)
   * @param limit The number of passwords per page
   * @returns Object containing paginated child passwords and pagination info
   * @throws HttpException if the parent password is not found or user has no access
   */
  async getChildPasswords(
    parentId: string,
    telegramId: string,
    page: number = 1,
    limit: number = 10,
    currentUserPrivacyMode: boolean = false,
  ): Promise<{
    passwords: passwordReturns[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    try {
      // Find the parent password by ID
      const parentPassword = await this.passwordModel.findById(parentId).exec();

      // Check if parent password exists
      if (!parentPassword) {
        throw new HttpException(
          'Parent secret not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // Check if parent password is actually a parent (no parent_secret_id)
      if (parentPassword.parent_secret_id) {
        throw new HttpException(
          'This secret is not a parent secret',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Verify user exists and is active
      const user = await this.userModel
        .findOne({ telegramId, isActive: true })
        .exec();

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Check if the authenticated user is the owner of the parent password OR has access to it OR owns any child password
      const isOwner = parentPassword.userId.equals(
        new Types.ObjectId(user._id ? String(user._id) : ''),
      );
      const hasAccess =
        parentPassword.sharedWith &&
        parentPassword.sharedWith.some(
          (shared) => shared.username === user.username,
        );

      // Check if user owns any child password
      const ownsChildPassword = await this.passwordModel.exists({
        parent_secret_id: new Types.ObjectId(parentId),
        userId: new Types.ObjectId(user._id ? String(user._id) : ''),
        isActive: true,
      });

      if (!isOwner && !hasAccess && !ownsChildPassword) {
        throw new HttpException(
          'You are not authorized to view child secrets for this parent secret',
          HttpStatus.FORBIDDEN,
        );
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Define the base query - return all child passwords regardless of ownership
      const baseQuery = {
        parent_secret_id: new Types.ObjectId(parentId),
        isActive: true,
        $or: [{ hidden: false }, { hidden: { $exists: false } }],
      };

      // Get total count for pagination
      const totalCount = await this.passwordModel
        .countDocuments(baseQuery)
        .exec();

      // Find child passwords with pagination
      const childPasswords = await this.passwordModel
        .find(baseQuery)
        .select(
          'key value description updatedAt createdAt sharedWith type hidden initData userId secretViews',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      console.log(
        'Child passwords found:',
        `${childPasswords.length} of ${totalCount} total`,
      );

      // If no child passwords found, throw NOT_FOUND
      if (totalCount === 0) {
        throw new HttpException('There are no children', HttpStatus.NOT_FOUND);
      }

      // Get unique user IDs from child passwords
      const userIds = [
        ...new Set(
          childPasswords
            .map((password) => (password.userId ? String(password.userId) : ''))
            .filter((id) => id),
        ),
      ];

      // Fetch privacy modes and user info for all owners
      const ownerPrivacyMap = new Map<string, boolean>();
      const ownerInfoMap = new Map<
        string,
        {
          id: string;
          telegramId?: string;
          firstName?: string;
          lastName?: string;
          publicAddress?: string;
        }
      >();
      const owners = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('_id privacyMode telegramId firstName lastName')
        .exec();

      // Get latest public addresses for all owners
      for (const owner of owners) {
        const ownerId = owner._id ? String(owner._id) : '';
        ownerPrivacyMap.set(ownerId, owner.privacyMode || false);

        let publicAddress: string | undefined;

        // Try to get latest public address by telegramId first
        if (owner.telegramId) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                owner.telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              publicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            // If no address found by telegramId, try by userId
          }
        }

        // If no address found by telegramId or user has no telegramId, try by userId
        if (!publicAddress) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByUserId(
                ownerId,
              );
            if (addressResponse.success && addressResponse.data) {
              publicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            // If no address found, latestPublicAddress remains undefined
          }
        }

        ownerInfoMap.set(ownerId, {
          id: ownerId,
          telegramId: owner.telegramId,
          firstName: owner.firstName,
          lastName: owner.lastName,
          publicAddress,
        });
      }

      // Get current user info to check ownership
      const currentUser = await this.userModel
        .findOne({ telegramId })
        .select('_id')
        .exec();
      const currentUserId = currentUser?._id ? String(currentUser._id) : '';

      // Transform child passwords to match passwordReturns format
      const passwordWithReports = await Promise.all(
        childPasswords.map(async (password) => {
          // Fetch unresolved reports for this password
          const reports = await this.reportModel
            .find({
              $or: [
                { secret_id: password._id },
                { secret_id: password._id.toString() },
              ],
              resolved: false,
            })
            .exec();

          // Transform reports to include reporter username
          const reportInfo: PasswordReportInfo[] = await Promise.all(
            reports.map(async (report) => {
              // Get reporter user info
              const reporter = await this.userModel
                .findOne({ telegramId: report.reporterTelegramId })
                .select('username')
                .exec();

              return {
                reporterUsername: reporter ? reporter.username : 'Unknown',
                report_type: report.report_type,
                reason: report.reason,
                createdAt: report.createdAt,
              };
            }),
          );

          // Get owner privacy mode and check if current user is owner
          const passwordUserId = password.userId ? String(password.userId) : '';
          const ownerPrivacyMode = ownerPrivacyMap.get(passwordUserId) || false;
          const isCurrentUserOwner = passwordUserId === currentUserId;

          // Get owner info for firstName and lastName
          const ownerInfo = ownerInfoMap.get(passwordUserId) || {
            id: passwordUserId,
            telegramId: undefined,
            firstName: undefined,
            lastName: undefined,
            publicAddress: undefined,
          };

          // Base password data
          const passwordData: any = {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            username: password.initData?.username || 'Unknown', // Include username of password owner
            ownerId: ownerInfo.id, // Add owner ID
            ownerTelegramId: ownerInfo.telegramId, // Add owner Telegram ID
            firstName: ownerInfo.firstName,
            lastName: ownerInfo.lastName,
            publicAddress: ownerInfo.publicAddress, // Add latest public address
            updatedAt: password.updatedAt,
            hidden: password.hidden || false,
            reports: reportInfo,
          };

          // Apply privacy logic: if current user has privacy mode enabled, don't include createdAt and view info
          // Otherwise, check each secret individually based on owner's privacy mode
          if (!currentUserPrivacyMode) {
            // If owner doesn't have privacy mode enabled OR current user is the owner, include createdAt and view info
            if (!ownerPrivacyMode || isCurrentUserOwner) {
              passwordData.createdAt = password.createdAt;
              const secretViews = password.secretViews || [];
              passwordData.viewsCount = secretViews.length;
              passwordData.secretViews = secretViews;
            }
          }

          return passwordData;
        }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        passwords: passwordWithReports,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get user passwords with optional pagination
   * @param telegramId The Telegram ID of the user
   * @param page Optional page number for pagination
   * @param limit Optional limit for pagination
   * @returns Either paginated response or simple array based on parameters
   */
  async findByUserTelegramIdWithPagination(
    telegramId: string,
    page?: number,
    limit?: number,
  ): Promise<passwordReturns[] | PaginatedResponse<passwordReturns>> {
    try {
      if (!telegramId) {
        throw new Error('Telegram ID is required');
      }
      const user = await this.userModel
        .findOne({ telegramId, isActive: true })
        .exec();
      if (!user) {
        throw new Error('telegramId is not valid');
      }

      // If pagination parameters are not provided or incomplete, return original response
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        return this.findByUserTelegramId(telegramId);
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Base query for finding passwords
      const baseQuery = {
        userId: user._id,
        isActive: true,
        $and: [
          { $or: [{ hidden: false }, { hidden: { $exists: false } }] },
          {
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          },
        ],
      };

      // Get total count for pagination
      const totalCount = await this.passwordModel
        .countDocuments(baseQuery)
        .exec();

      // Find passwords with pagination
      const passwords = await this.passwordModel
        .find(baseQuery)
        .select(
          'key value description updatedAt createdAt sharedWith type hidden secretViews',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Transform passwords with reports
      const passwordWithSharedWithAsUsernames = await Promise.all(
        passwords.map(async (password) => {
          // Fetch unresolved reports for this password
          const reports = await this.reportModel
            .find({
              $or: [
                { secret_id: password._id },
                { secret_id: password._id.toString() },
              ],
              resolved: false,
            })
            .exec();

          // Transform reports to include reporter username
          const reportInfo: PasswordReportInfo[] = await Promise.all(
            reports.map(async (report) => {
              // Get reporter user info
              const reporter = await this.userModel
                .findOne({ telegramId: report.reporterTelegramId })
                .select('username')
                .exec();

              return {
                reporterUsername: reporter ? reporter.username : 'Unknown',
                report_type: report.report_type,
                reason: report.reason,
                createdAt: report.createdAt,
              };
            }),
          );

          const secretViews = password.secretViews || [];
          return {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            updatedAt: password.updatedAt,
            createdAt: password.createdAt,
            hidden: password.hidden || false,
            publicAddress: password.publicAddress,
            reports: reportInfo,
            viewsCount: secretViews.length,
            secretViews: secretViews,
          };
        }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        data: passwordWithSharedWithAsUsernames,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findByUserIdWithPagination(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<passwordReturns[] | PaginatedResponse<passwordReturns>> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const user = await this.userModel
        .findOne({ _id: userId, isActive: true })
        .exec();
      if (!user) {
        throw new Error('userId is not valid');
      }

      // If pagination parameters are not provided or incomplete, return original response
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        // Call the string version of findByUserId explicitly
        return this.findByUserId(userId as string);
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Base query for finding passwords
      const baseQuery = {
        userId: user._id,
        isActive: true,
        $and: [
          { $or: [{ hidden: false }, { hidden: { $exists: false } }] },
          {
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          },
        ],
      };

      // Get total count for pagination
      const totalCount = await this.passwordModel
        .countDocuments(baseQuery)
        .exec();

      // Find passwords with pagination
      const passwords = await this.passwordModel
        .find(baseQuery)
        .select(
          'key value description updatedAt createdAt sharedWith type hidden publicAddress',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Transform passwords with reports
      const passwordWithSharedWithAsUsernames = await Promise.all(
        passwords.map(async (password) => {
          // Fetch unresolved reports for this password
          const reports = await this.reportModel
            .find({
              $or: [
                { secret_id: password._id },
                { secret_id: password._id.toString() },
              ],
              resolved: false,
            })
            .exec();

          // Transform reports to include reporter username
          const reportInfo: PasswordReportInfo[] = await Promise.all(
            reports.map(async (report) => {
              // Get reporter user info
              const reporter = await this.userModel
                .findOne({ telegramId: report.reporterTelegramId })
                .select('username')
                .exec();

              return {
                reporterUsername: reporter ? reporter.username : 'Unknown',
                report_type: report.report_type,
                reason: report.reason,
                createdAt: report.createdAt,
              };
            }),
          );

          const secretViews = password.secretViews || [];
          return {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            updatedAt: password.updatedAt,
            createdAt: password.createdAt,
            hidden: password.hidden || false,
            reports: reportInfo,
            viewsCount: secretViews.length,
            secretViews: secretViews,
          };
        }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        data: passwordWithSharedWithAsUsernames,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      };
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get shared with data with optional pagination
   * @param telegramId The Telegram ID of the user
   * @param key The password key
   * @param page Optional page number for pagination
   * @param limit Optional limit for pagination
   * @returns Either paginated response or simple array based on parameters
   */
  async findSharedWithByTelegramIdWithPagination(
    telegramId: string,
    key: string,
    page?: number,
    limit?: number,
  ): Promise<SharedWithDto[] | PaginatedResponse<SharedWithDto>> {
    try {
      if (!telegramId) {
        throw new Error('Telegram ID is required');
      }
      const user = await this.userModel.findOne({
        telegramId,
        isActive: true,
      });
      if (!user) {
        throw new Error('telegramId is not valid');
      }
      if (!key) {
        throw new Error('Key is required');
      }
      const passwordKey = await this.passwordModel.findOne({
        key,
        isActive: true,
      });
      if (!passwordKey) {
        throw new Error('Key is not found');
      }

      // If pagination parameters are not provided or incomplete, return original response
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        return this.findSharedWithByTelegramId(telegramId, key);
      }

      // For this method, pagination doesn't make much sense as it typically returns
      // a single password's sharedWith array, but we'll implement it for consistency
      const sharedWith = await this.passwordModel
        .find({
          userId: user._id,
          isActive: true,
          key: key,
        })
        .select('sharedWith -_id')
        .exec();

      const sharedWithData =
        sharedWith.length > 0 ? sharedWith[0].sharedWith : [];

      // Apply pagination to sharedWith array
      const skip = (page - 1) * limit;
      const paginatedData = sharedWithData.slice(skip, skip + limit);
      const totalCount = sharedWithData.length;
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        data: paginatedData,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      };
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get passwords shared with me with optional pagination
   * @param username The username
   * @param page Optional page number for pagination
   * @param limit Optional limit for pagination
   * @returns Either paginated response or simple response based on parameters
   */
  async findPasswordsSharedWithMeWithPagination(
    req: AuthenticatedRequest,
    page?: number,
    limit?: number,
  ): Promise<SharedWithMeResponse | PaginatedResponse<any>> {
    console.log('Service: findPasswordsSharedWithMeWithPagination called');
    try {
      // Extract userId, username, telegramId and publicAddress from request
      let userId: string | undefined;
      let username: string | undefined;
      let currentUserTelegramId: string | undefined;
      let currentUserPrivacyMode = false;
      let publicAddress: string | undefined;

      if (req?.user && req.user.id) {
        userId = req.user.id;
        username = req.user.username;
        // Get telegramId, privacyMode and publicAddress from user data
        const user = await this.userModel.findById(userId).exec();
        if (user) {
          currentUserTelegramId = user.telegramId;
          currentUserPrivacyMode = user.privacyMode || false;
          // Get user's public address if available
          const userPublicAddress = await this.publicAddressModel
            .findOne({ userId: user._id })
            .exec();
          if (userPublicAddress) {
            publicAddress = userPublicAddress.publicKey;
          }
        }
      } else if (req?.headers?.['x-telegram-init-data']) {
        const headerInitData = req.headers['x-telegram-init-data'] as string;
        const parsedData =
          this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
        username = parsedData.username;
        currentUserTelegramId = parsedData.telegramId;
        // Try to find userId from username and get privacyMode and publicAddress
        if (username) {
          const user = await this.userModel
            .findOne({
              username: username.toLowerCase(),
              isActive: true,
            })
            .exec();
          if (user) {
            userId = user._id ? String(user._id) : '';
            currentUserPrivacyMode = user.privacyMode || false;
            // Get user's public address if available
            const userPublicAddress = await this.publicAddressModel
              .findOne({ userId: user._id })
              .exec();
            if (userPublicAddress) {
              publicAddress = userPublicAddress.publicKey;
            }
          }
        }
      } else {
        throw new HttpException(
          'No authentication data provided',
          HttpStatus.BAD_REQUEST,
        );
      }

      // If pagination parameters are not provided or incomplete, return original response
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        if (!username && !userId && !publicAddress) {
          throw new Error('Username, userId, or publicAddress is required');
        }
        return this.findPasswordsSharedWithMe(
          username,
          userId,
          currentUserTelegramId,
          currentUserPrivacyMode,
          publicAddress,
        );
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      let allSharedPasswords: any[] = [];
      const passwordIds = new Set<string>(); // To track unique password IDs for deduplication

      // Search by userId if available
      if (userId) {
        const baseQuery = {
          'sharedWith.userId': userId,
          isActive: true,
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        };

        const userIdResults = await this.passwordModel
          .find(baseQuery)
          .select(
            ' _id key value description initData.username sharedWith updatedAt userId ',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        // Add unique results to the collection
        userIdResults.forEach((password) => {
          const passwordId = password._id.toString();
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });

        console.log(
          'Database query result (userId):',
          userIdResults.length,
          'passwords found',
        );
      }

      // Search by username if available
      if (username) {
        const baseQuery = {
          'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') },
          isActive: true,
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        };

        const usernameResults = await this.passwordModel
          .find(baseQuery)
          .select(
            ' _id key value description initData.username sharedWith updatedAt userId ',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        // Add unique results to the collection
        usernameResults.forEach((password) => {
          const passwordId = password._id.toString();
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });

        console.log(
          'Database query result (username):',
          usernameResults.length,
          'passwords found',
        );
      }

      // Search by publicAddress if available
      if (publicAddress) {
        const baseQuery = {
          'sharedWith.publicAddress': publicAddress,
          isActive: true,
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        };

        const publicAddressResults = await this.passwordModel
          .find(baseQuery)
          .select(
            ' _id key value description initData.username sharedWith updatedAt userId ',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        // Add unique results to the collection
        publicAddressResults.forEach((password) => {
          const passwordId = password._id.toString();
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });

        console.log(
          'Database query result (publicAddress):',
          publicAddressResults.length,
          'passwords found',
        );
      }

      // Sort the combined results by creation date (newest first)
      allSharedPasswords.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Apply pagination to the combined results
      const totalCount = allSharedPasswords.length;
      const sharedPasswords = allSharedPasswords.slice(skip, skip + limit);

      // If no results found and no search criteria available, return empty result
      if (totalCount === 0 && !username && !publicAddress) {
        return {
          data: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalCount: 0,
            hasNextPage: false,
            hasPreviousPage: page > 1,
            limit,
          },
        };
      }

      // Get all secret owners using UserFinderUtil for complete information
      const secretOwnerIds = [
        ...new Set(
          sharedPasswords
            .map((p) => (p.userId ? String(p.userId) : ''))
            .filter((id) => id),
        ),
      ];

      // Use UserFinderUtil to get complete owner information
      const ownerInfoMap = new Map();
      await Promise.all(
        secretOwnerIds.map(async (ownerId) => {
          try {
            const ownerInfo = await UserFinderUtil.findUserByAnyInfo(
              { userId: ownerId },
              this.userModel,
              this.publicAddressModel,
            );
            if (ownerInfo) {
              ownerInfoMap.set(ownerId, ownerInfo);
            }
          } catch (error) {
            console.log(
              `Error finding owner info for userId ${ownerId}:`,
              error,
            );
            // Set default values if user not found
            ownerInfoMap.set(ownerId, {
              user: null,
              publicAddress: null,
            });
          }
        }),
      );

      // Transform the data similar to getSharedWithMe method
      const transformedData = await Promise.all(
        sharedPasswords
          .filter((password) => password.userId) // Filter out passwords without userId
          .map(async (password) => {
            const passwordUserId = password.userId
              ? String(password.userId)
              : '';

            // Get owner information from the map
            const ownerInfo = ownerInfoMap.get(passwordUserId);
            const owner = ownerInfo?.user;
            const ownerLatestPublicAddress = ownerInfo?.publicAddress;

            // Use owner information or fallback to password initData
            const ownerUsername =
              owner?.username || password.initData?.username || 'Unknown';
            const ownerTelegramId = owner?.telegramId || null;
            const ownerPrivacyMode = owner?.privacyMode || false;
            const isOwner = currentUserTelegramId === ownerTelegramId;

            // Fetch unresolved reports for this password
            const reports = await this.reportModel
              .find({
                $or: [
                  { secret_id: password._id },
                  { secret_id: password._id.toString() },
                ],
                resolved: false,
              })
              .exec();

            const baseData = {
              _id: password._id,
              key: password.key,
              value: password.value,
              description: password.description,
              sharedBy: {
                userId: passwordUserId,
                username: ownerUsername,
                telegramId: ownerTelegramId,
                PublicAddress: ownerLatestPublicAddress || null,
              },
              sharedWith: password.sharedWith || [], // Include sharedWith field in response
              reports: reports, // Include complete reports data as stored in MongoDB
              updatedAt: password.updatedAt,
            };

            const result: any = { ...baseData };

            // If current user has privacy mode enabled, don't include createdAt and view info
            if (currentUserPrivacyMode) {
              return result;
            }

            // If current user has privacy mode disabled, check owner's privacy mode for each secret
            if (!ownerPrivacyMode || isOwner) {
              // Fetch additional data from database
              const fullPassword = await this.passwordModel
                .findById(password._id)
                .select('createdAt secretViews')
                .lean()
                .exec();

              if (fullPassword) {
                result.createdAt = fullPassword.createdAt;
                result.viewsCount = (fullPassword.secretViews || []).length;
                result.secretViews = fullPassword.secretViews || [];
              }
            }

            return result;
          }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        data: transformedData,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      };
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findSharedWithByUserIdWithPagination(
    userId: string,
    key: string,
    page?: number,
    limit?: number,
  ): Promise<SharedWithDto[] | PaginatedResponse<SharedWithDto>> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const user = await this.userModel.findOne({
        _id: userId,
        isActive: true,
      });
      if (!user) {
        throw new Error('userId is not valid');
      }
      if (!key) {
        throw new Error('Key is required');
      }
      const passwordKey = await this.passwordModel.findOne({
        key,
        isActive: true,
      });
      if (!passwordKey) {
        throw new Error('Key is not found');
      }

      // If pagination parameters are not provided or incomplete, return original response
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        return this.findSharedWithByUserId(userId, key);
      }

      // For this method, pagination doesn't make much sense as it typically returns
      // a single password's sharedWith array, but we'll implement it for consistency
      const sharedWith = await this.passwordModel
        .find({
          userId: user._id,
          isActive: true,
          key: key,
        })
        .select('sharedWith -_id')
        .exec();

      const sharedWithData =
        sharedWith.length > 0 ? sharedWith[0].sharedWith : [];

      // Apply pagination to sharedWith array
      const skip = (page - 1) * limit;
      const paginatedData = sharedWithData.slice(skip, skip + limit);
      const totalCount = sharedWithData.length;
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        data: paginatedData,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      };
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findSharedWithByUserId(
    userId: string,
    key: string,
  ): Promise<SharedWithDto[]> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const user = await this.userModel.findOne({
        _id: userId,
        isActive: true,
      });
      if (!user) {
        throw new Error('userId is not valid');
      }
      if (!key) {
        throw new Error('Key is required');
      }
      const passwordKey = await this.passwordModel.findOne({
        key,
        isActive: true,
      });
      if (!passwordKey) {
        throw new Error('Key is not found');
      }
      const sharedWith = await this.passwordModel
        .find({
          userId: user._id,
          isActive: true,
          key: key,
        })
        .select('sharedWith -_id')
        .exec();
      return sharedWith.length > 0 ? sharedWith[0].sharedWith : null;
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async deletePasswordByUserId(id: string, userId: string): Promise<Password> {
    try {
      // Find the user by userId
      const user = await this.userModel
        .findOne({ _id: userId, isActive: true })
        .exec();
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Find the password by ID
      const password = await this.passwordModel.findById(id).exec();

      // Check if password exists
      if (!password) {
        throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
      }

      // Check if the authenticated user is the owner of the password
      if (
        !password.userId.equals(
          new Types.ObjectId(user._id ? String(user._id) : ''),
        )
      ) {
        throw new HttpException(
          'You are not authorized to delete this secret',
          HttpStatus.FORBIDDEN,
        );
      }

      // Delete the password
      const deletedPassword = await this.passwordModel
        .findByIdAndDelete(id)
        .exec();
      return deletedPassword;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async hidePasswordByUserId(id: string, userId: string): Promise<Password> {
    try {
      // Find the user by userId
      const user = await this.userModel
        .findOne({ _id: userId, isActive: true })
        .exec();
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Find the password by ID
      const password = await this.passwordModel.findById(id).exec();

      // Check if password exists
      if (!password) {
        throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
      }

      // Check if the authenticated user is the owner of the password
      if (
        !password.userId.equals(
          new Types.ObjectId(user._id ? String(user._id) : ''),
        )
      ) {
        throw new HttpException(
          'You are not authorized to modify this secret',
          HttpStatus.FORBIDDEN,
        );
      }

      // Set the hidden field to true
      const updatedPassword = await this.passwordModel
        .findByIdAndUpdate(id, { hidden: true }, { new: true })
        .exec();

      return updatedPassword;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async getChildPasswordsByUserId(
    parentId: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
    currentUserPrivacyMode: boolean = false,
  ): Promise<{
    passwords: passwordReturns[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    try {
      // Find the parent password by ID
      const parentPassword = await this.passwordModel.findById(parentId).exec();

      // Check if parent password exists
      if (!parentPassword) {
        throw new HttpException(
          'Parent secret not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // Check if parent password is actually a parent (no parent_secret_id)
      if (parentPassword.parent_secret_id) {
        throw new HttpException(
          'This secret is not a parent secret',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Verify user exists and is active
      const user = await this.userModel
        .findOne({ _id: userId, isActive: true })
        .exec();

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Check if the authenticated user is the owner of the parent password OR has access to it OR owns any child password
      const isOwner = parentPassword.userId.equals(
        new Types.ObjectId(user._id ? String(user._id) : ''),
      );
      const hasAccess =
        parentPassword.sharedWith &&
        parentPassword.sharedWith.some(
          (shared) => shared.username === user.username,
        );

      // Check if user owns any child password
      const ownsChildPassword = await this.passwordModel.exists({
        parent_secret_id: new Types.ObjectId(parentId),
        userId: new Types.ObjectId(user._id ? String(user._id) : ''),
        isActive: true,
      });

      if (!isOwner && !hasAccess && !ownsChildPassword) {
        throw new HttpException(
          'You are not authorized to view child secrets for this parent secret',
          HttpStatus.FORBIDDEN,
        );
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Define the base query - return all child passwords regardless of ownership
      const baseQuery = {
        parent_secret_id: new Types.ObjectId(parentId),
        isActive: true,
        $or: [{ hidden: false }, { hidden: { $exists: false } }],
      };

      // Get total count for pagination
      const totalCount = await this.passwordModel
        .countDocuments(baseQuery)
        .exec();

      // Find child passwords with pagination
      const childPasswords = await this.passwordModel
        .find(baseQuery)
        .select(
          'key value description updatedAt createdAt sharedWith type hidden initData userId secretViews',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // If no child passwords found, throw NOT_FOUND
      if (totalCount === 0) {
        throw new HttpException('There are no children', HttpStatus.NOT_FOUND);
      }

      // Get unique user IDs from child passwords
      const userIds = [
        ...new Set(
          childPasswords
            .map((password) => (password.userId ? String(password.userId) : ''))
            .filter((id) => id),
        ),
      ];

      // Fetch privacy modes and user info for all owners
      const ownerPrivacyMap = new Map<string, boolean>();
      const ownerInfoMap = new Map<
        string,
        {
          id: string;
          telegramId?: string;
          firstName?: string;
          lastName?: string;
          publicAddress?: string;
        }
      >();
      const owners = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('_id privacyMode telegramId firstName lastName')
        .exec();

      // Get latest public addresses for all owners
      for (const owner of owners) {
        const ownerId = owner._id ? String(owner._id) : '';
        ownerPrivacyMap.set(ownerId, owner.privacyMode || false);

        let publicAddress: string | undefined;

        // Try to get latest public address by telegramId first
        if (owner.telegramId) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                owner.telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              publicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            // If no address found by telegramId, try by userId
          }
        }

        // If no address found by telegramId or user has no telegramId, try by userId
        if (!publicAddress) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByUserId(
                ownerId,
              );
            if (addressResponse.success && addressResponse.data) {
              publicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            // If no address found, latestPublicAddress remains undefined
          }
        }

        ownerInfoMap.set(ownerId, {
          id: ownerId,
          telegramId: owner.telegramId,
          firstName: owner.firstName,
          lastName: owner.lastName,
          publicAddress,
        });
      }

      // Transform child passwords to match passwordReturns format
      const passwordWithReports = await Promise.all(
        childPasswords.map(async (password) => {
          // Fetch unresolved reports for this password
          const reports = await this.reportModel
            .find({
              $or: [
                { secret_id: password._id },
                { secret_id: password._id.toString() },
              ],
              resolved: false,
            })
            .exec();

          // Transform reports to include reporter username
          const reportInfo: PasswordReportInfo[] = await Promise.all(
            reports.map(async (report) => {
              const reporter = await this.userModel
                .findOne({ telegramId: report.reporterTelegramId })
                .select('username')
                .exec();

              return {
                reporterUsername: reporter ? reporter.username : 'Unknown',
                report_type: report.report_type,
                reason: report.reason,
                createdAt: report.createdAt,
              };
            }),
          );

          // Get owner privacy mode and check if current user is owner
          const passwordUserId = password.userId ? String(password.userId) : '';
          const ownerPrivacyMode = ownerPrivacyMap.get(passwordUserId) || false;
          const isCurrentUserOwner = passwordUserId === userId;

          // Get owner info for firstName and lastName
          const ownerInfo = ownerInfoMap.get(passwordUserId) || {
            id: passwordUserId,
            telegramId: undefined,
            firstName: undefined,
            lastName: undefined,
            publicAddress: undefined,
          };

          // Base password data
          const passwordData: any = {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            username: password.initData?.username || 'Unknown', // Include username of password owner
            ownerId: ownerInfo.id, // Add owner ID
            ownerTelegramId: ownerInfo.telegramId, // Add owner Telegram ID
            firstName: ownerInfo.firstName,
            lastName: ownerInfo.lastName,
            publicAddress: ownerInfo.publicAddress, // Add latest public address
            updatedAt: password.updatedAt,
            hidden: password.hidden || false,
            reports: reportInfo,
          };

          // Apply privacy logic: if current user has privacy mode enabled, don't include createdAt and view info
          // Otherwise, check each secret individually based on owner's privacy mode
          if (!currentUserPrivacyMode) {
            // If owner doesn't have privacy mode enabled OR current user is the owner, include createdAt and view info
            if (!ownerPrivacyMode || isCurrentUserOwner) {
              passwordData.createdAt = password.createdAt;
              const secretViews = password.secretViews || [];
              passwordData.viewsCount = secretViews.length;
              passwordData.secretViews = secretViews;
            }
          }

          return passwordData;
        }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        passwords: passwordWithReports,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get user passwords with authentication logic
   * Handles both JWT and Telegram authentication with optional pagination
   * @param req The authenticated request object
   * @param page Optional page number for pagination
   * @param limit Optional limit for pagination
   * @returns Either paginated response or simple array based on parameters
   */
  async getUserPasswordsWithAuth(
    req: AuthenticatedRequest,
    page?: number,
    limit?: number,
  ): Promise<passwordReturns[] | PaginatedResponse<passwordReturns>> {
    // If JWT token exists and has publicAddress, use publicAddress
    if (req?.user && req.user.publicAddress) {
      return this.findByPublicAddressWithPagination(
        req.user.publicAddress,
        page,
        limit,
      );
    }
    // If no JWT token but X-Telegram-Init-Data is provided, get latest publicAddress and use it
    else if (req?.headers?.['x-telegram-init-data']) {
      const telegramId = this.extractTelegramIdFromRequest(req);

      try {
        // Get the latest public address for this user
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByTelegramId(
            telegramId,
          );

        if (
          addressResponse.success &&
          addressResponse.data &&
          addressResponse.data.publicKey
        ) {
          // Use the latest publicAddress to search for secrets
          return this.findByPublicAddressWithPagination(
            addressResponse.data.publicKey,
            page,
            limit,
          );
        } else {
          // If no publicAddress found, fallback to telegramId search
          return this.findByUserTelegramIdWithPagination(
            telegramId,
            page,
            limit,
          );
        }
      } catch (error) {
        // If getting publicAddress fails, fallback to telegramId search
        console.log(
          'Failed to get latest publicAddress for telegramId:',
          telegramId,
          error.message,
        );
        return this.findByUserTelegramIdWithPagination(telegramId, page, limit);
      }
    }
    // Fallback case (should not happen with proper authentication)
    else {
      const telegramId = this.extractTelegramIdFromRequest(req);
      return this.findByUserTelegramIdWithPagination(telegramId, page, limit);
    }
  }

  /**
   * Get shared-with data with authentication logic
   * Handles both JWT and Telegram authentication with optional pagination
   * @param req The authenticated request object
   * @param key The password key to get shared-with data for
   * @param page Optional page number for pagination
   * @param limit Optional limit for pagination
   * @returns Either paginated response or simple array based on parameters
   */
  async getSharedWithByAuth(
    req: AuthenticatedRequest,
    key: string,
    page?: number,
    limit?: number,
  ): Promise<SharedWithDto[] | PaginatedResponse<SharedWithDto>> {
    // Parse pagination parameters if provided
    const pageNumber = page ? parseInt(String(page), 10) : undefined;
    const limitNumber = limit ? parseInt(String(limit), 10) : undefined;

    // If JWT token exists, use userId; otherwise use telegramId
    if (req?.user && req.user.id) {
      return this.findSharedWithByUserIdWithPagination(
        req.user.id,
        key,
        pageNumber,
        limitNumber,
      );
    } else {
      const telegramId = this.extractTelegramIdFromRequest(req);
      return this.findSharedWithByTelegramIdWithPagination(
        telegramId,
        key,
        pageNumber,
        limitNumber,
      );
    }
  }

  /**
   * Delete password by owner with authentication logic
   * Handles both JWT and Telegram authentication
   * @param req The authenticated request object
   * @param key The password key to delete
   * @returns Success message
   */
  async deletePasswordByOwnerWithAuth(
    req: AuthenticatedRequest,
    key: string,
  ): Promise<Password> {
    try {
      let user;
      let telegramId: string;

      // Priority 1: JWT token authentication
      if (req?.user && req.user.id) {
        user = await this.userModel
          .findOne({
            _id: req.user.id,
            isActive: true,
          })
          .exec();

        if (!user) {
          throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        // Find the password by ID
        console.log('Searching for password with ID:', key);
        const password = await this.passwordModel.findById(key).exec();
        console.log('Found password:', password ? 'Yes' : 'No');

        // Check if password exists
        if (!password) {
          throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
        }

        console.log(
          'Password userId:',
          password.userId ? String(password.userId) : '',
        );
        console.log('User _id:', user._id ? String(user._id) : '');

        // Check if the user is the owner of the password
        if (
          (password.userId ? String(password.userId) : '') !==
          (user._id ? String(user._id) : '')
        ) {
          throw new HttpException(
            'You are not authorized to delete this password',
            HttpStatus.FORBIDDEN,
          );
        }

        console.log('User is authorized, proceeding to delete...');

        // Delete the password
        const deletedPassword = await this.passwordModel
          .findByIdAndDelete(key)
          .exec();

        console.log(
          'Delete operation result:',
          deletedPassword ? 'Success' : 'Failed',
        );

        if (!deletedPassword) {
          throw new HttpException(
            'Failed to delete secret',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        console.log('Password deleted successfully');
        return deletedPassword;
      }
      // Priority 2: Telegram authentication (only if no JWT token)
      else {
        // Parse X-Telegram-Init-Data header directly
        if (req?.headers?.['x-telegram-init-data']) {
          const headerInitData = req.headers['x-telegram-init-data'] as string;
          const parsedData =
            this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
          telegramId = parsedData.telegramId;
        } else {
          throw new HttpException(
            'No authentication data provided',
            HttpStatus.BAD_REQUEST,
          );
        }

        return this.deletePasswordByOwner(key, telegramId);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get child passwords with authentication logic
   * Handles both JWT and Telegram authentication
   * @param req The authenticated request object
   * @param parentId The parent password ID
   * @param page Page number for pagination
   * @param limit Number of items per page
   * @returns Child passwords with pagination
   */
  async getChildPasswordsWithAuth(
    req: AuthenticatedRequest,
    parentId: string,
    page: number,
    limit: number,
  ) {
    // Extract current user's privacy mode
    let currentUserPrivacyMode = false;

    // If JWT token exists, use userId; otherwise use telegramId
    if (req?.user && req.user.id) {
      const currentUser = await this.userModel
        .findById(req.user.id)
        .select('privacyMode')
        .exec();
      currentUserPrivacyMode = currentUser?.privacyMode || false;
      return this.getChildPasswordsByUserId(
        parentId,
        req.user.id,
        page,
        limit,
        currentUserPrivacyMode,
      );
    } else {
      const telegramId = this.extractTelegramIdFromRequest(req);
      const currentUser = await this.userModel
        .findOne({ telegramId })
        .select('privacyMode')
        .exec();
      currentUserPrivacyMode = currentUser?.privacyMode || false;
      return this.getChildPasswords(
        parentId,
        telegramId,
        page,
        limit,
        currentUserPrivacyMode,
      );
    }
  }

  /**
   * Hide password with authentication logic
   * Handles both JWT and Telegram authentication
   * @param req The authenticated request object
   * @param id The password ID to hide
   * @returns Hidden password
   */
  async hidePasswordWithAuth(
    req: AuthenticatedRequest,
    id: string,
  ): Promise<Password> {
    try {
      let user;
      let telegramId: string;

      // Priority 1: JWT token authentication
      if (req?.user && req.user.id) {
        user = await this.userModel
          .findOne({
            _id: req.user.id,
            isActive: true,
          })
          .exec();

        if (!user) {
          throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        // Find the password by ID
        const password = await this.passwordModel.findById(id).exec();

        // Check if password exists
        if (!password) {
          throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
        }

        // Check if the user is the owner of the password
        if (
          (password.userId ? String(password.userId) : '') !==
          (user._id ? String(user._id) : '')
        ) {
          throw new HttpException(
            'You are not authorized to modify this secret',
            HttpStatus.FORBIDDEN,
          );
        }

        // Set the hidden field to true
        const updatedPassword = await this.passwordModel
          .findByIdAndUpdate(id, { hidden: true }, { new: true })
          .exec();

        return updatedPassword;
      }
      // Priority 2: Telegram authentication (only if no JWT token)
      else {
        // Parse X-Telegram-Init-Data header directly
        if (req?.headers?.['x-telegram-init-data']) {
          const headerInitData = req.headers['x-telegram-init-data'] as string;
          const parsedData =
            this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
          telegramId = parsedData.telegramId;
        } else {
          throw new HttpException(
            'No authentication data provided',
            HttpStatus.BAD_REQUEST,
          );
        }

        return this.hidePassword(id, telegramId);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Record a secret view for a secret
   * @param secretId - The ID of the secret being viewed
   * @param telegramId - The telegram ID of the viewer
   * @param username - The username of the viewer (optional)
   * @param userId - The user ID of the viewer (optional)
   * @param publicAddress - The latest wallet address of the viewer (optional)
   * @returns Updated password document or empty object if access denied
   */
  async recordSecretView(
    secretId: string,
    telegramId: string,
    username?: string,
    userId?: string,
    publicAddress?: string,
  ): Promise<Password | {}> {
    try {
      // Check if secret exists
      const secret = await this.passwordModel.findById(secretId).exec();
      if (!secret) {
        return {}; // Return empty response for non-existent secrets
      }

      // Check if the secret has been shared with the viewing user
      const isSharedWithUser = secret.sharedWith?.some((shared) => {
        return (
          (userId && shared.userId === userId) ||
          (username &&
            shared.username &&
            shared.username.toLowerCase() === username.toLowerCase()) ||
          (publicAddress && shared.publicAddress === publicAddress)
        );
      });

      // Check if user is the owner of the secret
      const isOwner = userId && String(secret.userId) === userId;

      // Allow parent secret owner to view child secret response even if not shared
      let isParentOwnerViewingChild = false;
      if (!isOwner && !isSharedWithUser && secret.parent_secret_id && userId) {
        const parentSecret = await this.passwordModel
          .findById(secret.parent_secret_id)
          .select('userId')
          .exec();
        if (parentSecret && String(parentSecret.userId) === String(userId)) {
          isParentOwnerViewingChild = true;
        }
      }

      if (!isOwner && !isSharedWithUser && !isParentOwnerViewingChild) {
        console.log('🚫 Access denied: Secret not shared with user');
        return {}; // Return empty response with 200 status
      }

      console.log('🔍 SECRET FOUND:', {
        secretId: secret._id,
        secretUserId: secret.userId,
        secretUserIdType: typeof secret.userId,
      });

      // Get the viewing user - try multiple methods to find the user
      let viewingUser = null;

      // First try to find by telegramId if available
      if (telegramId) {
        viewingUser = await this.userModel
          .findOne({ telegramId })
          .select('privacyMode firstName lastName')
          .exec();
      }

      // If not found by telegramId and userId is available, try by userId
      if (!viewingUser && userId) {
        viewingUser = await this.userModel
          .findById(userId)
          .select('privacyMode firstName lastName')
          .exec();
      }

      // If still not found, create a minimal user object for recording the view
      if (!viewingUser) {
        console.log('⚠️ User not found in database, but recording view anyway');
        viewingUser = {
          firstName: '',
          lastName: '',
          privacyMode: false,
        };
      }

      // Get the secret owner
      console.log('🔍 SEARCHING FOR SECRET OWNER with userId:', secret.userId);
      const secretOwner = await this.userModel
        .findById(secret.userId)
        .select('privacyMode telegramId username')
        .exec();
      if (!secretOwner) {
        console.log('❌ SECRET OWNER NOT FOUND for userId:', secret.userId);
        throw new HttpException('Secret owner not found', HttpStatus.NOT_FOUND);
      }
      console.log('✅ SECRET OWNER FOUND:', {
        ownerId: secretOwner._id,
        ownerTelegramId: secretOwner.telegramId,
        ownerUsername: secretOwner.username,
      });

      // Check if the viewing user is the owner of the secret
      console.log('=== SECRET VIEW DEBUG ===');
      console.log('Secret ID:', secretId);
      console.log('Secret userId:', secret.userId);
      console.log(
        'Secret owner telegramId:',
        secretOwner.telegramId,
        'type:',
        typeof secretOwner.telegramId,
      );
      console.log('Secret owner username:', secretOwner.username);
      console.log(
        'Viewing user telegramId:',
        telegramId,
        'type:',
        typeof telegramId,
      );
      console.log('Viewing user username:', username);
      console.log('Viewing user userId:', userId);
      console.log('========================');

      // Check if owner is viewing their own secret using multiple identifiers
      const isOwnerViewing =
        (telegramId && String(secretOwner.telegramId) === String(telegramId)) ||
        (userId && String(secret.userId) === String(userId));

      if (isOwnerViewing) {
        // Owner viewing their own secret - don't record the view
        console.log('🚫 Owner viewing own secret - not recording view');
        return secret;
      }

      // Proceed with recording view (privacy checks follow)

      // Check privacy settings - if either the viewing user or secret owner has privacy mode enabled, don't record the view
      if (viewingUser.privacyMode || secretOwner.privacyMode) {
        // Return the secret without recording the view
        if (secretOwner.privacyMode) {
          console.log(
            '🔒 Secret owner has privacy mode enabled - not recording view',
          );
        }
        if (viewingUser.privacyMode) {
          console.log(
            '🔒 Viewing user has privacy mode enabled - not recording view',
          );
        }
        return secret;
      }

      // Check if this telegram user has already viewed this secret before (ever)
      const existingView = secret.secretViews?.find(
        (view) =>
          (telegramId && view.telegramId === telegramId) ||
          (userId && view.userId === userId) ||
          (username && view.username === username),
      );

      // If user has never viewed this secret before, add new view
      if (!existingView) {
        console.log(
          '✅ Recording new secret view for user:',
          telegramId || 'no-telegram',
          username || 'no-username',
          userId || 'no-userId',
        );

        // Get the latest public address for the viewing user
        let currentpublicAddress = publicAddress;

        try {
          // First try to get address by telegramId if available
          if (telegramId) {
            const addressByTelegramId =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                telegramId,
              );
            if (addressByTelegramId.success && addressByTelegramId.data) {
              currentpublicAddress = addressByTelegramId.data.publicKey;
            }
          }

          // If no address found by telegramId or telegramId is empty, try by userId
          if (!currentpublicAddress && userId) {
            const addressByUserId =
              await this.publicAddressesService.getLatestAddressByUserId(
                userId,
              );
            if (addressByUserId.success && addressByUserId.data) {
              currentpublicAddress = addressByUserId.data.publicKey;
            }
          }
        } catch (error) {
          console.log(
            '⚠️ Could not retrieve latest wallet address:',
            error.message,
          );
          // Continue with the provided publicAddress or undefined
        }

        const newView = {
          telegramId: telegramId || '',
          username: username || '',
          userId: userId || '',
          publicAddress: currentpublicAddress,
          firstName: viewingUser.firstName || '',
          lastName: viewingUser.lastName || '',
          viewedAt: new Date(),
        };

        const updatedSecret = await this.passwordModel
          .findByIdAndUpdate(
            secretId,
            { $push: { secretViews: newView } },
            { new: true },
          )
          .exec();

        // Log secret view event (separate for Telegram vs non-Telegram viewers)
        try {
          const eventName = newView.telegramId
            ? LogEvent.SecretViewedByTelegram
            : LogEvent.SecretViewedByNonTelegram;
          await this.loggerService.saveSystemLog(
            {
              event: eventName,
              message: 'Secret viewed',
              secretId: String(updatedSecret?._id || secretId),
              key: updatedSecret?.key || secret.key,
              viewerHasTelegram: !!newView.telegramId,
              viewerPublicAddress: newView.publicAddress || undefined,
            },
            {
              userId: newView.userId || undefined,
              telegramId: newView.telegramId || undefined,
              username: newView.username || undefined,
            },
          );
        } catch (e) {
          console.error('Failed to log secret view', e);
        }

        return updatedSecret;
      } else {
        console.log(
          '🔄 User has already viewed this secret before - not recording',
        );
      }

      // User has already viewed this secret before - don't record another view
      return secret;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to record secret view',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get secret view statistics for a secret with deduplication
   * @param secretId - The ID of the secret
   * @param userId - The user ID of the requesting user
   * @param telegramId - The telegram ID of the requesting user
   * @param username - The username of the requesting user
   * @param publicAddress - The latest wallet address of the requesting user
   * @returns View statistics including count and viewer details with deduplication
   */
  async getSecretViewStats(
    secretId: string,
    userId: string,
    telegramId: string,
    username: string,
    publicAddress?: string,
  ): Promise<{
    totalViews: number;
    uniqueViewers: number;
    totalSharedUsers: number;
    viewDetails: Array<{
      telegramId: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      userId?: string;
      publicAddress?: string;
      viewedAt: Date;
    }>;
    notViewedUsers: Array<{
      username?: string;
      firstName?: string;
      lastName?: string;
      telegramId?: string;
    }>;
    notViewedUsersCount: number;
    unknownUsers: Array<{
      username?: string;
    }>;
    unknownCount: number;
    requestingUserInfo: {
      userId: string;
      telegramId: string;
      username: string;
      publicAddress?: string;
      hasViewedSecret: boolean;
      isOwner: boolean;
    };
  }> {
    try {
      // Find the secret and verify ownership
      const secret = await this.passwordModel.findById(secretId).exec();
      if (!secret) {
        throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
      }

      // Use userId parameter for more efficient user lookup if available
      let user;
      if (userId) {
        user = await this.userModel
          .findOne({ _id: userId, isActive: true })
          .exec();
      }

      // Fallback to telegramId if userId lookup failed
      if (!user) {
        user = await this.userModel
          .findOne({ telegramId, isActive: true })
          .exec();
      }

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Find the secret owner to check privacy mode
      const secretOwner = await this.userModel.findById(secret.userId).exec();
      if (!secretOwner) {
        throw new HttpException('Secret owner not found', HttpStatus.NOT_FOUND);
      }

      // Check if requesting user is the owner
      const isOwner = String(secret.userId) === String(user._id);

      // Check if requesting user has viewed this secret
      const hasViewedSecret =
        secret.secretViews?.some(
          (view) =>
            view.telegramId === telegramId ||
            view.userId === userId ||
            (view.username && view.username === username) ||
            (view.publicAddress &&
              publicAddress &&
              view.publicAddress === publicAddress),
        ) || false;

      const secretViews = secret.secretViews || [];

      // Enhanced deduplication using all available identifiers including the requesting user's data
      const uniqueViewsMap = new Map<string, any>();

      for (const view of secretViews) {
        // Use the most reliable identifier as the primary key (userId > telegramId > username > walletAddress)
        const primaryKey =
          view.userId || view.telegramId || view.username || view.publicAddress;

        // If this user hasn't been seen before, or if this is a more complete record
        if (
          !uniqueViewsMap.has(primaryKey) ||
          (uniqueViewsMap.get(primaryKey) &&
            view.userId &&
            !uniqueViewsMap.get(primaryKey).userId)
        ) {
          uniqueViewsMap.set(primaryKey, view);
        }
      }

      // Convert deduplicated views back to array
      const deduplicatedViews = Array.from(uniqueViewsMap.values());

      // Get user details for each deduplicated view to include firstName and lastName
      const viewDetailsWithUserInfo = await Promise.all(
        deduplicatedViews.map(async (view) => {
          let userInfo = null;
          let currentpublicAddress = view.publicAddress;

          // Try to get user info from database if firstName/lastName not in view
          if (!view.firstName || !view.lastName) {
            userInfo = await this.userModel
              .findOne({ telegramId: view.telegramId })
              .select('firstName lastName')
              .exec();
          }

          // If publicAddress is missing, null, or empty, try to fetch the latest one
          if (!currentpublicAddress || currentpublicAddress.trim() === '') {
            try {
              // First try to get address by telegramId if available
              if (view.telegramId) {
                const addressResponse =
                  await this.publicAddressesService.getLatestAddressByTelegramId(
                    view.telegramId,
                  );
                if (addressResponse.success && addressResponse.data) {
                  currentpublicAddress = addressResponse.data.publicKey;
                }
              }

              // If no address found by telegramId, try by userId
              if (!currentpublicAddress && view.userId) {
                const addressResponse =
                  await this.publicAddressesService.getLatestAddressByUserId(
                    view.userId,
                  );
                if (addressResponse.success && addressResponse.data) {
                  currentpublicAddress = addressResponse.data.publicKey;
                }
              }

              // If still no address found, try to find user by username and get their address
              if (!currentpublicAddress && view.username) {
                const user = await this.userModel
                  .findOne({ username: view.username })
                  .select('_id telegramId')
                  .exec();

                if (user) {
                  // Try by telegramId first
                  if (user.telegramId) {
                    const addressResponse =
                      await this.publicAddressesService.getLatestAddressByTelegramId(
                        user.telegramId,
                      );
                    if (addressResponse.success && addressResponse.data) {
                      currentpublicAddress = addressResponse.data.publicKey;
                    }
                  }

                  // If still no address, try by userId
                  if (!currentpublicAddress) {
                    const addressResponse =
                      await this.publicAddressesService.getLatestAddressByUserId(
                        user._id.toString(),
                      );
                    if (addressResponse.success && addressResponse.data) {
                      currentpublicAddress = addressResponse.data.publicKey;
                    }
                  }
                }
              }
            } catch (error) {
              // If address retrieval fails, keep the original address (which might be null/empty)
              console.log(
                'Failed to retrieve latest wallet address for view:',
                error,
              );
            }
          }

          return {
            telegramId: view.telegramId,
            username: view.username,
            userId: view.userId,
            publicAddress: currentpublicAddress,
            firstName: userInfo?.firstName || view.firstName || '',
            lastName: userInfo?.lastName || view.lastName || '',
            viewedAt: view.viewedAt,
          };
        }),
      );

      const uniqueViewers = deduplicatedViews.length;

      // Calculate total number of users the secret has been shared with
      const totalSharedUsers = secret.sharedWith ? secret.sharedWith.length : 0;

      // Get identifiers of users who have viewed the secret (from deduplicated views)
      const viewedUserIdentifiers = new Set();
      deduplicatedViews.forEach((view) => {
        if (view.telegramId) viewedUserIdentifiers.add(view.telegramId);
        if (view.userId) viewedUserIdentifiers.add(view.userId);
        if (view.username) viewedUserIdentifiers.add(view.username);
        if (view.publicAddress) viewedUserIdentifiers.add(view.publicAddress);
      });

      // Process shared users to categorize them using enhanced matching
      const notViewedUsers = [];
      const unknownUsers = [];
      let unknownCount = 0;

      if (secret.sharedWith && secret.sharedWith.length > 0) {
        for (const sharedUser of secret.sharedWith) {
          let userDetails = null;

          // Enhanced lookup: try multiple methods to find the exact shared user
          // First, try to find by userId if available
          if (sharedUser.userId) {
            userDetails = await this.userModel
              .findById(sharedUser.userId)
              .select('telegramId firstName lastName privacyMode username')
              .exec();
          }

          // If not found by userId and username is available, try username lookup
          if (!userDetails && sharedUser.username) {
            userDetails = await this.userModel
              .findOne({ username: sharedUser.username })
              .select('telegramId firstName lastName privacyMode _id')
              .exec();
          }

          // If user details found in database
          if (userDetails) {
            // Verify this is actually the same user by cross-checking identifiers
            const isMatchingUser =
              (sharedUser.userId &&
                String(userDetails._id) === sharedUser.userId) ||
              (sharedUser.username &&
                userDetails.username === sharedUser.username) ||
              (!sharedUser.userId &&
                !sharedUser.username &&
                sharedUser.publicAddress); // User with only publicAddress

            if (isMatchingUser) {
              // Enhanced check using multiple identifiers
              const hasViewed =
                viewedUserIdentifiers.has(userDetails.telegramId) ||
                viewedUserIdentifiers.has(String(userDetails._id)) ||
                viewedUserIdentifiers.has(userDetails.username);

              // Get latest public address for the user
              let latestPublicAddress: string | undefined;
              try {
                // First try to get address by telegramId if available
                if (userDetails.telegramId) {
                  const addressResponse =
                    await this.publicAddressesService.getLatestAddressByTelegramId(
                      userDetails.telegramId,
                    );
                  if (addressResponse.success && addressResponse.data) {
                    latestPublicAddress = addressResponse.data.publicKey;
                  }
                }

                // If no address found by telegramId, try by userId
                if (!latestPublicAddress && userDetails._id) {
                  const addressResponse =
                    await this.publicAddressesService.getLatestAddressByUserId(
                      userDetails._id.toString(),
                    );
                  if (addressResponse.success && addressResponse.data) {
                    latestPublicAddress = addressResponse.data.publicKey;
                  }
                }
              } catch (error) {
                // If address retrieval fails, latestPublicAddress remains undefined
                latestPublicAddress = undefined;
              }

              // Check if user has privacy mode enabled AND hasn't viewed the secret
              if (userDetails.privacyMode && !hasViewed) {
                unknownUsers.push({
                  username: sharedUser.username,
                  firstName: userDetails.firstName,
                  lastName: userDetails.lastName,
                  telegramId: userDetails.telegramId,
                  publicAddress: latestPublicAddress,
                });
                unknownCount++;
              } else if (!userDetails.privacyMode && !hasViewed) {
                // User hasn't viewed the secret and doesn't have privacy mode
                notViewedUsers.push({
                  username: sharedUser.username,
                  firstName: userDetails.firstName,
                  lastName: userDetails.lastName,
                  telegramId: userDetails.telegramId,
                  publicAddress: latestPublicAddress,
                });
              }
              // Note: Users with privacyMode=true who have viewed the secret
              // will only appear in viewDetails without being added to unknownUsers
            }
          } else {
            // User not found in database - this could be a user with only publicAddress
            // Only add to notViewedUsers if they have some identifying information
            if (sharedUser.username || sharedUser.publicAddress) {
              // Check if this shared user has viewed the secret using publicAddress
              const hasViewedByAddress =
                sharedUser.publicAddress &&
                viewedUserIdentifiers.has(sharedUser.publicAddress);

              if (!hasViewedByAddress) {
                notViewedUsers.push({
                  username: sharedUser.username,
                  publicAddress: sharedUser.publicAddress,
                });
              }
            }
          }
        }
      }

      return {
        totalViews: deduplicatedViews.length, // Use deduplicated count
        uniqueViewers,
        totalSharedUsers,
        viewDetails: viewDetailsWithUserInfo,
        notViewedUsers,
        notViewedUsersCount: notViewedUsers.length,
        unknownUsers,
        unknownCount,
        requestingUserInfo: {
          userId,
          telegramId,
          username,
          publicAddress,
          hasViewedSecret,
          isOwner,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get secret view statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all secrets for admin with filters and pagination
   * @param filters Admin filters including userId, isActive, hidden, secretType
   * @returns Paginated secrets with metadata
   */
  async getAllSecretsForAdmin(filters: AdminSecretsFilterDto): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const {
        userId,
        isActive,
        hidden,
        secretType,
        search,
        page = 1,
        limit = 10,
      } = filters;

      // Build filter query
      const filterQuery: any = {};
      const andConditions: any[] = [];

      // Filter by userId if provided (convert string to ObjectId)
      if (userId) {
        try {
          const userObjectId = new Types.ObjectId(userId);
          filterQuery.userId = userObjectId;
        } catch (error) {
          // If userId is not a valid ObjectId, return empty results
          return {
            data: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
          };
        }
      }

      // Filter by isActive if provided
      if (typeof isActive === 'boolean') {
        filterQuery.isActive = isActive;
      }

      // Filter by hidden if provided
      if (typeof hidden === 'boolean') {
        filterQuery.hidden = hidden;
      }

      // Filter by secretType (parent/child secrets)
      if (secretType) {
        if (secretType === 'parents') {
          andConditions.push({
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
              { parent_secret_id: '' },
            ],
          });
        } else if (secretType === 'children') {
          andConditions.push({
            parent_secret_id: { $exists: true, $nin: [null, ''] },
          });
        }
        // For 'all', no additional filter needed
      }

      // Search filter
      if (search && search.trim()) {
        andConditions.push({
          $or: [
            { title: { $regex: search.trim(), $options: 'i' } },
            { description: { $regex: search.trim(), $options: 'i' } },
          ],
        });
      }

      // Combine all conditions
      if (andConditions.length > 0) {
        filterQuery.$and = andConditions;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get total count
      const total = await this.passwordModel.countDocuments(filterQuery);

      // Get paginated secrets
      const secrets = await this.passwordModel
        .find(filterQuery)
        .select('-hash -value -initData') // Exclude sensitive fields but keep key for title
        .populate('userId', 'username firstName lastName telegramId email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Transform data to include required fields
      const transformedSecrets = await Promise.all(
        secrets.map(async (secret) => {
          const secretObj = secret.toObject();
          const user = secretObj.userId as any;

          // Calculate statistics
          const views = secretObj.secretViews?.length || 0;
          const shares = secretObj.sharedWith?.length || 0;

          // Count reports for this secret
          const reports = await this.reportModel.countDocuments({
            secret_id: secret._id,
          });

          // Get last viewed date
          const lastViewed =
            secretObj.secretViews?.length > 0
              ? secretObj.secretViews[secretObj.secretViews.length - 1].viewedAt
              : null;

          return {
            ...secretObj,
            title: secretObj.key, // Use key as title
            ownerName: user
              ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
              : '',
            ownerHandle: user?.username || '',
            contactEmail: user?.email || '',
            statistics: {
              views,
              shares,
              reports,
            },
            lastViewed,
            // Remove key from final response
            key: undefined,
          };
        }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);

      return {
        data: transformedSecrets,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      throw new HttpException(
        'Failed to get secrets for admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
