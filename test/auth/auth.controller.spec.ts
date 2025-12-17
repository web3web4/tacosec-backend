import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { LoggerService } from '../../src/logger/logger.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockAuthService = {
    login: jest.fn(),
    refreshToken: jest.fn(),
  };

  const mockLoggerService = {
    logException: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return access token on successful login', async () => {
      const loginDto = {
        publicAddress: '0x1234567890abcdef',
        signature: 'test-signature',
      };

      const expectedResponse = {
        access_token: 'jwt-token',
      };

      jest.spyOn(service, 'login').mockResolvedValue(expectedResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expectedResponse);
      expect(service.login).toHaveBeenCalledWith(loginDto, undefined);
    });
  });
});
