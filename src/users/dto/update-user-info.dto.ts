import {
  IsOptional,
  IsString,
  Length,
  ValidateIf,
  IsEmail,
} from 'class-validator';

export class UpdateUserInfoDto {
  @IsOptional()
  @ValidateIf(
    (o) =>
      o.firstName !== undefined && o.firstName !== null && o.firstName !== '',
  )
  @IsString()
  @Length(1, 50)
  firstName?: string;

  @IsOptional()
  @ValidateIf(
    (o) => o.lastName !== undefined && o.lastName !== null && o.lastName !== '',
  )
  @IsString()
  @Length(1, 50)
  lastName?: string;

  @IsOptional()
  @ValidateIf(
    (o) => o.phone !== undefined && o.phone !== null && o.phone !== '',
  )
  @IsString()
  @Length(1, 20)
  phone?: string;

  @IsOptional()
  @ValidateIf(
    (o) => o.email !== undefined && o.email !== null && o.email !== '',
  )
  @IsEmail()
  email?: string;
}
