import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
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
import { PublicAddressesService } from '../public-addresses/public-addresses.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: {
    telegramId: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    photoUrl?: string;
    authDate?: Date;
    hash?: string;
    role?: string;
    isActive?: boolean;
    sharingRestricted?: boolean;
    reportCount?: number;
    privacyMode?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    publicAddress?: string;
  };
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
    private configService: ConfigService,
    private publicAddressesService: PublicAddressesService,
  ) {}

  async login(
    loginDto: LoginDto | undefined,
    telegramInitData?: string,
  ): Promise<LoginResponse | any> {
    try {
      // If X-Telegram-Init-Data header is provided, handle Telegram authentication
      if (telegramInitData) {
        // If loginDto is provided, use existing logic with publicAddress
        if (loginDto) {
          const { publicAddress } = loginDto;
          const addressRecord = await this.publicAddressModel
            .findOne({ publicKey: publicAddress })
            .populate('userId')
            .exec();
          return this.handleTelegramLogin(
            publicAddress,
            telegramInitData,
            addressRecord,
          );
        } else {
          // If no loginDto, handle pure Telegram authentication
          return this.handlePureTelegramLogin(telegramInitData);
        }
      }

      // If no telegramInitData, loginDto is required
      if (!loginDto) {
        throw new HttpException(
          {
            success: false,
            message:
              'Login data is required when not using Telegram authentication',
            error: 'Bad Request',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const { publicAddress } = loginDto;

      // Find the public address in the database
      const addressRecord = await this.publicAddressModel
        .findOne({ publicKey: publicAddress })
        .populate('userId')
        .exec();

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
          userId: savedUser._id.toString(),
          sub: savedUser._id.toString(),
          telegramId: savedUser.telegramId,
          username: savedUser.username,
          role: savedUser.role,
          publicAddress: publicAddress, // Add publicAddress to JWT payload
        };

        // Generate JWT tokens
        return await this.generateTokens(payload, savedUser);
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
        userId: user._id.toString(),
        sub: user._id.toString(),
        telegramId: user.telegramId,
        username: user.username,
        role: user.role,
        publicAddress: publicAddress, // Add publicAddress to JWT payload
      };

      // Generate JWT tokens
      return await this.generateTokens(payload, user);
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

  private async handlePureTelegramLogin(
    telegramInitData: string,
  ): Promise<LoginResponse> {
    try {
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

      // Check if user already exists
      let user = await this.userModel
        .findOne({ telegramId: telegramData.telegramId })
        .exec();

      if (user) {
        // User exists, update their data and generate token
        user.firstName = telegramData.firstName || user.firstName;
        user.lastName = telegramData.lastName || user.lastName;
        user.username = telegramData.username || user.username;
        user.authDate = new Date(telegramData.authDate * 1000);
        user.hash = telegramData.hash;

        await user.save();
      } else {
        // User doesn't exist, create new user
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

        user = await newUser.save();
      }

      // Get latest public address for the user (same logic as generateTokens)
      let latestPublicAddress: string | undefined;
      try {
        // First try to get address by telegramId if available
        if (user.telegramId) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByTelegramId(
              user.telegramId,
            );
          if (addressResponse.success && addressResponse.data) {
            latestPublicAddress = addressResponse.data.publicKey;
          }
        }

        // If no address found by telegramId, try by userId
        if (!latestPublicAddress && user._id) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByUserId(
              user._id.toString(),
            );
          if (addressResponse.success && addressResponse.data) {
            latestPublicAddress = addressResponse.data.publicKey;
          }
        }
      } catch (error) {
        // If address retrieval fails, latestPublicAddress remains undefined
        latestPublicAddress = undefined;
      }

      // Create JWT payload - use same publicAddress logic as response
      const payload = {
        userId: user._id.toString(),
        sub: user._id.toString(),
        telegramId: user.telegramId,
        username: user.username,
        role: user.role,
        publicAddress: latestPublicAddress, // Use same logic as generateTokens
      };

      // Generate JWT tokens
      return await this.generateTokens(payload, user);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Error during pure Telegram authentication',
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
      // If the existing user is the same as the current user, update their data
      if (existingTelegramUser._id.toString() === user._id.toString()) {
        // Update the current user's data
        existingTelegramUser.firstName =
          telegramData.firstName || existingTelegramUser.firstName;
        existingTelegramUser.lastName =
          telegramData.lastName || existingTelegramUser.lastName;
        existingTelegramUser.username =
          telegramData.username || existingTelegramUser.username;
        existingTelegramUser.authDate = new Date(telegramData.authDate * 1000);
        existingTelegramUser.hash = telegramData.hash;

        const savedUser = await existingTelegramUser.save();

        // Get latest public address for the user (same logic as generateTokens)
        let latestPublicAddress: string | undefined;
        try {
          // First try to get address by telegramId if available
          if (savedUser.telegramId) {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                savedUser.telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              latestPublicAddress = addressResponse.data.publicKey;
            }
          }

          // If no address found by telegramId, try by userId
          if (!latestPublicAddress && savedUser._id) {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByUserId(
                savedUser._id.toString(),
              );
            if (addressResponse.success && addressResponse.data) {
              latestPublicAddress = addressResponse.data.publicKey;
            }
          }
        } catch (error) {
          // If address retrieval fails, latestPublicAddress remains undefined
          latestPublicAddress = undefined;
        }

        // Create JWT payload - use same publicAddress logic as response
        const payload = {
          userId: savedUser._id.toString(),
          sub: savedUser._id.toString(),
          telegramId: savedUser.telegramId,
          username: savedUser.username,
          role: savedUser.role,
          publicAddress: latestPublicAddress, // Use same logic as generateTokens
        };

        // Generate JWT tokens
        return await this.generateTokens(payload, savedUser);
      } else {
        // Different user with same telegramId - this is a conflict for linking
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

    // Get latest public address for the user (same logic as generateTokens)
    let latestPublicAddress: string | undefined;
    try {
      // First try to get address by telegramId if available
      if (updatedUser.telegramId) {
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByTelegramId(
            updatedUser.telegramId,
          );
        if (addressResponse.success && addressResponse.data) {
          latestPublicAddress = addressResponse.data.publicKey;
        }
      }

      // If no address found by telegramId, try by userId
      if (!latestPublicAddress && updatedUser._id) {
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByUserId(
            updatedUser._id.toString(),
          );
        if (addressResponse.success && addressResponse.data) {
          latestPublicAddress = addressResponse.data.publicKey;
        }
      }
    } catch (error) {
      // If address retrieval fails, latestPublicAddress remains undefined
      latestPublicAddress = undefined;
    }

    // Create JWT payload - use same publicAddress logic as response
    const payload = {
      userId: updatedUser._id.toString(),
      sub: updatedUser._id.toString(),
      telegramId: updatedUser.telegramId,
      username: updatedUser.username,
      role: updatedUser.role,
      publicAddress: latestPublicAddress, // Use same logic as generateTokens
    };

    // Generate JWT tokens
    return await this.generateTokens(payload, updatedUser);
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
      // User exists, update their data
      existingTelegramUser.firstName =
        telegramData.firstName || existingTelegramUser.firstName;
      existingTelegramUser.lastName =
        telegramData.lastName || existingTelegramUser.lastName;
      existingTelegramUser.username =
        telegramData.username || existingTelegramUser.username;
      existingTelegramUser.authDate = new Date(telegramData.authDate * 1000);
      existingTelegramUser.hash = telegramData.hash;

      const savedUser = await existingTelegramUser.save();

      // Only create public address record if publicAddress is provided and valid
      if (publicAddress && publicAddress.trim() !== '') {
        // Check if public address already exists for this user
        const existingAddress = await this.publicAddressModel
          .findOne({ publicKey: publicAddress })
          .exec();

        if (!existingAddress) {
          // Create a new public address record
          const newAddressRecord = new this.publicAddressModel({
            publicKey: publicAddress,
            userId: savedUser._id,
          });
          await newAddressRecord.save();
        }
      }

      // Create JWT payload - use the publicAddress from login request if provided
      const payload = {
        userId: savedUser._id.toString(),
        sub: savedUser._id.toString(),
        telegramId: savedUser.telegramId,
        username: savedUser.username,
        role: savedUser.role,
        publicAddress: publicAddress, // Use the publicAddress from login request
      };

      // Generate JWT tokens
      return await this.generateTokens(payload, savedUser);
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

    // Only create public address record if publicAddress is provided and valid
    if (publicAddress && publicAddress.trim() !== '') {
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
    }

    // Get latest public address for the user
    let latestPublicAddress: string | undefined;
    try {
      if (savedUser.telegramId) {
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByTelegramId(
            savedUser.telegramId,
          );
        if (addressResponse.success && addressResponse.data) {
          latestPublicAddress = addressResponse.data.publicKey;
        }
      }

      if (!latestPublicAddress && savedUser._id) {
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByUserId(
            savedUser._id.toString(),
          );
        if (addressResponse.success && addressResponse.data) {
          latestPublicAddress = addressResponse.data.publicKey;
        }
      }
    } catch (error) {
      latestPublicAddress = undefined;
    }

    // Create JWT payload - use publicAddress from login request if provided
    const payload = {
      sub: savedUser._id.toString(),
      telegramId: savedUser.telegramId,
      username: savedUser.username,
      role: savedUser.role,
      publicAddress: publicAddress || latestPublicAddress, // Use publicAddress from request, fallback to latest
    };

    // Generate JWT token
    const access_token = this.jwtService.sign(payload);

    return {
      access_token,
    };
  }

  /**
   * Generate access and refresh tokens for a user
   * @param payload - JWT payload containing user information
   * @returns Object containing access_token, refresh_token, expires_in, and token_type
   */
  private async generateTokens(
    payload: JwtPayload,
    user?: any,
  ): Promise<LoginResponse> {
    // Get token expiration times from environment variables
    const accessTokenExpiry = this.configService.get<string>(
      'JWT_ACCESS_TOKEN_EXPIRES_IN',
      '15m',
    );
    const refreshTokenExpiry = this.configService.get<string>(
      'JWT_REFRESH_TOKEN_EXPIRES_IN',
      '7d',
    );

    // Update user's updatedAt field when generating tokens
    if (user && user._id) {
      try {
        await this.userModel.findByIdAndUpdate(
          user._id,
          { updatedAt: new Date() },
          { new: true }
        );
        // Update the user object to reflect the new updatedAt value
        user.updatedAt = new Date();
      } catch (error) {
        // If update fails, continue with token generation
        console.error('Failed to update user updatedAt field:', error);
      }
    }

    // Get latest public address for the user and update payload
    let updatedPayload = { ...payload };
    if (user) {
      try {
        // First try to get address by telegramId if available
        if (user.telegramId) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByTelegramId(
              user.telegramId,
            );
          if (addressResponse.success && addressResponse.data) {
            updatedPayload.publicAddress = addressResponse.data.publicKey;
          }
        }

        // If no address found by telegramId, try by userId
        if (!updatedPayload.publicAddress && user._id) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByUserId(
              user._id.toString(),
            );
          if (addressResponse.success && addressResponse.data) {
            updatedPayload.publicAddress = addressResponse.data.publicKey;
          }
        }
      } catch (error) {
        // If address retrieval fails, keep original publicAddress from payload
      }
    }

    // Generate access token with configurable expiration using updated payload
    const access_token = this.jwtService.sign(updatedPayload, {
      expiresIn: accessTokenExpiry,
    });

    // Generate refresh token with configurable expiration
    const refresh_token = this.jwtService.sign(
      {
        userId: payload.userId,
        type: 'refresh',
      },
      { expiresIn: refreshTokenExpiry },
    );

    // Calculate expires_in based on access token expiry (convert to seconds)
    const expiresInSeconds = this.parseExpirationToSeconds(accessTokenExpiry);

    return {
      access_token,
      refresh_token,
      expires_in: expiresInSeconds,
      token_type: 'Bearer',
      user: user
        ? {
            telegramId: user.telegramId,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            photoUrl: user.photoUrl,
            authDate: user.authDate,
            hash: user.hash,
            role: user.role,
            isActive: user.isActive,
            sharingRestricted: user.sharingRestricted,
            reportCount: user.reportCount,
            privacyMode: user.privacyMode,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            publicAddress: updatedPayload.publicAddress,
          }
        : undefined,
    };
  }

  /**
   * Parse expiration string to seconds
   * @param expiration - Expiration string like '15m', '1h', '7d'
   * @returns Number of seconds
   */
  private parseExpirationToSeconds(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default to 15 minutes if parsing fails

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        return 900; // Default to 15 minutes
    }
  }

  /**
   * Refresh access token using a valid refresh token
   * @param refreshToken - The refresh token
   * @returns New access and refresh tokens
   */
  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    try {
      // Verify the refresh token
      const decoded = this.jwtService.verify(refreshToken);

      // Check if it's a refresh token
      if (decoded.type !== 'refresh') {
        throw new HttpException(
          {
            success: false,
            message: 'Invalid token type',
            error: 'Unauthorized',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Find the user and check if active
      const user = await this.userModel.findById(decoded.userId).exec();
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

      // Get latest public address for the user
      let latestPublicAddress: string | undefined;
      try {
        if (user.telegramId) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByTelegramId(
              user.telegramId,
            );
          if (addressResponse.success && addressResponse.data) {
            latestPublicAddress = addressResponse.data.publicKey;
          }
        }

        if (!latestPublicAddress && user._id) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByUserId(
              user._id.toString(),
            );
          if (addressResponse.success && addressResponse.data) {
            latestPublicAddress = addressResponse.data.publicKey;
          }
        }
      } catch (error) {
        latestPublicAddress = undefined;
      }

      // Generate new tokens
      const payload = {
        userId: user._id.toString(),
        sub: user._id.toString(),
        telegramId: user.telegramId,
        username: user.username,
        role: user.role,
        publicAddress: latestPublicAddress, // Add latest publicAddress to JWT payload
      };

      return await this.generateTokens(payload, user);
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Invalid or expired refresh token ( ' + error + ' )',
          error: 'Unauthorized',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
