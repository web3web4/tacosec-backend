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
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { ERROR_MESSAGES } from '../../common/constants/error-messages.constant';

/**
 * Password Base Service
 * Contains shared dependencies and common utility methods for password services
 */
@Injectable()
export class PasswordBaseService {
  constructor(
    @InjectModel(Password.name)
    protected readonly passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name)
    protected readonly userModel: Model<UserDocument>,
    @InjectModel(Report.name)
    protected readonly reportModel: Model<ReportDocument>,
    @InjectModel(PublicAddress.name)
    protected readonly publicAddressModel: Model<PublicAddressDocument>,
    protected readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
    protected readonly publicAddressesService: PublicAddressesService,
  ) {}

  /**
   * Extract and validate user authentication data from request
   * Supports both JWT and Telegram authentication methods
   */
  async extractUserAuthData(req: AuthenticatedRequest): Promise<{
    userId: string;
    telegramId: string;
    username: string;
    publicAddress?: string;
  }> {
    let telegramId = '';
    let username = '';
    let userId = '';

    // Priority 1: JWT authentication - extract user info from req.user
    if (req?.user?.id) {
      telegramId = req.user.telegramId || '';
      username = req.user.username || '';
      userId = req.user.id;

      const tokenPublicAddress = this.extractPublicAddressFromBearerToken(req);
      const reqUserPublicAddress =
        typeof req.user.publicAddress === 'string' &&
        req.user.publicAddress.trim()
          ? req.user.publicAddress
          : undefined;
      const publicAddress = tokenPublicAddress || reqUserPublicAddress;

      return { userId, telegramId, username, publicAddress };
    }
    // Priority 2: Telegram authentication - extract from header
    else if (req?.headers?.['x-telegram-init-data']) {
      const telegramInitData = req.headers['x-telegram-init-data'] as string;

      if (!telegramInitData) {
        throw new HttpException(
          ERROR_MESSAGES.AUTH.REQUIRED,
          HttpStatus.BAD_REQUEST,
        );
      }

      try {
        const parsedData =
          this.telegramDtoAuthGuard.parseTelegramInitData(telegramInitData);
        telegramId = parsedData.telegramId || '';
        username = parsedData.username || '';

        if (telegramId) {
          const user = await this.userModel
            .findOne({ telegramId })
            .select('_id')
            .exec();

          if (user) {
            userId = (user._id as Types.ObjectId).toString();
          }
        }
      } catch {
        telegramId = '';
        username = '';
        userId = '';
      }
    }

    // Get the latest wallet address for the user
    let publicAddress: string | undefined;
    try {
      if (telegramId) {
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByTelegramId(
            telegramId,
          );
        if (addressResponse.success && addressResponse.data) {
          publicAddress = addressResponse.data.publicKey;
        }
      }

      if (!publicAddress && userId) {
        const addressResponse =
          await this.publicAddressesService.getLatestAddressByUserId(userId);
        if (addressResponse.success && addressResponse.data) {
          publicAddress = addressResponse.data.publicKey;
        }
      }
    } catch {
      publicAddress = undefined;
    }

    return { userId, telegramId, username, publicAddress };
  }

  /**
   * Extract user ID from request
   * Priority: JWT token -> Telegram init data
   */
  extractUserIdFromRequest(req: AuthenticatedRequest): string {
    if (req?.user?.id) {
      return req.user.id;
    }

    if (req?.headers?.['x-telegram-init-data']) {
      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
      return parsedData.telegramId;
    }

    throw new HttpException(
      ERROR_MESSAGES.AUTH.REQUIRED,
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Extract telegram ID from request
   */
  extractTelegramIdFromRequest(req: AuthenticatedRequest): string {
    if (req?.user?.id) {
      return req.user.telegramId || '';
    }

    if (req?.headers?.['x-telegram-init-data']) {
      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
      return parsedData.telegramId;
    }

    throw new HttpException(
      ERROR_MESSAGES.AUTH.REQUIRED,
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Extract username from request
   */
  extractUsernameFromRequest(req: AuthenticatedRequest): string {
    if (req?.user?.id) {
      return req.user.username || '';
    }

    if (req?.headers?.['x-telegram-init-data']) {
      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData =
        this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
      return parsedData.username;
    }

    throw new HttpException(
      ERROR_MESSAGES.AUTH.REQUIRED,
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Get valid auth date from various input formats
   */
  getValidAuthDate(authDateInput: unknown): Date {
    if (typeof authDateInput === 'number') {
      return new Date(authDateInput * 1000);
    }

    if (typeof authDateInput === 'string') {
      const timestamp = parseInt(authDateInput, 10);
      if (!isNaN(timestamp)) {
        return new Date(timestamp * 1000);
      }
      const date = new Date(authDateInput);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    if (authDateInput instanceof Date) {
      return authDateInput;
    }

    return new Date();
  }

  /**
   * Verify user exists and is active
   */
  async verifyUserExists(identifier: {
    telegramId?: string;
    userId?: string;
  }): Promise<UserDocument> {
    let user: UserDocument | null = null;

    if (identifier.userId) {
      user = await this.userModel
        .findOne({ _id: identifier.userId, isActive: true })
        .exec();
    } else if (identifier.telegramId) {
      user = await this.userModel
        .findOne({ telegramId: identifier.telegramId, isActive: true })
        .exec();
    }

    if (!user) {
      throw new HttpException(
        ERROR_MESSAGES.USER.NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    return user;
  }

  /**
   * Verify password exists
   */
  async verifyPasswordExists(passwordId: string): Promise<PasswordDocument> {
    const password = await this.passwordModel.findById(passwordId).exec();

    if (!password) {
      throw new HttpException(
        ERROR_MESSAGES.PASSWORD.NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    return password;
  }

  /**
   * Verify user is password owner
   */
  verifyPasswordOwnership(
    password: PasswordDocument,
    user: UserDocument,
  ): void {
    const passwordUserId = password.userId ? String(password.userId) : '';
    const userId = user._id ? String(user._id) : '';

    if (passwordUserId !== userId) {
      throw new HttpException(
        ERROR_MESSAGES.PASSWORD.ACCESS_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * Get formatted public address (shortened)
   */
  formatPublicAddress(address: string | undefined): string {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
   * Get latest public address for a user
   */
  async getLatestPublicAddress(userId: string): Promise<string | undefined> {
    try {
      const response =
        await this.publicAddressesService.getLatestAddressByUserId(userId);
      return response?.data?.publicKey;
    } catch {
      return undefined;
    }
  }

  protected extractPublicAddressFromBearerToken(
    req: AuthenticatedRequest,
  ): string | undefined {
    const authHeader = req?.headers?.authorization;
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return undefined;
    }

    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length < 2) return undefined;

    try {
      const payloadPart = parts[1];
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      const json = Buffer.from(padded, 'base64').toString('utf8');
      const payload = JSON.parse(json) as { publicAddress?: unknown };
      const publicAddress = payload?.publicAddress;
      if (typeof publicAddress === 'string' && publicAddress.length > 0) {
        return publicAddress;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
