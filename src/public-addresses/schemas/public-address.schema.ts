import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type PublicAddressDocument = PublicAddress & Document;

@Schema({ timestamps: true })
export class PublicAddress {
  // /**
  //  * The unique identifier for the public address
  //  */
  // @Prop()
  // id: string;

  /**
   * Reference to the user who owns this public address
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: User;

  /**
   * The public wallet address/key
   * Must be unique across the entire system
   */
  @Prop({
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: function (v) {
        return v !== null && v !== undefined && v.trim() !== '';
      },
      message: 'Public key cannot be null, undefined or empty',
    },
  })
  publicKey: string;

  /**
   * Encrypted secret or private key
   */
  @Prop({ required: false })
  encryptedSecret: string;
}

export const PublicAddressSchema = SchemaFactory.createForClass(PublicAddress);
