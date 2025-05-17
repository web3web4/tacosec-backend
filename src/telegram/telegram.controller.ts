import { Controller, Get, Headers } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramAuth } from '../decorators/telegram-auth.decorator';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('validate')
  @TelegramAuth()
  async validateTelegramUser(
    @Headers('X-Telegram-Init-Data') telegramInitData: string,
    @Headers('TelegramUsername') telegramUsername: string,
  ) {
    // Call the service method with the headers data
    return this.telegramService.validateTelegramUser(
      telegramInitData,
      telegramUsername,
    );
  }
}
