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

    // Extract Telegram data from the request body
    const telegramData = this.extractTelegramDto(request);

    if (!telegramData) {
      throw new UnauthorizedException(
        'Missing Telegram authentication data in body',
      );
    }

    // Validate Telegram data
    const isValid = this.telegramValidator.validateTelegramDto(telegramData);

    if (!isValid) {
      throw new UnauthorizedException('Invalid Telegram data');
    }

    return true;
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
