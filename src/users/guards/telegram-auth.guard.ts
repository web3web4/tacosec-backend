import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TelegramValidatorService } from '../telegram-validator.service';
import { Request } from 'express';

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(private telegramValidator: TelegramValidatorService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Extract Telegram init data from the request
    const telegramInitData = this.extractTelegramInitData(request);

    if (!telegramInitData) {
      throw new UnauthorizedException('Missing Telegram authentication data');
    }

    // Validate Telegram init data
    const isValid =
      this.telegramValidator.validateTelegramInitData(telegramInitData);

    if (!isValid) {
      throw new UnauthorizedException('Invalid Telegram data');
    }

    return true;
  }

  /**
   * Extract raw Telegram init data from the request
   * Searches for data in headers (X-Telegram-Init-Data)
   * or in body (initDataRaw) or in query (tgInitData)
   */
  private extractTelegramInitData(request: Request): string | null {
    // Search in headers
    const headerInitData = request.headers['x-telegram-init-data'];
    if (headerInitData) {
      return Array.isArray(headerInitData) ? headerInitData[0] : headerInitData;
    }

    // Search in body
    if (request.body && request.body.initDataRaw) {
      return request.body.initDataRaw;
    }

    // Search in query params
    if (request.query && request.query.tgInitData) {
      return request.query.tgInitData as string;
    }

    return null;
  }
}
