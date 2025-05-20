import { IsArray, IsString, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetUsersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',');
    }
    return value;
  })
  TelegramUsernames?: string[];

  @IsOptional()
  @IsString()
  authorizationToken?: string;
}
