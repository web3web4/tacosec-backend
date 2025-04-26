import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  IsMongoId,
  ValidateNested,
} from 'class-validator';
import { Type as TransformType } from 'class-transformer';
import { Types } from 'mongoose';
import { TelegramInitDto } from './telegram-init.dto';
import { Type } from '../enums/type.enum';

// For internal use with the complete model
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

  @IsEnum(Type)
  type: Type;

  @IsArray()
  @IsOptional()
  sharedWith: string[];

  @ValidateNested()
  @TransformType(() => TelegramInitDto)
  initData: TelegramInitDto;
}
