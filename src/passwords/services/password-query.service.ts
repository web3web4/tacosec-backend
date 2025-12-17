import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Password, PasswordDocument } from '../schemas/password.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Report, ReportDocument } from '../../reports/schemas/report.schema';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../../public-addresses/schemas/public-address.schema';
import { TelegramDtoAuthGuard } from '../../guards/telegram-dto-auth.guard';
import { PublicAddressesService } from '../../public-addresses/public-addresses.service';
import {
  passwordReturns,
  PasswordReportInfo,
} from '../../types/password-returns.types';
import { PaginatedResponse } from '../dto/pagination.dto';
import { AdminSecretsFilterDto } from '../dto/admin-secrets-filter.dto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { PasswordBaseService } from './password-base.service';

/**
 * Password Query Service
 * Handles complex queries and pagination for passwords
 */
@Injectable()
export class PasswordQueryService extends PasswordBaseService {
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
   * Base query for active parent passwords
   */
  private getBasePasswordQuery(
    additionalFilters: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      isActive: true,
      $and: [
        { $or: [{ hidden: false }, { hidden: { $exists: false } }] },
        {
          $or: [
            { parent_secret_id: { $exists: false } },
            { parent_secret_id: null },
          ],
        },
      ],
      ...additionalFilters,
    };
  }

  /**
   * Standard password select fields
   */
  private readonly selectFields =
    'key value description updatedAt createdAt sharedWith type hidden publicAddress secretViews';

  /**
   * Transform password with reports
   */
  private async transformPasswordWithReports(
    password: PasswordDocument,
    includeReportDetails = false,
  ): Promise<passwordReturns> {
    const reports = await this.reportModel
      .find({
        $or: [
          { secret_id: password._id },
          { secret_id: (password._id as Types.ObjectId).toString() },
        ],
        resolved: false,
      })
      .exec();

    let reportInfo: PasswordReportInfo[] | typeof reports = reports;

    if (includeReportDetails) {
      reportInfo = await Promise.all(
        reports.map(async (report) => {
          const reporter = await this.userModel
            .findOne({ telegramId: report.reporterTelegramId })
            .select('username')
            .exec();

          return {
            reporterUsername: reporter ? reporter.username : 'Unknown',
            report_type: report.report_type,
            reason: report.reason,
            createdAt: report.createdAt,
          };
        }),
      );
    }

    const secretViews = password.secretViews || [];

    return {
      _id: password._id,
      key: password.key,
      value: password.value,
      description: password.description,
      type: password.type,
      sharedWith: password.sharedWith,
      updatedAt: password.updatedAt,
      createdAt: password.createdAt,
      hidden: password.hidden || false,
      publicAddress: password.publicAddress,
      reports: reportInfo,
      viewsCount: secretViews.length,
      secretViews,
    };
  }

  /**
   * Find passwords by user ID
   */
  async findByUserId(userId: string): Promise<passwordReturns[]> {
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

      const passwords = await this.passwordModel
        .find(this.getBasePasswordQuery({ userId: user._id }))
        .select(this.selectFields)
        .sort({ createdAt: -1 })
        .exec();

      return Promise.all(
        passwords.map((password) =>
          this.transformPasswordWithReports(password),
        ),
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Find passwords by user ID with pagination
   */
  async findByUserIdWithPagination(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<passwordReturns>> {
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

      const skip = (page - 1) * limit;
      const baseQuery = this.getBasePasswordQuery({ userId: user._id });

      const [totalCount, passwords] = await Promise.all([
        this.passwordModel.countDocuments(baseQuery).exec(),
        this.passwordModel
          .find(baseQuery)
          .select(this.selectFields)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
      ]);

      const transformedPasswords = await Promise.all(
        passwords.map((password) =>
          this.transformPasswordWithReports(password),
        ),
      );

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: transformedPasswords,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          limit,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Find passwords by Telegram ID
   */
  async findByUserTelegramId(telegramId: string): Promise<passwordReturns[]> {
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

      const passwords = await this.passwordModel
        .find(this.getBasePasswordQuery({ userId: user._id }))
        .select(this.selectFields)
        .sort({ createdAt: -1 })
        .exec();

      return Promise.all(
        passwords.map((password) =>
          this.transformPasswordWithReports(password),
        ),
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Find passwords by Telegram ID with pagination
   */
  async findByUserTelegramIdWithPagination(
    telegramId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<passwordReturns>> {
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

      const skip = (page - 1) * limit;
      const baseQuery = this.getBasePasswordQuery({ userId: user._id });

      const [totalCount, passwords] = await Promise.all([
        this.passwordModel.countDocuments(baseQuery).exec(),
        this.passwordModel
          .find(baseQuery)
          .select(this.selectFields)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
      ]);

      const transformedPasswords = await Promise.all(
        passwords.map((password) =>
          this.transformPasswordWithReports(password),
        ),
      );

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: transformedPasswords,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          limit,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Find passwords by public address with optional pagination
   */
  async findByPublicAddressWithPagination(
    publicAddress: string,
    page?: number,
    limit?: number,
  ): Promise<passwordReturns[] | PaginatedResponse<passwordReturns>> {
    try {
      if (!publicAddress) {
        throw new Error('Public address is required');
      }

      const baseQuery = this.getBasePasswordQuery({ publicAddress });

      // Return simple array if no pagination
      if (
        page === undefined ||
        limit === undefined ||
        isNaN(page) ||
        isNaN(limit) ||
        page <= 0 ||
        limit <= 0
      ) {
        const passwords = await this.passwordModel
          .find(baseQuery)
          .select(this.selectFields)
          .sort({ createdAt: -1 })
          .exec();

        return Promise.all(
          passwords.map((password) =>
            this.transformPasswordWithReports(password, true),
          ),
        );
      }

      // Return paginated response
      const skip = (page - 1) * limit;

      const [totalCount, passwords] = await Promise.all([
        this.passwordModel.countDocuments(baseQuery).exec(),
        this.passwordModel
          .find(baseQuery)
          .select(this.selectFields)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
      ]);

      const transformedPasswords = await Promise.all(
        passwords.map((password) =>
          this.transformPasswordWithReports(password, true),
        ),
      );

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: transformedPasswords,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          limit,
        },
      };
    } catch (error) {
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get child passwords for a parent password
   */
  async getChildPasswords(
    parentId: string,
    telegramId: string,
    page: number = 1,
    limit: number = 10,
    currentUserPrivacyMode: boolean = false,
  ): Promise<{
    passwords: passwordReturns[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    try {
      const parentPassword = await this.passwordModel.findById(parentId).exec();

      if (!parentPassword) {
        throw new HttpException(
          'Parent secret not found',
          HttpStatus.NOT_FOUND,
        );
      }

      if (parentPassword.parent_secret_id) {
        throw new HttpException(
          'This secret is not a parent secret',
          HttpStatus.BAD_REQUEST,
        );
      }

      const user = await this.verifyUserExists({ telegramId });
      const userId = user._id ? String(user._id) : '';

      // Check access
      const isOwner = parentPassword.userId.equals(new Types.ObjectId(userId));
      const hasAccess = parentPassword.sharedWith?.some(
        (shared) => shared.username === user.username,
      );
      const ownsChildPassword = await this.passwordModel.exists({
        parent_secret_id: new Types.ObjectId(parentId),
        userId: new Types.ObjectId(userId),
        isActive: true,
      });

      if (!isOwner && !hasAccess && !ownsChildPassword) {
        throw new HttpException(
          'You are not authorized to view child secrets for this parent secret',
          HttpStatus.FORBIDDEN,
        );
      }

      const skip = (page - 1) * limit;
      const baseQuery = {
        parent_secret_id: new Types.ObjectId(parentId),
        isActive: true,
        $or: [{ hidden: false }, { hidden: { $exists: false } }],
      };

      const [totalCount, childPasswords] = await Promise.all([
        this.passwordModel.countDocuments(baseQuery).exec(),
        this.passwordModel
          .find(baseQuery)
          .select(
            'key value description updatedAt createdAt sharedWith type hidden initData userId secretViews',
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
      ]);

      const transformedPasswords = await Promise.all(
        childPasswords.map((password) =>
          this.transformPasswordWithReports(password),
        ),
      );

      const sanitizedPasswords = currentUserPrivacyMode
        ? transformedPasswords.map((password) => {
            const sanitized: any = { ...password };
            delete sanitized.createdAt;
            delete sanitized.viewsCount;
            delete sanitized.secretViews;
            return sanitized;
          })
        : transformedPasswords;

      const totalPages = Math.ceil(totalCount / limit);

      return {
        passwords: sanitizedPasswords,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get child passwords by userId with full owner info and privacy logic
   * @param parentId The parent password ID
   * @param userId The user ID of the requesting user
   * @param page Page number for pagination
   * @param limit Number of items per page
   * @param currentUserPrivacyMode Whether the current user has privacy mode enabled
   * @returns Child passwords with pagination
   */
  async getChildPasswordsByUserId(
    parentId: string,
    userId: string,
    page: number = 1,
    limit: number = 10,
    currentUserPrivacyMode: boolean = false,
  ): Promise<{
    passwords: passwordReturns[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    try {
      // Find the parent password by ID
      const parentPassword = await this.passwordModel.findById(parentId).exec();

      // Check if parent password exists
      if (!parentPassword) {
        throw new HttpException(
          'Parent secret not found',
          HttpStatus.NOT_FOUND,
        );
      }

      // Check if parent password is actually a parent (no parent_secret_id)
      if (parentPassword.parent_secret_id) {
        throw new HttpException(
          'This secret is not a parent secret',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Verify user exists and is active
      const user = await this.userModel
        .findOne({ _id: userId, isActive: true })
        .exec();

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Check if the authenticated user is the owner of the parent password OR has access to it OR owns any child password
      const isOwner = parentPassword.userId.equals(
        new Types.ObjectId(user._id ? String(user._id) : ''),
      );
      const hasAccess =
        parentPassword.sharedWith &&
        parentPassword.sharedWith.some(
          (shared) => shared.username === user.username,
        );

      // Check if user owns any child password
      const ownsChildPassword = await this.passwordModel.exists({
        parent_secret_id: new Types.ObjectId(parentId),
        userId: new Types.ObjectId(user._id ? String(user._id) : ''),
        isActive: true,
      });

      if (!isOwner && !hasAccess && !ownsChildPassword) {
        throw new HttpException(
          'You are not authorized to view child secrets for this parent secret',
          HttpStatus.FORBIDDEN,
        );
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Define the base query - return all child passwords regardless of ownership
      const baseQuery = {
        parent_secret_id: new Types.ObjectId(parentId),
        isActive: true,
        $or: [{ hidden: false }, { hidden: { $exists: false } }],
      };

      // Get total count for pagination
      const totalCount = await this.passwordModel
        .countDocuments(baseQuery)
        .exec();

      // Find child passwords with pagination
      const childPasswords = await this.passwordModel
        .find(baseQuery)
        .select(
          'key value description updatedAt createdAt sharedWith type hidden initData userId secretViews',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // If no child passwords found, throw NOT_FOUND
      if (totalCount === 0) {
        throw new HttpException('There are no children', HttpStatus.NOT_FOUND);
      }

      // Get unique user IDs from child passwords
      const userIds = [
        ...new Set(
          childPasswords
            .map((password) => (password.userId ? String(password.userId) : ''))
            .filter((id) => id),
        ),
      ];

      // Fetch privacy modes and user info for all owners
      const ownerPrivacyMap = new Map<string, boolean>();
      const ownerInfoMap = new Map<
        string,
        {
          id: string;
          telegramId?: string;
          firstName?: string;
          lastName?: string;
          publicAddress?: string;
        }
      >();
      const owners = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('_id privacyMode telegramId firstName lastName')
        .exec();

      // Get latest public addresses for all owners
      for (const owner of owners) {
        const ownerId = owner._id ? String(owner._id) : '';
        ownerPrivacyMap.set(ownerId, owner.privacyMode || false);

        let publicAddress: string | undefined;

        // Try to get latest public address by telegramId first
        if (owner.telegramId) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                owner.telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              publicAddress = addressResponse.data.publicKey;
            }
          } catch {
            // If no address found by telegramId, try by userId
          }
        }

        // If no address found by telegramId or user has no telegramId, try by userId
        if (!publicAddress) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByUserId(
                ownerId,
              );
            if (addressResponse.success && addressResponse.data) {
              publicAddress = addressResponse.data.publicKey;
            }
          } catch {
            // If no address found, latestPublicAddress remains undefined
          }
        }

        ownerInfoMap.set(ownerId, {
          id: ownerId,
          telegramId: owner.telegramId,
          firstName: owner.firstName,
          lastName: owner.lastName,
          publicAddress,
        });
      }

      // Transform child passwords to match passwordReturns format
      const passwordWithReports = await Promise.all(
        childPasswords.map(async (password) => {
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

          // Transform reports to include reporter username
          const reportInfo: PasswordReportInfo[] = await Promise.all(
            reports.map(async (report) => {
              const reporter = await this.userModel
                .findOne({ telegramId: report.reporterTelegramId })
                .select('username')
                .exec();

              return {
                reporterUsername: reporter ? reporter.username : 'Unknown',
                report_type: report.report_type,
                reason: report.reason,
                createdAt: report.createdAt,
              };
            }),
          );

          // Get owner privacy mode and check if current user is owner
          const passwordUserId = password.userId ? String(password.userId) : '';
          const ownerPrivacyMode = ownerPrivacyMap.get(passwordUserId) || false;
          const isCurrentUserOwner = passwordUserId === userId;

          // Get owner info for firstName and lastName
          const ownerInfo = ownerInfoMap.get(passwordUserId) || {
            id: passwordUserId,
            telegramId: undefined,
            firstName: undefined,
            lastName: undefined,
            publicAddress: undefined,
          };

          // Base password data
          const passwordData: any = {
            _id: password._id,
            key: password.key,
            value: password.value,
            description: password.description,
            type: password.type,
            sharedWith: password.sharedWith,
            username: password.initData?.username || 'Unknown', // Include username of password owner
            ownerId: ownerInfo.id, // Add owner ID
            ownerTelegramId: ownerInfo.telegramId, // Add owner Telegram ID
            firstName: ownerInfo.firstName,
            lastName: ownerInfo.lastName,
            publicAddress: ownerInfo.publicAddress, // Add latest public address
            updatedAt: password.updatedAt,
            hidden: password.hidden || false,
            reports: reportInfo,
          };

          // Apply privacy logic: if current user has privacy mode enabled, don't include createdAt and view info
          // Otherwise, check each secret individually based on owner's privacy mode
          if (!currentUserPrivacyMode) {
            // If owner doesn't have privacy mode enabled OR current user is the owner, include createdAt and view info
            if (!ownerPrivacyMode || isCurrentUserOwner) {
              passwordData.createdAt = password.createdAt;
              const secretViews = password.secretViews || [];
              passwordData.viewsCount = secretViews.length;
              passwordData.secretViews = secretViews;
            }
          }

          return passwordData;
        }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPreviousPage = page > 1;

      return {
        passwords: passwordWithReports,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPreviousPage,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException((error as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Get user passwords with authentication logic
   * Handles both JWT and Telegram authentication with optional pagination
   * @param req The authenticated request object
   * @param page Optional page number for pagination
   * @param limit Optional limit for pagination
   * @returns Either paginated response or simple array based on parameters
   */
  async getUserPasswordsWithAuth(
    req: AuthenticatedRequest,
    page?: number,
    limit?: number,
  ): Promise<passwordReturns[] | PaginatedResponse<passwordReturns>> {
    // If JWT token exists and has publicAddress, use publicAddress
    if (req?.user && req.user.publicAddress) {
      return this.findByPublicAddressWithPagination(
        req.user.publicAddress,
        page,
        limit,
      );
    }
    // If no JWT token but X-Telegram-Init-Data is provided, get latest publicAddress and use it
    else if (req?.headers?.['x-telegram-init-data']) {
      const telegramId = this.extractTelegramIdFromRequest(req);

      try {
        // Get the latest public address for this user
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByTelegramId(
            telegramId,
          );

        if (
          addressResponse.success &&
          addressResponse.data &&
          addressResponse.data.publicKey
        ) {
          // Use the latest publicAddress to search for secrets
          return this.findByPublicAddressWithPagination(
            addressResponse.data.publicKey,
            page,
            limit,
          );
        } else {
          // If no publicAddress found, fallback to telegramId search
          return this.findByUserTelegramIdWithPagination(
            telegramId,
            page,
            limit,
          );
        }
      } catch (error) {
        // If getting publicAddress fails, fallback to telegramId search
        console.log(
          'Failed to get latest publicAddress for telegramId:',
          telegramId,
          (error as Error).message,
        );
        return this.findByUserTelegramIdWithPagination(telegramId, page, limit);
      }
    }
    // Fallback case (should not happen with proper authentication)
    else {
      const telegramId = this.extractTelegramIdFromRequest(req);
      return this.findByUserTelegramIdWithPagination(telegramId, page, limit);
    }
  }

  /**
   * Get child passwords with authentication logic
   * Handles both JWT and Telegram authentication
   * @param req The authenticated request object
   * @param parentId The parent password ID
   * @param page Page number for pagination
   * @param limit Number of items per page
   * @returns Child passwords with pagination
   */
  async getChildPasswordsWithAuth(
    req: AuthenticatedRequest,
    parentId: string,
    page: number,
    limit: number,
  ) {
    // Extract current user's privacy mode
    let currentUserPrivacyMode = false;

    // If JWT token exists, use userId; otherwise use telegramId
    if (req?.user && req.user.id) {
      const currentUser = await this.userModel
        .findById(req.user.id)
        .select('privacyMode')
        .exec();
      currentUserPrivacyMode = currentUser?.privacyMode || false;
      return this.getChildPasswordsByUserId(
        parentId,
        req.user.id,
        page,
        limit,
        currentUserPrivacyMode,
      );
    } else {
      const telegramId = this.extractTelegramIdFromRequest(req);
      const currentUser = await this.userModel
        .findOne({ telegramId })
        .select('privacyMode')
        .exec();
      currentUserPrivacyMode = currentUser?.privacyMode || false;
      return this.getChildPasswords(
        parentId,
        telegramId,
        page,
        limit,
        currentUserPrivacyMode,
      );
    }
  }

  /**
   * Get all secrets for admin with filters and pagination
   * @param filters Admin filters including userId, isActive, hidden, secretType
   * @returns Paginated secrets with metadata
   */
  async getAllSecretsForAdmin(filters: AdminSecretsFilterDto): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const {
        userId,
        isActive,
        hidden,
        secretType,
        search,
        page = 1,
        limit = 10,
      } = filters;

      // Build filter query
      const filterQuery: any = {};
      const andConditions: any[] = [];

      // Filter by userId if provided (convert string to ObjectId)
      if (userId) {
        try {
          const userObjectId = new Types.ObjectId(userId);
          filterQuery.userId = userObjectId;
        } catch {
          // If userId is not a valid ObjectId, return empty results
          return {
            data: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
          };
        }
      }

      // Filter by isActive if provided
      if (typeof isActive === 'boolean') {
        filterQuery.isActive = isActive;
      }

      // Filter by hidden if provided
      if (typeof hidden === 'boolean') {
        filterQuery.hidden = hidden;
      }

      // Filter by secretType (parent/child secrets)
      if (secretType) {
        if (secretType === 'parents') {
          andConditions.push({
            $or: [
              { parent_secret_id: { $exists: false } },
              { parent_secret_id: null },
              { parent_secret_id: '' },
            ],
          });
        } else if (secretType === 'children') {
          andConditions.push({
            parent_secret_id: { $exists: true, $nin: [null, ''] },
          });
        }
        // For 'all', no additional filter needed
      }

      // Search filter
      if (search && search.trim()) {
        andConditions.push({
          $or: [
            { title: { $regex: search.trim(), $options: 'i' } },
            { description: { $regex: search.trim(), $options: 'i' } },
          ],
        });
      }

      // Combine all conditions
      if (andConditions.length > 0) {
        filterQuery.$and = andConditions;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get total count
      const total = await this.passwordModel.countDocuments(filterQuery);

      // Get paginated secrets
      const secrets = await this.passwordModel
        .find(filterQuery)
        .select('-hash -value -initData') // Exclude sensitive fields but keep key for title
        .populate('userId', 'username firstName lastName telegramId email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();

      // Transform data to include required fields
      const transformedSecrets = await Promise.all(
        secrets.map(async (secret) => {
          const secretObj = secret.toObject();
          const user = secretObj.userId as any;

          // Calculate statistics
          const views = secretObj.secretViews?.length || 0;
          const shares = secretObj.sharedWith?.length || 0;

          // Count reports for this secret
          const reports = await this.reportModel.countDocuments({
            secret_id: secret._id,
          });

          // Get last viewed date
          const lastViewed =
            secretObj.secretViews?.length > 0
              ? secretObj.secretViews[secretObj.secretViews.length - 1].viewedAt
              : null;

          return {
            ...secretObj,
            title: secretObj.key, // Use key as title
            ownerName: user
              ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
              : '',
            ownerHandle: user?.username || '',
            contactEmail: user?.email || '',
            statistics: {
              views,
              shares,
              reports,
            },
            lastViewed,
            // Remove key from final response
            key: undefined,
          };
        }),
      );

      // Calculate pagination info
      const totalPages = Math.ceil(total / limit);

      return {
        data: transformedSecrets,
        total,
        page,
        limit,
        totalPages,
      };
    } catch {
      throw new HttpException(
        'Failed to get secrets for admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
