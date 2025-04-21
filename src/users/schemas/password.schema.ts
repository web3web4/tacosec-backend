import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

export type PasswordDocument = Password & Document;

@Schema({ timestamps: true })
export class Password {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  passwordName: string;

  @Prop()
  telegramPassword: string;

  @Prop()
  facebookPassword: string;

  @Prop({ default: true })
  isActive: boolean;

  // User information fields
  @Prop({ required: true })
  telegramId: string;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop()
  username: string;

  @Prop()
  photoUrl: string;

  @Prop()
  authDate: Date;

  @Prop()
  hash: string;
}

export const PasswordSchema = SchemaFactory.createForClass(Password); 