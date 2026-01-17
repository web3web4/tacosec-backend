import { applyDecorators, UseGuards, SetMetadata } from '@nestjs/common';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';

export const SKIP_TELEGRAM_VALIDATION = 'skipTelegramValidation';

/**
 * Decorator to validate Telegram authentication data
 * Add this decorator to any endpoint that requires Telegram authentication
 * @param skipTelegramValidation - If true, only validates JWT token without checking Telegram account linkage
 */
export function TelegramAuth(skipTelegramValidation: boolean = false) {
  return applyDecorators(
    SetMetadata(SKIP_TELEGRAM_VALIDATION, skipTelegramValidation),
    UseGuards(TelegramDtoAuthGuard),
  );
}
