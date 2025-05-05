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
import { TelegramInitDto } from '../../telegram/dto/telegram-init.dto';
import { Type as TypeEnum } from '../enums/type.enum';
import { SharedWithDto } from './shared-with.dto';
import { Type } from 'class-transformer';

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

  @IsEnum(TypeEnum)
  @IsOptional()
  type: TypeEnum;

  @IsArray()
  @IsOptional()
  @ValidateNested()
  @Type(() => SharedWithDto)
  sharedWith: SharedWithDto[];

  @ValidateNested()
  @TransformType(() => TelegramInitDto)
  initData: TelegramInitDto;
}
