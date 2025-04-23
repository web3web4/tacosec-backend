import { IsString, IsMongoId, IsOptional, IsBoolean } from 'class-validator';
import { Types } from 'mongoose';
import { TelegramInitDto } from './telegram-init.dto';

export class CreatePasswordDto {
  @IsMongoId()
  userId: Types.ObjectId;

  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsBoolean()
  @IsOptional()
  isActive: boolean;

  initData: TelegramInitDto;
}
