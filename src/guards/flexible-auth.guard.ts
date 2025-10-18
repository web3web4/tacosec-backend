import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TelegramValidatorService } from '../telegram/telegram-validator.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { TelegramDtoAuthGuard } from './telegram-dto-auth.guard';

@Injectable()
export class FlexibleAuthGuard implements CanActivate {
  constructor(
    private telegramValidator: TelegramValidatorService,
    private jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private reflector: Reflector,
    private telegramDtoAuthGuard: TelegramDtoAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Priority 1: Check for JWT token in Authorization header
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

        // Store user data in request for later use
        (request as any).user = {
          id: user._id.toString(),
          telegramId: user.telegramId || '',
          username: user.username || '',
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          publicAddress: payload.publicAddress || '',
        };

        // Store authentication method for reference
        (request as any).authMethod = 'jwt';

        return true;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    // Priority 2: Check for Telegram init data in header
    const telegramInitData = request.headers['x-telegram-init-data'] as string;
    if (telegramInitData) {
      try {
        // Validate Telegram init data
        const isValid =
          this.telegramValidator.validateTelegramInitData(telegramInitData);
        if (!isValid) {
          throw new UnauthorizedException(
            'Invalid Telegram authentication data',
          );
        }

        // Parse Telegram data
        const telegramData =
          this.telegramDtoAuthGuard.parseTelegramInitData(telegramInitData);

        // Store telegram data in request for later use
        (request as any).telegramData = telegramData;
        (request as any).authMethod = 'telegram';

        return true;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException(
          'Error validating Telegram authentication data',
        );
      }
    }

    // No valid authentication method found
    throw new UnauthorizedException(
      'Authentication required: provide either JWT token or Telegram init data',
    );
  }
}
