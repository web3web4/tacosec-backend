import {
  IsOptional,
  IsMongoId,
  IsString,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ReportPriority } from '../enums/report-priority.enum';
import { ReportType } from './report-user.dto';
import { ResolvedFilterEnum } from '../enums/resolved-filter.enum';

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
    if (value === null || value === undefined) return undefined;
    const v = String(value).trim().toLowerCase();
    if (v === 'true' || v === '1') return ResolvedFilterEnum.TRUE;
    if (v === 'false' || v === '0') return ResolvedFilterEnum.FALSE;
    return undefined;
  })
  @IsEnum(ResolvedFilterEnum)
  resolved?: ResolvedFilterEnum;


  @IsOptional()
  @IsEnum(ReportType)
  report_type?: ReportType;
}
