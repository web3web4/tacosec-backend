import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PublicAddress,
  PublicAddressDocument,
} from './schemas/public-address.schema';
import { UsersService } from '../users/users.service';
import {
  CreatePublicAddressDto,
  WalletEntryDto,
} from './dto/create-public-address.dto';
// import { v4 as uuidv4 } from 'uuid';
import { UserDocument } from '../users/schemas/user.schema';
import { CryptoUtil } from '../utils/crypto.util';

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

@Injectable()
export class PublicAddressesService {
  constructor(
    @InjectModel(PublicAddress.name)
    private publicAddressModel: Model<PublicAddressDocument>,
    private readonly usersService: UsersService,
    private readonly cryptoUtil: CryptoUtil,
  ) {}

  /**
   * Adds multiple public addresses with encrypted secrets for a user
   * identified by telegram init data
   * Ensures each address is unique across the entire system
   */
  async addPublicAddresses(
    createDto: CreatePublicAddressDto,
  ): Promise<ApiResponse<PublicAddressResponse[]>> {
    try {
      // Extract user from telegram init data
      const user = await this.usersService.getUserFromTelegramInitData(
        createDto.telegramInitData,
      );
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Validate that no entries have null or empty public key
      if (
        createDto.publicAddresses.some((entry) => !entry['public-key']?.trim())
      ) {
        throw new HttpException(
          'Public key cannot be null or empty',
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
          // Encrypt the secret if it exists
          const encryptedSecret = entry.secret
            ? this.cryptoUtil.encrypt(entry.secret)
            : null;

          const newAddress = new this.publicAddressModel({
            // id: uuidv4(),
            // Cast to UserDocument to access _id
            userId: (user as UserDocument)._id,
            publicKey: entry['public-key'],
            encryptedSecret,
          });
          return newAddress.save();
        }),
      );

      // Transform the response to include userTelegramId and exclude userId
      const responseData = createdAddresses.map((address) => {
        const addressObj = address.toObject() as any;

        // Decrypt the secret if it exists
        const secret = addressObj.encryptedSecret
          ? this.cryptoUtil.decrypt(addressObj.encryptedSecret)
          : undefined;

        // Return the fields in the desired order
        return {
          _id: addressObj._id,
          publicKey: addressObj.publicKey,
          secret,
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
      const addresses = await this.publicAddressModel.find({ userId }).exec();
      const user = await this.usersService.findOne(userId);

      // Transform the response to include userTelegramId and exclude userId
      const responseData = addresses.map((address) => {
        const addressObj = address.toObject() as any;

        // Decrypt the secret if it exists
        const secret = addressObj.encryptedSecret
          ? this.cryptoUtil.decrypt(addressObj.encryptedSecret)
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
        .find({ userId: (user as UserDocument)._id })
        .exec();

      // Transform the response to include userTelegramId and exclude userId
      const responseData = addresses.map((address) => {
        const addressObj = address.toObject() as any;

        // Decrypt the secret if it exists
        const secret = addressObj.encryptedSecret
          ? this.cryptoUtil.decrypt(addressObj.encryptedSecret)
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
}
