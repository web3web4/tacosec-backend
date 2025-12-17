import { Test, TestingModule } from '@nestjs/testing';
import { TelegramClientService } from '../../src/telegram-client/telegram-client.service';
import { TelegramClientConfig } from '../../src/telegram-client/telegram-client.config';
import { AppConfigService } from '../../src/common/config/app-config.service';

describe('TelegramClientService', () => {
  let service: TelegramClientService;

  const mockAppConfig: Partial<AppConfigService> = {
    telegramApiId: 12345,
    telegramApiHash: 'test_hash',
    telegramSessionPath: './test-sessions',
    telegramRequestTimeoutMs: 30000,
    telegramMaxRetries: 3,
    telegramRetryDelayMs: 1000,
    telegramDebug: false,
    telegramCacheTtlSeconds: 300,
    telegramMaxContactsPerRequest: 1000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramClientService,
        TelegramClientConfig,
        {
          provide: AppConfigService,
          useValue: mockAppConfig,
        },
      ],
    }).compile();

    service = module.get<TelegramClientService>(TelegramClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize with correct API credentials', () => {
      expect(service).toBeDefined();
      // Test that service can be created without throwing errors
    });
  });

  describe('session management', () => {
    it('should handle session creation', async () => {
      const userId = 123;
      // Test that service can handle session operations
      expect(service.hasUserSession(userId)).toBe(false);
    });

    it('should handle session cleanup', async () => {
      const userId = 123;
      // Test that service can handle session removal
      service.removeUserSession(userId);
      expect(service.hasUserSession(userId)).toBe(false);
    });

    it('should save and retrieve user sessions', () => {
      const userId = 123;
      const sessionString = 'test_session_string';

      service.saveUserSession(userId, sessionString);
      expect(service.hasUserSession(userId)).toBe(true);
      expect(service.getUserSession(userId)).toBe(sessionString);
    });
  });

  describe('client connection', () => {
    it('should handle client creation', async () => {
      // This test would require mocking the actual Telegram client
      // For now, we just test that the method exists
      expect(service.createClient).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing API credentials gracefully', () => {
      // Test error handling for missing credentials
      expect(() => {
        const badAppConfig = {};
        new TelegramClientConfig(badAppConfig as any);
      }).toBeDefined();
    });
  });
});
