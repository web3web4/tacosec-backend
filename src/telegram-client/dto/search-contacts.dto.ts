import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ContactDto } from './get-contacts.dto';

/**
 * DTO for searching contacts
 */
export class SearchContactsDto {
  @IsString({ message: 'Query must be a string' })
  @IsNotEmpty({ message: 'Search query is required' })
  query: string;

  @IsOptional()
  @IsNumber({}, { message: 'Limit must be a number' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(500, { message: 'Limit cannot exceed 500' })
  @Type(() => Number)
  @Transform(({ value }) => parseInt(value) || 50)
  limit?: number = 50;
}

/**
 * Response DTO for search contacts operation
 */
export class SearchContactsResponseDto {
  contacts: ContactDto[];
  total: number;
  query: string;
  limit: number;
}
