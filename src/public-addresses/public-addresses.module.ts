import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedJwtModule } from '../shared/jwt.module';
import {
  PublicAddress,
  PublicAddressSchema,
} from './schemas/public-address.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PublicAddressesController } from './public-addresses.controller';
import { PublicAddressesService } from './public-addresses.service';
import { UsersModule } from '../users/users.module';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { TelegramModule } from '../telegram/telegram.module';
import { CryptoModule } from '../utils/crypto.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PublicAddress.name, schema: PublicAddressSchema },
      { name: User.name, schema: UserSchema },
    ]),
    SharedJwtModule,
    UsersModule,
    TelegramModule,
    CryptoModule,
  ],
  controllers: [PublicAddressesController],
  providers: [PublicAddressesService, TelegramDtoAuthGuard],
  exports: [PublicAddressesService],
})
export class PublicAddressesModule {}
