import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Password, PasswordDocument } from '../schemas/password.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Report, ReportDocument } from '../../reports/schemas/report.schema';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../../public-addresses/schemas/public-address.schema';
import { TelegramDtoAuthGuard } from '../../guards/telegram-dto-auth.guard';
import { PublicAddressesService } from '../../public-addresses/public-addresses.service';
import { LoggerService } from '../../logger/logger.service';
import { LogEvent } from '../../logger/dto/log-event.enum';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { PasswordBaseService } from './password-base.service';
import { ERROR_MESSAGES } from '../../common/constants/error-messages.constant';

/**
 * Password CRUD Service
 * Handles basic Create, Read, Update, Delete operations for passwords
 */
@Injectable()
export class PasswordCrudService extends PasswordBaseService {
  constructor(
    @InjectModel(Password.name) passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name) userModel: Model<UserDocument>,
    @InjectModel(Report.name) reportModel: Model<ReportDocument>,
    @InjectModel(PublicAddress.name)
    publicAddressModel: Model<PublicAddressDocument>,
    telegramDtoAuthGuard: TelegramDtoAuthGuard,
    publicAddressesService: PublicAddressesService,
    private readonly loggerService: LoggerService,
  ) {
    super(
      passwordModel,
      userModel,
      reportModel,
      publicAddressModel,
      telegramDtoAuthGuard,
      publicAddressesService,
    );
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return bcrypt.hash(password, salt);
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(
    hashedPassword: string,
    plainPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Find a single password by filter
   */
  async findOne(filter: Partial<Password>): Promise<Password | null> {
    return this.passwordModel.findOne(filter).exec();
  }

  /**
   * Find a password by ID
   */
  async findById(id: string): Promise<Password | null> {
    return this.passwordModel.findById(id).exec();
  }

  /**
   * Find passwords by user ObjectId
   */
  async findByUserObjectId(userId: Types.ObjectId): Promise<Password[]> {
    return this.passwordModel.find({ userId, isActive: true }).exec();
  }

  /**
   * Find and update a password
   */
  async findOneAndUpdate(
    filter: Partial<Password>,
    update: Partial<Password>,
  ): Promise<Password | null> {
    return this.passwordModel
      .findOneAndUpdate(filter, update, { new: true })
      .exec();
  }

  /**
   * Update a password by ID
   */
  async findByIdAndUpdate(
    id: string,
    update: Partial<Password>,
  ): Promise<Password | null> {
    const password = await this.verifyPasswordExists(id);

    // Ensure hidden field is maintained
    if (update.hidden === undefined) {
      update.hidden = password.hidden || false;
    }

    const updatedPassword = await this.passwordModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();

    // Log the update
    if (updatedPassword) {
      await this.logPasswordUpdate(updatedPassword);
    }

    return updatedPassword;
  }

  /**
   * Delete a password by filter
   */
  async findOneAndDelete(filter: Partial<Password>): Promise<Password | null> {
    return this.passwordModel.findOneAndDelete(filter).exec();
  }

  /**
   * Delete a password by ID
   */
  async findByIdAndDelete(id: string): Promise<Password | null> {
    return this.passwordModel.findByIdAndDelete(id).exec();
  }

  /**
   * Update a password with logging
   */
  async update(
    id: string,
    updatePasswordDto: Partial<Password>,
  ): Promise<Password | null> {
    try {
      const password = await this.verifyPasswordExists(id);

      // Ensure hidden field is maintained
      if (updatePasswordDto.hidden === undefined) {
        updatePasswordDto.hidden = password.hidden || false;
      }

      const updatedPassword = await this.passwordModel
        .findByIdAndUpdate(id, updatePasswordDto, { new: true })
        .exec();

      if (updatedPassword) {
        await this.logPasswordUpdate(updatedPassword);
      }

      return updatedPassword;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Delete a password with error handling
   */
  async delete(id: string): Promise<Password | null> {
    try {
      const password = await this.findByIdAndDelete(id);
      if (!password) {
        throw new HttpException(
          ERROR_MESSAGES.PASSWORD.NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      return password;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Create or update a password
   */
  async createOrUpdatePassword(
    passwordData: Partial<Password>,
  ): Promise<Password> {
    const existingPassword = await this.findOne({
      userId: passwordData.userId,
      key: passwordData.key,
    });

    if (existingPassword) {
      const updated = await this.findByIdAndUpdate(
        (existingPassword._id as Types.ObjectId).toString(),
        passwordData,
      );
      return updated as Password;
    }

    // Ensure hidden field is set for new passwords
    if (passwordData.hidden === undefined) {
      passwordData.hidden = false;
    }

    const newPassword = new this.passwordModel(passwordData);
    const savedPassword = await newPassword.save();

    // Log creation
    await this.logPasswordCreation(savedPassword);

    return savedPassword;
  }

  /**
   * Delete password by owner verification (using telegramId)
   */
  async deletePasswordByOwner(
    id: string,
    telegramId: string,
  ): Promise<Password | null> {
    try {
      const user = await this.verifyUserExists({ telegramId });
      const password = await this.verifyPasswordExists(id);
      this.verifyPasswordOwnership(password, user);

      return this.passwordModel.findByIdAndDelete(id).exec();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Delete password by owner verification (using userId)
   */
  async deletePasswordByUserId(
    id: string,
    userId: string,
  ): Promise<Password | null> {
    try {
      const user = await this.verifyUserExists({ userId });
      const password = await this.verifyPasswordExists(id);
      this.verifyPasswordOwnership(password, user);

      return this.passwordModel.findByIdAndDelete(id).exec();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Hide a password (set hidden field to true)
   */
  async hidePassword(id: string, telegramId: string): Promise<Password | null> {
    try {
      const user = await this.verifyUserExists({ telegramId });
      const password = await this.verifyPasswordExists(id);
      this.verifyPasswordOwnership(password, user);

      return this.passwordModel
        .findByIdAndUpdate(id, { hidden: true }, { new: true })
        .exec();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Hide password by userId
   */
  async hidePasswordByUserId(
    id: string,
    userId: string,
  ): Promise<Password | null> {
    try {
      const user = await this.verifyUserExists({ userId });
      const password = await this.verifyPasswordExists(id);
      this.verifyPasswordOwnership(password, user);

      return this.passwordModel
        .findByIdAndUpdate(id, { hidden: true }, { new: true })
        .exec();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Log password creation to logger service
   */
  private async logPasswordCreation(password: PasswordDocument): Promise<void> {
    try {
      let user: User | null = null;
      if (password.userId) {
        user = await this.userModel.findById(password.userId).exec();
      }

      await this.loggerService.saveSystemLog(
        {
          event: LogEvent.SecretCreated,
          message: 'New secret created',
          key: password.key,
          type: password.type,
          secretId: String(password._id),
          sharedRecipientsCount: Array.isArray(password.sharedWith)
            ? password.sharedWith.length
            : 0,
        },
        {
          userId: password.userId ? String(password.userId) : undefined,
          telegramId: user?.telegramId,
          username: user?.username,
        },
      );
    } catch (error) {
      console.error('Failed to log secret creation', error);
    }
  }

  /**
   * Log password update to logger service
   */
  private async logPasswordUpdate(password: PasswordDocument): Promise<void> {
    try {
      await this.loggerService.saveSystemLog(
        {
          event: LogEvent.SecretUpdated,
          message: 'Secret updated',
          key: password.key,
          type: password.type,
          secretId: String(password._id),
          sharedRecipientsCount: Array.isArray(password.sharedWith)
            ? password.sharedWith.length
            : 0,
        },
        {
          userId: password.userId ? String(password.userId) : undefined,
        },
      );
    } catch (error) {
      console.error('Failed to log secret update', error);
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
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
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
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }
}
