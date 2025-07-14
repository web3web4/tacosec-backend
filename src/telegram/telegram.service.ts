import {
  Injectable,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
// import { firstValueFrom } from 'rxjs';
// import { TelegramValidatorService } from './telegram-validator.service';
import { UsersService } from '../users/users.service';
import axios from 'axios';

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
    console.log('Full message content:', message);

    if (!this.botToken) {
      console.error(
        'ERROR: Cannot send message - Telegram bot token is missing!',
      );
      return false;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Attempt ${attempt} to send message to user ${userId}`);

        const requestBody = {
          chat_id: userId,
          text: message,
          parse_mode: 'HTML',
        };

        console.log('Request body:', JSON.stringify(requestBody));

        // Use axios directly instead of HttpService
        const response = await axios.post(url, requestBody, {
          timeout: 10000, // 10 second timeout
        });

        console.log('Message sent successfully:', response.data);
        return response.data.ok === true;
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message);

        if (error.response) {
          console.error(
            'Error response data:',
            JSON.stringify(error.response.data),
          );
          console.error('Error response status:', error.response.status);
        } else {
          console.error('Full error object:', JSON.stringify(error));
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

  /**
   * Send a message to all admin users
   * @param message The message to send
   * @param senderTelegramId The telegram ID of the sender
   * @param subject Optional subject for the message
   * @returns Object with success status and number of admins contacted
   */
  async sendMessageToAdmins(
    message: string,
    senderTelegramId: string,
    subject?: string,
  ): Promise<{ success: boolean; adminCount: number }> {
    try {
      // Get all admin users from the database
      const adminUsers = await this.usersService.findAdminUsers();

      if (adminUsers.length === 0) {
        console.log('No admin users found in the system');
        return { success: false, adminCount: 0 };
      }

      // Get sender information
      const sender = await this.usersService.findByTelegramId(senderTelegramId);

      // Format the message with sender information
      const formattedMessage = `🆘 <b>Support Request</b>

👤 <b>User:</b> ${sender?.firstName || ''} ${sender?.lastName || ''}
🪪 <b>Telegram Username:</b> ${sender?.username || 'N/A'}
🆔 <b>Telegram ID:</b> ${senderTelegramId}
${subject ? `📋 <b>Subject:</b> ${subject}\n` : ''}
💬 <b>Message:</b>
${message}

⏰ <b>Date:</b> ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })}`;

      let successCount = 0;
      const sendPromises = adminUsers.map(async (admin) => {
        try {
          const success = await this.sendMessage(
            Number(admin.telegramId),
            formattedMessage,
          );
          if (success) {
            successCount++;
            console.log(
              `Message sent successfully to admin: ${admin.telegramId}`,
            );
          } else {
            console.log(`Failed to send message to admin: ${admin.telegramId}`);
          }
          return success;
        } catch (error) {
          console.error(
            `Error sending message to admin ${admin.telegramId}:`,
            error,
          );
          return false;
        }
      });

      // Wait for all messages to be sent
      await Promise.all(sendPromises);

      console.log(
        `Message sent to ${successCount}/${adminUsers.length} admin users`,
      );

      return {
        success: successCount > 0,
        adminCount: successCount,
      };
    } catch (error) {
      console.error('Error sending message to admins:', error);
      return { success: false, adminCount: 0 };
    }
  }

  /**
   * Send a message to a specific admin user defined in environment variables
   * @param message The message to send
   * @param senderTelegramId The telegram ID of the sender
   * @param subject Optional subject for the message
   * @returns Object with success status
   */
  async sendMessageToSpecificAdmin(
    message: string,
    senderTelegramId: string,
    subject?: string,
  ): Promise<{ success: boolean; adminTelegramId?: string }> {
    try {
      // Get the admin telegram ID from environment variables
      const adminTelegramId =
        this.configService.get<string>('ADMIN_TELEGRAM_ID');

      if (!adminTelegramId) {
        console.error(
          'ADMIN_TELEGRAM_ID is not configured in environment variables',
        );
        return { success: false };
      }

      // Get sender information
      const sender = await this.usersService.findByTelegramId(senderTelegramId);

      // Format the message with sender information
      const formattedMessage = `🆘 <b>Support Request</b>

👤 <b>User:</b> ${sender?.firstName || ''} ${sender?.lastName || ''}
🪪 <b>Telegram Username:</b> ${sender?.username || 'N/A'}
🆔 <b>Telegram ID:</b> ${senderTelegramId}
${subject ? `📋 <b>Subject:</b> ${subject}\n` : ''}💬 <b>Message:</b>
${message}

⏰ <b>Date:</b> ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })}`;

      // Send message to the specific admin
      const success = await this.sendMessage(
        Number(adminTelegramId),
        formattedMessage,
      );

      if (success) {
        console.log(`Message sent successfully to admin: ${adminTelegramId}`);
      } else {
        console.log(`Failed to send message to admin: ${adminTelegramId}`);
      }

      return {
        success,
        adminTelegramId: success ? adminTelegramId : undefined,
      };
    } catch (error) {
      console.error('Error sending message to specific admin:', error);
      return { success: false };
    }
  }

  /**
   * Extract telegram ID from request - prioritizes JWT token over x-telegram-init-data
   * @param req The request object
   * @param telegramDtoAuthGuard The guard instance for parsing telegram data
   * @returns The telegram ID as string
   */
  extractTelegramIdFromRequest(req: any, telegramDtoAuthGuard: any): string {
    // Check if user data is available from JWT token
    if (req.user && req.user.telegramId) {
      return req.user.telegramId;
    }

    // Fallback to x-telegram-init-data
    const teleDtoData = telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return teleDtoData.telegramId;
  }

  /**
   * Handle sending message with automatic telegram ID extraction
   * @param req The request object
   * @param message The message to send
   * @param telegramDtoAuthGuard The guard instance for parsing telegram data
   * @returns Object with success status
   */
  async handleSendMessage(
    req: any,
    message: string,
    telegramDtoAuthGuard: any,
  ): Promise<{ success: boolean }> {
    const telegramId = this.extractTelegramIdFromRequest(
      req,
      telegramDtoAuthGuard,
    );

    const success = await this.sendMessage(Number(telegramId), message);
    return { success };
  }

  /**
   * Handle sending message to admin with automatic telegram ID extraction
   * @param req The request object
   * @param message The message to send
   * @param subject Optional subject for the message
   * @param telegramDtoAuthGuard The guard instance for parsing telegram data
   * @returns Object with success status and admin count
   */
  async handleSendMessageToAdmin(
    req: any,
    message: string,
    subject: string | undefined,
    telegramDtoAuthGuard: any,
  ): Promise<{ success: boolean; adminCount: number }> {
    const telegramId = this.extractTelegramIdFromRequest(
      req,
      telegramDtoAuthGuard,
    );

    return await this.sendMessageToAdmins(message, telegramId, subject);
  }

  /**
   * Handle sending message to specific admin with automatic telegram ID extraction
   * @param req The request object
   * @param message The message to send
   * @param subject Optional subject for the message
   * @param telegramDtoAuthGuard The guard instance for parsing telegram data
   * @returns Object with success status and admin telegram ID
   */
  async handleSendMessageToSpecificAdmin(
    req: any,
    message: string,
    subject: string | undefined,
    telegramDtoAuthGuard: any,
  ): Promise<{ success: boolean; adminTelegramId?: string }> {
    const telegramId = this.extractTelegramIdFromRequest(
      req,
      telegramDtoAuthGuard,
    );

    return await this.sendMessageToSpecificAdmin(message, telegramId, subject);
  }
}
