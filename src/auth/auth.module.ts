import { Module, forwardRef } from '@nestjs/common';
import { SharedJwtModule } from '../common/jwt/jwt.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  PublicAddress,
  PublicAddressSchema,
} from '../public-addresses/schemas/public-address.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Password, PasswordSchema } from '../passwords/schemas/password.schema';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { PublicAddressesModule } from '../public-addresses/public-addresses.module';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { LoggerModule } from '../logger/logger.module';
import { Challange, ChallangeSchema } from './schemas/challange.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PublicAddress.name, schema: PublicAddressSchema },
      { name: User.name, schema: UserSchema },
      { name: Password.name, schema: PasswordSchema },
      { name: Challange.name, schema: ChallangeSchema },
    ]),
    SharedJwtModule,
    TelegramModule,
    UsersModule,
    PublicAddressesModule,
    forwardRef(() => LoggerModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, TelegramDtoAuthGuard],
  exports: [AuthService, SharedJwtModule],
})
export class AuthModule {}
