import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
  Max,
  IsMongoId,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  NotificationType,
  NotificationStatus,
} from '../schemas/notification.schema';

export class GetNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsMongoId()
  recipientUserId?: string;

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
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsMongoId()
  relatedEntityId?: string;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'createdAt' || value === 'sentAt' || value === 'updatedAt') {
      return value;
    }
    return 'createdAt';
  })
  sortBy?: string = 'createdAt';

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'asc' || value === 'desc') {
      return value;
    }
    return 'desc';
  })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
