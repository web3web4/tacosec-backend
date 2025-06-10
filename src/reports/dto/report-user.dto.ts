import { IsNotEmpty, IsString } from 'class-validator';

export class ReportUserDto {
  @IsString()
  @IsNotEmpty()
  reportedUsername: string;

  @IsString()
  @IsNotEmpty()
  reason: string;
}
