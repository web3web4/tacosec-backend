import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  await app.init();
  
  const server = app.getHttpAdapter().getInstance();
  return server;
}

// For local development
if (process.env.NODE_ENV !== 'production') {
  bootstrap().then(server => {
    server.listen(3000);
  });
}

// For Vercel
export default bootstrap;
