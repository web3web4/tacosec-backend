import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { GetUsersDto } from './dto/get-users.dto';
import { TelegramDtoAuth } from '../decorators/telegram-dto-auth.decorator';
import { TelegramDtoAuthGuard } from './dto/telegram-dto-auth.guard';
// import { TelegramAuth } from '../decorators/telegram-auth.decorator';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
  ) {}

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

  /**
   * Send a message to a Telegram user
   */
  @Post('send')
  @TelegramDtoAuth()
  async sendMessage(
    @Request() req: Request,
    @Body() body: { message: string },
  ): Promise<{ success: boolean }> {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    const success = await this.telegramService.sendMessage(
      Number(teleDtoData.telegramId),
      body.message,
    );
    return { success };
  }

  /**
   * Test endpoint to send a message directly to a Telegram user
   * This endpoint is for testing purposes only and should be secured or removed in production
   */
  @Post('test-send')
  async testSendMessage(
    @Body() body: { telegramId: number; message: string },
  ): Promise<{ success: boolean }> {
    console.log('Received test message request:', body);
    const success = await this.telegramService.sendMessage(
      body.telegramId,
      body.message,
    );
    return { success };
  }
}
