import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

let app;

async function bootstrap() {
  // Validate critical environment variables
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_BOT_TOKEN environment variable is not set!');
    if (process.env.NODE_ENV === 'production') {
      console.error('Exiting application in production mode due to missing required environment variables.');
      process.exit(1);
    }
  }

  if (!app) {
    app = await NestFactory.create(AppModule);
    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();
  }
  return app;
}

// For local development
if (process.env.NODE_ENV !== 'production') {
  bootstrap().then((app) => {
    app.listen(3000).then(() => {
      console.log('Server running on http://localhost:3000');
    });
  });
}

export const handler = async (request, response) => {
  const app = await bootstrap();
  const httpAdapter = app.getHttpAdapter();
  return httpAdapter.getInstance()(request, response);
};

export default handler;
