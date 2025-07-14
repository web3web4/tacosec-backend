import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type as TransformType } from 'class-transformer';
import { TelegramInitDto } from '../../telegram/dto/telegram-init.dto';
import { Type as TypeEnum } from '../enums/type.enum';
import { SharedWithDto } from './shared-with.dto';
import { Type } from 'class-transformer';

// For use in the controller to receive only the necessary fields from the request
export class CreatePasswordRequestDto {
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
  @IsOptional()
  initData?: TelegramInitDto;

  @IsString()
  @IsOptional()
  initDataRaw?: string;

  @IsString()
  @IsOptional()
  parent_secret_id?: string;
}
