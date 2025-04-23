import { IsString, IsMongoId, IsOptional } from 'class-validator';
import { Types } from 'mongoose';

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
}
