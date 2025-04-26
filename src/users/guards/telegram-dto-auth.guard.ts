import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { TelegramValidatorService } from '../telegram-validator.service';
import { Request } from 'express';
import { TelegramInitDto } from '../dto/telegram-init.dto';

@Injectable()
export class TelegramDtoAuthGuard implements CanActivate {
  constructor(private telegramValidator: TelegramValidatorService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    console.log('Request body:', JSON.stringify(request.body));

    // First try to extract raw Telegram data if it's included
    const rawTelegramData = this.extractRawTelegramData(request);
    if (rawTelegramData) {
      console.log('Found raw Telegram data in the request');
      // If raw data is found, validate it directly
      const isRawValid =
        this.telegramValidator.validateTelegramInitData(rawTelegramData);
      if (isRawValid) {
        console.log('Raw Telegram data is valid');
        return true;
      } else {
        console.log('Raw Telegram data is invalid');
      }
    }

    // If no raw data or it's invalid, try structured data
    const telegramData = this.extractTelegramDto(request);

    if (!telegramData) {
      console.log('No Telegram data found in the request');
      throw new UnauthorizedException('Missing Telegram authentication data');
    }

    console.log('Found structured Telegram data in the request');

    // Validate structured Telegram data
    const isValid = this.telegramValidator.validateTelegramDto(telegramData);

    if (!isValid) {
      console.log('Structured Telegram data is invalid');
      throw new UnauthorizedException('Invalid Telegram data');
    }

    console.log('Structured Telegram data is valid');
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
}
