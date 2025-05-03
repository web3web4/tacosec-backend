import {
  Injectable,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { PasswordService } from '../passwords/password.service';
import { TelegramInitDto } from '../telegram/dto/telegram-init.dto';
import {
  Password,
  PasswordDocument,
} from '../passwords/schemas/password.schema';
import { PaginationParams } from '../decorators/pagination.decorator';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private passwordService: PasswordService,
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
    private readonly httpService: HttpService,
  ) {}

  async createAndUpdateUser(telegramInitDto: TelegramInitDto): Promise<User> {
    const { telegramId } = telegramInitDto;
    let user = await this.userModel.findOne({ telegramId }).exec();

    if (!user) {
      user = await this.userModel.create(telegramInitDto);
    } else {
      user = await this.userModel
        .findByIdAndUpdate(user._id, telegramInitDto, { new: true })
        .exec();
    }

    // Convert to plain object if it's a Mongoose document
    const userObject = user.toObject ? user.toObject() : user;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id: _, ...userWithoutId } = userObject;
    return userWithoutId;
  }

  async createOrUpdateUser(userData: Partial<User>): Promise<User> {
    try {
      const existingUser = await this.userModel.findOne({
        telegramId: userData.telegramId,
      });
      if (existingUser) {
        const updatedUser = await this.userModel.findByIdAndUpdate(
          existingUser._id,
          userData,
          {
            new: true,
          },
        );
        return updatedUser;
      }
      const newUser = new this.userModel(userData);
      const savedUser = await newUser.save();
      return savedUser;
    } catch (error) {
      // console.error('Error creating or updating user:', error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async createOrUpdatePassword(
    passwordData: Partial<Password>,
  ): Promise<Password> {
    const existingPassword = await this.passwordService.findOne({
      userId: passwordData.userId,
      key: passwordData.key,
    });
    if (existingPassword) {
      return this.passwordService.findByIdAndUpdate(
        existingPassword._id.toString(),
        passwordData,
      );
    }
    const newPassword = new this.passwordModel(passwordData);
    return newPassword.save();
  }

  async findAllExceptMe(telegramId: string, pagination: PaginationParams) {
    const user = await this.userModel.findOne({ telegramId }).exec();
    if (!user) {
      throw new HttpException('invalid telegramId', HttpStatus.BAD_REQUEST);
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find({ _id: { $ne: user._id } })
        .select('username -_id')
        .skip(pagination.skip)
        .limit(pagination.limit)
        .exec(),
      this.userModel.countDocuments({ _id: { $ne: user._id } }).exec(),
    ]);

    return {
      data: users,
      total,
      pages_count: Math.ceil(total / pagination.limit),
      current_page: pagination.page,
      limit: pagination.limit,
    };
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

  async getTelegramProfile(username: string): Promise<string> {
    try {
      const profile = await lastValueFrom(
        this.httpService.get(`https://t.me/${username}`),
      );
      return profile.data;
    } catch (error) {
      throw new InternalServerErrorException(
        error.response?.data || error.message,
      );
    }
  }
}
