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

    if (!this.botToken) {
      console.error('WARNING: TELEGRAM_BOT_TOKEN is not set or invalid!');
    }
  }

  async sendMessage(
    userId: number,
    message: string,
    retries = 3,
  ): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Attempt ${attempt} to send message to user ${userId}`);
        const response = await firstValueFrom(
          this.httpService.post(
            url,
            {
              chat_id: userId,
              text: message,
            },
            {
              timeout: 10000, // 10 second timeout
            },
          ),
        );

        console.log('Message sent successfully:', response.data);
        return response.data.ok === true;
      } catch (error) {
        console.error(
          `Attempt ${attempt} failed:`,
          error.message,
          error.response?.data,
        );

        if (attempt < retries) {
          // Exponential backoff (500ms, 1000ms, 2000ms, etc.)
          const delay = 500 * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(
            'All retry attempts failed for sending Telegram message',
          );
          return false;
        }
      }
    }

    return false;
  }
}
