import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { PasswordService } from './password.service';
import { TelegramInitDto } from './dto/telegram-init.dto';
import { PasswordData } from './interfaces/password-data.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private passwordService: PasswordService,
  ) {}

  async create(createUserDto: TelegramInitDto) {
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

  async findAllByIsActive(isActive: boolean): Promise<User[]> {
    return this.userModel.find({ isActive }).exec();
  }

  async findByQuery(query: any): Promise<User[]> {
    return this.userModel.find(query).exec();
  }

  async findOneIfActive(id: string): Promise<User> {
    const user = await this.userModel
      .findOne({ _id: new Types.ObjectId(id), isActive: true })
      .exec();
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return user;
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return user;
  }

  async findByTelegramId(telegramId: string): Promise<User> {
    return this.userModel.findOne({ telegramId, isActive: true }).exec();
  }

  async update(
    id: string,
    updateUserDto: Partial<TelegramInitDto>,
  ): Promise<User> {
    return this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .exec();
  }

  async remove(id: string): Promise<User> {
    return this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  async addPassword(userId: string, passwordData: PasswordData) {
    const user = await this.findOne(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    const oldPassword = await this.passwordService.findOne({
      userId: new Types.ObjectId(userId),
      key: passwordData.key,
    });
    if (oldPassword) {
      throw new HttpException(
        `${passwordData.key} password for User Name:(${user.username}), User TelegramId:(${user.telegramId}) already exists.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (user.telegramId !== passwordData.initData.telegramId) {
      throw new HttpException(
        'Telegram ID mismatch. Please provide correct user credentials.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (user.hash !== passwordData.initData.hash) {
      throw new HttpException(
        'Authentication hash mismatch. Please provide correct user credentials.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    // console.log('passwordData.Key', passwordData.key);
    // console.log('passwordData.Value', passwordData.value);
    // console.log('passwordData.Description', passwordData.description);
    try {
      return this.passwordService.create({
        userId: new Types.ObjectId(userId),
        key: passwordData.key,
        value: passwordData.value,
        description:
          passwordData.description || `Password for ${passwordData.key}`,
        isActive: true,
        initData: passwordData.initData,
      });
    } catch (error) {
      throw new HttpException(
        'Failed to create password. Please try again. Error: ' + error,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
