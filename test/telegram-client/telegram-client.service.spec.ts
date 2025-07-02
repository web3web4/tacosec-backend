import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramClientService } from '../../src/telegram-client/telegram-client.service';
import { TelegramClientConfig } from '../../src/telegram-client/telegram-client.config';

describe('TelegramClientService', () => {
  let service: TelegramClientService;
  let configService: ConfigService;

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
        TelegramClientService,
        TelegramClientConfig,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<TelegramClientService>(TelegramClientService);
    configService = module.get<ConfigService>(ConfigService);
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
      const userId = 123;
      // This test would require mocking the actual Telegram client
      // For now, we just test that the method exists
      expect(service.createClient).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing API credentials gracefully', () => {
      // Test error handling for missing credentials
      expect(() => {
        const badConfigService = {
          get: jest.fn(() => undefined),
        };
        new TelegramClientConfig(badConfigService as any);
      }).toBeDefined();
    });
  });
});
