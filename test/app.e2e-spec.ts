import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { TelegramValidatorService } from '../src/telegram/telegram-validator.service';
import { TelegramDtoAuthGuard } from '../src/telegram/dto/telegram-dto-auth.guard';
import { TelegramService } from '../src/telegram/telegram.service';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../src/users/schemas/user.schema';
import { Password } from '../src/passwords/schemas/password.schema';
import { Report } from '../src/reports/schemas/report.schema';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let telegramServiceMock;

  beforeEach(async () => {
    telegramServiceMock = {
      sendMessage: jest.fn().mockResolvedValue({}),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TelegramValidatorService)
      .useValue({
        validateTelegramInitData: jest.fn().mockReturnValue(true),
        validateTelegramDto: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(TelegramDtoAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
        parseTelegramInitData: jest.fn().mockReturnValue({
          telegramId: '12345',
          firstName: 'Test',
          lastName: 'User',
          username: 'testuser',
          authDate: new Date().getTime(),
          hash: 'test-hash',
        }),
      })
      .overrideProvider(getModelToken(User.name))
      .useValue({
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        updateOne: jest.fn(),
      })
      .overrideProvider(getModelToken(Password.name))
      .useValue({
        find: jest.fn(),
        findOne: jest.fn(),
        countDocuments: jest.fn(),
        create: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        save: jest.fn(),
      })
      .overrideProvider(getModelToken(Report.name))
      .useValue({
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      })
      .overrideProvider(TelegramService)
      .useValue(telegramServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30000);

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET)', async () => {
    const response = await request(app.getHttpServer()).get('/').expect(200);

    expect(response.text).toBe('Hello World!');
  }, 10000);

  describe('Password API endpoints with pagination', () => {
    it('should handle password endpoints without pagination parameters', async () => {
      // Mock password service responses
      const passwordService = app.get('PasswordService');
      if (passwordService) {
        jest
          .spyOn(passwordService, 'findByUserTelegramIdWithPagination')
          .mockResolvedValue([]);
        jest
          .spyOn(passwordService, 'findSharedWithByTelegramIdWithPagination')
          .mockResolvedValue([]);
        jest
          .spyOn(passwordService, 'findPasswordsSharedWithMeWithPagination')
          .mockResolvedValue({ sharedWithMe: [], userCount: 0 });
      }

      // Test user passwords endpoint
      await request(app.getHttpServer())
        .get('/passwords/user/12345')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);

      // Test shared passwords endpoint
      await request(app.getHttpServer())
        .get('/passwords/shared-with/12345')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);

      // Test shared with me endpoint
      await request(app.getHttpServer())
        .get('/passwords/shared-with-me/testuser')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);
    }, 15000);

    it('should handle password endpoints with pagination parameters', async () => {
      // Mock paginated responses
      const mockPaginatedResponse = {
        data: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      const mockSharedWithMePaginatedResponse = {
        data: { sharedWithMe: [], userCount: 0 },
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };

      const passwordService = app.get('PasswordService');
      if (passwordService) {
        jest
          .spyOn(passwordService, 'findByUserTelegramIdWithPagination')
          .mockResolvedValue(mockPaginatedResponse);
        jest
          .spyOn(passwordService, 'findSharedWithByTelegramIdWithPagination')
          .mockResolvedValue(mockPaginatedResponse);
        jest
          .spyOn(passwordService, 'findPasswordsSharedWithMeWithPagination')
          .mockResolvedValue(mockSharedWithMePaginatedResponse);
      }

      // Test user passwords endpoint with pagination
      const userPasswordsResponse = await request(app.getHttpServer())
        .get('/passwords/user/12345?page=1&limit=10')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);

      expect(userPasswordsResponse.body).toHaveProperty('data');
      expect(userPasswordsResponse.body).toHaveProperty('pagination');

      // Test shared passwords endpoint with pagination
      const sharedPasswordsResponse = await request(app.getHttpServer())
        .get('/passwords/shared-with/12345?page=1&limit=10')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);

      expect(sharedPasswordsResponse.body).toHaveProperty('data');
      expect(sharedPasswordsResponse.body).toHaveProperty('pagination');

      // Test shared with me endpoint with pagination
      const sharedWithMeResponse = await request(app.getHttpServer())
        .get('/passwords/shared-with-me/testuser?page=1&limit=10')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);

      expect(sharedWithMeResponse.body).toHaveProperty('data');
      expect(sharedWithMeResponse.body).toHaveProperty('pagination');
    }, 15000);

    it('should handle invalid pagination parameters', async () => {
      // Mock responses for invalid pagination
      const passwordService = app.get('PasswordService');
      if (passwordService) {
        jest
          .spyOn(passwordService, 'findByUserTelegramIdWithPagination')
          .mockResolvedValue([]);
        jest
          .spyOn(passwordService, 'findSharedWithByTelegramIdWithPagination')
          .mockResolvedValue([]);
        jest
          .spyOn(passwordService, 'findPasswordsSharedWithMeWithPagination')
          .mockResolvedValue({ sharedWithMe: [], userCount: 0 });
      }

      // Test with invalid page parameter
      await request(app.getHttpServer())
        .get('/passwords/user/12345?page=0&limit=10')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);

      // Test with invalid limit parameter
      await request(app.getHttpServer())
        .get('/passwords/user/12345?page=1&limit=0')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);

      // Test with non-numeric parameters
      await request(app.getHttpServer())
        .get('/passwords/user/12345?page=abc&limit=xyz')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);
    }, 15000);
  });
});
