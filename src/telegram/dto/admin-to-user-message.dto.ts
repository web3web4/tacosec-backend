import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';

export class AdminToUserMessageDto {
  @IsMongoId()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  subject?: string;
}
