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
  user: string; // Can be username, publicAddress, or userId

  @IsMongoId()
  @IsNotEmpty()
  secret_id: string; // passwords._id

  @IsEnum(ReportType)
  @IsNotEmpty()
  report_type: ReportType;

  // Reason is optional for all report types, but required when report_type is 'Other'
  @ValidateIf((o) => o.report_type === ReportType.OTHER)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  reason?: string;
}
