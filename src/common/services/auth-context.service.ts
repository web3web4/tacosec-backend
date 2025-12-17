import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { TelegramValidatorService } from '../../telegram/telegram-validator.service';
import {
  AuthenticatedRequest,
  AuthenticatedUser,
  TelegramAuthData,
} from '../interfaces/authenticated-request.interface';
import { ERROR_MESSAGES } from '../constants/error-messages.constant';

type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number;
  hash?: string;
};

/**
 * Auth Context Service
 * Provides unified authentication context extraction from requests
 *
 * This service centralizes all authentication logic to avoid code duplication
 * across different services that need to extract user information from requests
 */
@Injectable()
export class AuthContextService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly telegramValidator: TelegramValidatorService,
  ) {}

  async getJwtUserAndPayload(token: string): Promise<{
    user: UserDocument;
    payload: any;
  }> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userModel.findById(payload.sub).exec();

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      return { user, payload };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_TOKEN);
    }
  }

  getTelegramAuthDataFromInitData(telegramInitData: string): TelegramAuthData {
    const isValid =
      this.telegramValidator.validateTelegramInitData(telegramInitData);
    if (!isValid) {
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_TELEGRAM_DATA,
      );
    }

    const telegramData = this.parseTelegramInitData(telegramInitData);

    return {
      telegramId: telegramData.telegramId,
      username: telegramData.username,
      firstName: telegramData.firstName,
      lastName: telegramData.lastName,
      photoUrl: telegramData.photoUrl,
      authDate: telegramData.authDate,
      hash: telegramData.hash,
    };
  }

  /**
   * Extract authenticated user from request
   * Supports both JWT and Telegram authentication methods
   *
   * @param req - The incoming request
   * @returns The authenticated user document
   * @throws UnauthorizedException if no valid authentication found
   */
  async getCurrentUser(req: Request): Promise<UserDocument> {
    const authRequest = req as AuthenticatedRequest;

    // Priority 1: Check for existing user in request (from guards)
    if (authRequest.user?.id) {
      const user = await this.userModel.findById(authRequest.user.id).exec();
      if (!user) {
        throw new UnauthorizedException(ERROR_MESSAGES.USER.NOT_FOUND);
      }
      if (!user.isActive) {
        throw new UnauthorizedException(ERROR_MESSAGES.USER.INACTIVE);
      }
      return user;
    }

    // Priority 2: Try JWT authentication
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return this.authenticateWithJwt(authHeader.substring(7));
    }

    // Priority 3: Try Telegram authentication
    const telegramInitData = req.headers['x-telegram-init-data'] as string;
    if (telegramInitData) {
      return this.authenticateWithTelegram(telegramInitData);
    }

    throw new UnauthorizedException(ERROR_MESSAGES.AUTH.REQUIRED);
  }

  /**
   * Get user ID from request (lightweight version)
   * Returns just the user ID without fetching the full user document
   */
  async getCurrentUserId(req: Request): Promise<string> {
    const authRequest = req as AuthenticatedRequest;

    // Check for existing user in request
    if (authRequest.user?.id) {
      return authRequest.user.id;
    }

    // Otherwise, get the full user and return ID
    const user = await this.getCurrentUser(req);
    return (user._id as any).toString();
  }

  /**
   * Get authenticated user data from request
   * Returns the lightweight user info without database query if available
   */
  getAuthenticatedUser(req: Request): AuthenticatedUser | undefined {
    const authRequest = req as AuthenticatedRequest;
    return authRequest.user;
  }

  /**
   * Get Telegram auth data from request
   */
  getTelegramData(req: Request): TelegramAuthData | undefined {
    const authRequest = req as AuthenticatedRequest;
    return authRequest.telegramData;
  }

  /**
   * Get the authentication method used
   */
  getAuthMethod(req: Request): 'jwt' | 'telegram' | undefined {
    const authRequest = req as AuthenticatedRequest;
    return authRequest.authMethod;
  }

  /**
   * Check if request is authenticated
   */
  isAuthenticated(req: Request): boolean {
    const authRequest = req as AuthenticatedRequest;
    return !!(authRequest.user || authRequest.telegramData);
  }

  /**
   * Authenticate using JWT token
   */
  private async authenticateWithJwt(token: string): Promise<UserDocument> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userModel.findById(payload.sub).exec();

      if (!user) {
        throw new UnauthorizedException(ERROR_MESSAGES.USER.NOT_FOUND);
      }
      if (!user.isActive) {
        throw new UnauthorizedException(ERROR_MESSAGES.USER.INACTIVE);
      }

      return user;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_TOKEN);
    }
  }

  /**
   * Authenticate using Telegram init data
   */
  private async authenticateWithTelegram(
    telegramInitData: string,
  ): Promise<UserDocument> {
    try {
      // Validate Telegram init data
      const isValid =
        this.telegramValidator.validateTelegramInitData(telegramInitData);
      if (!isValid) {
        throw new UnauthorizedException(
          ERROR_MESSAGES.AUTH.INVALID_TELEGRAM_DATA,
        );
      }

      // Parse Telegram data
      const telegramData = this.parseTelegramInitData(telegramInitData);

      // Find user by Telegram ID
      const user = await this.userModel
        .findOne({ telegramId: telegramData.telegramId })
        .exec();

      if (!user) {
        throw new UnauthorizedException(ERROR_MESSAGES.USER.NOT_FOUND);
      }
      if (!user.isActive) {
        throw new UnauthorizedException(ERROR_MESSAGES.USER.INACTIVE);
      }

      return user;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(
        ERROR_MESSAGES.AUTH.INVALID_TELEGRAM_DATA,
      );
    }
  }

  private parseTelegramInitData(initData: string): {
    telegramId: string;
    firstName: string;
    lastName?: string;
    username?: string;
    photoUrl?: string;
    authDate: number;
    hash: string;
  } {
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    let user: TelegramUser = {} as TelegramUser;

    try {
      if (userJson) {
        user = JSON.parse(decodeURIComponent(userJson));
      }
    } catch (e) {
      console.error('Field To Get User Data:', e);
    }

    return {
      telegramId: user.id ? user.id.toString() : '',
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      username: user.username || '',
      photoUrl: user.photo_url,
      authDate: parseInt(params.get('auth_date') || '0'),
      hash: params.get('hash') || '',
    };
  }

  /**
   * Extract user info for JWT payload
   */
  extractUserForJwtPayload(user: UserDocument): AuthenticatedUser {
    return {
      id: (user._id as any).toString(),
      telegramId: user.telegramId || '',
      username: user.username || '',
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }
}
