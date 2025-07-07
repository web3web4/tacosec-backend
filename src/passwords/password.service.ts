import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
@Injectable()
export class PasswordService {
  constructor(
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    private readonly telegramService: TelegramService,
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

  async findByUserId(userId: Types.ObjectId): Promise<Password[]> {
    return this.passwordModel.find({ userId, isActive: true }).exec();
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
          'initData.telegramId': telegramId,
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
          'initData.telegramId': telegramId,
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
  ): Promise<SharedWithMeResponse> {
    try {
      if (!username) {
        throw new Error('Username is required');
      }
      // const user = await this.userModel.findOne({
      //   username,
      //   isActive: true,
      // });
      // if (!user) {
      //   throw new Error('username is not valid');
      // }
      const sharedWithMe = await this.getSharedWithMe(username);
      return sharedWithMe;
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async getSharedWithMe(username: string): Promise<SharedWithMeResponse> {
    try {
      if (!username) {
        throw new Error('Username is required');
      }
      const sharedPasswords = await this.passwordModel
        .find({
          // 'sharedWith.username': { $in: [username] },
          'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') }, //case insensitive
          isActive: true,
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        })
        .select(' _id key value description initData.username ')
        .lean()
        .exec();
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
            reports: transformedReports,
          } as {
            id: string;
            key: string;
            value: string;
            description: string;
            username: string;
            reports: any[];
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
              reports: any[];
            }>
          >,
          password,
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
          passwords,
          count: passwords.length,
        }));

      result.sort((a, b) => b.count - a.count);

      return { sharedWithMe: result, userCount: result.length };
    } catch (error) {
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
      const user = await this.userModel.findOne({
        telegramId: password.initData?.telegramId,
        isActive: true,
      });

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
  async addPassword(passwordData: CreatePasswordRequestDto) {
    try {
      // get user by telegramId
      const user = await this.userModel
        .findOne({
          telegramId: passwordData.initData.telegramId,
          isActive: true,
        })
        .exec();

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Check if user is restricted from sharing passwords
      if (user.sharingRestricted && passwordData.sharedWith?.length > 0) {
        // If user is restricted, we need to validate each user they're trying to share with
        await this.validateSharingRestrictions(user, passwordData.sharedWith);
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
      const authDate = this.getValidAuthDate(passwordData.initData.authDate);

      // create password
      const password = await this.createOrUpdatePassword({
        userId: (user as UserDocument)._id as Types.ObjectId,
        key: passwordData.key,
        value: passwordData.value,
        description: passwordData.description,
        isActive: true,
        type: passwordData.type,
        sharedWith: passwordData.sharedWith,
        hidden: false, // Explicitly set hidden to false
        parent_secret_id: parentSecretId,
        initData: { ...passwordData.initData, authDate },
      });

      // Get the full password object including _id
      const passwordObj = (password as PasswordDocument).toObject();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { userId: _, ...passwordWithId } = passwordObj;

      return passwordWithId;
    } catch (error) {
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
      const user = await this.userModel.findOne({
        telegramId: passwordUser.initData.telegramId,
        isActive: true,
      });

      if (!user) {
        console.error(
          'User not found when trying to send shared password messages',
        );
        return; // Don't throw exception, just return to prevent breaking the main flow
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
      // Find the password by ID
      const password = await this.passwordModel.findById(id).exec();

      // Check if password exists
      if (!password) {
        throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
      }

      // Check if the authenticated user is the owner of the password
      if (password.initData?.telegramId !== telegramId) {
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
      // Find the password by ID
      const password = await this.passwordModel.findById(id).exec();

      // Check if password exists
      if (!password) {
        throw new HttpException('Secret not found', HttpStatus.NOT_FOUND);
      }

      // Check if the authenticated user is the owner of the password
      if (password.initData?.telegramId !== telegramId) {
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

      // Check if user owns the parent password - check both initData.telegramId and direct user lookup
      const isParentOwner = parentPassword.initData?.telegramId === telegramId;

      // Additional check: find user by telegramId and check if they own this password
      const user = await this.userModel
        .findOne({ telegramId, isActive: true })
        .exec();
      const isOwnerByUserId =
        user &&
        parentPassword.userId &&
        parentPassword.userId.toString() === user._id.toString();

      const hasOwnershipAccess = isParentOwner || isOwnerByUserId;

      console.log('Parent ownership check:', {
        parentId,
        telegramId,
        parentTelegramId: parentPassword.initData?.telegramId,
        parentUserId: parentPassword.userId?.toString(),
        currentUserId: user?._id?.toString(),
        isParentOwner,
        isOwnerByUserId,
        hasOwnershipAccess,
      });

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Define the base query
      let baseQuery;
      if (hasOwnershipAccess) {
        baseQuery = {
          parent_secret_id: new Types.ObjectId(parentId),
          isActive: true,
          $or: [{ hidden: false }, { hidden: { $exists: false } }],
        };
      } else {
        baseQuery = {
          parent_secret_id: new Types.ObjectId(parentId),
          'initData.telegramId': telegramId,
          isActive: true,
          $or: [{ hidden: false }, { hidden: { $exists: false } }],
        };
      }

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
        hasOwnershipAccess
          ? 'Child passwords found (owner access):'
          : 'Child passwords found (user-specific access):',
        `${childPasswords.length} of ${totalCount} total`,
      );

      // If no child passwords found and user is not parent owner, throw forbidden
      if (totalCount === 0 && !isParentOwner) {
        throw new HttpException(
          'You are not authorized to access child secrets for this parent secret',
          HttpStatus.FORBIDDEN,
        );
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
        'initData.telegramId': telegramId,
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
          'initData.telegramId': telegramId,
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
    username: string,
    page?: number,
    limit?: number,
  ): Promise<SharedWithMeResponse | PaginatedResponse<any>> {
    try {
      if (!username) {
        throw new Error('Username is required');
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
        return this.findPasswordsSharedWithMe(username);
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Base query for finding shared passwords
      const baseQuery = {
        'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') },
        isActive: true,
        $or: [
          { parent_secret_id: { $exists: false } },
          { parent_secret_id: null },
        ],
      };

      // Get total count for pagination
      const totalCount = await this.passwordModel
        .countDocuments(baseQuery)
        .exec();

      // Find shared passwords with pagination
      const sharedPasswords = await this.passwordModel
        .find(baseQuery)
        .select(' _id key value description initData.username ')
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      // Transform the data similar to getSharedWithMe method
      const transformedData = sharedPasswords.map((password) => ({
        _id: password._id,
        key: password.key,
        value: password.value,
        description: password.description,
        sharedBy: password.initData?.username || 'Unknown',
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
}
