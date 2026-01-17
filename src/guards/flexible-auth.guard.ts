import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthContextService } from '../common/services/auth-context.service';

@Injectable()
export class FlexibleAuthGuard implements CanActivate {
  constructor(private readonly authContextService: AuthContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const authHeader = request.headers.authorization;
    const telegramInitData = request.headers['x-telegram-init-data'] as
      | string
      | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const { user, payload } =
          await this.authContextService.getJwtUserAndPayload(token);

        (request as any).user = {
          id: user._id.toString(),
          telegramId: user.telegramId || '',
          username: user.username || '',
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          publicAddress: payload.publicAddress || '',
          role: user.role,
        };

        (request as any).authMethod = 'jwt';

        return true;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException('Invalid or expired token');
      }
    }

    if (telegramInitData) {
      try {
        const telegramData =
          this.authContextService.getTelegramAuthDataFromInitData(
            telegramInitData,
          );

        (request as any).telegramData = telegramData;
        (request as any).authMethod = 'telegram';

        return true;
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        throw new UnauthorizedException(
          'Error validating Telegram authentication data',
        );
      }
    }

    throw new UnauthorizedException(
      'Authentication required: provide either JWT token or Telegram init data',
    );
  }
}
