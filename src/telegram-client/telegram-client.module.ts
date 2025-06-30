import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramClientService } from './telegram-client.service';
import { TelegramClientController } from './telegram-client.controller';
import { TelegramClientConfig } from './telegram-client.config';
import { ContactsService } from './services/contacts.service';
import { AuthService } from './services/auth.service';
import { TelegramModule } from '../telegram/telegram.module';

/**
 * Telegram Client Module
 * Provides access to Telegram Client API (MTProto) using gramjs
 * Enables real contact access and advanced Telegram features
 */
@Module({
  imports: [ConfigModule, TelegramModule],
  controllers: [TelegramClientController],
  providers: [
    TelegramClientConfig,
    TelegramClientService,
    ContactsService,
    AuthService,
  ],
  exports: [
    TelegramClientConfig,
    TelegramClientService,
    ContactsService,
    AuthService,
  ],
})
export class TelegramClientModule {}
