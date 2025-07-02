import { IsString, IsNotEmpty } from 'class-validator';

export class GetTelegramProfileDto {
  @IsString()
  @IsNotEmpty()
  username: string;
}
