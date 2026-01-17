import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  // Ensure MONGODB_URI is set before creating the app
  if (!process.env.MONGODB_URI) {
    console.log('Setting default MONGODB_URI as it was undefined');
    process.env.MONGODB_URI = 'mongodb://localhost:27017/taco-test';
  }

  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing';
  }

  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'test-jwt-secret';
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  }

  console.log(`Creating test app with MONGODB_URI: ${process.env.MONGODB_URI}`);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard('TelegramDtoAuthGuard')
    .useValue({ canActivate: () => true })
    .overrideProvider('TelegramValidatorService')
    .useValue({
      validateTelegramInitData: () => true,
      validateTelegramDto: () => true,
    })
    .compile();

  const app = moduleFixture.createNestApplication();

  // Configure app exactly like in main.ts
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
  return app;
}

export async function closeTestApp(app: INestApplication): Promise<void> {
  if (!app) {
    console.warn('App instance is undefined, cannot close test app');
    return;
  }
  await app.close();
}
