import { Test, TestingModule } from '@nestjs/testing';
import { ContactsService } from '../../src/telegram-client/services/contacts.service';
import { TelegramClientService } from '../../src/telegram-client/telegram-client.service';
import { TelegramClientConfig } from '../../src/telegram-client/telegram-client.config';
import { ConfigService } from '@nestjs/config';
import { ContactSyncStatus } from '../../src/telegram-client/interfaces/contact-sync.interface';

describe('ContactsService', () => {
  let service: ContactsService;
  let telegramClientService: TelegramClientService;

  const mockTelegramClientService = {
    createClient: jest.fn(),
    getClient: jest.fn(),
    hasUserSession: jest.fn(),
    saveUserSession: jest.fn(),
    removeUserSession: jest.fn(),
    disconnectClient: jest.fn().mockResolvedValue(undefined),
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
        ContactsService,
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

    service = module.get<ContactsService>(ContactsService);
    telegramClientService = module.get<TelegramClientService>(
      TelegramClientService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getContacts', () => {
    it('should retrieve contacts successfully', async () => {
      const userId = 123;
      const mockContactsData = [
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
          username: 'johndoe',
        },
        {
          id: 2,
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+0987654321',
          username: 'janesmith',
        },
      ];

      // Create proper Api.User instances
      const { Api } = require('telegram/tl');
      const mockUsers = mockContactsData.map((contact) => {
        const user = new Api.User({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          username: contact.username,
          self: false,
          bot: false,
          verified: false,
          premium: false,
          contact: true,
          mutualContact: true,
        });
        return user;
      });

      const mockResult = new Api.contacts.Contacts({
        users: mockUsers,
        savedCount: mockUsers.length,
      });

      const mockClient = {
        invoke: jest.fn().mockResolvedValue(mockResult),
      };

      mockTelegramClientService.hasUserSession.mockReturnValue(true);
      mockTelegramClientService.getClient.mockReturnValue(mockClient);

      const result = await service.getContacts(userId, { limit: 100 });

      const expectedContacts = [
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+1234567890',
          username: 'johndoe',
          isBot: false,
          isVerified: false,
          isPremium: false,
          isContact: true,
          isMutualContact: true,
          languageCode: '',
          accessHash: '',
          status: 'unknown',
          lastSeen: null,
          photo: { hasPhoto: false },
        },
        {
          id: 2,
          firstName: 'Jane',
          lastName: 'Smith',
          phoneNumber: '+0987654321',
          username: 'janesmith',
          isBot: false,
          isVerified: false,
          isPremium: false,
          isContact: true,
          isMutualContact: true,
          languageCode: '',
          accessHash: '',
          status: 'unknown',
          lastSeen: null,
          photo: { hasPhoto: false },
        },
      ];

      expect(result).toEqual({
        contacts: expectedContacts,
        total: expectedContacts.length,
        limit: 100,
        offset: 0,
        hasMore: false,
      });
    });

    it('should handle errors when retrieving contacts', async () => {
      const userId = 123;

      mockTelegramClientService.hasUserSession.mockReturnValue(true);
      mockTelegramClientService.getClient.mockReturnValue(null);

      await expect(service.getContacts(userId, { limit: 100 })).rejects.toThrow(
        'Client not found for user',
      );
    });
  });

  describe('searchContacts', () => {
    it('should search contacts by query', async () => {
      const userId = 123;
      const query = 'John';
      const limit = 10;

      const mockSearchResults = [
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          phoneNumber: '+1234567890',
          username: 'johndoe',
          isBot: false,
          isVerified: false,
          isPremium: false,
          isContact: true,
          isMutualContact: true,
          languageCode: '',
          accessHash: '',
          status: 'unknown',
          lastSeen: null,
          photo: { hasPhoto: false },
        },
      ];

      // Create a mock that will pass the instanceof check
      const { Api } = require('telegram/tl');

      const mockUsers = mockSearchResults.map((contact) => {
        const user = new Api.User({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phoneNumber,
          username: contact.username,
          self: false,
          bot: false,
          verified: false,
          premium: false,
          contact: true,
          mutualContact: true,
        });
        return user;
      });

      const mockResult = new Api.contacts.Contacts({
        users: mockUsers,
        savedCount: mockUsers.length,
      });

      const mockClient = {
        invoke: jest.fn().mockResolvedValue(mockResult),
      };

      mockTelegramClientService.hasUserSession.mockReturnValue(true);
      mockTelegramClientService.getClient.mockReturnValue(mockClient);

      const result = await service.searchContacts(userId, { query, limit });

      expect(result).toEqual({
        success: true,
        contacts: mockSearchResults,
        query,
        total: mockSearchResults.length,
      });
    });

    it('should handle empty search results', async () => {
      const userId = 123;
      const query = 'NonExistent';
      const limit = 10;

      // Create a mock that will pass the instanceof check
      const { Api } = require('telegram/tl');

      const mockResult = new Api.contacts.Contacts({
        users: [],
        savedCount: 0,
      });

      const mockClient = {
        invoke: jest.fn().mockResolvedValue(mockResult),
      };

      mockTelegramClientService.hasUserSession.mockReturnValue(true);
      mockTelegramClientService.getClient.mockReturnValue(mockClient);

      const result = await service.searchContacts(userId, { query, limit });

      expect(result).toEqual({
        success: true,
        contacts: [],
        query,
        total: 0,
      });
    });
  });

  describe('syncContacts', () => {
    it('should sync contacts successfully', async () => {
      const userId = 123;
      const contacts = [
        { name: 'John Doe', phone: '+1234567890' },
        { name: 'Jane Smith', phone: '+0987654321' },
      ];

      // Create a mock that will pass the instanceof check
      const { Api } = require('telegram/tl');

      const mockUsers = contacts.map((contact) => {
        const user = new Api.User({
          id: Math.floor(Math.random() * 1000000),
          firstName: contact.name.split(' ')[0],
          lastName: contact.name.split(' ')[1] || '',
          phone: contact.phone,
          self: false,
          bot: false,
          verified: false,
          premium: false,
          contact: true,
          mutualContact: true,
        });
        return user;
      });

      const mockResult = new Api.contacts.Contacts({
        users: mockUsers,
        savedCount: mockUsers.length,
      });

      const mockClient = {
        invoke: jest.fn().mockResolvedValue(mockResult),
      };

      mockTelegramClientService.hasUserSession.mockReturnValue(true);
      mockTelegramClientService.getClient.mockReturnValue(mockClient);

      const result = await service.syncContacts(userId);

      expect(result.status).toBe(ContactSyncStatus.COMPLETED);
      expect(result.totalContacts).toBe(contacts.length);
      expect(result.processedContacts).toBe(contacts.length);
      expect(result.newContacts).toBe(contacts.length);
    });

    it('should handle sync errors', async () => {
      const userId = 123;
      const contacts = [{ name: 'John Doe', phone: '+1234567890' }];

      mockTelegramClientService.hasUserSession.mockReturnValue(true);
      mockTelegramClientService.getClient.mockReturnValue(null);

      const result = await service.syncContacts(userId);

      expect(result.status).toBe(ContactSyncStatus.FAILED);
      expect(result.errors).toContain('Client not found for user');
    });

    it('should handle partial sync failures', async () => {
      const userId = 123;
      const contacts = [
        { name: 'John Doe', phone: '+1234567890' },
        { name: 'Invalid Contact', phone: 'invalid' },
      ];

      const mockClient = {
        invoke: jest.fn().mockRejectedValue(new Error('Invalid phone number')),
      };

      mockTelegramClientService.hasUserSession.mockReturnValue(true);
      mockTelegramClientService.getClient.mockReturnValue(mockClient);

      const result = await service.syncContacts(userId);

      expect(result.status).toBe(ContactSyncStatus.FAILED);
      expect(result.errors).toContain('Invalid phone number');
    });
  });

  // Note: getContactById method is not implemented in ContactsService
  // This test section has been removed as the method doesn't exist
});
