import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsMongoId,
} from 'class-validator';
import { NotificationType } from '../schemas/notification.schema';

export class CreateNotificationDto {
  @IsString()
  message: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsMongoId()
  recipientUserId: string;

  @IsOptional()
  @IsString()
  recipientTelegramId?: string;

  @IsOptional()
  @IsString()
  recipientUsername?: string;

  @IsOptional()
  @IsMongoId()
  senderUserId?: string;

  @IsOptional()
  @IsString()
  senderTelegramId?: string;

  @IsOptional()
  @IsString()
  senderUsername?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsMongoId()
  relatedEntityId?: string;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
