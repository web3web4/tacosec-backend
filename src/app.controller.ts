import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { MongoDBService } from './database/mongodb.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly mongoService: MongoDBService
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async healthCheck() {
    try {
      const db = this.mongoService.getDatabase();
      await db.command({ ping: 1 });
      return {
        status: 'ok',
        mongodb: 'connected',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  @Get('test')
  test() {
    return {
      status: 'ok',
      message: 'API is working!'
    };
  }
}
