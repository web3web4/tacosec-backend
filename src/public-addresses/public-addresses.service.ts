import {
  Injectable,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PublicAddress,
  PublicAddressDocument,
} from './schemas/public-address.schema';
import { Challange, ChallangeDocument } from '../auth/schemas/challange.schema';
import { UsersService } from '../users/users.service';
import {
  CreatePublicAddressDto,
  CreateMultiplePublicAddressesDto,
  WalletEntryDto,
} from './dto/create-public-address.dto';
// import { v4 as uuidv4 } from 'uuid';
import { UserDocument } from '../users/schemas/user.schema';
import { CryptoUtil } from '../utils/crypto.util';
import { AppConfigService } from '../common/config/app-config.service';

// Interface for the response that includes telegram_id
export interface PublicAddressResponse {
  _id: any;
  publicKey: string;
  secret?: string;
  userTelegramId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for standardized API responses
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  total?: number;
  duplicatesSkipped?: number;
  internalDuplicatesRemoved?: number;
  message?: string;
}

export interface PublicAddressChallangeResponse {
  challange: string;
  expiresAt: Date;
  expiresInMinutes: number;
}

@Injectable()
export class PublicAddressesService {
  constructor(
    @InjectModel(PublicAddress.name)
    private publicAddressModel: Model<PublicAddressDocument>,
    @InjectModel(Challange.name)
    private challangeModel: Model<ChallangeDocument>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly cryptoUtil: CryptoUtil,
    private readonly appConfig: AppConfigService,
  ) {}

  async createChallange(
    publicKeyRaw: string,
  ): Promise<ApiResponse<PublicAddressChallangeResponse>> {
    const publicKey = (publicKeyRaw || '').trim();
    if (!publicKey) {
      throw new HttpException(
        'Public key cannot be null or empty',
        HttpStatus.BAD_REQUEST,
      );
    }

    const expiresInMinutes = this.appConfig.authChallangeExpiresInMinutes;
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + expiresInMinutes * 60000);
    const nonce = randomBytes(16).toString('hex');

    const challange = [
      'Taco Authentication Challenge',
      `Address: ${publicKey}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expires At: ${expiresAt.toISOString()}`,
    ].join('\n');

    let publicAddressRecord = await this.publicAddressModel
      .findOne({ publicKey })
      .exec();

    if (!publicAddressRecord) {
      try {
        publicAddressRecord = await new this.publicAddressModel({
          publicKey,
          userIds: [],
          encryptedSecret: null,
        }).save();
      } catch (e) {
        if (
          (e as any)?.name === 'MongoServerError' &&
          (e as any)?.code === 11000
        ) {
          publicAddressRecord = await this.publicAddressModel
            .findOne({ publicKey })
            .exec();
        } else {
          throw e;
        }
      }
    }

    if (!publicAddressRecord) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create public address record',
          error: 'Internal Server Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    await this.challangeModel
      .findOneAndUpdate(
        { publicAddressId: publicAddressRecord._id },
        {
          $set: {
            challange,
            expiresAt,
            expiresInMinutes,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    return {
      success: true,
      data: {
        challange,
        expiresAt,
        expiresInMinutes,
      },
    };
  }

  private async getActiveChallangeOrThrow(publicKey: string): Promise<string> {
    const publicAddressRecord = await this.publicAddressModel
      .findOne({ publicKey })
      .select('_id')
      .exec();

    if (!publicAddressRecord) {
      throw new HttpException(
        {
          success: false,
          message:
            'The challenge for this public address was not found or has expired. Please create a new challenge and sign it.',
          error: 'Unauthorized',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const challangeRecord = await this.challangeModel
      .findOne({ publicAddressId: publicAddressRecord._id })
      .exec();

    if (!challangeRecord || challangeRecord.expiresAt.getTime() <= Date.now()) {
      throw new HttpException(
        {
          success: false,
          message:
            'The challenge for this public address was not found or has expired. Please create a new challenge and sign it.',
          error: 'Unauthorized',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return challangeRecord.challange;
  }

  private async expireChallangeForPublicKey(publicKey: string): Promise<void> {
    try {
      const publicAddressRecord = await this.publicAddressModel
        .findOne({ publicKey })
        .select('_id')
        .exec();

      if (!publicAddressRecord) return;

      await this.challangeModel
        .updateOne(
          { publicAddressId: publicAddressRecord._id },
          { $set: { expiresAt: new Date(0) } },
        )
        .exec();
    } catch {}
  }

  /**
   * Adds a single public address with optional encrypted secret for a user
   * Supports both JWT token authentication and Telegram init data authentication
   * Ensures the address is unique across the entire system
   */
  async addPublicAddress(
    createDto: CreatePublicAddressDto,
  ): Promise<
    ApiResponse<PublicAddressResponse[] | PublicAddressChallangeResponse>
  > {
    try {
      let user: any;

      // Handle different authentication methods
      if (createDto.jwtUser) {
        // JWT authentication - get user by ID
        user = await this.usersService.findOne(createDto.jwtUser.id);
        if (!user) {
          throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
      } else if (createDto.telegramInitData) {
        // Telegram authentication - extract user from telegram init data
        user = await this.usersService.getUserFromTelegramInitData(
          createDto.telegramInitData,
        );
        if (!user) {
          throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
      } else {
        throw new HttpException(
          'Authentication data required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate that publicKey is not null or empty
      if (!createDto.publicKey?.trim()) {
        throw new HttpException(
          'Public key cannot be null or empty',
          HttpStatus.BAD_REQUEST,
        );
      }

      const publicKey = createDto.publicKey.trim();

      const existingAddress = await this.publicAddressModel
        .findOne({
          publicKey,
        })
        .exec();

      if (!existingAddress) {
        return this.createChallange(publicKey);
      }

      // Require signature only when not in staging
      const isStaging = this.appConfig.isStaging;
      if (!isStaging && !createDto.signature?.trim()) {
        throw new HttpException(
          'Signature is required for adding public address',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Verify Ethereum signatures when applicable (message = challange) unless in staging
      const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/.test(publicKey);
      if (isEthereumAddress && !isStaging) {
        try {
          const { verifyMessage } = await import('ethers');
          const challange = await this.getActiveChallangeOrThrow(publicKey);
          const recoveredAddress = verifyMessage(
            challange,
            createDto.signature!,
          );
          if (recoveredAddress.toLowerCase() !== publicKey.toLowerCase()) {
            await this.expireChallangeForPublicKey(publicKey);
            throw new HttpException(
              {
                success: false,
                message: 'Invalid signature',
                error: 'Unauthorized',
              },
              HttpStatus.UNAUTHORIZED,
            );
          }
        } catch (e) {
          if (e instanceof HttpException) throw e;
          await this.expireChallangeForPublicKey(publicKey);
          throw new HttpException(
            {
              success: false,
              message: 'Invalid signature',
              error: 'Unauthorized',
            },
            HttpStatus.UNAUTHORIZED,
          );
        }
      }

      // If the address already exists, check ownership
      if (existingAddress) {
        const userIdStr = (user as UserDocument)._id.toString();
        const isLinked = existingAddress.userIds.some(
          (id) => id.toString() === userIdStr,
        );

        if (!isLinked) {
          (existingAddress.userIds as Types.ObjectId[]).push(
            (user as UserDocument)._id as Types.ObjectId,
          );
        }

        // Update secret if provided
        if (createDto.secret) {
          existingAddress.encryptedSecret = this.cryptoUtil.encrypt(
            createDto.secret,
          );
        }

        existingAddress.updatedAt = new Date();
        await existingAddress.save();

        const refreshed = await this.publicAddressModel
          .findById(existingAddress._id)
          .exec();

        const addressObj = refreshed.toObject() as any;

        // Decrypt the secret if it exists
        const secret = addressObj.encryptedSecret
          ? this.cryptoUtil.decryptSafe(addressObj.encryptedSecret)
          : undefined;

        // Prepare the response data
        const responseData = [
          {
            _id: addressObj._id,
            publicKey: addressObj.publicKey,
            secret,
            userTelegramId: (user as any).telegramId,
            createdAt: addressObj.createdAt,
            updatedAt: addressObj.updatedAt,
          },
        ];

        return {
          success: true,
          data: responseData,
          total: 1,
          message: 'Public address updated successfully.',
        };
      }

      // Create the new public address
      const newAddress = new this.publicAddressModel({
        userIds: [(user as UserDocument)._id as Types.ObjectId],
        publicKey,
        encryptedSecret: createDto.secret
          ? this.cryptoUtil.encrypt(createDto.secret)
          : null,
      });

      const savedAddress = await newAddress.save();

      // Transform the response to include userTelegramId and exclude userId
      const addressObj = savedAddress.toObject() as any;

      // Prepare the response data
      const responseData = [
        {
          _id: addressObj._id,
          publicKey: addressObj.publicKey,
          secret: createDto.secret,
          userTelegramId: (user as any).telegramId,
          createdAt: addressObj.createdAt,
          updatedAt: addressObj.updatedAt,
        },
      ];

      return {
        success: true,
        data: responseData,
        message: 'Successfully added the address.',
      };
    } catch (error) {
      // Handle duplicate key errors with a more specific message
      if (error.message?.includes('E11000 duplicate key error')) {
        // Extract the duplicated key if possible
        const keyMatchPublicKey = error.message.match(
          /dup key: \{ publicKey: "(.*?)" }/,
        );

        let duplicateKey = 'unknown';
        if (keyMatchPublicKey) {
          duplicateKey = keyMatchPublicKey[1];
        }

        throw new HttpException(
          {
            success: false,
            message: `Duplicate public key: ${duplicateKey}. This key is already registered in the system.`,
            error: 'Conflict',
          },
          HttpStatus.CONFLICT,
        );
      }

      // If it's already an HttpException, just pass it through
      if (error instanceof HttpException) {
        throw error;
      }

      // Otherwise, log and throw a generic error
      console.error('Error adding public address:', error);
      throw new HttpException(
        {
          success: false,
          message: 'Failed to add public address',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Adds multiple public addresses with encrypted secrets for a user
   * identified by telegram init data
   * Ensures each address is unique across the entire system
   * @deprecated Use addPublicAddress instead which accepts a single address
   */
  async addPublicAddresses(
    // eslint-disable-next-line
    createDto: CreateMultiplePublicAddressesDto,
  ): Promise<ApiResponse<PublicAddressResponse[]>> {
    try {
      // Determine staging mode once
      const isStaging = this.appConfig.isStaging;
      // Extract user from telegram init data
      const user = await this.usersService.getUserFromTelegramInitData(
        createDto.telegramInitData,
      );
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Validate that no entries have null or empty public key or missing signature
      if (
        createDto.publicAddresses.some((entry) => !entry['public-key']?.trim())
      ) {
        throw new HttpException(
          'Public key cannot be null or empty',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (
        !isStaging &&
        createDto.publicAddresses.some((entry) => !entry['signature']?.trim())
      ) {
        throw new HttpException(
          'Signature is required for each public address',
          HttpStatus.BAD_REQUEST,
        );
      }

      // First, remove any duplicates within the input array itself (based on public-key)
      const originalLength = createDto.publicAddresses.length;
      const uniquePublicKeys = new Set<string>();
      const uniqueInputAddresses: WalletEntryDto[] = [];

      for (const entry of createDto.publicAddresses) {
        if (!uniquePublicKeys.has(entry['public-key'])) {
          uniquePublicKeys.add(entry['public-key']);
          uniqueInputAddresses.push(entry);
        }
      }

      const internalDuplicatesRemoved =
        originalLength - uniqueInputAddresses.length;

      // Next, check if any of the public keys already exist in the system
      const existingAddresses = await this.publicAddressModel
        .find({
          publicKey: { $in: Array.from(uniquePublicKeys) },
        })
        .exec();

      // Extract the list of public keys that already exist
      const existingPublicKeys = new Set(
        existingAddresses.map((addr) => addr.publicKey),
      );

      // Filter out duplicates to get only new unique addresses
      const uniqueAddresses = uniqueInputAddresses.filter(
        (entry) => !existingPublicKeys.has(entry['public-key']),
      );

      // If all addresses were duplicates, return an empty array with message
      if (uniqueAddresses.length === 0) {
        return {
          success: true,
          data: [],
          duplicatesSkipped: uniqueInputAddresses.length,
          internalDuplicatesRemoved,
          message: 'All addresses were duplicates and have been skipped.',
        };
      }

      // Create a public address for each unique address in the array
      const createdAddresses = await Promise.all(
        uniqueAddresses.map(async (entry) => {
          // Verify Ethereum signatures when applicable (message = public-key)
          const isEthereumAddress = /^0x[a-fA-F0-9]{40}$/.test(
            entry['public-key'],
          );
          if (isEthereumAddress && !isStaging) {
            try {
              const { verifyMessage } = await import('ethers');
              const recoveredAddress = verifyMessage(
                entry['public-key'],
                entry['signature'],
              );
              if (
                recoveredAddress.toLowerCase() !==
                entry['public-key'].toLowerCase()
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
            } catch (e) {
              if (e instanceof HttpException) throw e;
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
          }
          const newAddress = new this.publicAddressModel({
            // id: uuidv4(),
            // Cast to UserDocument to access _id
            userIds: [(user as UserDocument)._id as Types.ObjectId],
            publicKey: entry['public-key'],
            encryptedSecret: null,
          });
          return newAddress.save();
        }),
      );

      // Transform the response to include userTelegramId and exclude userId
      const responseData = createdAddresses.map((address) => {
        const addressObj = address.toObject() as any;

        // Decrypt the secret if it exists
        // Return the fields in the desired order
        return {
          _id: addressObj._id,
          publicKey: addressObj.publicKey,
          userTelegramId: (user as any).telegramId,
          createdAt: addressObj.createdAt,
          updatedAt: addressObj.updatedAt,
        };
      });

      return {
        success: true,
        data: responseData,
        duplicatesSkipped: uniqueInputAddresses.length - uniqueAddresses.length,
        internalDuplicatesRemoved,
        message: `Successfully added ${responseData.length} unique addresses.${
          internalDuplicatesRemoved > 0
            ? ` ${internalDuplicatesRemoved} duplicates were removed from your request.`
            : ''
        }`,
      };
    } catch (error) {
      // Handle duplicate key errors with a more specific message
      if (error.message?.includes('E11000 duplicate key error')) {
        // Extract the duplicated key if possible
        // Check for both old and new field names in error message
        const keyMatchPublicKey = error.message.match(
          /dup key: \{ publicKey: "(.*?)" }/,
        );
        const keyMatchPublicAddress = error.message.match(
          /dup key: \{ publicAddress: "(.*?)" }/,
        );
        const keyMatchNull = error.message.match(
          /dup key: \{ (publicKey|publicAddress): null }/,
        );

        let duplicateKey = 'unknown';
        if (keyMatchPublicKey) {
          duplicateKey = keyMatchPublicKey[1];
        } else if (keyMatchPublicAddress) {
          duplicateKey = keyMatchPublicAddress[1];
        } else if (keyMatchNull) {
          duplicateKey = 'null (empty value)';
        }

        throw new HttpException(
          {
            success: false,
            message: `Duplicate public key: ${duplicateKey}. This key is already registered in the system.`,
            error: 'Conflict',
          },
          HttpStatus.CONFLICT,
        );
      }

      // If it's already an HttpException, just pass it through
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to add public addresses',
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Gets all public addresses for a specific user by MongoDB user ID
   */
  async getAddressesByUserId(
    userId: string,
  ): Promise<ApiResponse<PublicAddressResponse[]>> {
    try {
      const addresses = await this.publicAddressModel
        .find({ userIds: userId })
        .exec();
      const user = await this.usersService.findOne(userId);

      // Transform the response to include userTelegramId and exclude userId
      const responseData = addresses.map((address) => {
        const addressObj = address.toObject() as any;

        // Decrypt the secret if it exists
        const secret = addressObj.encryptedSecret
          ? this.cryptoUtil.decryptSafe(addressObj.encryptedSecret)
          : undefined;

        // Return the fields in the desired order
        return {
          _id: addressObj._id,
          publicKey: addressObj.publicKey,
          secret,
          userTelegramId: user.telegramId,
          createdAt: addressObj.createdAt,
          updatedAt: addressObj.updatedAt,
        };
      });

      return {
        success: true,
        data: responseData,
        total: responseData.length,
      };
    } catch (error) {
      // If it's already an HttpException, just pass it through
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve addresses',
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Gets all public addresses for a user by their Telegram ID
   */
  async getAddressesByTelegramId(
    telegramId: string,
  ): Promise<ApiResponse<PublicAddressResponse[]>> {
    try {
      // Find the user by telegramId first
      const user = await this.usersService.findByTelegramId(telegramId);
      if (!user) {
        throw new HttpException(
          {
            success: false,
            message: 'User not found',
            error: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Then get their addresses
      const addresses = await this.publicAddressModel
        .find({ userIds: (user as UserDocument)._id })
        .exec();

      // Transform the response to include userTelegramId and exclude userId
      const responseData = addresses.map((address) => {
        const addressObj = address.toObject() as any;

        // Decrypt the secret if it exists
        const secret = addressObj.encryptedSecret
          ? this.cryptoUtil.decryptSafe(addressObj.encryptedSecret)
          : undefined;

        // Return the fields in the desired order
        return {
          _id: addressObj._id,
          publicKey: addressObj.publicKey,
          secret,
          userTelegramId: user.telegramId,
          createdAt: addressObj.createdAt,
          updatedAt: addressObj.updatedAt,
        };
      });

      return {
        success: true,
        data: responseData,
        total: responseData.length,
      };
    } catch (error) {
      // If it's already an HttpException, just pass it through
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve addresses',
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getLatestAddressByTelegramId(
    telegramId: string,
  ): Promise<ApiResponse<PublicAddressResponse>> {
    try {
      // Find the user by telegramId first
      const user = await this.usersService.findByTelegramId(telegramId);
      if (!user) {
        throw new HttpException(
          {
            success: false,
            message: 'User not found',
            error: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const latestAddress = await this.publicAddressModel
        .findOne({ userIds: (user as UserDocument)._id })
        .sort({ updatedAt: -1 })
        .exec();

      if (!latestAddress) {
        throw new HttpException(
          {
            success: false,
            message: 'No addresses found for this user',
            error: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const addressObj = latestAddress.toObject() as any;

      // Decrypt the secret if it exists
      const secret = addressObj.encryptedSecret
        ? this.cryptoUtil.decryptSafe(addressObj.encryptedSecret)
        : undefined;

      // Return the latest address
      const responseData = {
        _id: addressObj._id,
        publicKey: addressObj.publicKey,
        secret,
        userTelegramId: user.telegramId,
        createdAt: addressObj.createdAt,
        updatedAt: addressObj.updatedAt,
      };

      return {
        success: true,
        data: responseData,
      };
    } catch (error) {
      // If it's already an HttpException, just pass it through
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve latest address',
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Gets the latest public address for a user by their MongoDB user ID
   */
  async getLatestAddressByUserId(
    userId: string,
  ): Promise<ApiResponse<PublicAddressResponse>> {
    try {
      // Find the user by userId first
      const user = await this.usersService.findOne(userId);
      if (!user) {
        throw new HttpException(
          {
            success: false,
            message: 'User not found',
            error: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const latestAddress = await this.publicAddressModel
        .findOne({ userIds: userId })
        .sort({ updatedAt: -1 })
        .exec();

      if (!latestAddress) {
        throw new HttpException(
          {
            success: false,
            message: 'No addresses found for this user',
            error: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const addressObj = latestAddress.toObject() as any;

      // Decrypt the secret if it exists
      const secret = addressObj.encryptedSecret
        ? this.cryptoUtil.decryptSafe(addressObj.encryptedSecret)
        : undefined;

      // Return the latest address
      const responseData = {
        _id: addressObj._id,
        publicKey: addressObj.publicKey,
        secret,
        userTelegramId: user.telegramId,
        createdAt: addressObj.createdAt,
        updatedAt: addressObj.updatedAt,
      };

      return {
        success: true,
        data: responseData,
        message: 'Latest address retrieved successfully.',
      };
    } catch (error) {
      // If it's already an HttpException, just pass it through
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to retrieve latest address',
          error: 'Bad Request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
