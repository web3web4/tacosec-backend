import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

let app;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn']
    });
    app.enableCors();
    await app.init();
  }
  const server = app.getHttpServer();
  return server;
}

export default bootstrap;
