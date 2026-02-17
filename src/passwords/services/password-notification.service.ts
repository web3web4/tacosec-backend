import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppConfigService } from '../../common/config/app-config.service';
import { Password, PasswordDocument } from '../schemas/password.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Report, ReportDocument } from '../../reports/schemas/report.schema';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../../public-addresses/schemas/public-address.schema';
import { TelegramDtoAuthGuard } from '../../guards/telegram-dto-auth.guard';
import { TelegramService } from '../../telegram/telegram.service';
import { PublicAddressesService } from '../../public-addresses/public-addresses.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/schemas/notification.schema';
import { UserFinderUtil } from '../../utils/user-finder.util';
import { PasswordBaseService } from './password-base.service';

/**
 * Password Notification Service
 * Handles sending notifications for password sharing and child password creation
 */
@Injectable()
export class PasswordNotificationService extends PasswordBaseService {
  constructor(
    @InjectModel(Password.name) passwordModel: Model<PasswordDocument>,
    @InjectModel(User.name) userModel: Model<UserDocument>,
    @InjectModel(Report.name) reportModel: Model<ReportDocument>,
    @InjectModel(PublicAddress.name)
    publicAddressModel: Model<PublicAddressDocument>,
    telegramDtoAuthGuard: TelegramDtoAuthGuard,
    publicAddressesService: PublicAddressesService,
    private readonly telegramService: TelegramService,
    private readonly notificationsService: NotificationsService,
    private readonly appConfig: AppConfigService,
  ) {
    super(
      passwordModel,
      userModel,
      reportModel,
      publicAddressModel,
      telegramDtoAuthGuard,
      publicAddressesService,
    );
  }

  /**
   * Send notifications to all users in the sharedWith list
   */
  async sendMessageToUsersBySharedWith(passwordUser: Password): Promise<void> {
    try {
      console.log('='.repeat(80));
      console.log(
        '[NOTIFICATION SERVICE] sendMessageToUsersBySharedWith called!',
      );
      console.log('[NOTIFICATION SERVICE] passwordUser._id:', passwordUser._id);
      console.log(
        '[NOTIFICATION SERVICE] passwordUser.userId:',
        passwordUser.userId,
      );
      console.log(
        '[NOTIFICATION SERVICE] passwordUser.sharedWith length:',
        passwordUser.sharedWith?.length || 0,
      );
      console.log(
        '[NOTIFICATION SERVICE] passwordUser.parent_secret_id:',
        passwordUser.parent_secret_id,
      );
      console.log('='.repeat(80));

      // Skip for child secrets
      if (passwordUser.parent_secret_id) {
        console.log('Skipping shared notifications for child secret');
        return;
      }

      const user = await this.userModel.findById(passwordUser.userId).exec();
      if (!user) {
        console.error(
          'User not found when trying to send shared password messages',
        );
        return;
      }

      if (!user.telegramId || user.telegramId === '') {
        console.log(
          'Sender has no Telegram ID — proceeding with fallback notifications',
        );
      }

      if (!passwordUser.sharedWith || passwordUser.sharedWith.length === 0) {
        console.log('No shared with users to notify');
        return;
      }

      console.log(
        `Attempting to send messages to ${passwordUser.sharedWith.length} users`,
      );

      const senderPublicAddress = await this.getLatestPublicAddress(
        String(user._id),
      );
      const formattedSenderAddress =
        this.formatPublicAddress(senderPublicAddress);

      const messagePromises = passwordUser.sharedWith.map(
        async (sharedWith) => {
          try {
            const recipients = await this.resolveRecipients(sharedWith);

            if (!recipients.length) {
              console.log('Skipping notification - no recipients resolved');
              return;
            }

            for (const recipientInfo of recipients) {
              console.log(
                `[DEBUG] Processing recipient: ${recipientInfo.username} (telegramId: ${recipientInfo.telegramId})`,
              );

              if (this.isSameUser(user, recipientInfo)) {
                console.log('[DEBUG] Skipping - same user');
                continue;
              }

              if (!recipientInfo.telegramId) {
                console.log('[DEBUG] No telegram ID - sending fallback');
                await this.sendFallbackNotification(
                  user,
                  recipientInfo,
                  passwordUser,
                  formattedSenderAddress,
                  senderPublicAddress,
                );
                continue;
              }

              console.log(
                '[DEBUG] Has telegram ID - sending telegram notification',
              );
              await this.sendTelegramShareNotification(
                user,
                recipientInfo,
                passwordUser,
                formattedSenderAddress,
                senderPublicAddress,
              );
            }
          } catch (error) {
            console.error(
              `Failed to process shared entry: ${(error as Error).message}`,
            );
          }
        },
      );

      await Promise.all(messagePromises);
      console.log('All notifications processed');
    } catch (error) {
      console.error(
        'Error in sendMessageToUsersBySharedWith:',
        (error as Error).message,
      );
    }
  }

  /**
   * Send notification to parent password owner when child password is created
   */
  async sendChildPasswordNotificationToParentOwner(
    parentSecretId: string,
    childUser: UserDocument,
    childSecretName: string,
    childSecretId: string,
  ): Promise<void> {
    try {
      const parentPassword = await this.passwordModel
        .findById(parentSecretId)
        .exec();

      if (!parentPassword) {
        console.error('Parent password not found for notification');
        return;
      }

      const parentOwner = await this.userModel
        .findById(parentPassword.userId)
        .exec();

      if (!parentOwner) {
        console.error('Parent password owner not found');
        return;
      }

      // Don't notify self
      if (String(parentOwner._id) === String(childUser._id)) {
        console.log(
          'Child password creator is the same as parent owner, skipping',
        );
        return;
      }

      const senderPublicAddress = await this.getLatestPublicAddress(
        String(childUser._id),
      );
      const formattedSenderAddress =
        this.formatPublicAddress(senderPublicAddress);

      // Fallback if parent owner has no Telegram
      if (!parentOwner.telegramId || parentOwner.telegramId === '') {
        console.log(
          'Parent owner has no Telegram ID, logging fallback notification',
        );
        await this.logChildPasswordFallbackNotification(
          parentOwner,
          childUser,
          parentSecretId,
          childSecretId,
          childSecretName,
          formattedSenderAddress,
          senderPublicAddress,
        );
        return;
      }

      const childUserDisplayName = this.getUserDisplayName(childUser);
      const dateTime = this.formatDateTime(new Date());

      const message = `🔔 <b>New Child Secret Response</b>

👤 <b>User:</b> ${childUserDisplayName}
🆔 <b>Public Address:</b> ${senderPublicAddress || 'N/A'}
🕒 <b>Time:</b> ${dateTime}

🔄 <b>Update:</b> ❝❞
A new secret has been sent in response to yours.

📋 <b>Action:</b>
Check your Secrets List to view it`;

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: 'Open Reply',
              url: `${this.appConfig.telegramBotUrl}?startapp=${parentSecretId}_mydata_${childSecretId}`,
            },
          ],
        ],
      };

      await this.telegramService.sendMessage(
        Number(parentOwner.telegramId),
        message,
        3,
        replyMarkup,
        {
          type: NotificationType.PASSWORD_CHILD_RESPONSE,
          recipientId: parentOwner._id as Types.ObjectId,
          recipientUsername: parentOwner.username,
          senderUserId: childUser._id as Types.ObjectId,
          senderUsername: childUser.username,
          reason: 'Child password response notification',
          subject: 'Child Secret Response',
          relatedEntityType: 'password',
          relatedEntityId: new Types.ObjectId(childSecretId),
          parentId: new Types.ObjectId(parentSecretId),
          tabName: 'mydata',
          metadata: {
            parentSecretId,
            childSecretName,
            responseDate: new Date(),
          },
        },
      );

      console.log(
        `Child password notification sent to ${parentOwner.username}`,
      );
    } catch (error) {
      console.error(
        'Error sending child password notification:',
        (error as Error).message,
      );
    }
  }

  /**
   * Send notification to shared users when child password is created
   */
  async sendChildPasswordNotificationToSharedUsers(
    parentSecretId: string,
    childUser: UserDocument,
    childSecretName: string,
    childSecretId: string,
  ): Promise<void> {
    try {
      const parentPassword = await this.passwordModel
        .findById(parentSecretId)
        .exec();

      if (!parentPassword) {
        console.error('Parent password not found for shared user notification');
        return;
      }

      const parentOwner = await this.userModel
        .findById(parentPassword.userId)
        .exec();

      if (!parentOwner) {
        console.error('Parent password owner not found');
        return;
      }

      const sharedWith = parentPassword.sharedWith || [];
      if (sharedWith.length === 0) {
        console.log('No shared users found for parent password');
        return;
      }

      const childUserDisplayName = this.getUserDisplayName(childUser);
      const parentOwnerDisplayName = this.getUserDisplayName(parentOwner);
      const dateTime = this.formatDateTime(new Date());

      const childPublicAddress = await this.getLatestPublicAddress(
        String(childUser._id),
      );
      const parentPublicAddress = await this.getLatestPublicAddress(
        String(parentOwner._id),
      );
      const formattedChildAddress =
        this.formatPublicAddress(childPublicAddress);
      const formattedParentAddress =
        this.formatPublicAddress(parentPublicAddress);

      for (const sharedUser of sharedWith) {
        try {
          const recipients = await this.resolveRecipients(sharedUser);

          for (const recipientInfo of recipients) {
            // Skip if recipient is the child creator or parent owner
            if (
              this.isSameUser(childUser, recipientInfo) ||
              this.isSameUser(parentOwner, recipientInfo)
            ) {
              continue;
            }

            if (!recipientInfo.telegramId) {
              await this.logChildPasswordSharedUserFallback(
                recipientInfo,
                childUser,
                parentOwner,
                parentSecretId,
                childSecretId,
                childSecretName,
                formattedChildAddress,
                formattedParentAddress,
              );
              continue;
            }

            const message = `🔐 <b>Secret Reply Received</b> ❝❞

👤 <b>From:</b> ${childUserDisplayName}
🕒 <b>Time:</b> ${dateTime}

🔄 <b>Update:</b> ❝❞
There's a new reply to a secret shared with you.

📋 <b>Action:</b>
View it in your Shared Secrets List`;

            const replyMarkup = {
              inline_keyboard: [
                [
                  {
                    text: 'Open Reply',
                    url: `${this.appConfig.telegramBotUrl}?startapp=${parentSecretId}_shared_${childSecretId}`,
                  },
                ],
              ],
            };

            await this.telegramService.sendMessage(
              Number(recipientInfo.telegramId),
              message,
              3,
              replyMarkup,
              {
                type: NotificationType.PASSWORD_CHILD_RESPONSE,
                recipientUserId: new Types.ObjectId(
                  String(recipientInfo.userId),
                ),
                recipientUsername: recipientInfo.username,
                senderUserId: childUser._id as Types.ObjectId,
                senderUsername: childUser.username,
                reason: 'Child password response notification to shared user',
                subject: 'Reply to Shared Secret',
                relatedEntityType: 'password',
                relatedEntityId: new Types.ObjectId(childSecretId),
                parentId: new Types.ObjectId(parentSecretId),
                tabName: 'shared',
                metadata: {
                  parentSecretId,
                  childSecretName,
                  parentOwnerUsername: parentOwner.username,
                  responseDate: new Date(),
                },
              },
            );
          }
        } catch (error) {
          console.error(
            `Error sending notification to shared user: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      console.error(
        'Error sending child password notification to shared users:',
        (error as Error).message,
      );
    }
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private async resolveRecipients(sharedWith: any): Promise<any[]> {
    console.log(`[DEBUG] resolveRecipients called with:`, {
      username: sharedWith.username,
      userId: sharedWith?.userId,
      publicAddress: sharedWith?.publicAddress,
      telegramId: sharedWith?.telegramId,
    });

    const recipients: any[] = [];
    const onlyPublicAddress =
      !!sharedWith?.publicAddress &&
      !sharedWith.username &&
      !sharedWith?.userId &&
      !sharedWith?.telegramId;

    if (onlyPublicAddress) {
      const infos = await UserFinderUtil.findUsersByPublicAddress(
        sharedWith.publicAddress,
        this.userModel,
        this.publicAddressModel,
      );
      infos.forEach((i) => recipients.push(i));
    } else {
      const info = await UserFinderUtil.findUserByAnyInfo(
        {
          username: sharedWith.username,
          userId: sharedWith?.userId,
          publicAddress: sharedWith?.publicAddress,
          telegramId: sharedWith?.telegramId,
        },
        this.userModel,
        this.publicAddressModel,
      );
      if (info) recipients.push(info);
    }

    console.log(
      `[DEBUG] resolveRecipients found ${recipients.length} recipient(s)`,
    );

    return recipients;
  }

  private isSameUser(user: UserDocument, recipientInfo: any): boolean {
    const userId = user._id ? String(user._id) : '';
    const username = (user.username || '').toLowerCase();
    const telegramId = String(user.telegramId || '');

    const recipientId = recipientInfo.userId
      ? String(recipientInfo.userId)
      : '';
    const recipientUsername = (recipientInfo.username || '').toLowerCase();
    const recipientTelegramId = String(recipientInfo.telegramId || '');

    if (recipientId && recipientId === userId) return true;
    if (recipientUsername && username && recipientUsername === username)
      return true;
    if (recipientTelegramId && telegramId && recipientTelegramId === telegramId)
      return true;

    return false;
  }

  private getUserDisplayName(user: UserDocument): string {
    if (user.firstName && user.firstName.trim() !== '') {
      return `${user.firstName} ${user.lastName || ''}`.trim();
    }
    return user.username;
  }

  private formatDateTime(date: Date): string {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const month = months[date.getUTCMonth()];
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    const formattedHour = hour12.toString().padStart(2, '0');
    return `${month} ${day}, ${year} · ${formattedHour}:${minutes} ${ampm} (UTC)`;
  }

  private async sendFallbackNotification(
    sender: UserDocument,
    recipient: any,
    password: Password,
    formattedSenderAddress: string,
    senderPublicAddress?: string,
  ): Promise<void> {
    try {
      const recipientPublicAddress = await this.getLatestPublicAddress(
        String(recipient.userId),
      );

      const fallbackMessage = `🔐 Secret Shared With You\n\n👤 From: ${sender.username}\n🆔 Public Address: ${formattedSenderAddress}\n🕐 Time: ${this.formatDateTime(new Date())}\n\n📝 Update:\nA new secret has been shared with you.\n\n📁 Action:\nView it in your Shared Secrets List`;

      await this.notificationsService.logNotificationWithResult(
        {
          message: fallbackMessage,
          type: NotificationType.PASSWORD_SHARED,
          recipientUserId: new Types.ObjectId(String(recipient.userId)),
          recipientUsername: recipient.username,
          senderUserId: sender._id as Types.ObjectId,
          senderUsername: sender.username,
          reason: 'Telegram unavailable: recipient has no Telegram ID',
          subject: 'Secret Shared With You',
          tabName: 'shared',
          relatedEntityType: 'password',
          relatedEntityId: password._id as Types.ObjectId,
          parentId: undefined,
          metadata: {
            passwordKey: password.key,
            sharedAt: new Date(),
            senderPublicAddress,
            recipientPublicAddress,
            telegramSent: false,
          },
        },
        {
          success: false,
          errorMessage: 'Recipient has no Telegram account',
        },
      );
    } catch (error) {
      console.error('Failed to log fallback notification:', error);
    }
  }

  private async sendTelegramShareNotification(
    sender: UserDocument,
    recipient: any,
    password: Password,
    formattedSenderAddress: string,
    fullSenderAddress?: string,
  ): Promise<void> {
    console.log(
      `[DEBUG] sendTelegramShareNotification called for recipient: ${recipient.username} (${recipient.telegramId})`,
    );

    const userName = this.getUserDisplayName(sender);
    const displayAddress = fullSenderAddress || formattedSenderAddress;

    const message = `🔐 <b>Secret Shared With You</b> ❝❞

👤 <b>From:</b> ${userName}
🆔 <b>Public Address:</b> ${displayAddress}
🕒 <b>Time:</b> ${this.formatDateTime(new Date())}

🔄 <b>Update:</b> ❝❞
A new secret has been shared with you.

📋 <b>Action:</b>
View it in your Shared Secrets List`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: 'Open Secret',
            url: `${this.appConfig.telegramBotUrl}?startapp=${password._id}_shared`,
          },
        ],
      ],
    };

    console.log(
      `[DEBUG] Calling telegramService.sendMessage to ${recipient.telegramId}`,
    );

    await this.telegramService.sendMessage(
      Number(recipient.telegramId),
      message,
      3,
      replyMarkup,
      {
        type: NotificationType.PASSWORD_SHARED,
        recipientId: new Types.ObjectId(String(recipient.userId)),
        recipientUsername: recipient.username,
        senderUserId: sender._id as Types.ObjectId,
        senderUsername: sender.username,
        reason: 'Password shared notification',
        subject: 'Secret Shared With You',
        relatedEntityType: 'password',
        relatedEntityId: password._id as Types.ObjectId,
        parentId: undefined,
        tabName: 'shared',
        metadata: {
          passwordKey: password.key,
          sharedAt: new Date(),
        },
      },
    );
  }

  private async logChildPasswordFallbackNotification(
    parentOwner: UserDocument,
    childUser: UserDocument,
    parentSecretId: string,
    childSecretId: string,
    childSecretName: string,
    formattedSenderAddress: string,
    senderPublicAddress?: string,
  ): Promise<void> {
    try {
      const recipientPublicAddress = await this.getLatestPublicAddress(
        String(parentOwner._id),
      );

      const fallbackMessage = `🔔 New Child Secret Response\n\n👤 User: ${childUser.username}\n🆔 Public Address: ${formattedSenderAddress}\n🕐 Time: ${this.formatDateTime(new Date())}\n\n📝 Update:\nA new secret has been sent in response to yours.\n\n📁 Action:\nCheck your Secrets List to view it`;

      await this.notificationsService.logNotificationWithResult(
        {
          message: fallbackMessage,
          type: NotificationType.PASSWORD_CHILD_RESPONSE,
          recipientUserId: parentOwner._id as Types.ObjectId,
          recipientUsername: parentOwner.username,
          senderUserId: childUser._id as Types.ObjectId,
          senderUsername: childUser.username,
          reason: 'Telegram unavailable: parent owner has no Telegram ID',
          subject: 'Child Secret Response',
          tabName: 'mydata',
          relatedEntityType: 'password',
          relatedEntityId: new Types.ObjectId(childSecretId),
          parentId: new Types.ObjectId(parentSecretId),
          metadata: {
            parentSecretId,
            childSecretName,
            senderPublicAddress,
            recipientPublicAddress,
            telegramSent: false,
          },
        },
        {
          success: false,
          errorMessage: 'Recipient has no Telegram account',
        },
      );
    } catch (error) {
      console.error('Failed to log fallback notification:', error);
    }
  }

  private async logChildPasswordSharedUserFallback(
    recipient: any,
    childUser: UserDocument,
    parentOwner: UserDocument,
    parentSecretId: string,
    childSecretId: string,
    childSecretName: string,
    formattedChildAddress: string,
    formattedParentAddress: string,
  ): Promise<void> {
    try {
      const recipientPublicAddress = await this.getLatestPublicAddress(
        String(recipient.userId),
      );
      const senderPublicAddress = await this.getLatestPublicAddress(
        String(childUser._id),
      );

      const fallbackMessage = `📬 Secret Reply Received\n\n👤 From: ${childUser.username}\n🕐 Time: ${this.formatDateTime(new Date())}\n\n🔄 Update:\nThere's a new reply to a secret shared with you.\n\n📁 Action:\nView it in your Shared Secrets List`;

      await this.notificationsService.logNotificationWithResult(
        {
          message: fallbackMessage,
          type: NotificationType.PASSWORD_CHILD_RESPONSE,
          recipientUserId: new Types.ObjectId(String(recipient.userId)),
          recipientUsername: recipient.username,
          senderUserId: childUser._id as Types.ObjectId,
          senderUsername: childUser.username,
          reason: 'Telegram unavailable: shared user has no Telegram ID',
          subject: 'Reply to Shared Secret',
          tabName: 'shared',
          relatedEntityType: 'password',
          relatedEntityId: new Types.ObjectId(childSecretId),
          parentId: new Types.ObjectId(parentSecretId),
          metadata: {
            parentSecretId,
            childSecretName,
            senderPublicAddress,
            recipientPublicAddress,
            telegramSent: false,
          },
        },
        {
          success: false,
          errorMessage: 'Recipient has no Telegram account',
        },
      );
    } catch (error) {
      console.error('Failed to log fallback notification:', error);
    }
  }
}
