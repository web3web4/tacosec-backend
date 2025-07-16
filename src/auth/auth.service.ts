import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../public-addresses/schemas/public-address.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  Password,
  PasswordDocument,
} from '../passwords/schemas/password.schema';
import { LoginDto } from './dto/login.dto';
import { Role } from '../decorators/roles.decorator';
import { TelegramValidatorService } from '../telegram/telegram-validator.service';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { UsersService } from '../users/users.service';

export interface LoginResponse {
  access_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(PublicAddress.name)
    private publicAddressModel: Model<PublicAddressDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Password.name)
    private passwordModel: Model<PasswordDocument>,
    private jwtService: JwtService,
    private telegramValidator: TelegramValidatorService,
    private telegramDtoAuthGuard: TelegramDtoAuthGuard,
    private usersService: UsersService,
  ) {}

  async login(
    loginDto: LoginDto,
    telegramInitData?: string,
  ): Promise<LoginResponse | any> {
    const { publicAddress } = loginDto;

    try {
      // Find the public address in the database
      const addressRecord = await this.publicAddressModel
        .findOne({ publicKey: publicAddress })
        .populate('userId')
        .exec();

      // If X-Telegram-Init-Data header is provided, handle Telegram authentication
      if (telegramInitData) {
        return this.handleTelegramLogin(
          publicAddress,
          telegramInitData,
          addressRecord,
        );
      }

      // Original login logic when no Telegram data is provided
      if (!addressRecord) {
        // Create a new user when public address is not found
        const newUser = new this.userModel({
          username: '',
          telegramId: '',
          firstName: '',
          lastName: '',
          hash: '',
          role: Role.USER,
          isActive: true,
        });

        const savedUser = await newUser.save();

        // Create a new public address record for the new user
        const newAddressRecord = new this.publicAddressModel({
          publicKey: publicAddress,
          userId: savedUser._id,
        });

        await newAddressRecord.save();

        // Update shared secrets that contain this public address
        await this.updateSharedSecretsForNewUser(
          publicAddress,
          savedUser.username,
          savedUser._id.toString(),
        );

        // Create JWT payload for the new user
        const payload = {
          sub: savedUser._id.toString(),
          telegramId: savedUser.telegramId,
          username: savedUser.username,
          role: savedUser.role,
        };

        // Generate JWT token
        const access_token = this.jwtService.sign(payload);

        return {
          access_token,
        };
      }

      // Get the user information
      const user = addressRecord.userId as UserDocument;

      if (!user || !user.isActive) {
        throw new HttpException(
          {
            success: false,
            message: 'User not found or inactive',
            error: 'Unauthorized',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Create JWT payload
      const payload = {
        sub: user._id.toString(),
        telegramId: user.telegramId,
        username: user.username,
        role: user.role,
      };

      // Generate JWT token
      const access_token = this.jwtService.sign(payload);

      return {
        access_token,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Internal server error during login',
          error: 'Internal Server Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async handleTelegramLogin(
    publicAddress: string,
    telegramInitData: string,
    addressRecord: any,
  ): Promise<any> {
    try {
      // Step 1: Check if public address exists and is linked to a user
      if (addressRecord) {
        const user = addressRecord.userId as UserDocument;

        // Check if user has a non-empty telegramId
        if (user.telegramId && user.telegramId !== '') {
          throw new HttpException(
            {
              success: false,
              message:
                'The specified public wallet address is already linked to a real Telegram user',
              error: 'Conflict',
            },
            HttpStatus.CONFLICT,
          );
        }

        // User exists but telegramId is empty, proceed with Telegram validation
        return this.linkTelegramToExistingUser(user, telegramInitData);
      }

      // No address record found, this shouldn't happen in normal flow
      // but we'll handle it by creating a new user with Telegram data
      return this.createUserWithTelegramData(publicAddress, telegramInitData);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Error during Telegram authentication',
          error: 'Internal Server Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async linkTelegramToExistingUser(
    user: UserDocument,
    telegramInitData: string,
  ): Promise<any> {
    // Step 2: Validate Telegram init data
    const isValid =
      this.telegramValidator.validateTelegramInitData(telegramInitData);
    if (!isValid) {
      throw new HttpException(
        {
          success: false,
          message: 'Invalid Telegram authentication data or signature',
          error: 'Unauthorized',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Step 3: Parse Telegram data
    const telegramData =
      this.telegramDtoAuthGuard.parseTelegramInitData(telegramInitData);

    // Step 4: Check if a user with this telegramId already exists
    const existingTelegramUser = await this.userModel
      .findOne({
        telegramId: telegramData.telegramId,
      })
      .exec();

    if (existingTelegramUser) {
      throw new HttpException(
        {
          success: false,
          message:
            'User already exists. Linking is only possible with new users',
          error: 'Conflict',
        },
        HttpStatus.CONFLICT,
      );
    }

    // Step 5: Update user with Telegram data
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        user._id,
        {
          telegramId: telegramData.telegramId,
          firstName: telegramData.firstName || '',
          lastName: telegramData.lastName || '',
          username: telegramData.username || '',
          authDate: new Date(telegramData.authDate * 1000),
          hash: telegramData.hash,
        },
        { new: true },
      )
      .exec();

    // Get the user's public address to update shared secrets
    const userPublicAddress = await this.publicAddressModel
      .findOne({ userId: updatedUser._id })
      .exec();

    if (userPublicAddress) {
      // Update shared secrets that contain this public address
      await this.updateSharedSecretsForNewUser(
        userPublicAddress.publicKey,
        updatedUser.username,
        updatedUser._id.toString(),
      );
    }

    // Step 6: Return successful response with user data (similar to signup)
    const userObject = updatedUser.toObject();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id: _, ...userWithoutId } = userObject;

    return userWithoutId;
  }

  /**
   * Update secrets that contain sharedWith with the same public address
   * to include username and userId along with the existing public address
   */
  private async updateSharedSecretsForNewUser(
    publicAddress: string,
    username: string,
    userId: string,
  ): Promise<void> {
    try {
      // Find all passwords that have sharedWith containing the public address
      const passwordsWithSharedAddress = await this.passwordModel
        .find({
          'sharedWith.publicAddress': publicAddress,
          isActive: true,
        })
        .exec();

      // Update each password's sharedWith array
      for (const password of passwordsWithSharedAddress) {
        const updatedSharedWith = password.sharedWith.map((shared) => {
          // If this shared entry has the matching public address, update it
          if (shared.publicAddress === publicAddress) {
            return {
              ...shared,
              username: username,
              userId: userId,
              publicAddress: publicAddress, // Keep the existing public address
            };
          }
          return shared;
        });

        // Update the password document
        await this.passwordModel
          .findByIdAndUpdate(
            password._id,
            { sharedWith: updatedSharedWith },
            { new: true },
          )
          .exec();
      }
    } catch (error) {
      console.error('Error updating shared secrets for new user:', error);
      // Don't throw error to avoid breaking the login flow
    }
  }

  private async createUserWithTelegramData(
    publicAddress: string,
    telegramInitData: string,
  ): Promise<any> {
    // Validate Telegram init data
    const isValid =
      this.telegramValidator.validateTelegramInitData(telegramInitData);
    if (!isValid) {
      throw new HttpException(
        {
          success: false,
          message: 'Invalid Telegram authentication data or signature',
          error: 'Unauthorized',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Parse Telegram data
    const telegramData =
      this.telegramDtoAuthGuard.parseTelegramInitData(telegramInitData);

    // Check if a user with this telegramId already exists
    const existingTelegramUser = await this.userModel
      .findOne({
        telegramId: telegramData.telegramId,
      })
      .exec();

    if (existingTelegramUser) {
      throw new HttpException(
        {
          success: false,
          message:
            'User already exists. Linking is only possible with new users',
          error: 'Conflict',
        },
        HttpStatus.CONFLICT,
      );
    }

    // Create new user with Telegram data
    const newUser = new this.userModel({
      telegramId: telegramData.telegramId,
      firstName: telegramData.firstName || '',
      lastName: telegramData.lastName || '',
      username: telegramData.username || '',
      authDate: new Date(telegramData.authDate * 1000),
      hash: telegramData.hash,
      role: Role.USER,
      isActive: true,
    });

    const savedUser = await newUser.save();

    // Create a new public address record for the new user
    const newAddressRecord = new this.publicAddressModel({
      publicKey: publicAddress,
      userId: savedUser._id,
    });

    await newAddressRecord.save();

    // Update shared secrets that contain this public address
    await this.updateSharedSecretsForNewUser(
      publicAddress,
      savedUser.username,
      savedUser._id.toString(),
    );

    // Return user data (similar to signup)
    const userObject = savedUser.toObject();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id: _, ...userWithoutId } = userObject;

    return userWithoutId;
  }
}
