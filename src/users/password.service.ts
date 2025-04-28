import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Password, PasswordDocument } from './schemas/password.schema';
import { User, UserDocument } from './schemas/user.schema';
import { CreatePasswordDto } from './dto/create-password.dto';
import * as bcrypt from 'bcrypt';
import { SharedWithMeResponse } from '../types/share-with-me-pass.types';
import { passwordReturns } from '../types/password-returns.types';
@Injectable()
export class PasswordService {
  constructor(
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // async create(createPasswordDto: CreatePasswordDto): Promise<Password> {
  //   // const { value, ...rest } = createPasswordDto;
  //   const { ...rest } = createPasswordDto;
  //   const hashedData: Partial<Password> = { ...rest };
  //   hashedData.isActive = true;

  //   // if (value) {
  //   //   hashedData.value = await this.hashPassword(value);
  //   // }

  //   const createdPassword = new this.passwordModel(hashedData);
  //   return createdPassword.save();
  // }

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
        .select(
          'key value description updatedAt createdAt sharedWith type -_id',
        )
        .exec();
      const passwordWithSharedWithAsUsernames = await Promise.all(
        passwords.map(async (password) => {
          const sharedWith = await this.userModel
            .find({
              telegramId: { $in: password.sharedWith },
            })
            .select('username -_id')
            .exec();
          const sharedWithUsernames = sharedWith.map((user) => user.username);
          return {
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: sharedWithUsernames,
            updatedAt: password.updatedAt,
            createdAt: password.createdAt,
          };
        }),
      );
      return passwordWithSharedWithAsUsernames;
    } catch (error) {
      // console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findSharedWithByTelegramId(
    telegramId: string,
    key: string,
  ): Promise<string[]> {
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
      const sharedWithUsers = sharedWith.flatMap(
        (password) => password.sharedWith,
      );
      const users = await this.userModel
        .find({ telegramId: { $in: sharedWithUsers }, isActive: true })
        .select('username -_id')
        .exec();
      return users.map((user) => user.username);
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findPasswordsSharedWithMe(
    telegramId: string,
  ): Promise<SharedWithMeResponse> {
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
      // console.log('user', user);
      const sharedWithMe = await this.getSharedWithMe(user.telegramId);
      return sharedWithMe;
    } catch (error) {
      console.log('error', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async getSharedWithMe(telegramId: string): Promise<SharedWithMeResponse> {
    try {
      if (!telegramId) {
        throw new Error('Telegram ID is required');
      }
      // get shared passwords with me
      const sharedPasswords = await this.passwordModel
        .find({
          sharedWith: { $in: [telegramId] },
          isActive: true,
        })
        .select('key value initData.telegramId -_id')
        .lean()
        .exec();
      // console.log('sharedPasswords', sharedPasswords);
      if (!sharedPasswords?.length) {
        return { sharedWithMe: [], userCount: 0 }; // return empty array if no results
      }

      // 1. resolve passwords with usernames
      const resolvedPasswords = await Promise.all(
        sharedPasswords.map(async (password) => {
          const user = await this.userModel.findOne({
            telegramId: password.initData.telegramId,
            isActive: true,
          });

          // return password with username
          return {
            key: password.key,
            value: password.value,
            username: user?.username || 'unknown', // handle empty values
          } as { key: string; value: string; username: string };
        }),
      );

      // 2. fix type of reduce
      const groupedByOwner = resolvedPasswords.reduce(
        (
          acc: Record<string, Array<{ key: string; value: string }>>,
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
            });
          }

          return acc;
        },
        {},
      );

      // 3. convert object to array with filter for unknown owners
      const result = Object.entries(groupedByOwner)
        .filter(([username]) => username !== 'unknown') // exclude unknown owners
        .map(([username, passwords]) => ({
          username,
          passwords,
          count: passwords.length, // add number of passwords for each owner
        }));

      // 4. sort results by number of passwords (descending)
      result.sort((a, b) => b.count - a.count);

      return { sharedWithMe: result, userCount: result.length };
    } catch (error) {
      // console.log('error', error);
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
    // const { value, ...rest } = updatePasswordDto;
    const { ...rest } = updatePasswordDto;
    const updateData: Partial<Password> = { ...rest };
    updateData.isActive = true;

    // if (value) {
    //   updateData.value = await this.hashPassword(value);
    // }

    return this.passwordModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
  }

  async delete(id: string): Promise<Password> {
    return this.passwordModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  async verifyPassword(
    hashedPassword: string,
    plainPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
