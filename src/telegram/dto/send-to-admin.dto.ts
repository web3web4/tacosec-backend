import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class SendToAdminDto {
  @IsString({ message: 'Message must be a string' })
  @IsNotEmpty({ message: 'Message cannot be empty' })
  @MaxLength(4000, { message: 'Message cannot exceed 4000 characters' })
  message: string;

  @IsOptional()
  @IsString({ message: 'Subject must be a string' })
  @MaxLength(200, { message: 'Subject cannot exceed 200 characters' })
  subject?: string;
}
