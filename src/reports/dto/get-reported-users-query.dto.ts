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
  @Transform(({ value }) => {
    if (value === true || value === false) return value as boolean;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
    }
    return undefined;
  })
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @IsEnum(ReportType)
  report_type?: ReportType;
}
