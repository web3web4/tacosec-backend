import { IsOptional, IsMongoId, IsString } from 'class-validator';

export class GetReportedUsersQueryDto {
  @IsOptional()
  @IsMongoId()
  reporterUserId?: string;

  @IsOptional()
  @IsMongoId()
  reportedUserId?: string;

  @IsOptional()
  @IsString()
  secret_id?: string;
}
