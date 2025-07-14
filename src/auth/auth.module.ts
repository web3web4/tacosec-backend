import { Module } from '@nestjs/common';
import { SharedJwtModule } from '../shared/jwt.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  PublicAddress,
  PublicAddressSchema,
} from '../public-addresses/schemas/public-address.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PublicAddress.name, schema: PublicAddressSchema },
      { name: User.name, schema: UserSchema },
    ]),
    SharedJwtModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, SharedJwtModule],
})
export class AuthModule {}
