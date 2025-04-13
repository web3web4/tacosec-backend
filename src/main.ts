import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  return app;
}

let cachedApp;

async function handler(request, response) {
  if (!cachedApp) {
    cachedApp = await bootstrap();
    await cachedApp.init();
  }
  
  cachedApp.getHttpAdapter().getInstance()(request, response);
}

export default handler;
