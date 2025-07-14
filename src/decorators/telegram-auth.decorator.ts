import { applyDecorators, UseGuards } from '@nestjs/common';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';

/**
 * Decorator to validate Telegram authentication data
 * Add this decorator to any endpoint that requires Telegram authentication
 */
export function TelegramAuth() {
  return applyDecorators(UseGuards(TelegramDtoAuthGuard));
}
