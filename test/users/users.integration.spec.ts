import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpException, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { TelegramInitDto } from '../../src/telegram/dto/telegram-init.dto';
import { UsersService } from '../../src/users/users.service';
import { TelegramValidatorService } from '../../src/telegram/telegram-validator.service';
import { UsersController } from '../../src/users/users.controller';
import { TelegramDtoAuthGuard } from '../../src/guards/telegram-dto-auth.guard';
import { TelegramService } from '../../src/telegram/telegram.service';
import { HttpService } from '@nestjs/axios';
import { FlexibleAuthGuard } from '../../src/guards/flexible-auth.guard';
import { RolesGuard } from '../../src/guards/roles.guard';
// import { Types } from 'mongoose';
// import { Type } from '../../src/passwords/enums/type.enum';

describe('UserController (e2e)', () => {
  let app: INestApplication;
  let telegramValidatorService: TelegramValidatorService;
  let userService: {
    createAndUpdateUser: jest.Mock;
    findByTelegramId: jest.Mock;
  };
  let telegramServiceMock: { sendMessage: jest.Mock };

  // Fixed authDate to avoid JSON serialization differences
  const fixedDate = new Date().toISOString();

  // Mock data
  const mockTelegramInitDto: TelegramInitDto = {
    telegramId: '12345',
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    authDate: new Date().getTime(),
    hash: 'hash',
  };

  const mockUser = {
    telegramId: '12345',
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    isActive: true,
    role: 'user',
    photoUrl: 'https://t.me/johndoe/photo',
    authDate: fixedDate,
    hash: 'user-hash',
  };

  // Increase timeout for beforeEach
  beforeEach(async () => {
    telegramServiceMock = {
      sendMessage: jest.fn().mockResolvedValue({}),
    };

    const usersServiceMock = {
      createAndUpdateUser: jest.fn(),
      findByTelegramId: jest.fn(),
    };

    // Create a new test module
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersServiceMock,
        },
        {
          provide: TelegramDtoAuthGuard,
          useValue: {
            canActivate: jest.fn().mockReturnValue(true),
            parseTelegramInitData: jest
              .fn()
              .mockReturnValue(mockTelegramInitDto),
          },
        },
        {
          provide: TelegramValidatorService,
          useValue: {
            validateTelegramInitData: jest.fn().mockReturnValue(true),
            validateTelegramDto: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: TelegramService,
          useValue: telegramServiceMock,
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(TelegramDtoAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
        parseTelegramInitData: jest.fn().mockReturnValue(mockTelegramInitDto),
      })
      .overrideGuard(FlexibleAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    // Create the app
    app = moduleFixture.createNestApplication();

    // Get services
    telegramValidatorService = moduleFixture.get<TelegramValidatorService>(
      TelegramValidatorService,
    );
    userService = moduleFixture.get(UsersService);

    // Initialize the app
    await app.init();
  }, 30000); // Increase timeout to 30 seconds

  // Clean up resources after each test
  afterEach(async () => {
    if (app) {
      await app.close();
    }
  }, 30000); // Increase timeout to 30 seconds

  // Clean up resources after all tests
  afterAll(async () => {
    // Any additional cleanup needed
  });

  describe('/users/signup (POST)', () => {
    it('should register a new user', async () => {
      // Mock services
      jest
        .spyOn(telegramValidatorService, 'validateTelegramDto')
        .mockReturnValue(true);

      jest
        .spyOn(userService, 'createAndUpdateUser')
        .mockResolvedValue(mockUser as any);

      // Use await instead of return for better error handling
      const response = await request(app.getHttpServer())
        .post('/users/signup')
        .send(mockTelegramInitDto)
        .expect(201);

      expect(response.body).toEqual(mockUser);
    }, 10000); // 10 seconds timeout

    it('should handle case when user already exists', async () => {
      // Mock services
      jest
        .spyOn(telegramValidatorService, 'validateTelegramDto')
        .mockReturnValue(true);

      jest
        .spyOn(userService, 'createAndUpdateUser')
        .mockResolvedValue(mockUser as any);

      // Use await instead of return for better error handling
      const response = await request(app.getHttpServer())
        .post('/users/signup')
        .send(mockTelegramInitDto)
        .expect(201);

      expect(response.body).toEqual(mockUser);
    }, 10000); // 10 seconds timeout
  });

  describe('/users/telegram/:telegramId (GET)', () => {
    it('should get user by telegramId', async () => {
      // Mock services
      jest
        .spyOn(userService, 'findByTelegramId')
        .mockResolvedValue(mockUser as any);

      // Use await instead of return for better error handling
      const response = await request(app.getHttpServer())
        .get('/users/telegram/12345')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200);

      expect(response.body).toEqual(mockUser);
    }, 10000); // 10 seconds timeout

    it('should handle case when user does not exist', async () => {
      // Mock findByTelegramId to throw a 404 error
      jest.spyOn(userService, 'findByTelegramId').mockImplementation(() => {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      });

      // Use await instead of return for better error handling
      await request(app.getHttpServer())
        .get('/users/telegram/nonexistent')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(404);
    }, 10000); // 10 seconds timeout
  });
});
