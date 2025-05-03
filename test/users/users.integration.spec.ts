import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpException, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TelegramInitDto } from '../../src/telegram/dto/telegram-init.dto';
import { UsersService } from '../../src/users/users.service';
import { TelegramValidatorService } from '../../src/telegram/telegram-validator.service';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../../src/users/schemas/user.schema';
import { TelegramDtoAuthGuard } from '../../src/telegram/dto/telegram-dto-auth.guard';

describe('UserController (e2e)', () => {
  let app: INestApplication;
  let telegramValidatorService: TelegramValidatorService;
  let userService: UsersService;
  let telegramDtoAuthGuard: TelegramDtoAuthGuard;

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

  beforeEach(async () => {
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
      .compile();

    app = moduleFixture.createNestApplication();
    telegramValidatorService = moduleFixture.get<TelegramValidatorService>(
      TelegramValidatorService,
    );
    userService = moduleFixture.get<UsersService>(UsersService);
    telegramDtoAuthGuard = moduleFixture.get<TelegramDtoAuthGuard>(
      TelegramDtoAuthGuard,
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/users/signup (POST)', () => {
    it('should register a new user', () => {
      // Mock services
      jest
        .spyOn(telegramValidatorService, 'validateTelegramDto')
        .mockReturnValue(true);

      jest
        .spyOn(userService, 'createAndUpdateUser')
        .mockResolvedValue(mockUser as any);

      return request(app.getHttpServer())
        .post('/users/signup')
        .send(mockTelegramInitDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toEqual(mockUser);
        });
    });

    it('should handle case when user already exists', () => {
      // Mock services
      jest
        .spyOn(telegramValidatorService, 'validateTelegramDto')
        .mockReturnValue(true);

      jest
        .spyOn(userService, 'createAndUpdateUser')
        .mockResolvedValue(mockUser as any);

      return request(app.getHttpServer())
        .post('/users/signup')
        .send(mockTelegramInitDto)
        .expect(201)
        .expect((res) => {
          expect(res.body).toEqual(mockUser);
        });
    });
  });

  describe('/users/telegram/:telegramId (GET)', () => {
    it('should get user by telegramId', () => {
      // Mock services
      jest.spyOn(userService, 'findByTelegramId').mockResolvedValue(mockUser as any);

      return request(app.getHttpServer())
        .get('/users/telegram/12345')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockUser);
        });
    });

    it('should handle case when user does not exist', () => {
      // Mock findByTelegramId to throw a 404 error
      jest.spyOn(userService, 'findByTelegramId').mockImplementation(() => {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      });

      return request(app.getHttpServer())
        .get('/users/telegram/nonexistent')
        .set('X-Telegram-Init-Data', 'mock-init-data')
        .expect(404);
    });
  });
});
