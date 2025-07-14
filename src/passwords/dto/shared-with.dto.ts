import {
  IsString,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
// For internal use with the complete model
export class SharedWithDto {
  @IsString()
  @Transform(({ value }) => value.toLowerCase())
  username: string;

  @IsBoolean()
  invited: boolean;

  @IsOptional()
  @IsString()
  userId?: string;
}
export class SharedWithArrayDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedWithDto)
  sharedWith: SharedWithDto[];
}
