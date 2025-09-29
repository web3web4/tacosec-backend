import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ErrorLogDocument = ErrorLog & Document;

@Schema({ timestamps: true })
export class ErrorLog {
  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId;

  @Prop({ required: false })
  telegramId?: string;

  @Prop({ required: false })
  username?: string;

  @Prop({ type: Object, required: true })
  logData: any;

  @Prop({ default: Date.now })
  createdAt?: Date;

  @Prop({ default: Date.now })
  updatedAt?: Date;
}

export const ErrorLogSchema = SchemaFactory.createForClass(ErrorLog);

// Create indexes for better query performance
ErrorLogSchema.index({ userId: 1, createdAt: -1 });
ErrorLogSchema.index({ telegramId: 1, createdAt: -1 });
ErrorLogSchema.index({ createdAt: -1 });