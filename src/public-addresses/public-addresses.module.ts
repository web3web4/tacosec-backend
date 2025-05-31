import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PublicAddress,
  PublicAddressSchema,
} from './schemas/public-address.schema';
import { PublicAddressesController } from './public-addresses.controller';
import { PublicAddressesService } from './public-addresses.service';
import { UsersModule } from '../users/users.module';
import { TelegramDtoAuthGuard } from '../telegram/dto/telegram-dto-auth.guard';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PublicAddress.name, schema: PublicAddressSchema },
    ]),
    UsersModule,
    TelegramModule,
  ],
  controllers: [PublicAddressesController],
  providers: [PublicAddressesService, TelegramDtoAuthGuard],
  exports: [PublicAddressesService],
})
export class PublicAddressesModule {}
