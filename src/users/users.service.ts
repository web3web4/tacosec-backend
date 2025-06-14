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
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private passwordService: PasswordService,
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
    private readonly httpService: HttpService,
    private readonly telegramService: TelegramService,
  ) {}

  async createAndUpdateUser(telegramInitDto: TelegramInitDto): Promise<User> {
    const { telegramId } = telegramInitDto;
    // Convert username to lowercase if it exists
    if (telegramInitDto.username) {
      telegramInitDto.username = telegramInitDto.username.toLowerCase();
    }

    console.log('createAndUpdateUser - Received data:', {
      telegramId,
      username: telegramInitDto.username,
    });

    let user = await this.userModel.findOne({ telegramId }).exec();

    if (!user) {
      console.log('User not found, creating new user');
      user = await this.userModel.create(telegramInitDto);
    } else {
      console.log('Found existing user:', {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
      });

      if (
        telegramInitDto.username.toLowerCase() !== user.username.toLowerCase()
      ) {
        console.log('Username changed detected!', {
          oldUsername: user.username,
          newUsername: telegramInitDto.username,
        });

        console.log('Sending notification message to user');
        try {
          await this.telegramService.sendMessage(
            Number(user.telegramId),
            `<b>🔄 Username Changed</b>

It appears that you've recently changed your username.

As a result:
• ✅ You can still <b>view</b> your old passwords.
• 🔐 However, they can <b>no longer be decrypted</b>.
• 🚫 You will also <b>lose access</b> to any passwords shared with you by other users.

<b>Old username:</b> <code>${user.username}</code>
<b>New username:</b> <code>${telegramInitDto.username}</code>

<i>😞 We're sorry for the inconvenience.</i>
🔁 To recover your passwords, please log in again using your old username.`,
          );
          console.log('Notification message sent successfully');
        } catch (error) {
          console.error('Failed to send notification message:', error);
        }

        user = await this.userModel
          .findByIdAndUpdate(user._id, telegramInitDto, { new: true })
          .exec();
      } else {
        console.log('Username has not changed');
      }
      // Convert to plain object if it's a Mongoose document
      const userObject = user.toObject ? user.toObject() : user;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _id: _, ...userWithoutId } = userObject;
      return userWithoutId;
    }
  }
  async createOrUpdateUser(userData: Partial<User>): Promise<User> {
    try {
      // Convert username to lowercase if it exists
      if (userData.username) {
        userData.username = userData.username.toLowerCase();
      }

      console.log('createOrUpdateUser - Received data:', {
        telegramId: userData.telegramId,
        username: userData.username,
      });

      const existingUser = await this.userModel.findOne({
        telegramId: userData.telegramId,
      });

      if (existingUser) {
        console.log('Found existing user:', {
          id: existingUser._id,
          telegramId: existingUser.telegramId,
          username: existingUser.username,
        });

        if (
          userData.username.toLowerCase() !==
          existingUser.username.toLowerCase()
        ) {
          console.log('Username changed detected!', {
            oldUsername: existingUser.username,
            newUsername: userData.username,
          });

          console.log('Sending notification message to user');
          try {
            await this.telegramService.sendMessage(
              Number(existingUser.telegramId),
              `<b>🔄 Username Changed</b>

It appears that you've recently changed your username.

As a result:
• ✅ You can still <b>view</b> your old passwords.
• 🔐 However, they can <b>no longer be decrypted</b>.
• 🚫 You will also <b>lose access</b> to any passwords shared with you by other users.

<b>Old username:</b> <code>${existingUser.username}</code>
<b>New username:</b> <code>${userData.username}</code>

<i>😞 We're sorry for the inconvenience.</i>
🔁 To recover your passwords, please log in again using your old username.`,
            );
            console.log('Notification message sent successfully');
          } catch (error) {
            console.error('Failed to send notification message:', error);
          }
        } else {
          console.log('Username has not changed');
        }

        const updatedUser = await this.userModel.findByIdAndUpdate(
          existingUser._id,
          userData,
          {
            new: true,
          },
        );
        return updatedUser;
      }

      console.log('User not found, creating new user');
      const newUser = new this.userModel(userData);
      const savedUser = await newUser.save();
      return savedUser;
    } catch (error) {
      // console.error('Error creating or updating user:', error);
      console.error('Error in createOrUpdateUser:', error);
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

  async findByUsername(username: string): Promise<boolean> {
    const usernameLower = username.toLowerCase();
    const user = await this.userModel
      .findOne({ username: usernameLower, isActive: true })
      .exec();
    if (!user) {
      return false;
    } else {
      return true;
    }
  }

  async update(
    id: string,
    updateUserDto: Partial<TelegramInitDto>,
  ): Promise<User> {
    // Convert username to lowercase if it exists
    if (updateUserDto.username) {
      updateUserDto.username = updateUserDto.username.toLowerCase();
    }
    return this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .exec();
  }

  async remove(id: string): Promise<User> {
    return this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();
  }

  /**
   * Gets a user from Telegram init data
   * @param telegramInitData The raw telegram init data string
   * @returns The user document if found
   */
  async getUserFromTelegramInitData(telegramInitData: string): Promise<User> {
    try {
      // Validate and parse the telegram init data
      const isValid = this.telegramService.validateInitData(telegramInitData);
      if (!isValid) {
        throw new HttpException(
          'Invalid Telegram init data',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Extract the user data
      const userData = this.telegramService.extractUserData(telegramInitData);
      if (!userData || !userData.id) {
        throw new HttpException(
          'Unable to extract user data',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Find the user by telegram ID
      const user = await this.userModel
        .findOne({ telegramId: userData.id.toString() })
        .exec();
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return user;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error processing Telegram init data',
      );
    }
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

  /**
   * Search users by username using full-text search for autocomplete
   * @param searchQuery The search query string
   * @param currentUserTelegramId The telegram ID of the current user to exclude from results
   * @param limit Maximum number of results to return
   * @param skip Number of results to skip
   * @returns Array of users matching the search query
   */
  async searchUsersByUsername(
    searchQuery: string,
    currentUserTelegramId: string,
    limit: number = 10,
    skip: number = 0,
  ): Promise<{
    data: { username: string; firstName?: string; lastName?: string }[];
    total: number;
  }> {
    // Get current user to exclude from results
    const currentUser = await this.userModel
      .findOne({ telegramId: currentUserTelegramId })
      .exec();

    if (!currentUser) {
      throw new HttpException('Current user not found', HttpStatus.NOT_FOUND);
    }

    // Build search query
    const searchFilter: any = {
      _id: { $ne: currentUser._id },
      isActive: true,
    };

    if (searchQuery && searchQuery.trim()) {
      // Use regex for partial matching (autocomplete functionality)
      searchFilter.username = {
        $regex: searchQuery.toLowerCase(),
        $options: 'i', // case insensitive
      };
    }

    // Execute search with pagination
    const [users, total] = await Promise.all([
      this.userModel
        .find(searchFilter)
        .select('username firstName lastName -_id')
        .limit(limit)
        .skip(skip)
        .sort({ username: 1 }) // Sort alphabetically
        .exec(),
      this.userModel.countDocuments(searchFilter).exec(),
    ]);

    return {
      data: users.map((user) => ({
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
      })),
      total,
    };
  }
}
