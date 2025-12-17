import { SharedWithDto } from '../passwords/dto/shared-with.dto';
import { Type } from '../passwords/enums/type.enum';
import { Types } from 'mongoose';

// Report information for passwords
// export type PasswordReportInfo = {
//   reporterUsername: string; // Username of the reporter
//   report_type: ReportType; // Type of the report
//   reason: string | null; // Reason if report_type is 'Other', otherwise null
//   createdAt: Date; // Date when the report was created
// };
// Report information for passwords - now using any to allow complete MongoDB document structure
export type PasswordReportInfo = any;
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
  publicAddress?: string; // Public address associated with the password
  reports: PasswordReportInfo[]; // Array of unresolved reports for this password
  firstName?: string; // First name of the password owner
  lastName?: string; // Last name of the password owner
  viewsCount?: number; // Number of secret views
  secretViews?: any[]; // Array of secret view records
};
