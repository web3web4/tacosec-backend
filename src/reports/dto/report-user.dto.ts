import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  ValidateIf,
  IsMongoId,
} from 'class-validator';

// Enum for report types
export enum ReportType {
  SECURITY = 'Security',
  ABUSE = 'Abuse',
  SPAM = 'Spam',
  OTHER = 'Other',
}

export class ReportUserDto {
  @IsString()
  @IsNotEmpty()
  reportedUsername: string;

  @IsMongoId()
  @IsNotEmpty()
  secret_id: string; // passwords._id

  @IsEnum(ReportType)
  @IsNotEmpty()
  report_type: ReportType;

  // Reason is required only when report_type is 'Other', otherwise it should be null
  @ValidateIf((o) => o.report_type === ReportType.OTHER)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  reason?: string;
}
