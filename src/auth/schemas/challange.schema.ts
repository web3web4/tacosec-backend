import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PublicAddress } from '../../public-addresses/schemas/public-address.schema';

export type ChallangeDocument = Challange & Document;

@Schema({ timestamps: true })
export class Challange {
  @Prop({
    type: Types.ObjectId,
    ref: 'PublicAddress',
    required: true,
    unique: true,
    index: true,
  })
  publicAddressId: Types.ObjectId | PublicAddress;

  @Prop({ required: true })
  challange: string;

  @Prop({ required: true, index: true })
  expiresAt: Date;

  @Prop({ required: true })
  expiresInMinutes: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ChallangeSchema = SchemaFactory.createForClass(Challange);

ChallangeSchema.index({ publicAddressId: 1 }, { unique: true });
