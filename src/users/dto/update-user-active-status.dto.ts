import { IsBoolean } from 'class-validator';

export class UpdateUserActiveStatusDto {
  @IsBoolean()
  isActive: boolean;
}
