import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchUsersDto {
  @IsString()
  @IsOptional()
  query?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  limit?: number = 10;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value))
  skip?: number = 0;
}
