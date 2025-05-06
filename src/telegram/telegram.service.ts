import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class TelegramService {
  private readonly botToken: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.botToken =
      this.configService.get<string>('TELEGRAM_BOT_TOKEN') ||
      process.env.TELEGRAM_BOT_TOKEN;
  }

  async sendMessage(userId: number, message: string): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      console.log('message sent response1');
      const response = await firstValueFrom(
        this.httpService.post(url, {
          chat_id: userId, // user.id is the same as chat_id in private conversations
          text: message,
        }),
      );
      console.log('message sent response', response.data);
      return response.data.ok === true;
    } catch (error) {
      console.error('Failed to send message:', error.response?.data);
      return false;
    }
  }
}
