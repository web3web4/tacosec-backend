import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { TelegramInitDto } from './dto/telegram-init.dto';

@Injectable()
export class TelegramValidatorService {
  constructor(private configService: ConfigService) {}

  /**
   * Validate raw Telegram init data
   * @param initData The raw data sent by Telegram (init_data)
   * @returns true if the data is valid, false if it is invalid
   */
  validateTelegramInitData(initData: string): boolean {
    try {
      if (!initData) {
        return false;
      }

      const telegramBotToken =
        this.configService.get<string>('TELEGRAM_BOT_TOKEN');

      if (!telegramBotToken) {
        console.error('TELEGRAM_BOT_TOKEN is not defined in .env file');
        return false;
      }

      // Decode Telegram init data
      const searchParams = new URLSearchParams(initData);
      const hash = searchParams.get('hash');

      if (!hash) {
        return false;
      }

      // Remove hash from the data before validation
      searchParams.delete('hash');

      // Sort the data alphabetically as required by Telegram documentation
      const dataCheckString = this.sortURLSearchParams(searchParams);

      // Create the secret key using HMAC-SHA256
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(telegramBotToken)
        .digest();

      // Calculate the expected hash
      const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      // Compare the calculated hash with the received hash
      return calculatedHash === hash;
    } catch (error) {
      console.error('Error validating Telegram init data:', error);
      return false;
    }
  }

  /**
   * Validate structured Telegram DTO data
   * @param data Telegram data from DTO
   * @returns true if the data is valid, false if it is invalid
   */
  validateTelegramDto(data: TelegramInitDto): boolean {
    try {
      if (!data || !data.hash || !data.authDate || !data.telegramId) {
        return false;
      }

      const telegramBotToken =
        this.configService.get<string>('TELEGRAM_BOT_TOKEN');

      if (!telegramBotToken) {
        console.error('TELEGRAM_BOT_TOKEN is not defined in .env file');
        return false;
      }

      // Check if auth_date is not older than 24h
      const maxAge = 86400; // 24 hours in seconds
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (currentTimestamp - data.authDate > maxAge) {
        return false;
      }

      // Create a data check string for Telegram validation
      const dataCheckArray = Object.entries(data)
        .filter(([key]) => key !== 'hash' && key !== 'initDataRaw')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`);

      const dataCheckString = dataCheckArray.join('\n');

      // Create a secret key by applying HMAC-SHA256 to the bot token using the literal "WebAppData" as the key
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(telegramBotToken)
        .digest();

      // Calculate expected hash
      const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      // Compare with received hash
      return calculatedHash === data.hash;
    } catch (error) {
      console.error('Error validating Telegram DTO:', error);
      return false;
    }
  }

  /**
   *   Sort the search parameters in the URL alphabetically
   * @param params The search parameters
   * @returns A sorted string for validation
   */
  private sortURLSearchParams(params: URLSearchParams): string {
    const ordered: [string, string][] = Array.from(params.entries()).sort(
      ([keyA], [keyB]) => keyA.localeCompare(keyB),
    );
    return ordered.map(([key, value]) => `${key}=${value}`).join('\n');
  }
}
