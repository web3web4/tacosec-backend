import {
  Injectable,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Inject,
  forwardRef,
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
import { SearchType } from './dto/search-users.dto';
import { PublicAddressesService } from '../public-addresses/public-addresses.service';
import { AddressDetectorUtil } from '../utils/address-detector.util';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../public-addresses/schemas/public-address.schema';
import { Report, ReportDocument } from '../reports/schemas/report.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private passwordService: PasswordService,
    @InjectModel(Password.name) private passwordModel: Model<PasswordDocument>,
    @InjectModel(PublicAddress.name)
    private publicAddressModel: Model<PublicAddressDocument>,
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    private readonly httpService: HttpService,
    private readonly telegramService: TelegramService,
    @Inject(forwardRef(() => PublicAddressesService))
    private readonly publicAddressesService: PublicAddressesService,
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
• ✅ You can still <b>view</b> your old secrets.
• 🔐 However, they can <b>no longer be decrypted</b>.
• 🚫 You will also <b>lose access</b> to any secrets shared with you by other users.

<b>Old username:</b> <code>${user.username}</code>
<b>New username:</b> <code>${telegramInitDto.username}</code>

<i>😞 We're sorry for the inconvenience.</i>
🔁 To recover your secrets, please log in again using your old username.`,
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
    }

    // Convert to plain object if it's a Mongoose document and return user data
    const userObject = user.toObject ? user.toObject() : user;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id: _, ...userWithoutId } = userObject;
    return userWithoutId;
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
• ✅ You can still <b>view</b> your old secrets.
• 🔐 However, they can <b>no longer be decrypted</b>.
• 🚫 You will also <b>lose access</b> to any secrets shared with you by other users.

<b>Old username:</b> <code>${existingUser.username}</code>
<b>New username:</b> <code>${userData.username}</code>

<i>😞 We're sorry for the inconvenience.</i>
🔁 To recover your secrets, please log in again using your old username.`,
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

  /**
   * Find all admin users
   * @returns Array of admin users
   */
  async findAdminUsers(): Promise<User[]> {
    return this.userModel.find({ role: 'admin', isActive: true }).exec();
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

  async updatePrivacyMode(id: string, privacyMode: boolean): Promise<User> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return this.userModel
      .findByIdAndUpdate(id, { privacyMode }, { new: true })
      .exec();
  }

  async getCurrentUserId(req: any): Promise<string> {
    // If user is authenticated via JWT token, user data is stored in req.user
    if (req.user && req.user.id) {
      return req.user.id;
    }

    // If user is authenticated via Telegram data, extract telegramId
    let telegramId: string | null = null;

    // Try to get telegramId from request body
    if (req.body?.telegramId) {
      telegramId = String(req.body.telegramId);
    } else if (req.body?.initData?.telegramId) {
      telegramId = String(req.body.initData.telegramId);
    }

    // Try to get telegramId from X-Telegram-Init-Data header
    if (!telegramId) {
      const headerInitData = req.headers['x-telegram-init-data'];
      if (headerInitData) {
        const initDataString = Array.isArray(headerInitData)
          ? headerInitData[0]
          : headerInitData;
        const params = new URLSearchParams(initDataString);
        const userJson = params.get('user');
        if (userJson) {
          try {
            const user = JSON.parse(decodeURIComponent(userJson));
            telegramId = user.id ? String(user.id) : '';
          } catch (e) {
            console.error(
              'Failed to parse user data from X-Telegram-Init-Data:',
              e,
            );
          }
        }
      }
    }

    if (!telegramId) {
      throw new HttpException(
        'Unable to identify current user',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Find user by telegramId and return their MongoDB _id
    return this.findUserIdByTelegramId(telegramId);
  }

  /**
   * Get complete information about the current user including latest public address
   * Supports both JWT token authentication and Telegram init data authentication
   * @param req - The request object containing authentication information
   * @returns Complete user information with latest public address
   */
  async getCurrentUserCompleteInfo(req: any): Promise<{
    success: boolean;
    data: {
      _id: string;
      telegramId?: string;
      firstName?: string;
      lastName?: string;
      username?: string;
      isActive: boolean;
      role?: string;
      privacyMode?: boolean;
      reportCount?: number;
      publicAddress?: string;
    };
  }> {
    try {
      // Get current user ID using existing method
      const currentUserId = await this.getCurrentUserId(req);

      // Find the complete user information
      const user = await this.userModel.findById(currentUserId).exec();
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Get the latest public address for this user
      let latestPublicAddress: string | undefined;

      try {
        // First try to get address by telegramId if available
        if (user.telegramId) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByTelegramId(
              user.telegramId,
            );
          if (addressResponse.success && addressResponse.data) {
            latestPublicAddress = addressResponse.data.publicKey;
          }
        }

        // If no address found by telegramId, try by userId
        if (!latestPublicAddress) {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByUserId(
              currentUserId,
            );
          if (addressResponse.success && addressResponse.data) {
            latestPublicAddress = addressResponse.data.publicKey;
          }
        }
      } catch (error) {
        // If address retrieval fails, latestPublicAddress remains undefined
        console.log('Could not retrieve latest public address:', error.message);
        latestPublicAddress = undefined;
      }

      // Return complete user information
      return {
        success: true,
        data: {
          _id: user._id.toString(),
          telegramId: user.telegramId,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          isActive: user.isActive,
          role: user.role,
          privacyMode: user.privacyMode,
          reportCount: user.reportCount,
          publicAddress: latestPublicAddress,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get user information',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async findUserIdByTelegramId(telegramId: string): Promise<string> {
    const user = await this.userModel.findOne({ telegramId }).exec();
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    return user._id.toString();
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
        .findOne({ telegramId: userData.id ? String(userData.id) : '' })
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

  async getTelegramProfile(username: string): Promise<{
    existsInPlatform: boolean;
    publicAddress?: string;
    profile: string;
  }> {
    try {
      // Use case-insensitive search to handle existing data with mixed case
      const user = await this.userModel
        .findOne({
          username: { $regex: new RegExp(`^${username}$`, 'i') },
        })
        .exec();

      const profile = await lastValueFrom(
        this.httpService.get(`https://t.me/${username}`),
      );

      if (user) {
        let latestPublicAddress: string | undefined;

        // Get the latest public address if user has telegramId
        if (user.telegramId) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                user.telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              latestPublicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            // If no address found, latestPublicAddress remains undefined
            latestPublicAddress = undefined;
          }
        }

        return {
          existsInPlatform: true,
          publicAddress: latestPublicAddress,
          profile: profile.data,
        };
      } else {
        return {
          existsInPlatform: false,
          profile: profile.data,
        };
      }
    } catch (error) {
      console.error('getTelegramProfile - Error:', error);
      throw new InternalServerErrorException(
        error.response?.data || error.message,
      );
    }
  }

  /**
   * Search users by username or public address with pagination and prioritization
   * @param searchQuery - The search query (username or public address)
   * @param currentUserTelegramId - Telegram ID of the current user
   * @param searchType - Type of search (starts_with or contains)
   * @param limit - Maximum number of results to return
   * @param skip - Number of results to skip for pagination
   * @returns Array of users matching the search query with previously shared contacts prioritized
   */
  async searchUsersByUsername(
    searchQuery: string,
    currentUserTelegramId: string,
    searchType: SearchType = SearchType.STARTS_WITH,
    limit: number = 10,
    skip: number = 0,
  ): Promise<{
    data: {
      username: string;
      firstName?: string;
      lastName?: string;
      isPreviouslyShared?: boolean;
      latestPublicAddress?: string;
    }[];
    total: number;
  }> {
    console.log('searchUsersByUsername called with:', {
      searchQuery,
      currentUserTelegramId,
      searchType,
      limit,
      skip,
    });

    // Get current user to exclude from results
    const currentUser = await this.userModel
      .findOne({ telegramId: currentUserTelegramId })
      .exec();

    if (!currentUser) {
      throw new HttpException('Current user not found', HttpStatus.NOT_FOUND);
    }

    // Check if the search query is a public address or username
    const isPublicAddressQuery =
      AddressDetectorUtil.isPublicAddress(searchQuery);

    if (isPublicAddressQuery) {
      // Handle public address search
      return this.searchByPublicAddress(searchQuery, currentUser, true);
    } else {
      // Handle username search (existing logic)
      return this.searchByUsername(
        searchQuery,
        currentUser,
        searchType,
        limit,
        skip,
      );
    }
  }

  /**
   * Search for users by public address
   * Finds the user associated with the given public address
   */
  private async searchByPublicAddress(
    publicAddress: string,
    currentUser: any,
    allowCurrentUser: boolean = false,
  ): Promise<{
    data: {
      username: string;
      firstName?: string;
      lastName?: string;
      isPreviouslyShared?: boolean;
      latestPublicAddress?: string;
    }[];
    total: number;
  }> {
    try {
      // Find the public address record
      const publicAddressRecord = await this.publicAddressModel
        .findOne({ publicKey: publicAddress })
        .populate('userId')
        .exec();

      // If no public address found, return empty result
      if (!publicAddressRecord || !publicAddressRecord.userId) {
        return {
          data: [],
          total: 0,
        };
      }

      const user = publicAddressRecord.userId as any;

      // Check if user is active and optionally exclude current user
      if (
        !user.isActive ||
        (!allowCurrentUser &&
          user._id.toString() === currentUser._id.toString())
      ) {
        return {
          data: [],
          total: 0,
        };
      }

      // Check if user has telegram account linked
      let displayUsername = user.username;
      if (!user.telegramId) {
        displayUsername = 'User has no Telegram account currently';
      }

      // Check if this user was previously shared with
      const sharedPasswords = await this.passwordModel
        .find({
          userId: currentUser._id,
          isActive: true,
          'sharedWith.0': { $exists: true },
        })
        .select('sharedWith')
        .exec();

      let isPreviouslyShared = false;
      sharedPasswords.forEach((password) => {
        password.sharedWith?.forEach((shared) => {
          if (
            shared.username &&
            shared.username.toLowerCase() === user.username?.toLowerCase()
          ) {
            isPreviouslyShared = true;
          }
          if (shared.publicAddress === publicAddress) {
            isPreviouslyShared = true;
          }
        });
      });

      const result = {
        username: displayUsername,
        firstName: user.firstName,
        lastName: user.lastName,
        isPreviouslyShared,
        latestPublicAddress: publicAddress,
      };

      return {
        data: [result],
        total: 1,
      };
    } catch (error) {
      console.error('Error in searchByPublicAddress:', error);
      // If any error occurs, return empty result
      return {
        data: [],
        total: 0,
      };
    }
  }

  /**
   * Search users by username (existing logic extracted to separate method)
   * @param searchQuery - The username search query
   * @param currentUser - The current user making the search
   * @param searchType - Type of search (starts_with or contains)
   * @param limit - Maximum number of results to return
   * @param skip - Number of results to skip for pagination
   * @returns Array of users matching the username search
   */
  private async searchByUsername(
    searchQuery: string,
    currentUser: any,
    searchType: SearchType,
    limit: number,
    skip: number,
  ): Promise<{
    data: {
      username: string;
      firstName?: string;
      lastName?: string;
      isPreviouslyShared?: boolean;
      latestPublicAddress?: string;
    }[];
    total: number;
  }> {
    // Get previously shared usernames from passwords
    const sharedPasswords = await this.passwordModel
      .find({
        userId: currentUser._id,
        isActive: true,
        'sharedWith.0': { $exists: true }, // Has at least one shared contact
      })
      .select('sharedWith')
      .exec();

    // Extract unique usernames that have been shared with
    const sharedUsernames = new Set<string>();
    sharedPasswords.forEach((password) => {
      password.sharedWith?.forEach((shared) => {
        if (shared.username) {
          sharedUsernames.add(shared.username.toLowerCase());
        }
      });
    });

    // Build search query
    const searchFilter: any = {
      _id: { $ne: currentUser._id },
      isActive: true,
    };

    if (searchQuery && searchQuery.trim()) {
      let regexPattern: string;

      // Choose regex pattern based on search type
      if (searchType === SearchType.STARTS_WITH) {
        // Search for usernames that START with the query
        regexPattern = `^${searchQuery.toLowerCase()}`;
      } else {
        // Search for usernames that CONTAIN the query anywhere
        regexPattern = searchQuery.toLowerCase();
      }

      searchFilter.username = {
        $regex: regexPattern,
        $options: 'i', // case insensitive
      };
    }

    // Execute search without pagination first to sort properly
    const allUsers = await this.userModel
      .find(searchFilter)
      .select('username firstName lastName telegramId -_id')
      .exec();

    // Separate users into previously shared and new contacts
    const previouslySharedUsers: any[] = [];
    const newUsers: any[] = [];

    // Process each user and get their latest public address
    for (const user of allUsers) {
      let latestPublicAddress: string | undefined;

      try {
        // Get the latest public address for this user
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByTelegramId(
            user.telegramId,
          );
        if (addressResponse.success && addressResponse.data) {
          latestPublicAddress = addressResponse.data.publicKey;
        }
      } catch (error) {
        // If no address found or error, latestPublicAddress remains undefined
        latestPublicAddress = undefined;
      }

      const userObj = {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        isPreviouslyShared: sharedUsernames.has(user.username.toLowerCase()),
        latestPublicAddress,
      };

      if (sharedUsernames.has(user.username.toLowerCase())) {
        previouslySharedUsers.push(userObj);
      } else {
        newUsers.push(userObj);
      }
    }

    // Sort each group alphabetically
    previouslySharedUsers.sort((a, b) => a.username.localeCompare(b.username));
    newUsers.sort((a, b) => a.username.localeCompare(b.username));

    // Combine arrays with previously shared users first
    const sortedUsers = [...previouslySharedUsers, ...newUsers];

    // Apply pagination to the sorted results
    const paginatedUsers = sortedUsers.slice(skip, skip + limit);

    return {
      data: paginatedUsers,
      total: sortedUsers.length,
    };
  }

  /**
   * Get all users with admin filters and pagination
   * @param filters - Filter criteria for users
   * @returns Paginated list of users with total count
   */
  async getAllUsersForAdmin(filters: {
    role?: string;
    sharingRestricted?: boolean;
    isActive?: boolean;
    hasTelegramId?: 'true' | 'false';
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
  }> {
    const {
      role,
      sharingRestricted,
      isActive,
      hasTelegramId,
      search,
      page = 1,
      limit = 10,
    } = filters;

    // Build filter query
    const filterQuery: any = {};
    const andConditions: any[] = [];

    if (role) {
      filterQuery.role = role;
    }

    if (typeof sharingRestricted === 'boolean') {
      filterQuery.sharingRestricted = sharingRestricted;
    }

    if (typeof isActive === 'boolean') {
      filterQuery.isActive = isActive;
    }

    // Handle hasTelegramId filter
    if (hasTelegramId === 'true') {
      andConditions.push({
        telegramId: { $exists: true, $nin: ['', null] },
      });
    } else if (hasTelegramId === 'false') {
      andConditions.push({
        $or: [
          { telegramId: '' },
          { telegramId: { $exists: false } },
          { telegramId: null },
        ],
      });
    }

    // Handle search filter
    if (search && search.trim()) {
      andConditions.push({
        $or: [
          { username: { $regex: search.trim(), $options: 'i' } },
          { firstName: { $regex: search.trim(), $options: 'i' } },
          { lastName: { $regex: search.trim(), $options: 'i' } },
          { telegramId: { $regex: search.trim(), $options: 'i' } },
        ],
      });
    }

    // Combine all conditions
    if (andConditions.length > 0) {
      filterQuery.$and = andConditions;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get total count for filtered results
    const total = await this.userModel.countDocuments(filterQuery);

    // Get pagination statistics for all users
    const totalUsers = await this.userModel.countDocuments({});
    const activeUsers = await this.userModel.countDocuments({ isActive: true });
    const inactiveUsers = await this.userModel.countDocuments({ isActive: false });

    // Get paginated users
    const users = await this.userModel
      .find(filterQuery)
      .select('-hash') // Exclude sensitive data
      .sort({ createdAt: -1 }) // Sort by newest first
      .skip(skip)
      .limit(limit)
      .exec();

    const totalPages = Math.ceil(total / limit);

    // Transform users data to include required fields
    const transformedUsers = await Promise.all(
      users.map(async (user) => {
        // Convert to plain object to access timestamps
        const userObj = user.toObject() as any;
        
        // Combine firstName and lastName into Name
        const Name = `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim() || 'N/A';

        // Format phone field
        let phone: string;
        if (!userObj.phone || userObj.phone.trim() === '') {
          phone = 'TG';
        } else {
          phone = `TG: ${userObj.phone}`;
        }

        // Format joinedDate from createdAt
        const joinedDate = userObj.createdAt ? userObj.createdAt.toISOString().split('T')[0] : null;

        // Calculate statistics
        // Count secrets (passwords) for this user
        const secrets = await this.passwordModel.countDocuments({
          userId: userObj._id,
          isActive: true,
        });

        // Count total views for all user's secrets
        const userPasswords = await this.passwordModel.find({
          userId: userObj._id,
          isActive: true,
        }).select('secretViews');

        let views = 0;
        userPasswords.forEach(password => {
          if (password.secretViews && Array.isArray(password.secretViews)) {
            views += password.secretViews.length;
          }
        });

        // Count reports for this user (unresolved reports)
        const reports = await this.reportModel.countDocuments({
          'reportedUserInfo.userId': userObj._id,
          resolved: false,
        });

        return {
          _id: userObj._id,
          username: userObj.username,
          Name,
          phone,
          telegramId: userObj.telegramId,
          photoUrl: userObj.photoUrl,
          authDate: userObj.authDate,
          isActive: userObj.isActive,
          role: userObj.role,
          sharingRestricted: userObj.sharingRestricted,
          reportCount: userObj.reportCount,
          privacyMode: userObj.privacyMode,
          joinedDate,
          lastActive: userObj.updatedAt,
          statistics: {
            secrets,
            views,
            reports,
          },
        };
      })
    );

    return {
      data: transformedUsers,
      total,
      page,
      limit,
      totalPages,
      totalUsers,
      activeUsers,
      inactiveUsers,
    };
  }

  async updateUserInfo(
    userId: string,
    updateData: { firstName?: string; lastName?: string; phone?: string; email?: string },
  ): Promise<{
    success: boolean;
    data: {
      id: string;
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      telegramId?: string;
    };
  }> {
    try {
      // Get current user to check if linked to Telegram
      const currentUser = await this.userModel.findById(userId).exec();
      if (!currentUser) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Prepare update object
      const updateObject: any = {};

      // If user is linked to Telegram, only allow phone and email updates
      if (currentUser.telegramId) {
        if (updateData.phone !== undefined) {
          updateObject.phone = updateData.phone;
        }
        if (updateData.email !== undefined) {
          updateObject.email = updateData.email;
        }
        // firstName and lastName are ignored for Telegram users
      } else {
        // For non-Telegram users, allow all fields
        if (updateData.firstName !== undefined) {
          updateObject.firstName = updateData.firstName;
        }
        if (updateData.lastName !== undefined) {
          updateObject.lastName = updateData.lastName;
        }
        if (updateData.phone !== undefined) {
          updateObject.phone = updateData.phone;
        }
        if (updateData.email !== undefined) {
          updateObject.email = updateData.email;
        }
      }

      // Update user
      const updatedUser = await this.userModel
        .findByIdAndUpdate(userId, updateObject, { new: true })
        .exec();

      if (!updatedUser) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        data: {
          id: updatedUser._id.toString(),
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          phone: updatedUser.phone,
          email: updatedUser.email,
          telegramId: updatedUser.telegramId,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update user active status (Admin only)
   * @param userId - The ID of the user to update
   * @param isActive - The new active status
   * @returns Updated user information
   */
  async updateUserActiveStatus(
    userId: string,
    isActive: boolean,
  ): Promise<{ success: boolean; message: string; user?: any }> {
    try {
      // Check if user exists
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Update the user's active status
      const updatedUser = await this.userModel.findByIdAndUpdate(
        userId,
        { isActive },
        { new: true },
      );

      return {
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        user: {
          _id: updatedUser._id,
          telegramId: updatedUser.telegramId,
          username: updatedUser.username,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          isActive: updatedUser.isActive,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
