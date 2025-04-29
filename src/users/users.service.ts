import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { PasswordService } from './password.service';
import { TelegramInitDto } from './dto/telegram-init.dto';
import { Password, PasswordDocument } from './schemas/password.schema';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';
import { PaginationParams } from './interfaces/pagination.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private passwordService: PasswordService,
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
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
      // check if user is sharing password with himself
      if (passwordData.sharedWith.includes(user.username)) {
        throw new HttpException(
          'User cannot share password with himself',
          HttpStatus.BAD_REQUEST,
        );
      }
      // get valid auth date
      const authDate = this.getValidAuthDate(passwordData.initData.authDate);
      // get shared with array
      const sharedWithArray = (
        await Promise.all(
          passwordData.sharedWith.map(async (username) => {
            const user = await this.userModel
              .findOne({
                username,
                isActive: true,
                // telegramId: { $ne: passwordData.initData.telegramId },
              })
              .select('telegramId -_id')
              .exec();
            if (user) {
              return user.telegramId;
            }
            return null;
          }),
        )
      ).filter((telegramId) => telegramId !== null && telegramId !== undefined);
      // check if all users in sharedWith array are found
      if (sharedWithArray.length !== passwordData.sharedWith.length) {
        throw new HttpException(
          'some users in sharedWith array not found',
          HttpStatus.BAD_REQUEST,
        );
      }
      // create password
      const password = await this.createOrUpdatePassword({
        userId: (user as UserDocument)._id as Types.ObjectId,
        key: passwordData.key,
        value: passwordData.value,
        description: passwordData.description,
        isActive: true,
        type: passwordData.type,
        sharedWith: sharedWithArray,
        initData: { ...passwordData.initData, authDate },
      });
      // console.log('password', password);
      // Get the full password object including _id
      const passwordObj = (password as PasswordDocument).toObject();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { userId: _, ...passwordWithId } = passwordObj;

      const passwordWithSharedWithUsernames = await Promise.all(
        passwordWithId.sharedWith.map(async (telegramId) => {
          const user = await this.userModel.findOne({
            telegramId,
            isActive: true,
          });
          return user?.username;
        }),
      );
      return {
        ...passwordWithId,
        sharedWith: passwordWithSharedWithUsernames,
      };
    } catch (error) {
      // console.error('Error creating password:', error);
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
