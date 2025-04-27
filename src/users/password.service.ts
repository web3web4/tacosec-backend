import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Password, PasswordDocument } from './schemas/password.schema';
import { User, UserDocument } from './schemas/user.schema';
import { CreatePasswordDto } from './dto/create-password.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  constructor(
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async create(createPasswordDto: CreatePasswordDto): Promise<Password> {
    // const { value, ...rest } = createPasswordDto;
    const { ...rest } = createPasswordDto;
    const hashedData: Partial<Password> = { ...rest };
    hashedData.isActive = true;

    // if (value) {
    //   hashedData.value = await this.hashPassword(value);
    // }

    const createdPassword = new this.passwordModel(hashedData);
    return createdPassword.save();
  }

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

  async findByUserTelegramId(telegramId: string): Promise<Password[]> {
    try {
      if (!telegramId) {
        throw new Error('Telegram ID is required');
      }
      const passwords = await this.passwordModel
        .find({ 'initData.telegramId': telegramId, isActive: true })
        .select('key value -_id')
        .exec();
      return passwords;
    } catch (error) {
      console.log('error', error);
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
      if (!key) {
        throw new Error('Key is required');
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
        .find({ username: { $in: sharedWithUsers }, isActive: true })
        .select('username -_id')
        .exec();
      return users.map((user) => user.username);
    } catch (error) {
      console.log('error', error);
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
