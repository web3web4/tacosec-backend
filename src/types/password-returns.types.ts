import { SharedWithDto } from '../passwords/dto/shared-with.dto';
import { Type } from '../passwords/enums/type.enum';
import { ReportType } from '../reports/dto/report-user.dto';
import { Types } from 'mongoose';

// Report information for passwords
export type PasswordReportInfo = {
  reporterUsername: string; // Username of the reporter
  report_type: ReportType; // Type of the report
  reason: string | null; // Reason if report_type is 'Other', otherwise null
  createdAt: Date; // Date when the report was created
};

export type passwordReturns = {
  _id: Types.ObjectId;
  key: string;
  value: string;
  description: string;
  sharedWith: SharedWithDto[];
  updatedAt: Date;
  createdAt: Date;
  type: Type;
  hidden: boolean;
  reports: PasswordReportInfo[]; // Array of unresolved reports for this password
};
