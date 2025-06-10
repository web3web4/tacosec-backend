import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReportDocument = Report & Document;

@Schema({ timestamps: true })
export class Report {
  _id: Types.ObjectId;

  @Prop({ type: String, required: true })
  reporterTelegramId: string;

  @Prop({ type: String, required: true })
  reportedTelegramId: string;

  @Prop({ type: String, required: true })
  reason: string;

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
