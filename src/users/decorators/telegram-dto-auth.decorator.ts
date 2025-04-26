import { applyDecorators, UseGuards } from '@nestjs/common';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';

/**
 * Decorator to validate Telegram authentication data from DTO objects in request body
 * Add this decorator to any endpoint that requires Telegram authentication using structured data
 */
export function TelegramDtoAuth() {
  return applyDecorators(UseGuards(TelegramDtoAuthGuard));
}
