import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  USER_TO_USER = 'user_to_user',
  USER_TO_ADMIN = 'user_to_admin',
  ADMIN_TO_USER = 'admin_to_user',
  ADMIN_TO_ADMIN = 'admin_to_admin',
  SYSTEM_TO_USER = 'system_to_user',
  SYSTEM_TO_ADMIN = 'system_to_admin',
  GENERAL = 'general',
  PASSWORD_SHARED = 'password_shared',
  PASSWORD_CHILD_RESPONSE = 'password_child_response',
  REPORT_NOTIFICATION = 'report_notification',
  ADMIN_NOTIFICATION = 'admin_notification',
  USER_NOTIFICATION = 'user_notification',
  USERNAME_CHANGE = 'username_change',
}

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
  PENDING = 'pending',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true })
  message: string;

  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  @Prop({
    required: true,
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  telegramStatus: NotificationStatus;

  // User ID that received the notification
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipientUserId: Types.ObjectId;

  @Prop()
  recipientTelegramId: string;

  @Prop()
  recipientUsername: string;

  // User ID that caused the notification (sender)
  @Prop({ type: Types.ObjectId, ref: 'User' })
  senderUserId: Types.ObjectId;

  @Prop()
  senderTelegramId: string;

  @Prop()
  senderUsername: string;

  // Additional information about the reason for the notification
  @Prop()
  reason: string;

  @Prop()
  subject: string;

  // ID of the related entity (e.g. shared password ID)
  @Prop({ type: Types.ObjectId })
  relatedEntityId: Types.ObjectId;

  @Prop()
  relatedEntityType: string;

  // Parent secret ID for reply-type notifications
  @Prop({ type: Types.ObjectId })
  parentId: Types.ObjectId;

  // Technical information about the sending
  @Prop()
  telegramMessageId: number;

  @Prop()
  telegramResponse: string;

  @Prop()
  errorMessage: string;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop()
  sentAt: Date;

  @Prop()
  failedAt: Date;

  // Additional information that can be stored as JSON
  @Prop()
  tabName : string;

  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Create indexes for fast search
NotificationSchema.index({ recipientUserId: 1, createdAt: -1 });
NotificationSchema.index({ senderUserId: 1, createdAt: -1 });
NotificationSchema.index({ type: 1, createdAt: -1 });
NotificationSchema.index({ telegramStatus: 1, createdAt: -1 });
NotificationSchema.index({ recipientTelegramId: 1, createdAt: -1 });
NotificationSchema.index({ senderTelegramId: 1, createdAt: -1 });
NotificationSchema.index({ relatedEntityId: 1, createdAt: -1 });
NotificationSchema.index({ parentId: 1, createdAt: -1 });

// Interface for notification result
export interface NotificationResult {
  success: boolean;
  notificationId?: string;
  telegramMessageId?: number;
  error?: string;
}
