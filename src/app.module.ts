import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { DatabaseModule } from './database/database.module';
import { PasswordModule } from './passwords/password.module';
import { TelegramModule } from './telegram/telegram.module';
import { TelegramClientModule } from './telegram-client/telegram-client.module';
import { PublicAddressesModule } from './public-addresses/public-addresses.module';
import { CryptoModule } from './utils/crypto.module';
import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { LoggerModule } from './logger/logger.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    UsersModule,
    PasswordModule,
    TelegramModule,
    TelegramClientModule,
    PublicAddressesModule,
    CryptoModule,
    ReportsModule,
    AuthModule,
    LoggerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
