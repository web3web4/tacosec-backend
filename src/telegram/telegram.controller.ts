import { Controller, Get, Headers, Query } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { GetUsersDto } from './dto/get-users.dto';
// import { TelegramAuth } from '../decorators/telegram-auth.decorator';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Get('verify-true')
  // @TelegramAuth()
  async validateTelegramUserTrue() {
    return { isValid: true };
  }

  @Get('verify')
  // @TelegramAuth()
  async validateTelegramUser(
    @Headers('authorizationToken') telegramInitData: string,
    @Query() getUsersDto: GetUsersDto,
  ) {
    return this.telegramService.validateTelegramUser(
      telegramInitData,
      getUsersDto.TelegramUsernames,
    );
  }

  @Get('verify-test')
  // @TelegramAuth()
  async validateTelegramUserTest(@Query() getUsersDto: GetUsersDto) {
    return this.telegramService.validateTelegramUser(
      getUsersDto.authorizationToken,
      getUsersDto.TelegramUsernames,
    );
  }
}
