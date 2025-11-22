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
import { LoggerService } from '../logger/logger.service';
import { LogEvent } from '../logger/dto/log-event.enum';

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
    private readonly loggerService: LoggerService,
  ) {}

  async login(
    loginDto: LoginDto | undefined,
    telegramInitData?: string,
  ): Promise<LoginResponse | any> {
    try {
      // If loginDto contains an Ethereum-style publicAddress and signature, verify it first (unless IS_STAGING=true)
      if (loginDto && loginDto.publicAddress) {
        const isStagingRaw = this.configService.get<string>('IS_STAGING');
        const isStaging = ['true', '1', 'yes', 'y', 'on'].includes(
          String(isStagingRaw).trim().toLowerCase(),
        );
        if (
          !isStaging &&
          (!loginDto.signature || loginDto.signature.trim() === '')
        ) {
          throw new HttpException(
            {
              success: false,
              message: 'Signature is required when publicAddress is provided',
              error: 'Bad Request',
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      if (loginDto && loginDto.publicAddress && loginDto.signature) {
        const isStagingRaw =
        this.configService.get<string>('IS_STAGING');
        const isStaging = ['true', '1', 'yes', 'y', 'on'].includes(
          String(isStagingRaw).trim().toLowerCase(),
        );
        const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/.test(
          loginDto.publicAddress,
        );

        if (isEthereumAddress && !isStaging) {
          const messageToVerify = loginDto.publicAddress;
          let recoveredAddress = '';
          try {
            const { verifyMessage } = await import('ethers');
            recoveredAddress = verifyMessage(
              messageToVerify,
              loginDto.signature,
            );
          } catch (e) {
            throw new HttpException(
              {
                success: false,
                message:
                  'Invalid signature format or verification failure for the provided message',
                error: 'Unauthorized',
              },
              HttpStatus.UNAUTHORIZED,
            );
          }

          if (
            recoveredAddress.toLowerCase() !==
            loginDto.publicAddress.toLowerCase()
          ) {
            throw new HttpException(
              {
                success: false,
                message:
                  'Signature does not match the provided public address (Ethereum)',
                error: 'Unauthorized',
              },
              HttpStatus.UNAUTHORIZED,
            );
          }
        }
        // For non-Ethereum addresses, signature verification is skipped here.
        // Chain-specific verification can be added if required.
      }
      // If X-Telegram-Init-Data header is provided, handle Telegram authentication
      if (telegramInitData) {
        // If loginDto is provided, use existing logic with publicAddress
        if (loginDto) {
          const publicAddress = (loginDto.publicAddress || '').trim();
          if (!publicAddress) {
            // No public address provided, fall back to pure Telegram authentication
            return this.handlePureTelegramLogin(telegramInitData);
          }
          const addressRecord = await this.publicAddressModel
            .findOne({ publicKey: publicAddress })
            .populate('userIds')
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
      // If signature exists, it has been verified above when applicable

      // Find the public address in the database
      const addressRecord = await this.publicAddressModel
        .findOne({ publicKey: publicAddress })
        .populate('userIds')
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

        // Log user creation in logger table (non-Telegram login path)
        try {
          await this.loggerService.saveSystemLog(
            {
              event: LogEvent.UserCreated,
              message: 'User created via publicAddress login',
              publicAddress,
            },
            {
              userId: String(savedUser._id),
              telegramId: savedUser.telegramId,
              username: savedUser.username,
            },
          );
        } catch (e) {
          console.error(
            'Failed to log user creation (AuthService non-Telegram)',
            e,
          );
        }

        // Create a new public address record for the new user
        const newAddressRecord = new this.publicAddressModel({
          publicKey: publicAddress,
          userIds: [savedUser._id],
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
      // In many-to-many, we pick the first user if multiple exist and no specific user context is given
      const users = addressRecord.userIds as UserDocument[];
      const user = users && users.length > 0 ? users[0] : null;

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
        user.username = telegramData.username?.toLowerCase() || user.username;
        user.authDate = new Date(telegramData.authDate * 1000);
        user.hash = telegramData.hash;

        await user.save();
      } else {
        // User doesn't exist, create new user
        const newUser = new this.userModel({
          telegramId: telegramData.telegramId,
          firstName: telegramData.firstName || '',
          lastName: telegramData.lastName || '',
          username: telegramData.username?.toLowerCase() || '',
          authDate: new Date(telegramData.authDate * 1000),
          hash: telegramData.hash,
          role: Role.USER,
          isActive: true,
        });

        user = await newUser.save();

        // Log user creation in logger table (pure Telegram login path)
        try {
          await this.loggerService.saveSystemLog(
            {
              event: LogEvent.UserCreated,
              message: 'User created via pure Telegram login',
            },
            {
              userId: String(user._id),
              telegramId: user.telegramId,
              username: user.username,
            },
          );
        } catch (e) {
          console.error(
            'Failed to log user creation (AuthService pure Telegram)',
            e,
          );
        }
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
      let user = await this.userModel
        .findOne({
          telegramId: telegramData.telegramId,
        })
        .exec();

      if (user) {
        // Update user data
        user.firstName = telegramData.firstName || user.firstName;
        user.lastName = telegramData.lastName || user.lastName;
        user.username = telegramData.username?.toLowerCase() || user.username;
        user.authDate = new Date(telegramData.authDate * 1000);
        user.hash = telegramData.hash;
        user = await user.save();
      } else {
        // Create new user
        const newUser = new this.userModel({
          telegramId: telegramData.telegramId,
          firstName: telegramData.firstName || '',
          lastName: telegramData.lastName || '',
          username: telegramData.username?.toLowerCase() || '',
          authDate: new Date(telegramData.authDate * 1000),
          hash: telegramData.hash,
          role: Role.USER,
          isActive: true,
        });
        user = await newUser.save();

        // Log user creation
        try {
          await this.loggerService.saveSystemLog(
            {
              event: LogEvent.UserCreated,
              message: 'User created via Telegram login with publicAddress',
              publicAddress,
            },
            {
              userId: String(user._id),
              telegramId: user.telegramId,
              username: user.username,
            },
          );
        } catch (e) {
          console.error('Failed to log user creation', e);
        }
      }

      // Link address to user if a valid publicAddress is provided
      const hasValidPublicAddress =
        typeof publicAddress === 'string' && publicAddress.trim() !== '';

      if (hasValidPublicAddress && addressRecord) {
        const userIdStr = user._id.toString();
        const isLinked = addressRecord.userIds.some(
          (id) => id.toString() === userIdStr,
        );

        if (!isLinked) {
          addressRecord.userIds.push(user._id);
          await addressRecord.save();
        }
      } else if (hasValidPublicAddress && !addressRecord) {
        // Create new address record
        const newAddressRecord = new this.publicAddressModel({
          publicKey: publicAddress,
          userIds: [user._id],
        });
        await newAddressRecord.save();
      }

      // Update shared secrets only if a valid publicAddress is provided
      if (hasValidPublicAddress) {
        await this.updateSharedSecretsForNewUser(
          publicAddress,
          user.username,
          user._id.toString(),
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

      // Create JWT payload
      const payload = {
        userId: user._id.toString(),
        sub: user._id.toString(),
        telegramId: user.telegramId,
        username: user.username,
        role: user.role,
        publicAddress: hasValidPublicAddress
          ? publicAddress
          : latestPublicAddress,
      };

      return await this.generateTokens(payload, user);
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
        const sharedWith = [...password.sharedWith];
        let updated = false;
        let foundForUser = false;

        // 1. Check if user already has an entry
        for (let i = 0; i < sharedWith.length; i++) {
          if (
            sharedWith[i].publicAddress === publicAddress &&
            sharedWith[i].userId === userId
          ) {
            sharedWith[i].username = username; // Update username
            foundForUser = true;
            updated = true;
          }
        }

        if (!foundForUser) {
          // 2. Check for unclaimed entry
          let claimed = false;
          for (let i = 0; i < sharedWith.length; i++) {
            if (
              sharedWith[i].publicAddress === publicAddress &&
              !sharedWith[i].userId
            ) {
              sharedWith[i].userId = userId;
              sharedWith[i].username = username;
              claimed = true;
              updated = true;
              break; // Claim one
            }
          }

          // 3. If not found for user and no unclaimed entry, add new entry
          if (!claimed) {
            const existing = sharedWith.find(
              (s) => s.publicAddress === publicAddress,
            );
            if (existing) {
              sharedWith.push({
                ...existing,
                userId: userId,
                username: username,
              });
              updated = true;
            }
          }
        }

        if (updated) {
          await this.passwordModel
            .findByIdAndUpdate(
              password._id,
              { sharedWith },
              { new: true },
            )
            .exec();
        }
      }
    } catch (error) {
      console.error('Error updating shared secrets for new user:', error);
      // Don't throw error to avoid breaking the login flow
    }
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
          { new: true },
        );
        // Update the user object to reflect the new updatedAt value
        user.updatedAt = new Date();
      } catch (error) {
        // If update fails, continue with token generation
        console.error('Failed to update user updatedAt field:', error);
      }
    }

    // Preserve publicAddress from payload when provided (e.g., login via specific publicAddress).
    // Only fetch latest when payload lacks publicAddress.
    const updatedPayload = { ...payload };
    if (user && !updatedPayload.publicAddress) {
      try {
        if (user.telegramId) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByTelegramId(
              user.telegramId,
            );
          if (addressResponse.success && addressResponse.data) {
            updatedPayload.publicAddress = addressResponse.data.publicKey;
          }
        }

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
        // Keep original payload publicAddress if fetching fails
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
