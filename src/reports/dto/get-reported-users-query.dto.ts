import {
  IsOptional,
  IsMongoId,
  IsString,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ReportPriority } from '../enums/report-priority.enum';
import { ReportType } from './report-user.dto';

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

  @IsOptional()
  @IsEnum(ReportPriority)
  priority?: ReportPriority;

  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
      ? false
      : undefined,
  )
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @IsEnum(ReportType)
  report_type?: ReportType;
}
