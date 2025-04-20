import { Injectable } from '@nestjs/common';
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
    },
  ) {
    const user = await this.findOne(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return this.passwordService.create({
      userId: new Types.ObjectId(userId),
      ...passwordData,
    });
  }
} 