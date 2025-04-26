import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { PasswordService } from './password.service';
import { TelegramInitDto } from './dto/telegram-init.dto';
import { Password, PasswordDocument } from './schemas/password.schema';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private passwordService: PasswordService,
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
  ) {}

  async createAndUpdateUser(createUserDto: TelegramInitDto) {
    const authDate = this.getValidAuthDate(createUserDto.authDate);

    const user = await this.createOrUpdateUser({
      telegramId: createUserDto.telegramId.toString(),
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      username: createUserDto.username,
      photoUrl: createUserDto.photoUrl,
      authDate: authDate,
      hash: createUserDto.hash || 'default_hash',
    });
    // Remove _id from the returned object
    const { _id, ...userWithoutId } = (user as UserDocument).toObject();
    return userWithoutId;
  }

  async createOrUpdateUser(userData: Partial<User>): Promise<User> {
    const existingUser = await this.userModel.findOne({
      telegramId: userData.telegramId,
    });
    if (existingUser) {
      return this.userModel.findByIdAndUpdate(existingUser.id, userData, {
        new: true,
      });
    }
    const newUser = new this.userModel(userData);
    return newUser.save();
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

  async addPassword(passwordData: CreatePasswordRequestDto) {
    const user = await this.userModel.findOne({
      telegramId: passwordData.initData.telegramId,
      isActive: true,
    }).exec();
    
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const authDate = this.getValidAuthDate(passwordData.initData.authDate);
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
    // Remove _id from the returned object
    const { userId,_id, ...passwordWithoutId } = (password as PasswordDocument).toObject();
    return passwordWithoutId;
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
      
      // try to convert string directly to date
      const date = new Date(authDateInput);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // if input is date and valid
    if (authDateInput instanceof Date && !isNaN(authDateInput.getTime())) {
      return authDateInput;
    }
    
    // return current date as default value
    return new Date();
  }  
}
