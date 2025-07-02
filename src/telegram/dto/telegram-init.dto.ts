import { IsString, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
export class TelegramInitDto {
  @IsString()
  @IsNotEmpty()
  telegramId: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value.toLowerCase())
  username?: string;

  @IsString()
  @IsOptional()
  photoUrl?: string;

  @IsNumber()
  @IsNotEmpty()
  authDate: number;

  @IsString()
  @IsNotEmpty()
  hash: string;

  @IsString()
  @IsOptional()
  initDataRaw?: string;
}
