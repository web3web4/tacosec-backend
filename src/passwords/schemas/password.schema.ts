import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Type } from '../enums/type.enum';
import { SharedWithDto } from '../dto/shared-with.dto';

export type PasswordDocument = Password & Document;

@Schema({ timestamps: true })
export class Password {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  value: string;

  @Prop({ required: false })
  description: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object, required: false })
  initData: any;

  @Prop({ type: String, enum: Type, required: false })
  type: Type;

  @Prop({ type: [SharedWithDto], required: false })
  sharedWith: SharedWithDto[];

  @Prop({ default: false })
  hidden: boolean;

  @Prop({ type: String, required: false })
  threadId: string;

  @Prop({ type: Date, required: false })
  updatedAt: Date;

  @Prop({ type: Date, required: false })
  createdAt: Date;
}

export const PasswordSchema = SchemaFactory.createForClass(Password);
