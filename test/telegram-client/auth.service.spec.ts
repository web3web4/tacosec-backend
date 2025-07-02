import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/telegram-client/services/auth.service';
import { TelegramClientService } from '../../src/telegram-client/telegram-client.service';
import { TelegramClientConfig } from '../../src/telegram-client/telegram-client.config';
import { ConfigService } from '@nestjs/config';

describe('AuthService', () => {
  let service: AuthService;
  let telegramClientService: TelegramClientService;

  const mockTelegramClientService = {
    createClient: jest.fn(),
    getClient: jest.fn(),
    hasUserSession: jest.fn(),
    saveUserSession: jest.fn(),
    removeUserSession: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        TELEGRAM_API_ID: '12345',
        TELEGRAM_API_HASH: 'test_hash',
        TELEGRAM_SESSION_PATH: './test-sessions',
        TELEGRAM_REQUEST_TIMEOUT: '30000',
        TELEGRAM_MAX_RETRIES: '3',
        TELEGRAM_RETRY_DELAY: '1000',
        TELEGRAM_DEBUG: 'false',
        TELEGRAM_CACHE_TTL: '300',
        TELEGRAM_MAX_CONTACTS_PER_REQUEST: '1000',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: TelegramClientService,
          useValue: mockTelegramClientService,
        },
        {
          provide: TelegramClientConfig,
          useFactory: () => new TelegramClientConfig(mockConfigService as any),
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    telegramClientService = module.get<TelegramClientService>(
      TelegramClientService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendCode', () => {
    it('should send verification code', async () => {
      const phoneNumber = '+1234567890';
      const userId = 123;

      const mockClient = {
        invoke: jest.fn().mockResolvedValue({
          phoneCodeHash: 'test_hash',
          timeout: 60,
          type: 'sms',
        }),
      };

      mockTelegramClientService.createClient.mockResolvedValue(mockClient);

      const result = await service.sendCode({ phoneNumber, userId });

      expect(result).toEqual({
        success: true,
        phoneCodeHash: 'test_hash',
        timeout: 60,
        type: 'sms',
      });
      expect(mockTelegramClientService.createClient).toHaveBeenCalledWith(
        userId,
      );
    });

    it('should handle errors when sending code', async () => {
      const phoneNumber = '+1234567890';
      const userId = 123;

      mockTelegramClientService.createClient.mockRejectedValue(
        new Error('Network error'),
      );

      await expect(service.sendCode({ phoneNumber, userId })).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('verifyCode', () => {
    it('should verify code successfully', async () => {
      const phoneNumber = '+1234567890';
      const phoneCode = '12345';
      const phoneCodeHash = 'test_hash';
      const userId = 123;

      const mockClient = {
        invoke: jest.fn().mockResolvedValue({
          user: {
            id: 123,
            firstName: 'Test',
            lastName: 'User',
            username: 'testuser',
            phone: '+1234567890',
          },
        }),
      };

      mockTelegramClientService.getClient.mockReturnValue(mockClient);

      const result = await service.verifyCode({
        phoneNumber,
        code: phoneCode,
        phoneCodeHash,
        userId,
      });

      expect(result).toEqual({
        success: true,
        user: {
          id: 123,
          firstName: 'Test',
          lastName: 'User',
          username: 'testuser',
          phone: '+1234567890',
        },
      });
    });

    it('should handle invalid verification code', async () => {
      const phoneNumber = '+1234567890';
      const phoneCode = 'invalid';
      const phoneCodeHash = 'test_hash';
      const userId = 123;

      const mockClient = {
        invoke: jest.fn().mockRejectedValue(new Error('PHONE_CODE_INVALID')),
      };

      mockTelegramClientService.getClient.mockReturnValue(mockClient);

      await expect(
        service.verifyCode({
          phoneNumber,
          code: phoneCode,
          phoneCodeHash,
          userId,
        }),
      ).rejects.toThrow('PHONE_CODE_INVALID');
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      const userId = 123;

      const mockClient = {
        invoke: jest.fn().mockResolvedValue(true),
      };

      mockTelegramClientService.getClient.mockReturnValue(mockClient);

      const result = await service.logout(userId);

      expect(result).toEqual({ success: true });
      expect(mockTelegramClientService.removeUserSession).toHaveBeenCalledWith(
        userId,
      );
    });

    it('should handle logout errors', async () => {
      const userId = 123;

      mockTelegramClientService.getClient.mockReturnValue(null);

      await expect(service.logout(userId)).rejects.toThrow(
        'Client not found for user',
      );
    });
  });
});
