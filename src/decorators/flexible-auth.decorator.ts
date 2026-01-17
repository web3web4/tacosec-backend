import { applyDecorators, UseGuards, SetMetadata } from '@nestjs/common';
import { FlexibleAuthGuard } from '../guards/flexible-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
export const FLEXIBLE_AUTH_KEY = 'flexible_auth';

/**
 * Decorator that supports both JWT token authentication and Telegram init data authentication
 * Priority: JWT token (Bearer) > Telegram init data (x-telegram-init-data header)
 * If JWT token is provided, it will be used regardless of Telegram init data presence
 * If only Telegram init data is provided, it will be validated and used
 */
export function FlexibleAuth() {
  return applyDecorators(
    SetMetadata(FLEXIBLE_AUTH_KEY, true),
    UseGuards(FlexibleAuthGuard, RolesGuard),
  );
}
