import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
// import { User } from './user.schema';

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
}

export const PasswordSchema = SchemaFactory.createForClass(Password);
