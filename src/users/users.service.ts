import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { PasswordService } from './password.service';

interface TelegramInitData {
  telegramId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: Date;
  hash: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private passwordService: PasswordService,
  ) {}

  async create(createUserDto: TelegramInitData) {
    const existingUser = await this.userModel.findOne({
      telegramId: createUserDto.telegramId,
    });

    if (existingUser) {
      return this.update(existingUser._id.toString(), createUserDto);
    }

    const createdUser = new this.userModel(createUserDto);
    return createdUser.save();
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find({ isActive: true }).exec();
  }

  async findOne(id: string): Promise<User> {
    return this.userModel.findById(id).exec();
  }

  async findByTelegramId(telegramId: string): Promise<User> {
    return this.userModel.findOne({ telegramId, isActive: true }).exec();
  }

  async update(id: string, updateUserDto: Partial<User>): Promise<User> {
    return this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .exec();
  }

  async remove(id: string): Promise<User> {
    return this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  async addPassword(
    userId: string,
    passwordData: {
      passwordName: string;
      telegramPassword?: string;
      facebookPassword?: string;
      initData: TelegramInitData;
    },
  ) {
    const user = await this.findOne(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (user.telegramId !== passwordData.initData.telegramId) {
      throw new HttpException(
        'Telegram ID mismatch. Please provide correct user credentials.',
        HttpStatus.UNAUTHORIZED
      );
    }

    if (user.hash !== passwordData.initData.hash) {
      throw new HttpException(
        'Authentication hash mismatch. Please provide correct user credentials.',
        HttpStatus.UNAUTHORIZED
      );
    }

    try {
      return this.passwordService.create({
        userId: new Types.ObjectId(userId),
        ...passwordData,
        telegramId: user.telegramId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        photoUrl: user.photoUrl,
        authDate: user.authDate,
        hash: user.hash,
      });
    } catch (error) {
      throw new HttpException(
        'Failed to create password. Please try again.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 