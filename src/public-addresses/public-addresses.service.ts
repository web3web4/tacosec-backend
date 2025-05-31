import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PublicAddress,
  PublicAddressDocument,
} from './schemas/public-address.schema';
import { UsersService } from '../users/users.service';
import { CreatePublicAddressDto } from './dto/create-public-address.dto';
// import { v4 as uuidv4 } from 'uuid';
import { UserDocument } from '../users/schemas/user.schema';

// Interface for the response that includes telegram_id
export interface PublicAddressResponse {
  id?: string;
  publicAddress: string;
  userTelegramId: string;
  createdAt?: Date;
  updatedAt?: Date;
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
  ) {}

  /**
   * Adds multiple public addresses for a user identified by telegram init data
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

      // First, remove any duplicates within the input array itself
      const originalLength = createDto.publicAddresses.length;
      const uniqueInputAddresses = [...new Set(createDto.publicAddresses)];
      const internalDuplicatesRemoved =
        originalLength - uniqueInputAddresses.length;

      // Next, check if any of the addresses already exist in the system
      const existingAddresses = await this.publicAddressModel
        .find({
          publicAddress: { $in: uniqueInputAddresses },
        })
        .exec();

      // Extract the list of addresses that already exist
      const existingAddressList = existingAddresses.map(
        (addr) => addr.publicAddress,
      );

      // Filter out duplicates to get only new unique addresses
      const uniqueAddresses = uniqueInputAddresses.filter(
        (address) => !existingAddressList.includes(address),
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
        uniqueAddresses.map(async (address) => {
          const newAddress = new this.publicAddressModel({
            // Cast to UserDocument to access _id
            userId: (user as UserDocument)._id,
            publicAddress: address,
          });
          return newAddress.save();
        }),
      );

      // Transform the response to include userTelegramId and exclude userId
      const responseData = createdAddresses.map((address) => {
        const addressObj = address.toObject();
        // Destructuring but not using these variables is intentional for exclusion
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { userId, __v, ...addressWithoutUserId } = addressObj;
        return {
          ...addressWithoutUserId,
          userTelegramId: (user as any).telegramId,
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
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to add public addresses',
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
        const addressObj = address.toObject();
        // Destructuring but not using these variables is intentional for exclusion
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { userId, __v, ...addressWithoutUserId } = addressObj;
        return {
          ...addressWithoutUserId,
          userTelegramId: user.telegramId,
        };
      });

      return {
        success: true,
        data: responseData,
        total: responseData.length,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to retrieve addresses',
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
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Then get their addresses
      const addresses = await this.publicAddressModel
        .find({ userId: (user as UserDocument)._id })
        .exec();

      // Transform the response to include userTelegramId and exclude userId
      const responseData = addresses.map((address) => {
        const addressObj = address.toObject();
        // Destructuring but not using these variables is intentional for exclusion
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { userId, __v, ...addressWithoutUserId } = addressObj;
        return {
          ...addressWithoutUserId,
          userTelegramId: user.telegramId,
        };
      });

      return {
        success: true,
        data: responseData,
        total: responseData.length,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to retrieve addresses',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
