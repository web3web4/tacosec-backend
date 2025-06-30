import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
// import { Api } from 'telegram/tl';

/**
 * Telegram Client Service
 * Main service for managing Telegram Client API connections
 * Handles authentication and session management
 */
@Injectable()
export class TelegramClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramClientService.name);
  private client: TelegramClient;
  private readonly apiId: number;
  private readonly apiHash: string;
  private readonly sessions = new Map<number, string>(); // userId -> session string

  constructor(private readonly configService: ConfigService) {
    this.apiId = parseInt(
      this.configService.get<string>('TELEGRAM_API_ID') || '0',
    );
    this.apiHash = this.configService.get<string>('TELEGRAM_API_HASH') || '';

    if (!this.apiId || !this.apiHash) {
      this.logger.error(
        'TELEGRAM_API_ID and TELEGRAM_API_HASH must be provided',
      );
      throw new Error('Missing Telegram API credentials');
    }
  }

  async onModuleInit() {
    this.logger.log('Telegram Client Service initialized');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
      this.logger.log('Telegram Client disconnected');
    }
  }

  /**
   * Create a new Telegram client instance
   * @param sessionString - Optional session string for existing session
   * @returns TelegramClient instance
   */
  createClient(sessionString?: string): TelegramClient {
    const session = new StringSession(sessionString || '');
    return new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
      retryDelay: 1000,
      autoReconnect: true,
      timeout: 30000,
    });
  }

  /**
   * Get or create client for a specific user
   * @param userId - User ID
   * @param sessionString - Session string if available
   * @returns TelegramClient instance
   */
  async getClientForUser(
    userId: number,
    sessionString?: string,
  ): Promise<TelegramClient> {
    const session = sessionString || this.sessions.get(userId) || '';
    const client = this.createClient(session);

    try {
      await client.connect();
      this.logger.log(`Client connected for user ${userId}`);
      return client;
    } catch (error) {
      this.logger.error(`Failed to connect client for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get client for a user (synchronous)
   * @param userId - User ID
   * @returns TelegramClient instance or null if not available
   */
  getClient(userId: number): TelegramClient | null {
    const session = this.sessions.get(userId);
    if (!session) {
      return null;
    }
    return this.createClient(session);
  }

  /**
   * Save session for a user
   * @param userId - User ID
   * @param sessionString - Session string to save
   */
  saveUserSession(userId: number, sessionString: string): void {
    this.sessions.set(userId, sessionString);
    this.logger.log(`Session saved for user ${userId}`);
  }

  /**
   * Get saved session for a user
   * @param userId - User ID
   * @returns Session string or undefined
   */
  getUserSession(userId: number): string | undefined {
    return this.sessions.get(userId);
  }

  /**
   * Remove session for a user
   * @param userId - User ID
   */
  removeUserSession(userId: number): void {
    this.sessions.delete(userId);
    this.logger.log(`Session removed for user ${userId}`);
  }

  /**
   * Check if user has an active session
   * @param userId - User ID
   * @returns boolean
   */
  hasUserSession(userId: number): boolean {
    return this.sessions.has(userId);
  }

  /**
   * Disconnect client safely
   * @param client - TelegramClient instance
   */
  async disconnectClient(client: TelegramClient): Promise<void> {
    try {
      await client.disconnect();
      this.logger.log('Client disconnected successfully');
    } catch (error) {
      this.logger.error('Error disconnecting client:', error);
    }
  }
}
