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
import { TelegramService } from '../telegram/telegram.service';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { ConfigService } from '@nestjs/config';
import { PublicAddressesService } from '../public-addresses/public-addresses.service';
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
    latestWalletAddress?: string;
  }> {
    let telegramId: string;
    let username: string;
    let userId: string;

    // Priority 1: JWT authentication - extract user info from req.user
    if (req?.user?.telegramId) {
      telegramId = req.user.telegramId;
      username = req.user.username;
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

      // Parse telegram init data to extract telegramId and username
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(telegramInitData);
      telegramId = parsedData.telegramId;
      username = parsedData.username;

      // Get userId from database using telegramId
      const user = await this.userModel
        .findOne({ telegramId })
        .select('_id')
        .exec();

      if (!user) {
        throw new HttpException(
          'User not found for the provided Telegram data',
          HttpStatus.NOT_FOUND,
        );
      }

      userId = user._id.toString();
    } else {
      throw new HttpException(
        'Authentication required: provide either JWT token or Telegram init data',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Get the latest wallet address for the user
    let latestWalletAddress: string | undefined;
    try {
      if (telegramId) {
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByTelegramId(
            telegramId,
          );
        if (addressResponse.success && addressResponse.data) {
          latestWalletAddress = addressResponse.data.publicKey;
        }
      }
    } catch (error) {
      // If no address found, latestWalletAddress remains undefined
      latestWalletAddress = undefined;
    }

    return {
      userId,
      telegramId,
      username,
      latestWalletAddress,
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
          'key value description updatedAt createdAt sharedWith type hidden secretViews',
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
          'key value description updatedAt createdAt sharedWith type hidden secretViews',
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
            reports: reportInfo, // Include report information
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

            const transformedReports = await Promise.all(
              reports.map(async (report) => {
                // Find the reporter user by telegramId
                const reporterUser = await this.userModel
                  .findOne({ telegramId: report.reporterTelegramId })
                  .select('username')
                  .exec();

                return {
                  id: report._id.toString(),
                  reporterUsername: reporterUser?.username || 'unknown',
                  report_type: report.report_type,
                  reason: report.reason,
                  createdAt: report.createdAt,
                };
              }),
            );

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
              reports: transformedReports,
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
          const ownerUsername = password.username;

          if (!acc[ownerUsername]) {
            acc[ownerUsername] = [];
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

            acc[ownerUsername].push(passwordData);
          }

          return acc;
        },
        {},
      );

      const result = Object.entries(groupedByOwner)
        .filter(([username]) => username !== 'unknown')
        .map(([username, passwords]) => ({
          username,
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
        }));

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

    // Process sharedWith array to ensure both userId and username are present
    const processedUpdate = { ...update };
    if (update.sharedWith?.length > 0) {
      processedUpdate.sharedWith = await Promise.all(
        update.sharedWith.map(async (shared) => {
          let sharedUser;
          let finalUsername = shared.username
            ? shared.username.toLowerCase()
            : shared.username;
          let finalUserId = shared.userId;
          let finalPublicAddress = shared.publicAddress;

          // Case 1: Both userId and username provided - use userId and ignore username
          if (shared.userId && shared.username) {
            sharedUser = await this.userModel
              .findOne({
                _id: shared.userId,
                isActive: true,
              })
              .exec();
            if (sharedUser) {
              finalUsername = sharedUser.username.toLowerCase();
              finalUserId = shared.userId;
            }
          }
          // Case 2: Only userId provided - find username
          else if (shared.userId && !shared.username) {
            sharedUser = await this.userModel
              .findOne({
                _id: shared.userId,
                isActive: true,
              })
              .exec();
            if (sharedUser) {
              finalUsername = sharedUser.username.toLowerCase();
              finalUserId = shared.userId;
            }
          }
          // Case 3: Only username provided - find userId
          else if (shared.username && !shared.userId) {
            sharedUser = await this.userModel
              .findOne({
                username: shared.username.toLowerCase(),
                isActive: true,
              })
              .exec();
            if (sharedUser) {
              finalUsername = sharedUser.username.toLowerCase();
              finalUserId = sharedUser._id ? String(sharedUser._id) : '';
            }
          }
          // Case 4: Only publicAddress provided - find user by public address
          else if (shared.publicAddress && !shared.userId && !shared.username) {
            // First, find the public address record
            const publicAddressRecord = await this.publicAddressModel
              .findOne({
                publicKey: shared.publicAddress,
              })
              .populate('userId')
              .exec();

            if (publicAddressRecord && publicAddressRecord.userId) {
              const user = publicAddressRecord.userId as any;
              if (user.isActive) {
                sharedUser = user;
                finalUsername = user.username.toLowerCase();
                finalUserId = user._id ? String(user._id) : '';
                finalPublicAddress = shared.publicAddress;
              }
            } else {
              // If no user found for this public address, keep only the public address
              finalPublicAddress = shared.publicAddress;
              finalUsername = undefined;
              finalUserId = undefined;
            }
          }

          return {
            ...shared,
            username: finalUsername,
            userId: finalUserId,
            publicAddress: finalPublicAddress,
          };
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
      }

      // Process sharedWith array to ensure both userId and username are present
      let processedSharedWith = passwordData.sharedWith;
      if (passwordData.sharedWith?.length > 0) {
        processedSharedWith = await Promise.all(
          passwordData.sharedWith.map(async (shared) => {
            let sharedUser;
            let finalUsername = shared.username
              ? shared.username.toLowerCase()
              : shared.username;
            let UserId = shared.userId;
            let finalPublicAddress = shared.publicAddress;
            let shouldSendTelegramNotification = false;

            // Case 1: Both userId and username provided - use userId and ignore username
            if (shared.userId && shared.username) {
              sharedUser = await this.userModel
                .findOne({
                  _id: shared.userId,
                  isActive: true,
                })
                .exec();
              if (sharedUser) {
                finalUsername = sharedUser.username.toLowerCase();
                UserId = shared.userId;
                // Check if user has telegramId for notification
                if (sharedUser.telegramId) {
                  shouldSendTelegramNotification = true;
                }
              }
            }
            // Case 2: Only userId provided - find username
            else if (shared.userId && !shared.username) {
              sharedUser = await this.userModel
                .findOne({
                  _id: shared.userId,
                  isActive: true,
                })
                .exec();
              if (sharedUser) {
                finalUsername = sharedUser.username.toLowerCase();
                UserId = shared.userId;
                // Check if user has telegramId for notification
                if (sharedUser.telegramId) {
                  shouldSendTelegramNotification = true;
                }
              }
            }
            // Case 3: Only username provided - find userId and check if it's a registered user
            else if (shared.username && !shared.userId) {
              // Search for active user by username (case-insensitive)
              sharedUser = await this.userModel
                .findOne({
                  username: { $regex: new RegExp(`^${shared.username}$`, 'i') },
                  isActive: true,
                })
                .exec();

              if (sharedUser) {
                // User found - populate all details
                finalUsername = sharedUser.username.toLowerCase();
                UserId = sharedUser._id ? String(sharedUser._id) : '';

                // Check if user has telegramId for notification
                if (sharedUser.telegramId) {
                  shouldSendTelegramNotification = true;
                }

                // Find the public address for this user
                const publicAddressRecord = await this.publicAddressModel
                  .findOne({
                    userId: sharedUser._id,
                  })
                  .exec();

                if (publicAddressRecord) {
                  finalPublicAddress = publicAddressRecord.publicKey;
                }
              } else {
                // Username not found in registered users, treat as Telegram username
                finalUsername = shared.username.toLowerCase();
                UserId = undefined;
                shouldSendTelegramNotification = true;
              }
            }
            // Case 4: Only publicAddress provided - find user by public address
            else if (
              shared.publicAddress &&
              !shared.userId &&
              !shared.username
            ) {
              // First, find the public address record
              const publicAddressRecord = await this.publicAddressModel
                .findOne({
                  publicKey: shared.publicAddress,
                })
                .populate('userId')
                .exec();

              if (publicAddressRecord && publicAddressRecord.userId) {
                const user = publicAddressRecord.userId as any;
                if (user.isActive) {
                  sharedUser = user;
                  finalUsername = user.username.toLowerCase();
                  UserId = user._id ? String(user._id) : '';
                  finalPublicAddress = shared.publicAddress;
                  // Always add user to sharedWith if found, regardless of Telegram account
                  // Check if user has telegramId for notification
                  if (user.telegramId) {
                    shouldSendTelegramNotification = true;
                  }
                }
              } else {
                // If no user found for this public address, keep only the public address
                finalPublicAddress = shared.publicAddress;
                finalUsername = undefined;
                UserId = undefined;
                shouldSendTelegramNotification = false;
              }
            }

            return {
              ...shared,
              username: finalUsername,
              userId: UserId,
              publicAddress: finalPublicAddress,
              shouldSendTelegramNotification,
            };
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

      // Check if user has a valid telegramId before sending messages
      if (!user.telegramId || user.telegramId === '') {
        console.log('User has no valid Telegram ID, skipping notifications');
        return;
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
            if (!sharedWith.username) {
              console.log(
                'Skipping notification - shared user has no username',
              );
              return;
            }

            const sharedWithUser = await this.userModel.findOne({
              username: sharedWith.username,
              isActive: true,
            });

            if (!sharedWithUser || !sharedWithUser.telegramId) {
              console.log(
                `User ${sharedWith.username} not found or has no Telegram ID`,
              );
              return;
            }

            // Check if the shared user is the same as the secret owner - don't send notification to self
            if (
              (sharedWithUser._id ? String(sharedWithUser._id) : '') ===
              (user._id ? String(user._id) : '')
            ) {
              console.log(
                'Secret owner is the same as shared user, skipping notification',
              );
              return;
            }

            console.log(
              `Sending notification to ${sharedWithUser.username} (${sharedWithUser.telegramId})`,
            );
            const userName =
              user.firstName && user.firstName.trim() !== ''
                ? user.firstName + ' ' + user.lastName
                : user.username;

            const message = `🔐 <b>Secret Shared With You</b> 

User <b>${userName}</b> has shared a secret with you 🔁.

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
              Number(sharedWithUser.telegramId),
              message,
              3,
              replyMarkup,
            );

            console.log(
              `Message to ${sharedWithUser.username} sent result: ${result}`,
            );
            return result;
          } catch (error) {
            console.error(
              `Failed to send notification to ${sharedWith.username}:`,
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
          'Parent password owner has no valid Telegram ID, skipping notification',
        );
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

User <b>${childUserDisplayName}</b> has responded to your secret with a new secret " 🔄

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
          // Find the shared user by username
          const user = await this.userModel
            .findOne({ username: sharedUser.username })
            .exec();

          if (!user) {
            console.log(`Shared user ${sharedUser.username} not found`);
            continue;
          }

          // Check if shared user is the same as child user - don't send notification to self
          if (
            (user._id ? String(user._id) : '') ===
            (childUser._id ? String(childUser._id) : '')
          ) {
            console.log(
              'Child password creator is the same as shared user, skipping notification',
            );
            continue;
          }

          // Check if shared user has a valid telegramId
          if (!user.telegramId || user.telegramId === '') {
            console.log(
              `Shared user ${sharedUser.username} has no valid Telegram ID, skipping notification`,
            );
            continue;
          }

          // Create the notification message
          const message = `🔐 <b>Reply to Shared Secret</b>

User <b>${childUserDisplayName}</b> has replied to <b>${parentOwnerDisplayName}</b>'s secret that was shared with you 🔄

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
            `Sending child password notification to shared user ${user.username} (${user.telegramId})`,
          );

          // Send the notification
          const result = await this.telegramService.sendMessage(
            Number(user.telegramId),
            message,
            3,
            replyMarkup,
          );

          console.log(
            `Child password notification sent to shared user ${user.username}, result: ${result}`,
          );
        } catch (userError) {
          console.error(
            `Error sending notification to shared user ${sharedUser.username}:`,
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
          latestPublicAddress?: string;
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

        let latestPublicAddress: string | undefined;
        if (owner.telegramId) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                owner.telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              latestPublicAddress = addressResponse.data.publicKey;
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
          latestPublicAddress,
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
            latestPublicAddress: undefined,
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
            latestPublicAddress: ownerInfo.latestPublicAddress, // Add latest public address
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
          'key value description updatedAt createdAt sharedWith type hidden',
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

      // Transform the data similar to getSharedWithMe method
      const transformedData = await Promise.all(
        sharedPasswords
          .filter((password) => password.userId) // Filter out passwords without userId
          .map(async (password) => {
            const passwordUserId = password.userId
              ? String(password.userId)
              : '';
            const ownerUsername = ownerUsernameMap.get(passwordUserId);
            const ownerTelegramId = ownerTelegramIdMap.get(passwordUserId);
            const ownerPrivacyMode =
              ownerPrivacyMap.get(passwordUserId) || false;
            const isOwner = currentUserTelegramId === ownerTelegramId;

            const baseData = {
              _id: password._id,
              key: password.key,
              value: password.value,
              description: password.description,
              sharedBy:
                ownerUsername || password.initData?.username || 'Unknown',
              sharedWith: password.sharedWith || [], // Include sharedWith field in response
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
          latestPublicAddress?: string;
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

        let latestPublicAddress: string | undefined;
        if (owner.telegramId) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                owner.telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              latestPublicAddress = addressResponse.data.publicKey;
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
          latestPublicAddress,
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
            latestPublicAddress: undefined,
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
            latestPublicAddress: ownerInfo.latestPublicAddress, // Add latest public address
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
    // If JWT token exists, use userId; otherwise use telegramId
    if (req?.user && req.user.id) {
      return this.findByUserIdWithPagination(req.user.id, page, limit);
    } else {
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
   * @param latestWalletAddress - The latest wallet address of the viewer (optional)
   * @returns Updated password document
   */
  async recordSecretView(
    secretId: string,
    telegramId: string,
    username?: string,
    userId?: string,
    latestWalletAddress?: string,
  ): Promise<Password> {
    try {
      // Check if secret exists
      const secret = await this.passwordModel.findById(secretId).exec();
      if (!secret) {
        throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
      }

      console.log('🔍 SECRET FOUND:', {
        secretId: secret._id,
        secretUserId: secret.userId,
        secretUserIdType: typeof secret.userId,
      });

      // Get the viewing user
      const viewingUser = await this.userModel
        .findOne({ telegramId })
        .select('privacyMode firstName lastName')
        .exec();
      if (!viewingUser) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
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
      console.log(
        'Are they equal (strict):',
        secretOwner.telegramId === telegramId,
      );
      console.log(
        'Are they equal (string):',
        String(secretOwner.telegramId) === String(telegramId),
      );
      console.log('========================');

      if (String(secretOwner.telegramId) === String(telegramId)) {
        // Owner viewing their own secret - don't record the view
        console.log('🚫 Owner viewing own secret - not recording view');
        return secret;
      }

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
        (view) => view.telegramId === telegramId,
      );

      // If user has never viewed this secret before, add new view
      if (!existingView) {
        console.log(
          '✅ Recording new secret view for user:',
          telegramId,
          username,
        );
        const newView = {
          telegramId,
          username,
          userId,
          latestWalletAddress,
          firstName: viewingUser.firstName,
          lastName: viewingUser.lastName,
          viewedAt: new Date(),
        };

        const updatedSecret = await this.passwordModel
          .findByIdAndUpdate(
            secretId,
            { $push: { secretViews: newView } },
            { new: true },
          )
          .exec();

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
   * @param latestWalletAddress - The latest wallet address of the requesting user
   * @returns View statistics including count and viewer details with deduplication
   */
  async getSecretViewStats(
    secretId: string,
    userId: string,
    telegramId: string,
    username: string,
    latestWalletAddress?: string,
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
      latestWalletAddress?: string;
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
      latestWalletAddress?: string;
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
            (view.latestWalletAddress &&
              latestWalletAddress &&
              view.latestWalletAddress === latestWalletAddress),
        ) || false;

      const secretViews = secret.secretViews || [];

      // Enhanced deduplication using all available identifiers including the requesting user's data
      const uniqueViewsMap = new Map<string, any>();

      for (const view of secretViews) {
        // Create a composite key for deduplication using multiple identifiers
        const deduplicationKeys = [
          view.userId,
          view.telegramId,
          view.username,
          view.latestWalletAddress,
        ].filter(Boolean); // Remove null/undefined values

        // Use the most reliable identifier as the primary key (userId > telegramId > username > walletAddress)
        const primaryKey =
          view.userId ||
          view.telegramId ||
          view.username ||
          view.latestWalletAddress;

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
          // Try to get user info from database if firstName/lastName not in view
          if (!view.firstName || !view.lastName) {
            const userInfo = await this.userModel
              .findOne({ telegramId: view.telegramId })
              .select('firstName lastName')
              .exec();

            return {
              telegramId: view.telegramId,
              username: view.username,
              userId: view.userId,
              latestWalletAddress: view.latestWalletAddress,
              firstName: userInfo?.firstName || view.firstName || '',
              lastName: userInfo?.lastName || view.lastName || '',
              viewedAt: view.viewedAt,
            };
          }

          return {
            telegramId: view.telegramId,
            username: view.username,
            userId: view.userId,
            latestWalletAddress: view.latestWalletAddress,
            firstName: view.firstName,
            lastName: view.lastName,
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
        if (view.latestWalletAddress)
          viewedUserIdentifiers.add(view.latestWalletAddress);
      });

      // Process shared users to categorize them using enhanced matching
      const notViewedUsers = [];
      const unknownUsers = [];
      let unknownCount = 0;

      if (secret.sharedWith && secret.sharedWith.length > 0) {
        for (const sharedUser of secret.sharedWith) {
          // Find user details from database using multiple lookup methods
          let userDetails = await this.userModel
            .findOne({ username: sharedUser.username })
            .select('telegramId firstName lastName privacyMode _id')
            .exec();

          // Try alternative lookup methods if username lookup failed
          if (!userDetails && sharedUser.userId) {
            userDetails = await this.userModel
              .findById(sharedUser.userId)
              .select('telegramId firstName lastName privacyMode username')
              .exec();
          }

          if (userDetails) {
            // Enhanced check using multiple identifiers
            const hasViewed =
              viewedUserIdentifiers.has(userDetails.telegramId) ||
              viewedUserIdentifiers.has(String(userDetails._id)) ||
              viewedUserIdentifiers.has(userDetails.username);

            // Check if user has privacy mode enabled AND hasn't viewed the secret
            if (userDetails.privacyMode && !hasViewed) {
              unknownUsers.push({
                username: sharedUser.username,
                firstName: userDetails.firstName,
                lastName: userDetails.lastName,
                telegramId: userDetails.telegramId,
              });
              unknownCount++;
            } else if (!userDetails.privacyMode && !hasViewed) {
              // User hasn't viewed the secret and doesn't have privacy mode
              notViewedUsers.push({
                username: sharedUser.username,
                firstName: userDetails.firstName,
                lastName: userDetails.lastName,
                telegramId: userDetails.telegramId,
              });
            }
            // Note: Users with privacyMode=true who have viewed the secret
            // will only appear in viewDetails without being added to unknownUsers
          } else {
            // User not found in database, add to not viewed
            notViewedUsers.push({
              username: sharedUser.username,
            });
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
          latestWalletAddress,
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
}
