import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpException, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TelegramInitDto } from '../../src/telegram/dto/telegram-init.dto';
import { UsersService } from '../../src/users/users.service';
// import { PasswordService } from '../../src/passwords/password.service';
import { TelegramValidatorService } from '../../src/telegram/telegram-validator.service';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../../src/users/schemas/user.schema';
import { TelegramDtoAuthGuard } from '../../src/telegram/dto/telegram-dto-auth.guard';
import { TelegramService } from '../../src/telegram/telegram.service';
// import { Types } from 'mongoose';
// import { Type } from '../../src/passwords/enums/type.enum';

describe('UserController (e2e)', () => {
  let app: INestApplication;
  let telegramValidatorService: TelegramValidatorService;
  let userService: UsersService;
  let telegramDtoAuthGuard: TelegramDtoAuthGuard;
  let telegramServiceMock;

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

    // Create a new test module
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TelegramValidatorService)
      .useValue({
        // Mock the validation to always return true
        validateTelegramInitData: jest.fn().mockReturnValue(true),
        validateTelegramDto: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(TelegramDtoAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
        parseTelegramInitData: jest.fn().mockReturnValue(mockTelegramInitDto),
      })
      .overrideProvider(getModelToken(User.name))
      .useValue({
        findOne: jest.fn(),
        create: jest.fn(),
      })
      .overrideProvider(TelegramService)
      .useValue(telegramServiceMock)
      .compile();

    // Create the app
    app = moduleFixture.createNestApplication();

    // Get services
    telegramValidatorService = moduleFixture.get<TelegramValidatorService>(
      TelegramValidatorService,
    );
    userService = moduleFixture.get<UsersService>(UsersService);
    telegramDtoAuthGuard =
      moduleFixture.get<TelegramDtoAuthGuard>(TelegramDtoAuthGuard);

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
