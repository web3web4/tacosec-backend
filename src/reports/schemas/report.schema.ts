import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ReportType } from '../dto/report-user.dto';

export type ReportDocument = Report & Document;

// Reporter information schema
@Schema({ _id: false })
export class ReporterInfo {
  @Prop({ type: String, required: false })
  username: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: String, required: false })
  telegramId?: string;

  @Prop({ type: String, required: false })
  latestPublicAddress?: string;
}

// Reported user (secret owner) information schema
@Schema({ _id: false })
export class ReportedUserInfo {
  @Prop({ type: String, required: false })
  username: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: String, required: false })
  telegramId?: string;

  @Prop({ type: String, required: false })
  latestPublicAddress?: string;
}

@Schema({ timestamps: true })
export class Report {
  _id: Types.ObjectId;

  // Legacy fields for backward compatibility
  @Prop({ type: String, required: false })
  reporterTelegramId: string;

  @Prop({ type: String, required: false })
  reportedTelegramId: string;

  // New comprehensive information fields
  @Prop({ type: ReporterInfo, required: true })
  reporterInfo: ReporterInfo;

  @Prop({ type: ReportedUserInfo, required: true })
  reportedUserInfo: ReportedUserInfo;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Password' })
  secret_id: Types.ObjectId; // Reference to passwords._id

  @Prop({ type: String, enum: Object.values(ReportType), required: true })
  report_type: ReportType;

  @Prop({ type: String, required: false, default: null })
  reason: string | null; // Optional field, null when report_type is not 'Other'

  @Prop({ default: false })
  resolved: boolean;

  @Prop({ type: Date, required: false })
  resolvedAt: Date;

  @Prop({ type: Date, required: false })
  updatedAt: Date;

  @Prop({ type: Date, required: false })
  createdAt: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
export const ReporterInfoSchema = SchemaFactory.createForClass(ReporterInfo);
export const ReportedUserInfoSchema =
  SchemaFactory.createForClass(ReportedUserInfo);
