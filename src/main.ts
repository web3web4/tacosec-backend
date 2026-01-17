import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsLoggerFilter } from './logger/all-exceptions-logger.filter';
import { LoggerService } from './logger/logger.service';
import { AppConfigService } from './common/config/app-config.service';

let app;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create(AppModule);

    const appConfig = app.get(AppConfigService);
    if (!appConfig.telegramBotToken) {
      console.error(
        'ERROR: TELEGRAM_BOT_TOKEN environment variable is not set!',
      );
      if (appConfig.isProduction) {
        console.error(
          'Exiting application in production mode due to missing required environment variables.',
        );
        process.exit(1);
      }
    }

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
    // Register global exception filter for logging
    const loggerService = app.get(LoggerService);
    app.useGlobalFilters(new AllExceptionsLoggerFilter(loggerService));
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
