import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { DatabaseModule } from './database/database.module';
import { PasswordModule } from './passwords/password.module';
import { TelegramModule } from './telegram/telegram.module';
import { PublicAddressesModule } from './public-addresses/public-addresses.module';
import { CryptoModule } from './utils/crypto.module';

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
    PublicAddressesModule,
    CryptoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
