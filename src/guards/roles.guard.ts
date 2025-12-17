import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';
import { UsersService } from '../users/users.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    let user = null;

    // Check authentication method and get user accordingly
    if ((request as any).authMethod === 'jwt') {
      // JWT authentication - user data is already in request.user
      const userData = (request as any).user;

      if (userData?.role) {
        return requiredRoles.some((role) => userData.role === role);
      }

      if (userData) {
        // First try to find by telegramId if available
        if (userData.telegramId) {
          user = await this.usersService.findByTelegramId(userData.telegramId);
        }
        // If no telegramId or user not found, try to find by userId
        if (!user && userData.id) {
          user = await this.usersService.findById(userData.id);
        }
      }
    } else {
      // Telegram authentication - extract from telegram init data
      const telegramId =
        (request as any).telegramData?.telegramId ||
        (request.headers['x-telegram-init-data']
          ? new URLSearchParams(request.headers['x-telegram-init-data']).get(
              'user',
            )
            ? JSON.parse(
                decodeURIComponent(
                  new URLSearchParams(
                    request.headers['x-telegram-init-data'],
                  ).get('user'),
                ),
              ).id
            : null
          : null);

      if (!telegramId) {
        throw new UnauthorizedException('User not authenticated');
      }

      user = await this.usersService.findByTelegramId(telegramId);
    }

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return requiredRoles.some((role) => user.role === role);
  }
}
