import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';

let cachedServer: any;

async function bootstrap() {
  if (!cachedServer) {
    const expressApp = express();
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );

    app.enableCors();
    app.setGlobalPrefix('api');
    await app.init();
    
    cachedServer = expressApp;
  }
  return cachedServer;
}

// For local development
if (process.env.NODE_ENV !== 'production') {
  bootstrap().then(server => {
    server.listen(3000);
  });
}

// For Vercel
export default bootstrap;
