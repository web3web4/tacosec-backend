import {
  Injectable,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Password, PasswordDocument } from './schemas/password.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Report, ReportDocument } from '../reports/schemas/report.schema';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../public-addresses/schemas/public-address.schema';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { PublicAddressesService } from '../public-addresses/public-addresses.service';
import { LoggerService } from '../logger/logger.service';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';
import { SharedWithDto } from './dto/shared-with.dto';
import { PaginatedResponse } from './dto/pagination.dto';
import { AdminSecretsFilterDto } from './dto/admin-secrets-filter.dto';
import { SharedWithMeResponse } from '../types/share-with-me-pass.types';
import { passwordReturns } from '../types/password-returns.types';
import { LogEvent } from '../logger/dto/log-event.enum';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

// Sub-services
import { PasswordCrudService } from './services/password-crud.service';
import { PasswordQueryService } from './services/password-query.service';
import { PasswordSharingService } from './services/password-sharing.service';
import { PasswordNotificationService } from './services/password-notification.service';
import { PasswordViewsService } from './services/password-views.service';

/**
 * Password Service Facade
 *
 * This is a facade that delegates to specialized sub-services while maintaining
 * backward compatibility with the original PasswordService interface.
 *
 * Sub-services:
 * - PasswordCrudService: Basic CRUD operations
 * - PasswordQueryService: Complex queries and pagination
 * - PasswordSharingService: Sharing logic and validation
 * - PasswordNotificationService: Telegram and fallback notifications
 * - PasswordViewsService: Secret view recording and statistics
 */
@Injectable()
export class PasswordServiceFacade {
  constructor(
    // Models for direct access when needed
    @InjectModel(Password.name)
    private readonly passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(PublicAddress.name)
    publicAddressModel: Model<PublicAddressDocument>,

    // Sub-services
    private readonly crudService: PasswordCrudService,
    private readonly queryService: PasswordQueryService,
    private readonly sharingService: PasswordSharingService,
    private readonly notificationService: PasswordNotificationService,
    private readonly viewsService: PasswordViewsService,

    // Additional dependencies
    telegramService: TelegramService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
    private readonly publicAddressesService: PublicAddressesService,
    @Inject(forwardRef(() => LoggerService))
    private readonly loggerService: LoggerService,
  ) {
    // Dependencies injected but not directly used are kept for DI container
    void publicAddressModel;
    void telegramService;
  }

  // ============================================
  // Auth Data Extraction (delegated to base)
  // ============================================

  async extractUserAuthData(req: AuthenticatedRequest) {
    return this.crudService.extractUserAuthData(req);
  }

  extractUserIdFromRequest(req: AuthenticatedRequest): string {
    return this.crudService.extractUserIdFromRequest(req);
  }

  extractTelegramIdFromRequest(req: AuthenticatedRequest): string {
    return this.crudService.extractTelegramIdFromRequest(req);
  }

  extractUsernameFromRequest(req: AuthenticatedRequest): string {
    return this.crudService.extractUsernameFromRequest(req);
  }

  // ============================================
  // CRUD Operations (delegated to CrudService)
  // ============================================

  async findOne(filter: Partial<Password>): Promise<Password | null> {
    return this.crudService.findOne(filter);
  }

  async findById(id: string): Promise<Password | null> {
    return this.crudService.findById(id);
  }

  async findByUserObjectId(userId: Types.ObjectId): Promise<Password[]> {
    return this.crudService.findByUserObjectId(userId);
  }

  async findOneAndUpdate(
    filter: Partial<Password>,
    update: Partial<Password>,
  ): Promise<Password | null> {
    return this.crudService.findOneAndUpdate(filter, update);
  }

  async findByIdAndUpdate(
    id: string,
    update: Partial<Password>,
  ): Promise<Password | null> {
    const updated = await this.crudService.findByIdAndUpdate(id, update);
    if (updated) {
      await this.notificationService.sendMessageToUsersBySharedWith(updated);
    }
    return updated;
  }

  async findOneAndDelete(filter: Partial<Password>): Promise<Password | null> {
    return this.crudService.findOneAndDelete(filter);
  }

  async findByIdAndDelete(id: string): Promise<Password | null> {
    return this.crudService.findByIdAndDelete(id);
  }

  async update(
    id: string,
    updatePasswordDto: Partial<Password>,
  ): Promise<Password | null> {
    return this.crudService.update(id, updatePasswordDto);
  }

  async delete(id: string): Promise<Password | null> {
    return this.crudService.delete(id);
  }

  async createOrUpdatePassword(
    passwordData: Partial<Password>,
  ): Promise<Password> {
    const password =
      await this.crudService.createOrUpdatePassword(passwordData);
    if (password) {
      await this.notificationService.sendMessageToUsersBySharedWith(password);
    }
    return password;
  }

  async deletePasswordByOwner(
    id: string,
    telegramId: string,
  ): Promise<Password | null> {
    return this.crudService.deletePasswordByOwner(id, telegramId);
  }

  async deletePasswordByUserId(
    id: string,
    userId: string,
  ): Promise<Password | null> {
    return this.crudService.deletePasswordByUserId(id, userId);
  }

  async hidePassword(id: string, telegramId: string): Promise<Password | null> {
    return this.crudService.hidePassword(id, telegramId);
  }

  async hidePasswordByUserId(
    id: string,
    userId: string,
  ): Promise<Password | null> {
    return this.crudService.hidePasswordByUserId(id, userId);
  }

  async verifyPassword(
    hashedPassword: string,
    plainPassword: string,
  ): Promise<boolean> {
    return this.crudService.verifyPassword(hashedPassword, plainPassword);
  }

  // ============================================
  // Query Operations (delegated to QueryService)
  // ============================================

  async findByUserId(userId: string): Promise<passwordReturns[]> {
    return this.queryService.findByUserId(userId);
  }

  async findByUserIdWithPagination(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResponse<passwordReturns>> {
    return this.queryService.findByUserIdWithPagination(userId, page, limit);
  }

  async findByUserTelegramId(telegramId: string): Promise<passwordReturns[]> {
    return this.queryService.findByUserTelegramId(telegramId);
  }

  async findByUserTelegramIdWithPagination(
    telegramId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResponse<passwordReturns>> {
    return this.queryService.findByUserTelegramIdWithPagination(
      telegramId,
      page,
      limit,
    );
  }

  async findByPublicAddressWithPagination(
    publicAddress: string,
    page?: number,
    limit?: number,
  ): Promise<passwordReturns[] | PaginatedResponse<passwordReturns>> {
    return this.queryService.findByPublicAddressWithPagination(
      publicAddress,
      page,
      limit,
    );
  }

  async getChildPasswords(
    parentId: string,
    telegramId: string,
    page?: number,
    limit?: number,
    currentUserPrivacyMode?: boolean,
  ) {
    return this.queryService.getChildPasswords(
      parentId,
      telegramId,
      page,
      limit,
      currentUserPrivacyMode,
    );
  }

  async getChildPasswordsByUserId(
    parentId: string,
    userId: string,
    page?: number,
    limit?: number,
    currentUserPrivacyMode?: boolean,
  ) {
    return this.queryService.getChildPasswordsByUserId(
      parentId,
      userId,
      page,
      limit,
      currentUserPrivacyMode,
    );
  }

  // ============================================
  // Sharing Operations (delegated to SharingService)
  // ============================================

  async findSharedWithByTelegramId(
    telegramId: string,
    key: string,
  ): Promise<SharedWithDto[] | null> {
    return this.sharingService.findSharedWithByTelegramId(telegramId, key);
  }

  async findSharedWithByUserId(
    userId: string,
    key: string,
  ): Promise<SharedWithDto[] | null> {
    return this.sharingService.findSharedWithByUserId(userId, key);
  }

  async findPasswordsSharedWithMe(
    username: string,
    userId?: string,
    currentUserTelegramId?: string,
    currentUserPrivacyMode?: boolean,
    publicAddress?: string,
  ): Promise<SharedWithMeResponse> {
    return this.sharingService.findPasswordsSharedWithMe(
      username,
      userId,
      currentUserTelegramId,
      currentUserPrivacyMode,
      publicAddress,
    );
  }

  async getSharedWithMe(
    username: string,
    userId?: string,
    currentUserTelegramId?: string,
    currentUserPrivacyMode?: boolean,
    publicAddress?: string,
  ): Promise<SharedWithMeResponse> {
    return this.sharingService.getSharedWithMe(
      username,
      userId,
      currentUserTelegramId,
      currentUserPrivacyMode,
      publicAddress,
    );
  }

  // ============================================
  // Notification Operations (delegated to NotificationService)
  // ============================================

  async sendMessageToUsersBySharedWith(passwordUser: Password): Promise<void> {
    return this.notificationService.sendMessageToUsersBySharedWith(
      passwordUser,
    );
  }

  // ============================================
  // Complex Operations (require multiple services)
  // ============================================

  /**
   * Add a new password with full validation and notifications
   */
  async addPassword(
    passwordData: CreatePasswordRequestDto,
    req?: AuthenticatedRequest,
  ) {
    try {
      let user: UserDocument | null = null;
      let initData: any;
      let latestPublicAddress: string | null = null;

      // Priority 1: JWT token authentication
      if (req?.user?.id) {
        user = await this.userModel
          .findOne({ _id: req.user.id, isActive: true })
          .exec();

        if (!user) {
          throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        initData = {
          telegramId: req.user.telegramId || '',
          username: req.user.username || user.username || '',
          firstName: req.user.firstName || user.firstName || '',
          lastName: req.user.lastName || user.lastName || '',
          authDate: Math.floor(Date.now() / 1000),
        };
      }
      // Priority 2: Telegram authentication
      else {
        const telegramInitData = req?.headers?.[
          'x-telegram-init-data'
        ] as string;
        if (!telegramInitData && !passwordData.initData) {
          throw new HttpException(
            'No Telegram authentication data provided',
            HttpStatus.BAD_REQUEST,
          );
        }

        const parsedData =
          passwordData.initData ||
          this.telegramDtoAuthGuard.parseTelegramInitData(telegramInitData);

        user = await this.userModel
          .findOne({ telegramId: parsedData.telegramId, isActive: true })
          .exec();

        if (!user) {
          throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        initData = parsedData;

        // Get latest publicAddress for Telegram auth
        try {
          const addressResponse =
            await this.publicAddressesService.getLatestAddressByTelegramId(
              parsedData.telegramId,
            );
          if (addressResponse.success && addressResponse.data) {
            latestPublicAddress = addressResponse.data.publicKey;
          }
        } catch {
          latestPublicAddress = null;
        }
      }

      // Process sharedWith array
      let processedSharedWith = passwordData.sharedWith || [];
      if (processedSharedWith.length > 0) {
        processedSharedWith =
          await this.sharingService.expandSharedWith(processedSharedWith);

        // Get creator info for filtering
        const creatorUsername = (user.username || '').toLowerCase();
        const creatorUserId = String(user._id);
        const creatorPublicAddress =
          req?.user?.publicAddress || latestPublicAddress;

        processedSharedWith = this.sharingService.filterSelfSharing(
          processedSharedWith,
          creatorUsername,
          creatorUserId,
          creatorPublicAddress || undefined,
        );

        // Validate sharing restrictions
        if (user.sharingRestricted && processedSharedWith.length > 0) {
          await this.sharingService.validateSharingRestrictions(
            user,
            processedSharedWith,
          );
        }
      }

      // Validate parent_secret_id if provided
      let parentSecretId: Types.ObjectId | undefined;
      if (passwordData.parent_secret_id) {
        const parentSecret = await this.passwordModel
          .findById(passwordData.parent_secret_id)
          .exec();

        if (!parentSecret) {
          throw new HttpException(
            'Parent secret not found',
            HttpStatus.NOT_FOUND,
          );
        }

        if (parentSecret.parent_secret_id) {
          throw new HttpException(
            'Parent secret cannot be a child secret itself',
            HttpStatus.BAD_REQUEST,
          );
        }

        parentSecretId = new Types.ObjectId(passwordData.parent_secret_id);
      }

      // Get valid auth date
      const authDate = this.crudService.getValidAuthDate(initData.authDate);

      // Create password
      const password = await this.crudService.createOrUpdatePassword({
        userId: user._id as Types.ObjectId,
        key: passwordData.key,
        value: passwordData.value,
        description: passwordData.description,
        isActive: true,
        type: passwordData.type,
        sharedWith: processedSharedWith,
        hidden: false,
        parent_secret_id: parentSecretId,
        initData: { ...initData, authDate },
        publicAddress: req?.user?.publicAddress || latestPublicAddress || '',
      });

      const passwordObj = (password as PasswordDocument).toObject();
      const { userId: _, ...passwordWithId } = passwordObj;

      console.log('[FACADE addPassword] Password created:', {
        _id: passwordObj._id,
        hasParentSecret: !!passwordData.parent_secret_id,
        sharedWithCount: processedSharedWith.length,
      });

      // Send notifications for child password
      if (passwordData.parent_secret_id) {
        console.log('[FACADE addPassword] Sending child password notifications');
        await this.notificationService.sendChildPasswordNotificationToParentOwner(
          passwordData.parent_secret_id,
          user,
          passwordData.key,
          String(passwordObj._id),
        );

        await this.notificationService.sendChildPasswordNotificationToSharedUsers(
          passwordData.parent_secret_id,
          user,
          passwordData.key,
          String(passwordObj._id),
        );
      }

      // Send notifications to shared users (if not a child password)
      if (!passwordData.parent_secret_id && processedSharedWith.length > 0) {
        console.log('[FACADE addPassword] Sending shared notifications to', processedSharedWith.length, 'users');
        await this.notificationService.sendMessageToUsersBySharedWith(
          password as PasswordDocument,
        );
      } else if (!passwordData.parent_secret_id) {
        console.log('[FACADE addPassword] No sharedWith users, skipping notifications');
      }

      return passwordWithId;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Update password with authentication
   */
  async updatePasswordWithAuth(
    id: string,
    update: Partial<Password>,
    req?: AuthenticatedRequest,
  ): Promise<Password | null> {
    const password = await this.passwordModel.findById(id).exec();
    if (!password) {
      throw new HttpException('Password not found', HttpStatus.NOT_FOUND);
    }

    let user: UserDocument | null = null;
    let initData: any;

    // Priority 1: JWT token
    if (req?.user?.id) {
      user = await this.userModel
        .findOne({ _id: req.user.id, isActive: true })
        .exec();

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      if (String(password.userId) !== String(user._id)) {
        throw new HttpException(
          'You are not authorized to update this password',
          HttpStatus.FORBIDDEN,
        );
      }

      initData = {
        telegramId: req.user.telegramId || '',
        username: req.user.username || user.username || '',
        firstName: req.user.firstName || user.firstName || '',
        lastName: req.user.lastName || user.lastName || '',
        authDate: Math.floor(Date.now() / 1000),
      };
    }
    // Priority 2: Telegram
    else {
      if (!req?.headers?.['x-telegram-init-data']) {
        throw new HttpException(
          'No authentication data provided',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);

      user = await this.userModel
        .findOne({ telegramId: parsedData.telegramId, isActive: true })
        .exec();

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      initData = parsedData;
    }

    // Process sharedWith
    const processedUpdate = { ...update };
    if (update.sharedWith && update.sharedWith.length > 0) {
      let expanded = await this.sharingService.expandSharedWith(
        update.sharedWith,
      );

      const creatorUsername = (user.username || '').toLowerCase();
      const creatorUserId = String(user._id);
      let creatorPublicAddress: string | undefined;
      try {
        const resp =
          await this.publicAddressesService.getLatestAddressByUserId(
            creatorUserId,
          );
        creatorPublicAddress = resp?.data?.publicKey;
      } catch {}

      expanded = this.sharingService.filterSelfSharing(
        expanded,
        creatorUsername,
        creatorUserId,
        creatorPublicAddress,
      );

      processedUpdate.sharedWith = expanded;

      if (user.sharingRestricted) {
        await this.sharingService.validateSharingRestrictions(user, expanded);
      }
    }

    // Maintain hidden field
    if (processedUpdate.hidden === undefined) {
      processedUpdate.hidden = password.hidden || false;
    }

    // Update initData
    const authDate = this.crudService.getValidAuthDate(initData.authDate);
    processedUpdate.initData = { ...initData, authDate };

    const updatedPassword = await this.passwordModel
      .findByIdAndUpdate(id, processedUpdate, { new: true })
      .exec();

    if (updatedPassword) {
      await this.notificationService.sendMessageToUsersBySharedWith(
        updatedPassword,
      );

      // Log update
      try {
        await this.loggerService.saveSystemLog(
          {
            event: LogEvent.SecretUpdated,
            message: 'Secret updated',
            key: updatedPassword.key,
            type: updatedPassword.type,
            secretId: String(updatedPassword._id),
            sharedRecipientsCount: Array.isArray(updatedPassword.sharedWith)
              ? updatedPassword.sharedWith.length
              : 0,
          },
          {
            userId: updatedPassword.userId
              ? String(updatedPassword.userId)
              : undefined,
          },
        );
      } catch (e) {
        console.error('Failed to log secret update', e);
      }
    }

    return updatedPassword;
  }

  /**
   * Get user passwords with authentication logic
   * Handles both JWT and Telegram authentication with optional pagination
   * Delegates to PasswordQueryService
   */
  async getUserPasswordsWithAuth(
    req: AuthenticatedRequest,
    page?: number,
    limit?: number,
  ): Promise<passwordReturns[] | PaginatedResponse<passwordReturns>> {
    return this.queryService.getUserPasswordsWithAuth(req, page, limit);
  }

  /**
   * Get shared-with data with authentication logic
   * Delegates to PasswordSharingService
   */
  async getSharedWithByAuth(
    req: AuthenticatedRequest,
    key: string,
    page?: number,
    limit?: number,
  ): Promise<SharedWithDto[] | PaginatedResponse<SharedWithDto>> {
    return this.sharingService.getSharedWithByAuth(req, key, page, limit);
  }

  /**
   * Get child passwords with authentication
   * Delegates to PasswordQueryService
   */
  async getChildPasswordsWithAuth(
    req: AuthenticatedRequest,
    parentId: string,
    page?: number,
    limit?: number,
  ) {
    return this.queryService.getChildPasswordsWithAuth(req, parentId, page, limit);
  }

  /**
   * Delete password by owner with authentication
   * Delegates to PasswordCrudService
   */
  async deletePasswordByOwnerWithAuth(
    req: AuthenticatedRequest,
    id: string,
  ): Promise<Password | null> {
    return this.crudService.deletePasswordByOwnerWithAuth(req, id);
  }

  /**
   * Hide password with authentication
   * Delegates to PasswordCrudService
   */
  async hidePasswordWithAuth(
    req: AuthenticatedRequest,
    id: string,
  ): Promise<Password | null> {
    return this.crudService.hidePasswordWithAuth(req, id);
  }

  /**
   * Find passwords shared with me with pagination support
   * Delegates to PasswordSharingService
   */
  async findPasswordsSharedWithMeWithPagination(
    req: AuthenticatedRequest,
    page?: number,
    limit?: number,
  ): Promise<SharedWithMeResponse | PaginatedResponse<any>> {
    return this.sharingService.findPasswordsSharedWithMeWithPagination(req, page, limit);
  }

  /**
   * Record a secret view
   * Delegates to PasswordViewsService
   */
  async recordSecretView(
    secretId: string,
    telegramId: string,
    username?: string,
    userId?: string,
    publicAddress?: string,
  ): Promise<Password | {}> {
    return this.viewsService.recordSecretView(
      secretId,
      telegramId,
      username,
      userId,
      publicAddress,
    );
  }

  /**
   * Get secret view statistics with deduplication
   * Delegates to PasswordViewsService
   */
  async getSecretViewStats(
    secretId: string,
    userId: string,
    telegramId: string,
    username: string,
    publicAddress?: string,
  ): Promise<{
    totalViews: number;
    uniqueViewers: number;
    totalSharedUsers: number;
    viewDetails: Array<{
      telegramId: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      userId?: string;
      publicAddress?: string;
      viewedAt: Date;
    }>;
    notViewedUsers: Array<{
      username?: string;
      firstName?: string;
      lastName?: string;
      telegramId?: string;
    }>;
    notViewedUsersCount: number;
    unknownUsers: Array<{ username?: string }>;
    unknownCount: number;
    requestingUserInfo: {
      userId: string;
      telegramId: string;
      username: string;
      publicAddress?: string;
      hasViewedSecret: boolean;
      isOwner: boolean;
    };
  }> {
    return this.viewsService.getSecretViewStats(
      secretId,
      userId,
      telegramId,
      username,
      publicAddress,
    );
  }

  /**
   * Get all secrets for admin with filters
   * Delegates to PasswordQueryService
   */
  async getAllSecretsForAdmin(filters: AdminSecretsFilterDto): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.queryService.getAllSecretsForAdmin(filters);
  }

  // ===== SHARING PAGINATION METHODS =====

  /**
   * Get sharedWith for a key by TelegramId with optional pagination
   */
  async findSharedWithByTelegramIdWithPagination(
    telegramId: string,
    key: string,
    page?: number,
    limit?: number,
  ): Promise<SharedWithDto[] | PaginatedResponse<SharedWithDto>> {
    return this.sharingService.findSharedWithByTelegramIdWithPagination(
      telegramId,
      key,
      page,
      limit,
    );
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
    return this.sharingService.findSharedWithByUserIdWithPagination(
      userId,
      key,
      page,
      limit,
    );
  }
}
