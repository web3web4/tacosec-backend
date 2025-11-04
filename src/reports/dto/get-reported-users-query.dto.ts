import {
  IsOptional,
  IsMongoId,
  IsString,
  IsEnum,
  IsBoolean,
} from 'class-validator';
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
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @IsEnum(ReportType)
  report_type?: ReportType;
}
