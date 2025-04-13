import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return { message: 'Hello World!' };
  }

  @Get('ping')
  ping() {
    return { timestamp: new Date().toISOString() };
  }
}
