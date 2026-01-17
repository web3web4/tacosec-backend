import { applyDecorators, UseGuards, SetMetadata } from '@nestjs/common';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { SKIP_TELEGRAM_VALIDATION } from './telegram-auth.decorator';

/**
 * Decorator to validate Telegram authentication data from DTO objects in request body
 * Add this decorator to any endpoint that requires Telegram authentication using structured data
 * @param skipTelegramValidation - If true, only validates JWT token without checking Telegram account linkage
 */
export function TelegramDtoAuth(skipTelegramValidation: boolean = false) {
  return applyDecorators(
    SetMetadata(SKIP_TELEGRAM_VALIDATION, skipTelegramValidation),
    UseGuards(TelegramDtoAuthGuard, RolesGuard),
  );
}
