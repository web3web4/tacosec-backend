import {
  Injectable,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
// import { firstValueFrom } from 'rxjs';
// import { TelegramValidatorService } from './telegram-validator.service';
import { UsersService } from '../users/users.service';
import { PublicAddressesService } from '../public-addresses/public-addresses.service';
import {
  NotificationsService,
  NotificationLogData,
  NotificationResult,
} from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
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
    private readonly publicAddressesService: PublicAddressesService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
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
    replyMarkup?: any,
    notificationData?: {
      senderId?: Types.ObjectId;
      senderUserId?: Types.ObjectId;
      senderUsername?: string;
      recipientId?: Types.ObjectId;
      recipientUserId?: Types.ObjectId;
      recipientUsername?: string;
      type?: NotificationType;
      reason?: string;
      subject?: string;
      relatedEntityId?: Types.ObjectId;
      relatedEntityType?: string;
      metadata?: Record<string, any>;
    },
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

    const originalMessage = message;
    let recipientUser = null;

    // Check user's privacy mode and get recipient info
    try {
      recipientUser = await this.usersService.findByTelegramId(String(userId));
      if (recipientUser && recipientUser.privacyMode) {
        // Replace message with privacy-friendly text
        message = 'please check your data';
        console.log('User has privacy mode enabled, using generic message');
      }
    } catch (error) {
      console.log(
        'Could not check user privacy mode, proceeding with original message:',
        error.message,
      );
    }

    // Prepare notification log data
    const logData: NotificationLogData = {
      message: originalMessage,
      type: notificationData?.type || NotificationType.GENERAL,
      recipientUserId: recipientUser?._id || undefined,
      recipientUsername: recipientUser?.telegramUsername || undefined,
      senderUserId: notificationData?.senderUserId,
      senderUsername: notificationData?.senderUsername,
      reason: notificationData?.reason,
      subject: notificationData?.subject,
      relatedEntityId: notificationData?.relatedEntityId,
      relatedEntityType: notificationData?.relatedEntityType,
      telegramChatId: String(userId),
      telegramMessageId: undefined, // Will be set after successful send
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Attempt ${attempt} to send message to user ${userId}`);

        const requestBody: any = {
          chat_id: userId,
          text: message,
          parse_mode: 'HTML',
        };

        if (replyMarkup) {
          requestBody.reply_markup = replyMarkup;
        }

        console.log('Request body:', JSON.stringify(requestBody));

        // Use axios directly instead of HttpService
        const response = await axios.post(url, requestBody, {
          timeout: 10000, // 10 second timeout
        });

        console.log('Message sent successfully:', response.data);

        if (response.data.ok === true) {
          // Log successful notification
          logData.telegramMessageId =
            response.data.result?.message_id?.toString();
          await this.notificationsService.logNotificationWithResult(logData, {
            success: true,
            telegramMessageId: logData.telegramMessageId,
          });
          return true;
        }

        return false;
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

          // Log failed notification
          await this.notificationsService.logNotificationWithResult(logData, {
            success: false,
            error: error.message,
            errorMessage: error.response?.data,
          });
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
   * @param senderInfo Object containing sender's telegramId, username, and publicAddress
   * @param subject Optional subject for the message
   * @returns Object with success status and number of admins contacted
   */
  async sendMessageToAdmins(
    message: string,
    senderInfo: { telegramId: string; username: string; publicAddress: string },
    subject?: string,
  ): Promise<{ success: boolean; adminCount: number }> {
    try {
      // Get all admin users from the database
      const adminUsers = await this.usersService.findAdminUsers();

      if (adminUsers.length === 0) {
        console.log('No admin users found in the system');
        return { success: false, adminCount: 0 };
      }

      // Get additional sender information if telegramId is available
      let senderDisplayName = 'Unknown User';
      let senderFirstName = '';
      let senderLastName = '';
      let sender = null;

      if (senderInfo.telegramId) {
        try {
          sender = await this.usersService.findByTelegramId(
            senderInfo.telegramId,
          );
          if (sender) {
            senderFirstName = sender.firstName || '';
            senderLastName = sender.lastName || '';
            senderDisplayName =
              `${senderFirstName} ${senderLastName}`.trim() ||
              sender.username ||
              'Unknown User';
          }
        } catch (error) {
          console.log('Could not fetch sender details:', error.message);
        }
      }

      // Format the message with comprehensive sender information
      const formattedMessage = `🆘 <b>Support Request</b>

👤 <b>User:</b> ${senderDisplayName}
🪪 <b>Telegram Username:</b> ${senderInfo.username || 'N/A'}
🆔 <b>Telegram ID:</b> ${senderInfo.telegramId || 'N/A'}
🏦 <b>Public Address:</b> ${senderInfo.publicAddress || 'N/A'}
${subject ? `📋 <b>Subject:</b> ${subject}\n` : ''}💬 <b>Message:</b>
${message}

⏰ <b>Date:</b> ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })}`;

      let successCount = 0;
      const sendPromises = adminUsers.map(async (admin) => {
        try {
          const success = await this.sendMessage(
            Number(admin.telegramId),
            formattedMessage,
            3, // retries
            undefined, // replyMarkup
            {
              senderUserId: sender?._id,
              senderUsername: senderInfo.username,
              type: NotificationType.ADMIN_NOTIFICATION,
              reason: 'User message to admins',
              subject: subject,
              relatedEntityId: sender?._id,
              relatedEntityType: 'user',
            },
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
   * @param senderInfo Object containing sender's telegramId, username, and publicAddress
   * @param subject Optional subject for the message
   * @returns Object with success status
   */
  async sendMessageToSpecificAdmin(
    message: string,
    senderInfo: { telegramId: string; username: string; publicAddress: string },
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

      // Get additional sender information if telegramId is available
      let senderDisplayName = 'Unknown User';
      let senderFirstName = '';
      let senderLastName = '';
      let sender = null;

      if (senderInfo.telegramId) {
        try {
          sender = await this.usersService.findByTelegramId(
            senderInfo.telegramId,
          );
          if (sender) {
            senderFirstName = sender.firstName || '';
            senderLastName = sender.lastName || '';
            senderDisplayName =
              `${senderFirstName} ${senderLastName}`.trim() ||
              sender.username ||
              'Unknown User';
          }
        } catch (error) {
          console.log('Could not fetch sender details:', error.message);
        }
      }

      // Format the message with comprehensive sender information
      const formattedMessage = `🆘 <b>Support Request</b>

👤 <b>User:</b> ${senderDisplayName}
🪪 <b>Telegram Username:</b> ${senderInfo.username || 'N/A'}
🆔 <b>Telegram ID:</b> ${senderInfo.telegramId || 'N/A'}
🏦 <b>Public Address:</b> ${senderInfo.publicAddress || 'N/A'}
${subject ? `📋 <b>Subject:</b> ${subject}\n` : ''}💬 <b>Message:</b>
${message}

⏰ <b>Date:</b> ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })}`;

      // Send message to the specific admin
      const success = await this.sendMessage(
        Number(adminTelegramId),
        formattedMessage,
        3, // retries
        undefined, // replyMarkup
        {
          senderUserId: sender?._id,
          senderUsername: senderInfo.username,
          type: NotificationType.ADMIN_NOTIFICATION,
          reason: 'User message to specific admin',
          subject: subject,
          relatedEntityId: sender?._id,
          relatedEntityType: 'user',
        },
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
    // Extract sender information from request (supports both JWT and Telegram auth)
    const senderInfo = {
      telegramId: '',
      username: '',
      publicAddress: '',
    };

    try {
      // Priority 1: JWT authentication - extract user info from req.user
      if (req?.user?.id) {
        const user = await this.usersService.findOne(req.user.id);
        if (user) {
          senderInfo.telegramId = user.telegramId || '';
          senderInfo.username = user.username || '';

          // Get latest public address for the user
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByUserId(
                req.user.id,
              );
            if (addressResponse.success && addressResponse.data) {
              senderInfo.publicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            console.log('No public address found for user:', req.user.id);
            senderInfo.publicAddress = '';
          }
        }
      } else {
        // Priority 2: Telegram authentication - extract from telegram init data
        const telegramId = this.extractTelegramIdFromRequest(
          req,
          telegramDtoAuthGuard,
        );
        senderInfo.telegramId = telegramId;

        // Get user info and username from database
        if (senderInfo.telegramId) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                senderInfo.telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              senderInfo.publicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            console.log(
              'No public address found for telegramId:',
              senderInfo.telegramId,
            );
            senderInfo.publicAddress = '';
          }

          // Get username from user record
          try {
            const user = await this.usersService.findByTelegramId(
              senderInfo.telegramId,
            );
            if (user) {
              senderInfo.username = user.username || '';
            }
          } catch (error) {
            console.log(
              'Could not find user by telegramId:',
              senderInfo.telegramId,
            );
          }
        }
      }
    } catch (error) {
      console.error('Error extracting sender information:', error);
      // Continue with empty sender info if extraction fails
    }

    return await this.sendMessageToAdmins(message, senderInfo, subject);
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
    // Extract sender information from request (supports both JWT and Telegram auth)
    const senderInfo = {
      telegramId: '',
      username: '',
      publicAddress: '',
    };

    try {
      // Priority 1: JWT authentication - extract user info from req.user
      if (req?.user?.id) {
        const user = await this.usersService.findOne(req.user.id);
        if (user) {
          senderInfo.telegramId = user.telegramId || '';
          senderInfo.username = user.username || '';

          // Get latest public address for the user
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByUserId(
                req.user.id,
              );
            if (addressResponse.success && addressResponse.data) {
              senderInfo.publicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            console.log('No public address found for user:', req.user.id);
            senderInfo.publicAddress = '';
          }
        }
      }
      // Priority 2: Telegram authentication - extract from telegram data
      else if (req?.headers?.['x-telegram-init-data']) {
        const parsedData = telegramDtoAuthGuard.parseTelegramInitData(
          req.headers['x-telegram-init-data'],
        );
        senderInfo.telegramId = parsedData.telegramId || '';
        senderInfo.username = parsedData.username || '';

        // Try to find user by telegramId to get public address
        if (senderInfo.telegramId) {
          try {
            const addressResponse =
              await this.publicAddressesService.getLatestAddressByTelegramId(
                senderInfo.telegramId,
              );
            if (addressResponse.success && addressResponse.data) {
              senderInfo.publicAddress = addressResponse.data.publicKey;
            }
          } catch (error) {
            console.log(
              'No user or public address found for telegramId:',
              senderInfo.telegramId,
            );
            senderInfo.publicAddress = '';
          }
        }
      }
    } catch (error) {
      console.error('Error extracting sender information:', error);
      // Continue with empty sender info if extraction fails
    }

    return await this.sendMessageToSpecificAdmin(message, senderInfo, subject);
  }

  /**
   * Send a message from admin to a specific user by userId
   * @param adminRequest The admin request object
   * @param userId The target user's MongoDB ObjectId
   * @param message The message to send
   * @param subject Optional subject for the message
   * @returns Promise with success status and user info
   */
  async handleAdminToUserMessage(
    adminRequest: any,
    userId: string,
    message: string,
    subject?: string,
  ): Promise<{
    success: boolean;
    userFound: boolean;
    hasTelegram: boolean;
    userInfo?: any;
    error?: string;
  }> {
    try {
      // Find the target user by userId
      const targetUser = await this.usersService.findById(userId);

      if (!targetUser) {
        return {
          success: false,
          userFound: false,
          hasTelegram: false,
          error: 'User not found',
        };
      }

      // Check if user has telegram account
      if (!targetUser.telegramId) {
        return {
          success: false,
          userFound: true,
          hasTelegram: false,
          userInfo: {
            username: targetUser.username,
            firstName: targetUser.firstName,
            lastName: targetUser.lastName,
          },
          error: 'User does not have a Telegram account',
        };
      }

      // Get admin info for the message
      let adminInfo = '';
      try {
        if (adminRequest.user && adminRequest.user.userId) {
          const admin = await this.usersService.findById(
            adminRequest.user.userId,
          );
          if (admin) {
            adminInfo = `\n\n<i>📤 Sent by Admin: ${admin.firstName || ''} ${admin.lastName || ''} (@${admin.username || 'admin'})</i>`;
          }
        }
      } catch (error) {
        console.log('Could not get admin info:', error.message);
        adminInfo = '\n\n<i>📤 Sent by Admin</i>';
      }

      // Format the message
      let formattedMessage = '';
      if (subject) {
        formattedMessage = `<b>📢 ${subject}</b>\n\n${message}${adminInfo}`;
      } else {
        formattedMessage = `<b>📢 Admin Message</b>\n\n${message}${adminInfo}`;
      }

      // Send the message
      const messageSent = await this.sendMessage(
        Number(targetUser.telegramId),
        formattedMessage,
        3, // retries
        undefined, // replyMarkup
        {
          senderUserId: adminRequest.user?.userId,
          senderUsername: adminRequest.user?.username,
          type: NotificationType.USER_NOTIFICATION,
          reason: 'Admin message to user',
          subject: subject,
          relatedEntityId: new Types.ObjectId(userId),
          relatedEntityType: 'user',
        },
      );

      return {
        success: messageSent,
        userFound: true,
        hasTelegram: true,
        userInfo: {
          username: targetUser.username,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName,
          telegramId: targetUser.telegramId,
        },
        error: messageSent ? undefined : 'Failed to send message to Telegram',
      };
    } catch (error) {
      console.error('Error in handleAdminToUserMessage:', error);
      return {
        success: false,
        userFound: false,
        hasTelegram: false,
        error: 'Internal server error',
      };
    }
  }
}
