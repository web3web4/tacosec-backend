import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Role } from '../../decorators/roles.decorator';
import { Transform } from 'class-transformer';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: false })
  telegramId: string;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop({ index: true })
  @Transform(({ value }) => value.toLowerCase())
  username: string;

  @Prop()
  photoUrl: string;

  @Prop()
  authDate: Date;

  @Prop()
  hash: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: String, enum: Role, default: Role.USER })
  role: Role;

  @Prop({ default: false })
  sharingRestricted: boolean;

  @Prop({ default: 0 })
  reportCount: number;

  @Prop({ default: false })
  privacyMode: boolean;

  @Prop({ required: false })
  phone: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Add text index for full-text search on username
UserSchema.index({ username: 'text' });
