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
import { Type } from '../enums/type.enum';

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

  @IsEnum(Type)
  type: Type;

  @IsArray()
  @IsOptional()
  sharedWith: string[];

  @ValidateNested()
  @TransformType(() => TelegramInitDto)
  initData: TelegramInitDto;

  @IsString()
  @IsOptional()
  initDataRaw?: string;
}
