import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Password, PasswordDocument } from './schemas/password.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import * as bcrypt from 'bcrypt';
import { SharedWithMeResponse } from '../types/share-with-me-pass.types';
import { passwordReturns } from '../types/password-returns.types';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';
import { SharedWithDto } from './dto/shared-with.dto';
@Injectable()
export class PasswordService {
  constructor(
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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
      const passwords = await this.passwordModel
        .find({ 'initData.telegramId': telegramId, isActive: true })
        .select('key value description updatedAt createdAt sharedWith type ')
        .exec();
      const passwordWithSharedWithAsUsernames = await Promise.all(
        passwords.map(async (password) => {
          return {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            updatedAt: password.updatedAt,
            createdAt: password.createdAt,
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
          'sharedWith.username': { $in: [username] },
          isActive: true,
        })
        .select('key value description initData.username -_id')
        .lean()
        .exec();
      if (!sharedPasswords?.length) {
        return { sharedWithMe: [], userCount: 0 };
      }

      const resolvedPasswords = await Promise.all(
        sharedPasswords.map(async (password) => {
          // const user = await this.userModel.findOne({
          //   telegramId: password.initData.telegramId,
          //   isActive: true,
          // });

          return {
            key: password.key,
            value: password.value,
            description: password.description,
            // username: user?.username || 'unknown',
            username: password.initData.username,
          } as {
            key: string;
            value: string;
            description: string;
            username: string;
          };
        }),
      );

      const groupedByOwner = resolvedPasswords.reduce(
        (
          acc: Record<
            string,
            Array<{ key: string; value: string; description: string }>
          >,
          password,
        ) => {
          const ownerUsername = password.username;

          if (!acc[ownerUsername]) {
            acc[ownerUsername] = [];
          }

          if (password.key && password.value) {
            acc[ownerUsername].push({
              key: password.key,
              value: password.value,
              description: password.description,
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
    return this.passwordModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
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
    const newPassword = new this.passwordModel(passwordData);
    return newPassword.save();
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
}
