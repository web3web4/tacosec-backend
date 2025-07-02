import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { TelegramClientService } from '../telegram-client.service';
import { TelegramClient } from 'telegram';
import { Api } from 'telegram/tl';
import { SendCodeDto, VerifyCodeDto } from '../dto';

interface AuthSession {
  phoneCodeHash: string;
  phoneNumber: string;
  client: TelegramClient;
  timestamp: number;
}

/**
 * Authentication Service for Telegram Client
 * Handles phone authentication flow using MTProto
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly authSessions = new Map<number, AuthSession>();
  private readonly SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly telegramClientService: TelegramClientService) {}

  /**
   * Send authentication code to phone number
   * @param sendCodeDto - Phone number and user info
   * @returns Code hash and authentication info
   */
  async sendCode(sendCodeDto: SendCodeDto) {
    const { phoneNumber, userId } = sendCodeDto;

    try {
      // Create new client for this authentication session
      const client = this.telegramClientService.createClient();
      await client.connect();

      // Send authentication code
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber,
          apiId: parseInt(process.env.TELEGRAM_API_ID || '0'),
          apiHash: process.env.TELEGRAM_API_HASH || '',
          settings: new Api.CodeSettings({
            allowFlashcall: false,
            currentNumber: false,
            allowAppHash: false,
            allowMissedCall: false,
            logoutTokens: [],
          }),
        }),
      );

      // Store auth session
      this.authSessions.set(userId, {
        phoneCodeHash: (result as any).phoneCodeHash,
        phoneNumber,
        client,
        timestamp: Date.now(),
      });

      this.logger.log(
        `Authentication code sent to ${phoneNumber} for user ${userId}`,
      );

      return {
        success: true,
        phoneCodeHash: (result as any).phoneCodeHash,
        timeout: (result as any).timeout || 60,
        type: (result as any).type?.className || 'unknown',
        message: 'Authentication code sent successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to send code to ${phoneNumber}:`, error);
      throw new BadRequestException('Failed to send authentication code');
    }
  }

  /**
   * Verify authentication code and complete login
   * @param verifyCodeDto - Code, phone number, and user info
   * @returns Authentication result with session
   */
  async verifyCode(verifyCodeDto: VerifyCodeDto) {
    const { code, phoneNumber, userId, phoneCodeHash } = verifyCodeDto;

    // Get auth session
    const authSession = this.authSessions.get(userId);
    if (!authSession) {
      throw new UnauthorizedException('No active authentication session found');
    }

    // Check session timeout
    if (Date.now() - authSession.timestamp > this.SESSION_TIMEOUT) {
      this.authSessions.delete(userId);
      await this.telegramClientService.disconnectClient(authSession.client);
      throw new UnauthorizedException('Authentication session expired');
    }

    // Verify phone code hash matches
    if (authSession.phoneCodeHash !== phoneCodeHash) {
      throw new BadRequestException('Invalid phone code hash');
    }

    try {
      // Sign in with the code
      const result = await authSession.client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash,
          phoneCode: code,
        }),
      );

      // Get session string
      const sessionString =
        authSession.client.session.save() as unknown as string;

      // Save session for future use
      this.telegramClientService.saveUserSession(userId, sessionString);

      // Clean up auth session
      this.authSessions.delete(userId);

      this.logger.log(`User ${userId} authenticated successfully`);

      const user = (result as any).user;
      return {
        success: true,
        user: {
          id: user?.id?.toString(),
          firstName: user?.firstName,
          lastName: user?.lastName,
          username: user?.username,
          phone: user?.phone,
        },
        sessionString,
        message: 'Authentication successful',
      };
    } catch (error) {
      this.logger.error(`Authentication failed for user ${userId}:`, error);

      // Clean up on failure
      this.authSessions.delete(userId);
      await this.telegramClientService.disconnectClient(authSession.client);

      if (error.message?.includes('PHONE_CODE_INVALID')) {
        throw new BadRequestException('Invalid authentication code');
      }
      if (error.message?.includes('PHONE_CODE_EXPIRED')) {
        throw new BadRequestException('Authentication code expired');
      }
      if (error.message?.includes('SESSION_PASSWORD_NEEDED')) {
        throw new BadRequestException('Two-factor authentication required');
      }

      throw new BadRequestException('Authentication failed');
    }
  }

  /**
   * Check authentication status for a user
   * @param userId - User ID
   * @returns Authentication status
   */
  async getAuthStatus(userId: number) {
    const hasSession = this.telegramClientService.hasUserSession(userId);
    const hasActiveAuth = this.authSessions.has(userId);

    return {
      isAuthenticated: hasSession,
      hasActiveAuthSession: hasActiveAuth,
      sessionExists: hasSession,
    };
  }

  /**
   * Logout user and clear session
   * @param userId - User ID
   * @returns Logout result
   */
  async logout(userId: number) {
    try {
      // Get user session if exists
      const sessionString = this.telegramClientService.getUserSession(userId);

      if (sessionString) {
        // Create client with existing session and logout
        const client = await this.telegramClientService.getClientForUser(
          userId,
          sessionString,
        );

        try {
          await client.invoke(new Api.auth.LogOut());
          this.logger.log(`User ${userId} logged out from Telegram`);
        } catch (error) {
          this.logger.warn(
            `Failed to logout from Telegram for user ${userId}:`,
            error,
          );
        } finally {
          await this.telegramClientService.disconnectClient(client);
        }
      }

      // Remove session and auth data
      this.telegramClientService.removeUserSession(userId);

      // Clean up any pending auth session
      const authSession = this.authSessions.get(userId);
      if (authSession) {
        await this.telegramClientService.disconnectClient(authSession.client);
        this.authSessions.delete(userId);
      }

      return {
        success: true,
        message: 'Logout successful',
      };
    } catch (error) {
      this.logger.error(`Logout failed for user ${userId}:`, error);
      throw new BadRequestException('Logout failed');
    }
  }

  /**
   * Clean up expired auth sessions
   */
  private async cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions: number[] = [];

    for (const [userId, session] of this.authSessions.entries()) {
      if (now - session.timestamp > this.SESSION_TIMEOUT) {
        expiredSessions.push(userId);
        await this.telegramClientService.disconnectClient(session.client);
      }
    }

    expiredSessions.forEach((userId) => {
      this.authSessions.delete(userId);
      this.logger.log(`Cleaned up expired auth session for user ${userId}`);
    });
  }
}
