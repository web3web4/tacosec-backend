import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * DTO for getting contacts
 */
export class GetContactsDto {
  @IsOptional()
  @IsNumber({}, { message: 'Limit must be a number' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(1000, { message: 'Limit cannot exceed 1000' })
  @Type(() => Number)
  @Transform(({ value }) => parseInt(value) || 50)
  limit?: number = 50;

  @IsOptional()
  @IsNumber({}, { message: 'Offset must be a number' })
  @Min(0, { message: 'Offset must be at least 0' })
  @Type(() => Number)
  @Transform(({ value }) => parseInt(value) || 0)
  offset?: number = 0;

  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  search?: string;
}

/**
 * DTO for contact response
 */
export class ContactDto {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  phoneNumber?: string;
  isBot: boolean;
  isVerified: boolean;
  isPremium: boolean;
  isContact: boolean;
  isMutualContact: boolean;
  languageCode?: string;
  accessHash?: string;
  status: string;
  lastSeen?: number;
  photo?: {
    photoId?: string;
    hasPhoto: boolean;
  };
}

/**
 * Response DTO for get contacts operation
 */
export class GetContactsResponseDto {
  contacts: ContactDto[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
