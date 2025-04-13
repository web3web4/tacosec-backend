import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

let cachedServer = null;

async function bootstrap() {
  if (cachedServer) {
    return cachedServer;
  }

  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
    cors: true,
    bodyParser: true
  });

  await app.init();
  cachedServer = app.getHttpServer();
  return cachedServer;
}

// Export the bootstrap function for Vercel
module.exports = bootstrap;
