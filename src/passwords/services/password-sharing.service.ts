import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Password, PasswordDocument } from '../schemas/password.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Report, ReportDocument } from '../../reports/schemas/report.schema';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../../public-addresses/schemas/public-address.schema';
import { SharedWithDto } from '../dto/shared-with.dto';
import { PaginatedResponse } from '../dto/pagination.dto';
import { SharedWithMeResponse } from '../../types/share-with-me-pass.types';
import { TelegramDtoAuthGuard } from '../../guards/telegram-dto-auth.guard';
import { PublicAddressesService } from '../../public-addresses/public-addresses.service';
import { UserFinderUtil } from '../../utils/user-finder.util';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { PasswordBaseService } from './password-base.service';

/**
 * Password Sharing Service
 * Handles password sharing logic, shared-with queries, and sharing restrictions
 */
@Injectable()
export class PasswordSharingService extends PasswordBaseService {
  constructor(
    @InjectModel(Password.name) passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name) userModel: Model<UserDocument>,
    @InjectModel(Report.name) reportModel: Model<ReportDocument>,
    @InjectModel(PublicAddress.name)
    publicAddressModel: Model<PublicAddressDocument>,
    telegramDtoAuthGuard: TelegramDtoAuthGuard,
    publicAddressesService: PublicAddressesService,
  ) {
    super(
      passwordModel,
      userModel,
      reportModel,
      publicAddressModel,
      telegramDtoAuthGuard,
      publicAddressesService,
    );
  }

  /**
   * Find shared-with list by Telegram ID
   */
  async findSharedWithByTelegramId(
    telegramId: string,
    key: string,
  ): Promise<SharedWithDto[] | null> {
    try {
      if (!telegramId) {
        throw new Error('Telegram ID is required');
      }

      const user = await this.userModel
        .findOne({ telegramId, isActive: true })
        .exec();

      if (!user) {
        throw new Error('Telegram ID is not valid');
      }

      if (!key) {
        throw new Error('Key is required');
      }

      const passwordKey = await this.passwordModel
        .findOne({ key, isActive: true })
        .exec();

      if (!passwordKey) {
        throw new Error('Key is not found');
      }

      const sharedWith = await this.passwordModel
        .find({ userId: user._id, isActive: true, key })
        .select('sharedWith -_id')
        .exec();

      return sharedWith.length > 0 ? (sharedWith[0]?.sharedWith ?? null) : null;
    } catch (error) {
      console.log('error', error);
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Find shared-with list by user ID
   */
  async findSharedWithByUserId(
    userId: string,
    key: string,
  ): Promise<SharedWithDto[] | null> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const user = await this.userModel
        .findOne({ _id: userId, isActive: true })
        .exec();

      if (!user) {
        throw new Error('User ID is not valid');
      }

      if (!key) {
        throw new Error('Key is required');
      }

      const sharedWith = await this.passwordModel
        .find({ userId: user._id, isActive: true, key })
        .select('sharedWith -_id')
        .exec();

      return sharedWith.length > 0 ? (sharedWith[0]?.sharedWith ?? null) : null;
    } catch (error) {
      console.log('error', error);
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Find passwords shared with user
   */
  async findPasswordsSharedWithMe(
    username: string,
    userId?: string,
    currentUserTelegramId?: string,
    currentUserPrivacyMode?: boolean,
    publicAddress?: string,
  ): Promise<SharedWithMeResponse> {
    try {
      if (!username && !userId && !publicAddress) {
        throw new Error('Username, userId, or publicAddress is required');
      }

      let finalUserId = userId;
      if (!finalUserId && username) {
        const user = await this.userModel
          .findOne({ username: username.toLowerCase(), isActive: true })
          .exec();
        if (user) {
          finalUserId = user._id ? String(user._id) : '';
        }
      }

      return this.getSharedWithMe(
        username,
        finalUserId,
        currentUserTelegramId,
        currentUserPrivacyMode,
        publicAddress,
      );
    } catch (error) {
      console.log('error', error);
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get passwords shared with the current user
   * Searches by userId, username, and publicAddress
   */
  async getSharedWithMe(
    username: string,
    userId?: string,
    currentUserTelegramId?: string,
    currentUserPrivacyMode?: boolean,
    publicAddress?: string,
  ): Promise<SharedWithMeResponse> {
    try {
      if (!username && !userId && !publicAddress) {
        throw new Error('Username, userId, or publicAddress is required');
      }

      const allSharedPasswords: any[] = [];
      const passwordIds = new Set<string>();

      // Search by userId
      if (userId) {
        const userIdResults = await this.passwordModel
          .find({
            'sharedWith.userId': userId,
            isActive: true,
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          })
          .select(
            '_id key value description initData.username sharedWith createdAt updatedAt userId secretViews',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        userIdResults.forEach((password) => {
          const passwordId = String(password._id);
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });
      }

      // Search by username (case insensitive)
      if (username) {
        const usernameResults = await this.passwordModel
          .find({
            'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') },
            isActive: true,
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          })
          .select(
            '_id key value description initData.username sharedWith createdAt updatedAt userId secretViews',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        usernameResults.forEach((password) => {
          const passwordId = String(password._id);
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });
      }

      // Search by publicAddress
      if (publicAddress) {
        const publicAddressResults = await this.passwordModel
          .find({
            'sharedWith.publicAddress': publicAddress,
            isActive: true,
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
            ],
          })
          .select(
            '_id key value description initData.username sharedWith createdAt updatedAt userId secretViews',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        publicAddressResults.forEach((password) => {
          const passwordId = String(password._id);
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });
      }

      // Get latest public address
      let latestPublicAddress = publicAddress;
      if (!latestPublicAddress) {
        try {
          if (currentUserTelegramId) {
            const byTg =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                currentUserTelegramId,
              );
            if (byTg.success && byTg.data) {
              latestPublicAddress = byTg.data.publicKey;
            }
          }
          if (!latestPublicAddress && userId) {
            const byUser =
              await this.publicAddressesService.getLatestAddressByUserId(
                String(userId),
              );
            if (byUser.success && byUser.data) {
              latestPublicAddress = byUser.data.publicKey;
            }
          }
        } catch {
          // Ignore errors
        }
      }

      // Filter shared passwords
      const filteredShared = allSharedPasswords.filter((password) => {
        const entries = (password.sharedWith || []).filter((sw: any) => {
          const matchesUserId =
            userId && sw.userId && String(sw.userId) === String(userId);
          const matchesUsername =
            username &&
            sw.username &&
            sw.username.toLowerCase() === String(username).toLowerCase();
          const matchesLatestAddress =
            latestPublicAddress && sw.publicAddress === latestPublicAddress;
          return matchesUserId || matchesUsername || matchesLatestAddress;
        });

        if (!entries.length) return false;

        for (const sw of entries) {
          if (sw.publicAddress) {
            if (!latestPublicAddress) return false;
            if (sw.publicAddress !== latestPublicAddress) return false;
          }
        }
        return true;
      });

      // Sort by creation date
      const sharedPasswords = filteredShared.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      if (!sharedPasswords?.length) {
        return { sharedWithMe: [], userCount: 0 };
      }

      // Get owner information for privacy checks
      const secretOwnerIds = [
        ...new Set(
          sharedPasswords
            .map((p) => (p.userId ? String(p.userId) : ''))
            .filter((id) => id),
        ),
      ];

      const secretOwners = await this.userModel
        .find({ _id: { $in: secretOwnerIds } })
        .exec();

      const ownerPrivacyMap = new Map(
        secretOwners.map((owner) => [
          owner._id ? String(owner._id) : '',
          owner.privacyMode,
        ]),
      );
      const ownerUsernameMap = new Map(
        secretOwners.map((owner) => [
          owner._id ? String(owner._id) : '',
          owner.username,
        ]),
      );
      const ownerTelegramIdMap = new Map(
        secretOwners.map((owner) => [
          owner._id ? String(owner._id) : '',
          owner.telegramId,
        ]),
      );

      // Transform passwords with reports and privacy filtering
      const resolvedPasswords = await this.transformSharedPasswordsWithPrivacy(
        sharedPasswords,
        ownerPrivacyMap,
        ownerUsernameMap,
        ownerTelegramIdMap,
        currentUserTelegramId,
        currentUserPrivacyMode,
      );

      // Group by owner
      const result = await this.groupPasswordsByOwner(
        resolvedPasswords,
        sharedPasswords,
      );

      result.sort((a, b) => b.count - a.count);

      return { sharedWithMe: result, userCount: result.length };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Validate sharing restrictions for a user
   */
  async validateSharingRestrictions(
    user: UserDocument,
    sharedWith: { username: string }[],
  ): Promise<void> {
    const passwordsSharedWithUser = await this.passwordModel.find({
      'sharedWith.username': user.username,
      isActive: true,
    });

    const usersWhoSharedWithThisUser = new Set(
      passwordsSharedWithUser
        .map((p) => p.initData?.username?.toLowerCase())
        .filter(Boolean),
    );

    for (const shareTarget of sharedWith) {
      const targetUsername = shareTarget.username.toLowerCase();

      if (!usersWhoSharedWithThisUser.has(targetUsername)) {
        throw new HttpException(
          `Due to sharing restrictions, you can only share passwords with users who have shared passwords with you. User ${shareTarget.username} has not shared any passwords with you.`,
          HttpStatus.FORBIDDEN,
        );
      }
    }
  }

  /**
   * Expand sharedWith entries to resolve user info
   */
  async expandSharedWith(
    sharedWith: SharedWithDto[],
  ): Promise<SharedWithDto[]> {
    const expanded: SharedWithDto[] = [];

    for (const shared of sharedWith) {
      let shouldSendTelegramNotification = false;
      const onlyPublicAddress =
        !!(shared as any).publicAddress &&
        !shared.username &&
        !(shared as any).userId;

      if (onlyPublicAddress) {
        const infos = await UserFinderUtil.findUsersByPublicAddress(
          (shared as any).publicAddress,
          this.userModel,
          this.publicAddressModel,
        );
        if (infos.length) {
          infos.forEach((info) =>
            expanded.push({
              ...shared,
              username: info.username?.toLowerCase() ?? '',
              userId: info.userId,
              publicAddress:
                (shared as any).publicAddress || info.publicAddress,
              shouldSendTelegramNotification: !!info.telegramId,
            } as SharedWithDto),
          );
          continue;
        }
      }

      const userInfo = await UserFinderUtil.findUserByAnyInfo(
        {
          username: shared.username,
          userId: (shared as any).userId,
          publicAddress: (shared as any).publicAddress,
        },
        this.userModel,
        this.publicAddressModel,
      );

      if (userInfo) {
        shouldSendTelegramNotification = !!userInfo.telegramId;
        expanded.push({
          ...shared,
          username: userInfo.username?.toLowerCase() ?? '',
          userId: userInfo.userId,
          publicAddress:
            (shared as any).publicAddress || userInfo.publicAddress,
          shouldSendTelegramNotification,
        } as SharedWithDto);
      } else if (shared.username) {
        // If user not found but username provided, assume they might register later
        shouldSendTelegramNotification = true;
        expanded.push({
          ...shared,
          username: shared.username.toLowerCase(),
          userId: undefined,
          publicAddress: (shared as any).publicAddress,
          shouldSendTelegramNotification,
        } as SharedWithDto);
      } else {
        expanded.push({
          ...shared,
          username: undefined,
          userId: undefined,
          publicAddress: (shared as any).publicAddress,
          shouldSendTelegramNotification: false,
        } as SharedWithDto);
      }
    }

    return expanded;
  }

  /**
   * Filter out self-sharing from sharedWith list
   */
  filterSelfSharing(
    sharedWith: SharedWithDto[],
    creatorUsername: string,
    creatorUserId: string,
    creatorPublicAddress?: string,
  ): SharedWithDto[] {
    return sharedWith.filter((shared) => {
      const sharedUsername = (shared.username || '').toLowerCase();
      const sharedUserIdStr = (shared as any).userId
        ? String((shared as any).userId)
        : '';
      const sharedPublicAddress = (shared as any).publicAddress || '';

      if (
        sharedUsername &&
        creatorUsername &&
        sharedUsername === creatorUsername.toLowerCase()
      ) {
        return false;
      }
      if (sharedUserIdStr && sharedUserIdStr === creatorUserId) {
        return false;
      }
      if (
        creatorPublicAddress &&
        sharedPublicAddress &&
        sharedPublicAddress === creatorPublicAddress
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * Transform shared passwords with privacy settings
   */
  private async transformSharedPasswordsWithPrivacy(
    sharedPasswords: any[],
    ownerPrivacyMap: Map<string, boolean | undefined>,
    ownerUsernameMap: Map<string, string | undefined>,
    ownerTelegramIdMap: Map<string, string | undefined>,
    currentUserTelegramId?: string,
    currentUserPrivacyMode?: boolean,
  ): Promise<any[]> {
    return Promise.all(
      sharedPasswords
        .filter((password) => password.userId)
        .map(async (password) => {
          const reports = await this.reportModel
            .find({
              $or: [
                { secret_id: password._id },
                { secret_id: String(password._id) },
              ],
              resolved: false,
            })
            .exec();

          const passwordUserId = password.userId ? String(password.userId) : '';
          const ownerPrivacyMode = ownerPrivacyMap.get(passwordUserId) || false;
          const ownerTelegramId = ownerTelegramIdMap.get(passwordUserId);
          const ownerUsername = ownerUsernameMap.get(passwordUserId);
          const isOwner = currentUserTelegramId === ownerTelegramId;
          const secretViews = password.secretViews || [];

          const baseData = {
            id: String(password._id),
            key: password.key,
            value: password.value,
            description: password.description,
            username: ownerUsername || password.initData.username,
            sharedWith: password.sharedWith || [],
            reports,
            updatedAt: password.updatedAt,
          };

          // Apply privacy filters
          if (currentUserPrivacyMode) {
            return baseData;
          }

          if (!ownerPrivacyMode || isOwner) {
            return {
              ...baseData,
              createdAt: password.createdAt,
              viewsCount: secretViews.length,
              secretViews,
            };
          }

          return baseData;
        }),
    );
  }

  /**
   * Group passwords by owner
   */
  private async groupPasswordsByOwner(
    resolvedPasswords: any[],
    sharedPasswords: any[],
  ): Promise<any[]> {
    const groupedByOwner: Record<string, any[]> = {};

    for (const password of resolvedPasswords) {
      const originalPassword = sharedPasswords.find(
        (sp) => String(sp._id) === password.id,
      );
      const ownerUserId = originalPassword
        ? String(originalPassword.userId)
        : '';

      if (!groupedByOwner[ownerUserId]) {
        groupedByOwner[ownerUserId] = [];
      }

      if (password.key && password.value) {
        groupedByOwner[ownerUserId].push(password);
      }
    }

    // Get owner information
    const ownerUserIds = Object.keys(groupedByOwner).filter((id) => id);
    const ownerInfoMap = new Map<string, any>();

    for (const ownerId of ownerUserIds) {
      console.log(`Looking up owner info for userId: ${ownerId}`);

      // Search for the actual owner user by userId first
      let ownerInfo = await UserFinderUtil.findUserByAnyInfo(
        { userId: ownerId },
        this.userModel,
        this.publicAddressModel,
      );

      // If not found by userId, try to find the owner using other available information
      if (!ownerInfo) {
        console.log(
          `User not found by userId ${ownerId}, trying alternative search methods...`,
        );

        // Find passwords owned by this userId to get additional owner information
        const ownerPasswords = sharedPasswords.filter(
          (p) => String(p.userId) === ownerId,
        );

        // Try to find owner information from the password's user data
        for (const password of ownerPasswords) {
          // If password has username, try searching by username
          if (password.username) {
            ownerInfo = await UserFinderUtil.findUserByAnyInfo(
              { username: password.username },
              this.userModel,
              this.publicAddressModel,
            );
            if (ownerInfo) break;
          }

          // If password has telegramId, try searching by telegramId
          if (password.telegramId) {
            ownerInfo = await UserFinderUtil.findUserByAnyInfo(
              { telegramId: password.telegramId },
              this.userModel,
              this.publicAddressModel,
            );
            if (ownerInfo) break;
          }
        }
      }

      console.log(`Owner info result for userId ${ownerId}:`, ownerInfo);

      if (ownerInfo) {
        ownerInfoMap.set(ownerId, {
          userId: ownerInfo.userId,
          username: ownerInfo.username || '',
          telegramId: ownerInfo.telegramId || '',
          publicAddress: ownerInfo.publicAddress || '',
        });
      } else {
        console.log(`No owner info found for userId: ${ownerId}`);
        // Store minimal info if no user found
        ownerInfoMap.set(ownerId, {
          userId: ownerId,
          username: '',
          telegramId: '',
          publicAddress: '',
        });
      }
    }

    return Object.entries(groupedByOwner)
      .filter(([userId]) => userId)
      .map(([userId, passwords]) => {
        const ownerInfo = ownerInfoMap.get(userId);

        return {
          sharedBy: {
            userId: ownerInfo?.userId || userId,
            username: ownerInfo?.username || '',
            telegramId: ownerInfo?.telegramId || null,
            publicAddress: ownerInfo?.publicAddress || null,
          },
          passwords: passwords.map((p) => {
            const passwordData: any = {
              id: p.id,
              key: p.key,
              value: p.value,
              description: p.description,
              updatedAt: p.updatedAt,
              sharedWith: p.sharedWith,
              reports: p.reports,
            };

            // Add optional fields if they exist (they were already filtered based on privacy settings)
            if (p.createdAt) {
              passwordData.createdAt = p.createdAt;
            }
            if (p.secretViews) {
              passwordData.secretViews = p.secretViews;
              passwordData.viewsCount = p.secretViews.length;
            } else {
              passwordData.viewsCount = 0;
            }

            return passwordData;
          }),
          count: passwords.length,
        };
      });
  }

  /**
   * Get sharedWith for a key by TelegramId with optional pagination
   */
  async findSharedWithByTelegramIdWithPagination(
    telegramId: string,
    key: string,
    page?: number,
    limit?: number,
  ): Promise<SharedWithDto[] | PaginatedResponse<SharedWithDto>> {
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

      // If pagination parameters are not provided or incomplete, return original response
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        return this.findSharedWithByTelegramId(telegramId, key);
      }

      // For this method, pagination doesn't make much sense as it typically returns
      // a single password's sharedWith array, but we'll implement it for consistency
      const sharedWith = await this.passwordModel
        .find({
          userId: user._id,
          isActive: true,
          key: key,
        })
        .select('sharedWith -_id')
        .exec();

      const sharedWithData = Array.isArray(sharedWith?.[0]?.sharedWith)
        ? sharedWith[0].sharedWith
        : [];

      // Apply pagination to sharedWith array
      const skip = (page - 1) * limit;
      const paginatedData = sharedWithData.slice(skip, skip + limit);
      const totalCount = sharedWithData.length;
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        data: paginatedData,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      };
    } catch (error) {
      console.log('error', error);
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get sharedWith for a key by UserId with optional pagination
   */
  async findSharedWithByUserIdWithPagination(
    userId: string,
    key: string,
    page?: number,
    limit?: number,
  ): Promise<SharedWithDto[] | PaginatedResponse<SharedWithDto>> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }
      const user = await this.userModel.findOne({
        _id: userId,
        isActive: true,
      });
      if (!user) {
        throw new Error('userId is not valid');
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

      // If pagination parameters are not provided or incomplete, return original response
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        return this.findSharedWithByUserId(userId, key);
      }

      // For this method, pagination doesn't make much sense as it typically returns
      // a single password's sharedWith array, but we'll implement it for consistency
      const sharedWith = await this.passwordModel
        .find({
          userId: user._id,
          isActive: true,
          key: key,
        })
        .select('sharedWith -_id')
        .exec();

      const sharedWithData = Array.isArray(sharedWith?.[0]?.sharedWith)
        ? sharedWith[0].sharedWith
        : [];

      // Apply pagination to sharedWith array
      const skip = (page - 1) * limit;
      const paginatedData = sharedWithData.slice(skip, skip + limit);
      const totalCount = sharedWithData.length;
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        data: paginatedData,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      };
    } catch (error) {
      console.log('error', error);
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get shared-with data with authentication logic
   * Handles both JWT and Telegram authentication with optional pagination
   * @param req The authenticated request object
   * @param key The password key to get shared-with data for
   * @param page Optional page number for pagination
   * @param limit Optional limit for pagination
   * @returns Either paginated response or simple array based on parameters
   */
  async getSharedWithByAuth(
    req: AuthenticatedRequest,
    key: string,
    page?: number,
    limit?: number,
  ): Promise<SharedWithDto[] | PaginatedResponse<SharedWithDto>> {
    // Parse pagination parameters if provided
    const pageNumber = page ? parseInt(String(page), 10) : undefined;
    const limitNumber = limit ? parseInt(String(limit), 10) : undefined;

    // If JWT token exists, use userId; otherwise use telegramId
    if (req?.user && req.user.id) {
      return this.findSharedWithByUserIdWithPagination(
        req.user.id,
        key,
        pageNumber,
        limitNumber,
      );
    } else {
      const telegramId = this.extractTelegramIdFromRequest(req);
      return this.findSharedWithByTelegramIdWithPagination(
        telegramId,
        key,
        pageNumber,
        limitNumber,
      );
    }
  }

  /**
   * Get passwords shared with me with optional pagination
   * @param req The authenticated request object
   * @param page Optional page number for pagination
   * @param limit Optional limit for pagination
   * @returns Either paginated response or simple response based on parameters
   */
  async findPasswordsSharedWithMeWithPagination(
    req: AuthenticatedRequest,
    page?: number,
    limit?: number,
  ): Promise<SharedWithMeResponse | PaginatedResponse<any>> {
    console.log('Service: findPasswordsSharedWithMeWithPagination called');
    try {
      // Extract userId, username, telegramId and publicAddress from request
      let userId: string | undefined;
      let username: string | undefined;
      let currentUserTelegramId: string | undefined;
      let currentUserPrivacyMode = false;
      let publicAddress: string | undefined;

      if (req?.user && req.user.id) {
        userId = req.user.id;
        username = req.user.username;
        // Get telegramId, privacyMode and publicAddress from user data
        const user = await this.userModel.findById(userId).exec();
        if (user) {
          currentUserTelegramId = user.telegramId;
          currentUserPrivacyMode = user.privacyMode || false;
          try {
            if (user.telegramId) {
              const respByTelegram =
                await this.publicAddressesService.getLatestAddressByTelegramId(
                  user.telegramId,
                );
              if (respByTelegram.success && respByTelegram.data) {
                publicAddress = respByTelegram.data.publicKey;
              }
            }
            if (!publicAddress) {
              const respByUser =
                await this.publicAddressesService.getLatestAddressByUserId(
                  String(user._id),
                );
              if (respByUser.success && respByUser.data) {
                publicAddress = respByUser.data.publicKey;
              }
            }
          } catch {}
        }
      } else if (req?.headers?.['x-telegram-init-data']) {
        const headerInitData = req.headers['x-telegram-init-data'] as string;
        const parsedData =
          this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
        username = parsedData.username;
        currentUserTelegramId = parsedData.telegramId;
        // Try to find userId from username and get privacyMode and publicAddress
        if (username) {
          const user = await this.userModel
            .findOne({
              username: username.toLowerCase(),
              isActive: true,
            })
            .exec();
          if (user) {
            userId = user._id ? String(user._id) : '';
            currentUserPrivacyMode = user.privacyMode || false;
            try {
              if (user.telegramId) {
                const respByTelegram =
                  await this.publicAddressesService.getLatestAddressByTelegramId(
                    user.telegramId,
                  );
                if (respByTelegram.success && respByTelegram.data) {
                  publicAddress = respByTelegram.data.publicKey;
                }
              }
              if (!publicAddress) {
                const respByUser =
                  await this.publicAddressesService.getLatestAddressByUserId(
                    String(user._id),
                  );
                if (respByUser.success && respByUser.data) {
                  publicAddress = respByUser.data.publicKey;
                }
              }
            } catch {}
          }
        }
      } else {
        throw new HttpException(
          'No authentication data provided',
          HttpStatus.BAD_REQUEST,
        );
      }

      // If pagination parameters are not provided or incomplete, return original response
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        if (!username && !userId && !publicAddress) {
          throw new Error('Username, userId, or publicAddress is required');
        }
        return this.findPasswordsSharedWithMe(
          username,
          userId,
          currentUserTelegramId,
          currentUserPrivacyMode,
          publicAddress,
        );
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      const allSharedPasswords: any[] = [];
      const passwordIds = new Set<string>(); // To track unique password IDs for deduplication

      // Search by userId if available
      if (userId) {
        const baseQuery = {
          'sharedWith.userId': userId,
          isActive: true,
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        };

        const userIdResults = await this.passwordModel
          .find(baseQuery)
          .select(
            ' _id key value description initData.username sharedWith updatedAt userId ',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        // Add unique results to the collection
        userIdResults.forEach((password) => {
          const passwordId = password._id.toString();
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });

        console.log(
          'Database query result (userId):',
          userIdResults.length,
          'passwords found',
        );
      }

      // Search by username if available
      if (username) {
        const baseQuery = {
          'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') },
          isActive: true,
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        };

        const usernameResults = await this.passwordModel
          .find(baseQuery)
          .select(
            ' _id key value description initData.username sharedWith updatedAt userId ',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        // Add unique results to the collection
        usernameResults.forEach((password) => {
          const passwordId = password._id.toString();
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });

        console.log(
          'Database query result (username):',
          usernameResults.length,
          'passwords found',
        );
      }

      // Search by publicAddress if available
      if (publicAddress) {
        const baseQuery = {
          'sharedWith.publicAddress': publicAddress,
          isActive: true,
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        };

        const publicAddressResults = await this.passwordModel
          .find(baseQuery)
          .select(
            ' _id key value description initData.username sharedWith updatedAt userId ',
          )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        // Add unique results to the collection
        publicAddressResults.forEach((password) => {
          const passwordId = password._id.toString();
          if (!passwordIds.has(passwordId)) {
            passwordIds.add(passwordId);
            allSharedPasswords.push(password);
          }
        });

        console.log(
          'Database query result (publicAddress):',
          publicAddressResults.length,
          'passwords found',
        );
      }

      const latestPublicAddress = publicAddress;

      const filteredSharedPasswords = allSharedPasswords.filter((password) => {
        const entries = (password.sharedWith || []).filter((sw: any) => {
          const matchesUserId =
            userId && sw.userId && String(sw.userId) === String(userId);
          const matchesUsername =
            username &&
            sw.username &&
            sw.username.toLowerCase() === String(username).toLowerCase();
          return (
            matchesUserId ||
            matchesUsername ||
            (latestPublicAddress && sw.publicAddress === latestPublicAddress)
          );
        });
        if (!entries.length) return false;
        for (const sw of entries) {
          if (sw.publicAddress) {
            if (!latestPublicAddress) return false;
            if (sw.publicAddress !== latestPublicAddress) return false;
          }
        }
        return true;
      });

      // Sort the filtered results by creation date (newest first)
      filteredSharedPasswords.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Apply pagination to the filtered results
      const totalCount = filteredSharedPasswords.length;
      const sharedPasswords = filteredSharedPasswords.slice(skip, skip + limit);

      // If no results found and no search criteria available, return empty result
      if (totalCount === 0 && !username && !publicAddress) {
        return {
          data: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalCount: 0,
            hasNextPage: false,
            hasPreviousPage: page > 1,
            limit,
          },
        };
      }

      // Get all secret owners using UserFinderUtil for complete information
      const secretOwnerIds = [
        ...new Set(
          sharedPasswords
            .map((p) => (p.userId ? String(p.userId) : ''))
            .filter((id) => id),
        ),
      ];

      // Use UserFinderUtil to get complete owner information
      const ownerInfoMap = new Map();
      await Promise.all(
        secretOwnerIds.map(async (ownerId) => {
          try {
            const ownerInfo = await UserFinderUtil.findUserByAnyInfo(
              { userId: ownerId },
              this.userModel,
              this.publicAddressModel,
            );
            if (ownerInfo) {
              ownerInfoMap.set(ownerId, ownerInfo);
            }
          } catch (error) {
            console.log(
              `Error finding owner info for userId ${ownerId}:`,
              error,
            );
            // Set default values if user not found
            ownerInfoMap.set(ownerId, {
              user: null,
              publicAddress: null,
            });
          }
        }),
      );

      // Transform the data similar to getSharedWithMe method
      const transformedData = await Promise.all(
        sharedPasswords
          .filter((password) => password.userId) // Filter out passwords without userId
          .map(async (password) => {
            const passwordUserId = password.userId
              ? String(password.userId)
              : '';

            // Get owner information from the map
            const ownerInfo = ownerInfoMap.get(passwordUserId);
            const owner = ownerInfo?.user;
            const ownerLatestPublicAddress = ownerInfo?.publicAddress;

            // Use owner information or fallback to password initData
            const ownerUsername =
              owner?.username || password.initData?.username || 'Unknown';
            const ownerTelegramId = owner?.telegramId || null;
            const ownerPrivacyMode = owner?.privacyMode || false;
            const isOwner = currentUserTelegramId === ownerTelegramId;

            // Fetch unresolved reports for this password
            const reports = await this.reportModel
              .find({
                $or: [
                  { secret_id: password._id },
                  { secret_id: password._id.toString() },
                ],
                resolved: false,
              })
              .exec();

            const baseData = {
              _id: password._id,
              key: password.key,
              value: password.value,
              description: password.description,
              sharedBy: {
                userId: passwordUserId,
                username: ownerUsername,
                telegramId: ownerTelegramId,
                PublicAddress: ownerLatestPublicAddress || null,
              },
              sharedWith: password.sharedWith || [], // Include sharedWith field in response
              reports: reports, // Include complete reports data as stored in MongoDB
              updatedAt: password.updatedAt,
            };

            const result: any = { ...baseData };

            // If current user has privacy mode enabled, don't include createdAt and view info
            if (currentUserPrivacyMode) {
              return result;
            }

            // If current user has privacy mode disabled, check owner's privacy mode for each secret
            if (!ownerPrivacyMode || isOwner) {
              // Fetch additional data from database
              const fullPassword = await this.passwordModel
                .findById(password._id)
                .select('createdAt secretViews')
                .lean()
                .exec();

              if (fullPassword) {
                result.createdAt = fullPassword.createdAt;
                result.viewsCount = (fullPassword.secretViews || []).length;
                result.secretViews = fullPassword.secretViews || [];
              }
            }

            return result;
          }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        data: transformedData,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
          limit,
        },
      };
    } catch (error) {
      console.log('error', error);
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }
}
