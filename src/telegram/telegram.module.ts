import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramValidatorService } from './telegram-validator.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [HttpModule, ConfigModule, forwardRef(() => UsersModule)],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramValidatorService],
  exports: [TelegramService, TelegramValidatorService],
})
export class TelegramModule {}
