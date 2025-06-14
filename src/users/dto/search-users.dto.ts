import { IsString, IsOptional, IsNumber, Min, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export enum SearchType {
  STARTS_WITH = 'starts_with',
  CONTAINS = 'contains',
}

export class SearchUsersDto {
  @IsString()
  @IsOptional()
  query?: string;

  @IsOptional()
  @IsEnum(SearchType)
  searchType?: SearchType = SearchType.STARTS_WITH; // Default to starts_with

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
