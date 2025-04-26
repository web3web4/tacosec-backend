import { IsString, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';

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
  username?: string;

  @IsString()
  @IsOptional()
  photoUrl?: string;

  // @IsDate()
  // @Type(() => Date)
  // authDate: Date;
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
