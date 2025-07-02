import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

/**
 * Configuration service for Telegram Client API
 */
@Injectable()
export class TelegramClientConfig {
  constructor(private configService: ConfigService) {}

  /**
   * Get Telegram API ID
   */
  get apiId(): number {
    const apiId = this.configService.get<string>('TELEGRAM_API_ID');
    if (!apiId) {
      throw new Error('TELEGRAM_API_ID is required for Telegram Client API');
    }
    return parseInt(apiId, 10);
  }

  /**
   * Get Telegram API Hash
   */
  get apiHash(): string {
    const apiHash = this.configService.get<string>('TELEGRAM_API_HASH');
    if (!apiHash) {
      throw new Error('TELEGRAM_API_HASH is required for Telegram Client API');
    }
    return apiHash;
  }

  /**
   * Get session storage path
   */
  get sessionPath(): string {
    return (
      this.configService.get<string>('TELEGRAM_SESSION_PATH') || './sessions'
    );
  }

  /**
   * Get request timeout in milliseconds
   */
  get requestTimeout(): number {
    return parseInt(
      this.configService.get<string>('TELEGRAM_REQUEST_TIMEOUT') || '30000',
      10,
    );
  }

  /**
   * Get max retries for failed requests
   */
  get maxRetries(): number {
    return parseInt(
      this.configService.get<string>('TELEGRAM_MAX_RETRIES') || '3',
      10,
    );
  }

  /**
   * Get retry delay in milliseconds
   */
  get retryDelay(): number {
    return parseInt(
      this.configService.get<string>('TELEGRAM_RETRY_DELAY') || '1000',
      10,
    );
  }

  /**
   * Check if debug mode is enabled
   */
  get isDebugEnabled(): boolean {
    return this.configService.get<string>('TELEGRAM_DEBUG') === 'true';
  }

  /**
   * Get cache TTL in seconds
   */
  get cacheTtl(): number {
    return parseInt(
      this.configService.get<string>('TELEGRAM_CACHE_TTL') || '300',
      10,
    );
  }

  /**
   * Get max contacts per request
   */
  get maxContactsPerRequest(): number {
    return parseInt(
      this.configService.get<string>('TELEGRAM_MAX_CONTACTS_PER_REQUEST') ||
        '1000',
      10,
    );
  }
}
