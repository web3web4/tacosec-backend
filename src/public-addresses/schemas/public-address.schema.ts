import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type PublicAddressDocument = PublicAddress & Document;

@Schema({ timestamps: true })
export class PublicAddress {
  /**
   * Reference to the user who owns this public address
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: User;

  /**
   * The public wallet address
   * Must be unique across the entire system
   */
  @Prop({ required: true, unique: true, index: true })
  publicAddress: string;
}

export const PublicAddressSchema = SchemaFactory.createForClass(PublicAddress);
