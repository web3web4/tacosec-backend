import {
  IsOptional,
  IsString,
  IsDateString,
  IsNumberString,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { LogEvent } from './log-event.enum';

export class AdminGetLogsDto {
  @IsOptional()
  @IsNumberString()
  page?: string = '1';

  @IsOptional()
  @IsNumberString()
  limit?: string = '10';

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
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  telegramId?: string;

  @IsOptional()
  @IsString()
  username?: string;

  // Filter by event name stored inside logData.event
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const v = value.trim();
      if (v.toLowerCase() === 'all') {
        return LogEvent.All;
      }
      return value;
    }
    return value;
  })
  @IsEnum(LogEvent)
  event?: LogEvent;
}
