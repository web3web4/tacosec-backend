import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../common/config/app-config.service';

/**
 * Configuration service for Telegram Client API
 */
@Injectable()
export class TelegramClientConfig {
  constructor(private readonly appConfig: AppConfigService) {}

  /**
   * Get Telegram API ID
   */
  get apiId(): number {
    if (!this.appConfig.telegramApiId) {
      throw new Error('TELEGRAM_API_ID is required for Telegram Client API');
    }
    return this.appConfig.telegramApiId;
  }

  /**
   * Get Telegram API Hash
   */
  get apiHash(): string {
    const apiHash = this.appConfig.telegramApiHash;
    if (!apiHash) {
      throw new Error('TELEGRAM_API_HASH is required for Telegram Client API');
    }
    return apiHash;
  }

  /**
   * Get session storage path
   */
  get sessionPath(): string {
    return this.appConfig.telegramSessionPath;
  }

  /**
   * Get request timeout in milliseconds
   */
  get requestTimeout(): number {
    return this.appConfig.telegramRequestTimeoutMs;
  }

  /**
   * Get max retries for failed requests
   */
  get maxRetries(): number {
    return this.appConfig.telegramMaxRetries;
  }

  /**
   * Get retry delay in milliseconds
   */
  get retryDelay(): number {
    return this.appConfig.telegramRetryDelayMs;
  }

  /**
   * Check if debug mode is enabled
   */
  get isDebugEnabled(): boolean {
    return this.appConfig.telegramDebug;
  }

  /**
   * Get cache TTL in seconds
   */
  get cacheTtl(): number {
    return this.appConfig.telegramCacheTtlSeconds;
  }

  /**
   * Get max contacts per request
   */
  get maxContactsPerRequest(): number {
    return this.appConfig.telegramMaxContactsPerRequest;
  }
}
