import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ReportType } from '../dto/report-user.dto';

export type ReportDocument = Report & Document;

@Schema({ timestamps: true })
export class Report {
  _id: Types.ObjectId;

  @Prop({ type: String, required: true })
  reporterTelegramId: string;

  @Prop({ type: String, required: true })
  reportedTelegramId: string;

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
