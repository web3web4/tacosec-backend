import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TelegramInitDto } from './telegram-init.dto';
import { TelegramValidatorService } from '../telegram-validator.service';
import { User, UserDocument } from '../../users/schemas/user.schema';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number;
  hash?: string;
}

@Injectable()
export class TelegramDtoAuthGuard implements CanActivate {
  constructor(
    private telegramValidator: TelegramValidatorService,
    private jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Check for JWT token in Authorization header first
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        // Verify JWT token
        const payload = this.jwtService.verify(token);

        // Check if user exists in database
        const user = await this.userModel.findById(payload.sub).exec();
        if (!user || !user.isActive) {
          throw new UnauthorizedException('User not found or inactive');
        }

        // Check if user has a valid telegramId
        if (!user.telegramId || user.telegramId === '') {
          throw new UnauthorizedException(
            'User does not have a valid linked Telegram account',
          );
        }

        // Store user data in request for later use
        (request as any).user = {
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
        };

        // Token is valid and user exists with valid telegram account
        return true;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    // If no valid JWT token, proceed with Telegram data validation
    // console.log('Request body:', JSON.stringify(request.body));

    // First try to extract raw Telegram data if it's included
    const rawTelegramData = this.extractRawTelegramData(request);
    if (rawTelegramData) {
      // console.log('Found raw Telegram data in the request');
      // If raw data is found, validate it directly
      const isRawValid =
        this.telegramValidator.validateTelegramInitData(rawTelegramData);
      if (isRawValid) {
        // console.log('Raw Telegram data is valid');
        const telegramDataDto = this.parseTelegramInitData(rawTelegramData);
        // console.log('Telegram data DTO:', telegramDataDto);
        const telegramDataBody = request.body;
        // console.log('Telegram data body:', telegramDataBody);
        if (
          telegramDataBody.telegramId &&
          telegramDataBody.hash &&
          telegramDataBody.authDate
        ) {
          if (
            telegramDataDto.telegramId !==
              telegramDataBody.telegramId.toString() ||
            telegramDataDto.hash !== telegramDataBody.hash ||
            telegramDataDto.authDate !==
              parseInt(telegramDataBody.authDate.toString())
          ) {
            throw new UnauthorizedException('Invalid Telegram data');
          } else {
            // console.log('Telegram data is valid');
            return true;
          }
        } else {
          if (telegramDataBody.initData) {
            if (
              telegramDataDto.telegramId !==
                telegramDataBody.initData.telegramId.toString() ||
              telegramDataDto.hash !== telegramDataBody.initData.hash ||
              telegramDataDto.authDate !==
                parseInt(telegramDataBody.initData.authDate.toString())
            ) {
              throw new UnauthorizedException('Invalid Telegram data');
            } else {
              // console.log('Telegram data is valid');
              return true;
            }
          } else {
            // console.log('Telegram data is valid');
            return true;
          }
        }
      } else {
        // console.log('Raw Telegram data is invalid');
        throw new UnauthorizedException('Invalid Telegram data');
      }
    }

    // If no raw data or it's invalid, try structured data
    const telegramData = this.extractTelegramDto(request);

    if (!telegramData) {
      // console.log('No Telegram data found in the request');
      throw new UnauthorizedException('Missing Telegram authentication data');
    }

    console.log('Found structured Telegram data in the request');

    // Validate structured Telegram data
    const isValid = this.telegramValidator.validateTelegramDto(telegramData);

    if (!isValid) {
      // console.log('Structured Telegram data is invalid');
      throw new UnauthorizedException('Invalid Telegram data');
    }

    // console.log('Structured Telegram data is valid');
    return true;
  }

  /**
   * Extract raw Telegram init_data from the request
   */
  private extractRawTelegramData(request: Request): string | null {
    // Check if initDataRaw is present in the body
    if (request.body?.initDataRaw) {
      return request.body.initDataRaw;
    }

    // Check headers
    const headerInitData = request.headers['x-telegram-init-data'];
    if (headerInitData) {
      return Array.isArray(headerInitData) ? headerInitData[0] : headerInitData;
    }

    // Check query params
    if (request.query?.tgInitData) {
      return request.query.tgInitData as string;
    }

    // Check if the entire body is a string and looks like Telegram init data
    if (
      typeof request.body === 'string' &&
      request.body.includes('auth_date=') &&
      request.body.includes('hash=')
    ) {
      return request.body;
    }

    // Check if raw body is available via request.rawBody (depends on middleware)
    if (
      (request as any).rawBody &&
      typeof (request as any).rawBody === 'string'
    ) {
      const rawBody = (request as any).rawBody;
      if (rawBody.includes('auth_date=') && rawBody.includes('hash=')) {
        return rawBody;
      }
    }

    return null;
  }

  /**
   * Extract Telegram DTO data from the request body
   * For signup endpoint: directly from body
   * For password endpoints: from body.initData
   */
  private extractTelegramDto(request: Request): TelegramInitDto | null {
    const body = request.body;

    if (!body) {
      return null;
    }

    // For signup endpoint
    if (body.telegramId && body.hash && body.authDate) {
      return body as TelegramInitDto;
    }

    // For password endpoints
    if (
      body.initData &&
      body.initData.telegramId &&
      body.initData.hash &&
      body.initData.authDate
    ) {
      return body.initData as TelegramInitDto;
    }

    return null;
  }

  public parseTelegramInitData(initData: string): TelegramInitDto {
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
      telegramId: user.id.toString(),
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      authDate: parseInt(params.get('auth_date') || '0'),
      hash: params.get('hash'),
    };
  }
}
