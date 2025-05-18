import { Controller, Get, Headers, Query } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramAuth } from '../decorators/telegram-auth.decorator';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('verify')
  @TelegramAuth()
  async validateTelegramUser(
    @Headers('X-Telegram-Init-Data') telegramInitData: string,
    @Query('TelegramUsernames') telegramUsernames: string[],
  ) {
    return this.telegramService.validateTelegramUser(
      telegramInitData,
      telegramUsernames,
    );
  }
}
