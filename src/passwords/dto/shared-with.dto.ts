import { IsString, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// For internal use with the complete model
export class SharedWithDto {
  @IsString()
  username: string;

  @IsBoolean()
  invited: boolean;
}
export class SharedWithArrayDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SharedWithDto)
  sharedWith: SharedWithDto[];
}
