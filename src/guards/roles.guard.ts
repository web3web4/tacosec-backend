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
    const telegramId = request.headers['x-telegram-init-data']
      ? new URLSearchParams(request.headers['x-telegram-init-data']).get('user')
        ? JSON.parse(
            decodeURIComponent(
              new URLSearchParams(request.headers['x-telegram-init-data']).get(
                'user',
              ),
            ),
          ).id
        : null
      : null;

    if (!telegramId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const user = await this.usersService.findByTelegramId(telegramId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return requiredRoles.some((role) => user.role === role);
  }
}
