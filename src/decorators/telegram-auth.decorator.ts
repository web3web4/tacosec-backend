import { applyDecorators, UseGuards } from '@nestjs/common';
import { TelegramAuthGuard } from '../guards/telegram-auth.guard';

/**
 * Decorator to validate Telegram authentication data
 * Add this decorator to any endpoint that requires Telegram authentication
 */
export function TelegramAuth() {
  return applyDecorators(UseGuards(TelegramAuthGuard));
}
