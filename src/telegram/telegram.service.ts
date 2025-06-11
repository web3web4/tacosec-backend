import {
  Injectable,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
// import { TelegramValidatorService } from './telegram-validator.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class TelegramService {
  private readonly botToken: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    // private readonly telegramValidatorService: TelegramValidatorService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {
    this.botToken =
      this.configService.get<string>('TELEGRAM_BOT_TOKEN') ||
      process.env.TELEGRAM_BOT_TOKEN;

    if (!this.botToken) {
      console.error('WARNING: TELEGRAM_BOT_TOKEN is not set or invalid!');
    }
  }

  async validateTelegramUser(
    telegramInitData: string,
    telegramUsernames: string[],
  ): Promise<{ isValid: boolean }> {
    // Validate that both parameters are provided
    // console.log('telegramInitData', telegramInitData);
    // console.log('telegramUsernames', telegramUsernames);
    // console.log('telegramUsernames.length', telegramUsernames.length);
    if (
      !telegramInitData ||
      !telegramUsernames ||
      telegramUsernames.length === 0
    ) {
      throw new UnauthorizedException('Missing required parameters');
    }

    // Parse the init data to extract information
    const searchParams = new URLSearchParams(telegramInitData);
    const user = JSON.parse(searchParams.get('user'));
    const lowerCaseTelegramUsernames = await Promise.all(
      telegramUsernames.map(async (username) => {
        console.log('username', username);
        return username.toLowerCase();
      }),
    );
    // Check if the username in the init data is in the provided array of usernames
    if (!lowerCaseTelegramUsernames.includes(user.username.toLowerCase())) {
      return { isValid: false };
    }

    // Find the user in the database
    const dbUser = await this.usersService.findByTelegramId(user.id);

    // Check if user exists and is active
    if (!dbUser || !dbUser.isActive) {
      return { isValid: false };
    }

    // Return the validated user
    return { isValid: true };
  }

  async sendMessage(
    userId: number,
    message: string,
    retries = 3,
  ): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    
    console.log('Attempting to send message to Telegram user:', userId);
    console.log('Bot token available:', !!this.botToken);
    
    if (!this.botToken) {
      console.error(
        'ERROR: Cannot send message - Telegram bot token is missing!',
      );
      return false;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Attempt ${attempt} to send message to user ${userId}`);
        console.log('Message content:', message.substring(0, 50) + '...');
        
        const requestBody = {
          chat_id: userId,
          text: message,
          parse_mode: 'HTML',
        };
        
        console.log('Request body:', JSON.stringify(requestBody));
        
        const response = await firstValueFrom(
          this.httpService.post(url, requestBody, {
            timeout: 10000, // 10 second timeout
          }),
        );

        console.log('Message sent successfully:', response.data);
        return response.data.ok === true;
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message);
        
        if (error.response) {
          console.error('Error response data:', error.response.data);
          console.error('Error response status:', error.response.status);
        }

        if (attempt < retries) {
          // Exponential backoff (500ms, 1000ms, 2000ms, etc.)
          const delay = 500 * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(
            'All retry attempts failed for sending Telegram message',
          );
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Validates Telegram init data signature
   * @param initData Raw init data string from Telegram
   * @returns Boolean indicating if the data is valid
   */
  validateInitData(initData: string): boolean {
    try {
      // In a real implementation, you would validate the hash here
      // This would involve checking the data_check_string against the hash using HMAC-SHA-256
      // For now, we'll just check if the data is parseable
      const searchParams = new URLSearchParams(initData);
      const user = searchParams.get('user');

      return !!user && JSON.parse(user).id !== undefined;
    } catch (error) {
      console.error('Error validating Telegram init data:', error);
      return false;
    }
  }

  /**
   * Extracts user data from Telegram init data
   * @param initData Raw init data string from Telegram
   * @returns The parsed user data object or null if invalid
   */
  extractUserData(initData: string): any {
    try {
      const searchParams = new URLSearchParams(initData);
      const userJson = searchParams.get('user');

      if (!userJson) {
        return null;
      }

      return JSON.parse(userJson);
    } catch (error) {
      console.error(
        'Error extracting user data from Telegram init data:',
        error,
      );
      return null;
    }
  }
}
