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
        console.error('No init data provided');
        return false;
      }

      console.log('Validating raw init data:', initData);

      const telegramBotToken =
        this.configService.get<string>('TELEGRAM_BOT_TOKEN');

      if (!telegramBotToken) {
        console.error('TELEGRAM_BOT_TOKEN is not defined in .env file');
        return false;
      }

      // Try to parse as query string (standard Telegram format)
      let searchParams: URLSearchParams;
      try {
        // Handle both raw initData and URL-encoded data
        searchParams = new URLSearchParams(initData);
      } catch (e) {
        console.error('Failed to parse init data as URL params:', e);
        return false;
      }

      // Extract hash from the data
      const hash = searchParams.get('hash');
      if (!hash) {
        console.error('No hash found in init data');
        return false;
      }

      // Remove hash from the data before validation
      searchParams.delete('hash');

      // Check auth_date if present
      const authDateStr = searchParams.get('auth_date');
      if (authDateStr) {
        const authDate = parseInt(authDateStr, 10);
        const maxAge = 86400; // 24 hours in seconds
        const currentTimestamp = Math.floor(Date.now() / 1000);

        if (!isNaN(authDate) && currentTimestamp - authDate > maxAge) {
          console.error('Auth date is too old');
          return false;
        }
      }

      // Sort the data alphabetically as required by Telegram documentation
      const dataCheckString = this.sortURLSearchParams(searchParams);

      console.log('Check string:', dataCheckString);

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

      console.log('Calculated hash:', calculatedHash);
      console.log('Received hash:', hash);

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
        console.error('Missing required fields in Telegram data');
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
        console.error('Auth date is too old');
        return false;
      }

      // Create a data check string for Telegram validation
      // IMPORTANT: The property names must match exactly what Telegram sends
      // Usually Telegram sends these properties in snake_case
      const dataCheck: Record<string, string> = {};

      // Map DTO properties to the format Telegram expects
      if (data.telegramId) dataCheck.id = data.telegramId;
      if (data.firstName) dataCheck.first_name = data.firstName;
      if (data.lastName) dataCheck.last_name = data.lastName;
      if (data.username) dataCheck.username = data.username;
      if (data.photoUrl) dataCheck.photo_url = data.photoUrl;
      if (data.authDate) dataCheck.auth_date = data.authDate.toString();

      // Debug log to see what we're processing
      console.log('Data to validate:', dataCheck);

      // Create JSON string of user data for validation
      const userDataString = JSON.stringify(dataCheck);

      // Build check string in the format Telegram expects
      // This might need adjustment based on how your Telegram app sends data
      const dataCheckArray = [
        `auth_date=${data.authDate}`,
        `user=${userDataString}`,
      ];

      // Sort alphabetically as required by Telegram
      dataCheckArray.sort();
      const dataCheckString = dataCheckArray.join('\n');

      console.log('Check string:', dataCheckString);

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

      console.log('Calculated hash:', calculatedHash);
      console.log('Received hash:', data.hash);

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
