import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
// import { Request } from 'express';

// Extend Request interface to include user property
interface AuthenticatedRequest extends Request {
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
@Injectable()
export class PasswordService {
  constructor(
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    private readonly telegramService: TelegramService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
  ) {}

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
          'key value description updatedAt createdAt sharedWith type hidden',
        )
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
          'key value description updatedAt createdAt sharedWith type hidden',
        )
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
  ): Promise<SharedWithMeResponse> {
    try {
      if (!username && !userId) {
        throw new Error('Username or userId is required');
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
          finalUserId = user._id.toString();
        }
      }

      const sharedWithMe = await this.getSharedWithMe(username, finalUserId);
      return sharedWithMe;
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async getSharedWithMe(
    username: string,
    userId?: string,
  ): Promise<SharedWithMeResponse> {
    try {
      if (!username && !userId) {
        throw new Error('Username or userId is required');
      }

      let sharedPasswords: any[] = [];

      // First, try searching by userId if available
      if (userId) {
        sharedPasswords = await this.passwordModel
          .find({
            'sharedWith.userId': userId,
            isActive: true,
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          })
          .select(
            ' _id key value description initData.username sharedWith createdAt updatedAt ',
          )
          .lean()
          .exec();
      }

      // If no results found with userId and username exists, try searching by username
      if (sharedPasswords.length === 0 && username) {
        sharedPasswords = await this.passwordModel
          .find({
            'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') }, //case insensitive
            isActive: true,
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          })
          .select(
            ' _id key value description initData.username sharedWith createdAt updatedAt ',
          )
          .lean()
          .exec();
      }
      if (!sharedPasswords?.length) {
        return { sharedWithMe: [], userCount: 0 };
      }

      const resolvedPasswords = await Promise.all(
        sharedPasswords.map(async (password) => {
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

          return {
            id: password._id.toString(),
            key: password.key,
            value: password.value,
            description: password.description,
            username: password.initData.username,
            sharedWith: password.sharedWith || [], // Include sharedWith field in response
            reports: transformedReports,
            createdAt: password.createdAt,
            updatedAt: password.updatedAt,
          } as {
            id: string;
            key: string;
            value: string;
            description: string;
            username: string;
            sharedWith: any[];
            reports: any[];
            createdAt: Date;
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
              createdAt: Date;
              updatedAt: Date;
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
            createdAt: Date;
            updatedAt: Date;
          },
        ) => {
          const ownerUsername = password.username;

          if (!acc[ownerUsername]) {
            acc[ownerUsername] = [];
          }

          if (password.key && password.value) {
            acc[ownerUsername].push({
              id: password.id,
              key: password.key,
              value: password.value,
              description: password.description,
              createdAt: password.createdAt,
              updatedAt: password.updatedAt,
              sharedWith: password.sharedWith || [],
              reports: password.reports,
            });
          }

          return acc;
        },
        {},
      );

      const result = Object.entries(groupedByOwner)
        .filter(([username]) => username !== 'unknown')
        .map(([username, passwords]) => ({
          username,
          passwords: passwords.map((p) => ({
            id: p.id,
            key: p.key,
            value: p.value,
            description: p.description,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            sharedWith: p.sharedWith,
            reports: p.reports,
          })),
          count: passwords.length,
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
  ): Promise<Password> {
    const password = await this.passwordModel.findById(id).exec();
    if (!password) {
      throw new HttpException('Password not found', HttpStatus.NOT_FOUND);
    }

    // Process sharedWith array to ensure both userId and username are present
    const processedUpdate = { ...update };
    if (update.sharedWith?.length > 0) {
      processedUpdate.sharedWith = await Promise.all(
        update.sharedWith.map(async (shared) => {
          let sharedUser;
          let finalUsername = shared.username;
          let finalUserId = shared.userId;

          // Case 1: Both userId and username provided - use userId and ignore username
          if (shared.userId && shared.username) {
            sharedUser = await this.userModel
              .findOne({
                _id: shared.userId,
                isActive: true,
              })
              .exec();
            if (sharedUser) {
              finalUsername = sharedUser.username;
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
              finalUsername = sharedUser.username;
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
              finalUsername = sharedUser.username;
              finalUserId = sharedUser._id.toString();
            }
          }

          return {
            ...shared,
            username: finalUsername,
            userId: finalUserId,
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
      const headerInitData = req.headers['x-telegram-init-data'];
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
      const headerInitData = req.headers['x-telegram-init-data'];
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
      const headerInitData = req.headers['x-telegram-init-data'];
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

    // Try request body initData first
    if (bodyInitData) {
      telegramId = bodyInitData.telegramId;
      initData = bodyInitData;
    }
    // Use X-Telegram-Init-Data header as fallback
    else if (req?.headers?.['x-telegram-init-data']) {
      const headerInitData = req.headers['x-telegram-init-data'];
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
            let finalUsername = shared.username;
            let finalUserId = shared.userId;

            // Case 1: Both userId and username provided - use userId and ignore username
            if (shared.userId && shared.username) {
              sharedUser = await this.userModel
                .findOne({
                  _id: shared.userId,
                  isActive: true,
                })
                .exec();
              if (sharedUser) {
                finalUsername = sharedUser.username;
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
                finalUsername = sharedUser.username;
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
                finalUsername = sharedUser.username;
                finalUserId = sharedUser._id.toString();
              }
            }

            return {
              ...shared,
              username: finalUsername,
              userId: finalUserId,
            };
          }),
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

            console.log(
              `Sending notification to ${sharedWithUser.username} (${sharedWithUser.telegramId})`,
            );
            const userName =
              user.firstName && user.firstName.trim() !== ''
                ? user.firstName + ' ' + user.lastName
                : user.username;

            const message = `🔐 <b>Secret Shared With You</b> 

User <b>${userName}</b> has shared their "<b>${passwordUser.key}</b>" secret with you 🔁.

You can view it under the <b>"Shared with me"</b> tab 📂.
`;

            const result = await this.telegramService.sendMessage(
              Number(sharedWithUser.telegramId),
              message,
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

      // Check if parent owner has a valid telegramId before sending notification
      if (!parentOwner.telegramId || parentOwner.telegramId === '') {
        console.log(
          'Parent password owner has no valid Telegram ID, skipping notification',
        );
        return;
      }

      // For development/testing purposes, send notification even if same user
      // if (parentOwner.telegramId === childUser.telegramId) {
      //   console.log('Child password creator is the same as parent owner, skipping notification');
      //   return;
      // }

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

User <b>${childUserDisplayName}</b> has responded to your secret "<b>${parentPassword.key}</b>" with a new secret "<b>${childSecretName}</b>" 🔄

📅 <b>Response Date & Time:</b> ${dateTime}

You can view the response in your secrets list 📋.`;

      console.log(
        `Sending child password notification to parent owner ${parentOwner.username} (${parentOwner.telegramId})`,
      );

      // Send the notification
      const result = await this.telegramService.sendMessage(
        Number(parentOwner.telegramId),
        message,
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
      if (!password.userId.equals(new Types.ObjectId(user._id.toString()))) {
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
      if (!password.userId.equals(new Types.ObjectId(user._id.toString()))) {
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
        new Types.ObjectId(user._id.toString()),
      );
      const hasAccess =
        parentPassword.sharedWith &&
        parentPassword.sharedWith.some(
          (shared) => shared.username === user.username,
        );

      // Check if user owns any child password
      const ownsChildPassword = await this.passwordModel.exists({
        parent_secret_id: new Types.ObjectId(parentId),
        userId: new Types.ObjectId(user._id.toString()),
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
          'key value description updatedAt createdAt sharedWith type hidden initData',
        )
        .skip(skip)
        .limit(limit)
        .exec();

      console.log(
        'Child passwords found:',
        `${childPasswords.length} of ${totalCount} total`,
      );

      // If no child passwords found, throw not found
      if (totalCount === 0) {
        throw new HttpException('There are no children', HttpStatus.NOT_FOUND);
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

          return {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            username: password.initData?.username || 'Unknown', // Include username of password owner
            updatedAt: password.updatedAt,
            createdAt: password.createdAt,
            hidden: password.hidden || false,
            reports: reportInfo,
          };
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
          'key value description updatedAt createdAt sharedWith type hidden',
        )
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
    try {
      // Extract userId and username from request
      let userId: string | undefined;
      let username: string | undefined;

      if (req?.user && req.user.id) {
        userId = req.user.id;
        username = req.user.username;
      } else if (req?.headers?.['x-telegram-init-data']) {
        const headerInitData = req.headers['x-telegram-init-data'];
        const parsedData =
          this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
        username = parsedData.username;
        // Try to find userId from username
        if (username) {
          const user = await this.userModel
            .findOne({
              username: username.toLowerCase(),
              isActive: true,
            })
            .exec();
          if (user) {
            userId = user._id.toString();
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
        if (!username && !userId) {
          throw new Error('Username or userId is required');
        }
        return this.findPasswordsSharedWithMe(username, userId);
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      let baseQuery: any;
      let totalCount = 0;
      let sharedPasswords: any[] = [];

      // First, try searching by userId if available
      if (userId) {
        baseQuery = {
          'sharedWith.userId': userId,
          isActive: true,
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        };

        totalCount = await this.passwordModel.countDocuments(baseQuery).exec();

        if (totalCount > 0) {
          sharedPasswords = await this.passwordModel
            .find(baseQuery)
            .select(
              ' _id key value description initData.username sharedWith createdAt updatedAt ',
            )
            .skip(skip)
            .limit(limit)
            .lean()
            .exec();
        }
      }

      // If no results found with userId and username exists, try searching by username
      if (totalCount === 0 && username) {
        baseQuery = {
          'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') },
          isActive: true,
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        };

        totalCount = await this.passwordModel.countDocuments(baseQuery).exec();

        if (totalCount > 0) {
          sharedPasswords = await this.passwordModel
            .find(baseQuery)
            .select(
              ' _id key value description initData.username sharedWith createdAt updatedAt ',
            )
            .skip(skip)
            .limit(limit)
            .lean()
            .exec();
        }
      }

      // If no username available and no results, stop search and return empty result
      if (totalCount === 0 && !username) {
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

      // Transform the data similar to getSharedWithMe method
      const transformedData = sharedPasswords.map((password) => ({
        _id: password._id,
        key: password.key,
        value: password.value,
        description: password.description,
        sharedBy: password.initData?.username || 'Unknown',
        sharedWith: password.sharedWith || [], // Include sharedWith field in response
        createdAt: password.createdAt,
        updatedAt: password.updatedAt,
      }));

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
      if (!password.userId.equals(new Types.ObjectId(user._id.toString()))) {
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
      if (!password.userId.equals(new Types.ObjectId(user._id.toString()))) {
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
        new Types.ObjectId(user._id.toString()),
      );
      const hasAccess =
        parentPassword.sharedWith &&
        parentPassword.sharedWith.some(
          (shared) => shared.username === user.username,
        );

      // Check if user owns any child password
      const ownsChildPassword = await this.passwordModel.exists({
        parent_secret_id: new Types.ObjectId(parentId),
        userId: new Types.ObjectId(user._id.toString()),
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
          'key value description updatedAt createdAt sharedWith type hidden initData',
        )
        .skip(skip)
        .limit(limit)
        .exec();

      // If no child passwords found, throw not found
      if (totalCount === 0) {
        throw new HttpException('There are no children', HttpStatus.NOT_FOUND);
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
          };
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
    const pageNumber = page ? parseInt(page.toString(), 10) : undefined;
    const limitNumber = limit ? parseInt(limit.toString(), 10) : undefined;

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
    // If JWT token exists, use userId; otherwise use telegramId
    if (req?.user && req.user.id) {
      return this.deletePasswordByUserId(key, req.user.id);
    } else {
      const telegramId = this.extractTelegramIdFromRequest(req);
      return this.deletePasswordByOwner(key, telegramId);
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
    // If JWT token exists, use userId; otherwise use telegramId
    if (req?.user && req.user.id) {
      return this.getChildPasswordsByUserId(parentId, req.user.id, page, limit);
    } else {
      const telegramId = this.extractTelegramIdFromRequest(req);
      return this.getChildPasswords(parentId, telegramId, page, limit);
    }
  }
}
