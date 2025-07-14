import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramClientService } from './telegram-client.service';
import { TelegramClientController } from './telegram-client.controller';
import { TelegramClientConfig } from './telegram-client.config';
import { ContactsService } from './services/contacts.service';
import { AuthService } from './services/auth.service';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { SharedJwtModule } from '../shared/jwt.module';
import { User, UserSchema } from '../users/schemas/user.schema';

/**
 * Telegram Client Module
 * Provides access to Telegram Client API (MTProto) using gramjs
 * Enables real contact access and advanced Telegram features
 */
@Module({
  imports: [
    ConfigModule,
    TelegramModule,
    SharedJwtModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [TelegramClientController],
  providers: [
    TelegramClientConfig,
    TelegramClientService,
    ContactsService,
    AuthService,
    TelegramDtoAuthGuard,
  ],
  exports: [
    TelegramClientConfig,
    TelegramClientService,
    ContactsService,
    AuthService,
    TelegramDtoAuthGuard,
  ],
})
export class TelegramClientModule {}
