import { Test, TestingModule } from '@nestjs/testing';
import { TelegramClientController } from '../../src/telegram-client/telegram-client.controller';
import { TelegramClientService } from '../../src/telegram-client/telegram-client.service';
import { AuthService } from '../../src/telegram-client/services/auth.service';
import { ContactsService } from '../../src/telegram-client/services/contacts.service';
import { SendCodeDto } from '../../src/telegram-client/dto/send-code.dto';
import { VerifyCodeDto } from '../../src/telegram-client/dto/verify-code.dto';
import { GetContactsDto } from '../../src/telegram-client/dto/get-contacts.dto';
import { SearchContactsDto } from '../../src/telegram-client/dto/search-contacts.dto';
import { ContactSyncStatus } from '../../src/telegram-client/interfaces/contact-sync.interface';
import { TelegramValidatorService } from '../../src/telegram/telegram-validator.service';
import { TelegramDtoAuthGuard } from '../../src/guards/telegram-dto-auth.guard';
import { AuthContextService } from '../../src/common/services/auth-context.service';

describe('TelegramClientController', () => {
  let controller: TelegramClientController;

  const mockTelegramClientService = {
    hasUserSession: jest.fn(),
    removeUserSession: jest.fn(),
  };

  const mockAuthService = {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
    logout: jest.fn(),
  };

  const mockContactsService = {
    getContacts: jest.fn(),
    searchContacts: jest.fn(),
    syncContacts: jest.fn(),
    // getContactById method doesn't exist in ContactsService
  };

  const mockTelegramValidatorService = {
    validateTelegramInitData: jest.fn().mockReturnValue(true),
  };

  const mockAuthContextService = {
    getCurrentUser: jest.fn(),
    getCurrentUserId: jest.fn(),
    getAuthenticatedUser: jest.fn(),
    getTelegramData: jest.fn(),
    getAuthMethod: jest.fn(),
    isAuthenticated: jest.fn(),
    getJwtUserAndPayload: jest.fn(),
    getTelegramAuthDataFromInitData: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramClientController],
      providers: [
        {
          provide: TelegramClientService,
          useValue: mockTelegramClientService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ContactsService,
          useValue: mockContactsService,
        },
        {
          provide: TelegramValidatorService,
          useValue: mockTelegramValidatorService,
        },
        {
          provide: AuthContextService,
          useValue: mockAuthContextService,
        },
        {
          provide: TelegramDtoAuthGuard,
          useValue: { canActivate: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    controller = module.get<TelegramClientController>(TelegramClientController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendCode', () => {
    it('should send verification code', async () => {
      const userId = 123;
      const sendCodeDto: SendCodeDto = {
        phoneNumber: '+1234567890',
        userId: userId,
      };
      const expectedResult = {
        success: true,
        phoneCodeHash: 'test_hash',
        timeout: 60,
        type: 'sms',
      };

      mockAuthService.sendCode.mockResolvedValue(expectedResult);

      const result = await controller.sendCode(sendCodeDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.sendCode).toHaveBeenCalledWith(sendCodeDto);
    });
  });

  describe('verifyCode', () => {
    it('should verify code successfully', async () => {
      const userId = 123;
      const verifyCodeDto: VerifyCodeDto = {
        phoneNumber: '+1234567890',
        code: '12345',
        phoneCodeHash: 'test_hash',
        userId: userId,
      };
      const expectedResult = {
        success: true,
        user: {
          id: 123,
          firstName: 'Test',
          lastName: 'User',
          username: 'testuser',
          phone: '+1234567890',
        },
      };

      mockAuthService.verifyCode.mockResolvedValue(expectedResult);

      const result = await controller.verifyCode(verifyCodeDto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.verifyCode).toHaveBeenCalledWith(verifyCodeDto);
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      const userId = 123;
      const expectedResult = { success: true };

      mockAuthService.logout.mockResolvedValue(expectedResult);

      const result = await controller.logout(userId.toString());

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.logout).toHaveBeenCalledWith(userId);
    });
  });

  describe('getContacts', () => {
    it('should get contacts with pagination', async () => {
      const getContactsDto: GetContactsDto = {
        offset: 0,
        limit: 10,
      };
      const userId = 123;
      const expectedResult = {
        success: true,
        contacts: [
          {
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1234567890',
            username: 'johndoe',
          },
        ],
        total: 1,
      };

      mockContactsService.getContacts.mockResolvedValue(expectedResult);

      const result = await controller.getContacts(
        userId.toString(),
        getContactsDto,
      );

      expect(result).toEqual(expectedResult);
      expect(mockContactsService.getContacts).toHaveBeenCalledWith(
        userId,
        getContactsDto,
      );
    });
  });

  describe('searchContacts', () => {
    it('should search contacts by query', async () => {
      const searchContactsDto: SearchContactsDto = {
        query: 'John',
        limit: 10,
      };
      const userId = 123;
      const expectedResult = {
        success: true,
        contacts: [
          {
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            phone: '+1234567890',
            username: 'johndoe',
          },
        ],
        query: 'John',
        total: 1,
      };

      mockContactsService.searchContacts.mockResolvedValue(expectedResult);

      const result = await controller.searchContacts(
        userId.toString(),
        searchContactsDto,
      );

      expect(result).toEqual(expectedResult);
      expect(mockContactsService.searchContacts).toHaveBeenCalledWith(
        userId,
        searchContactsDto,
      );
    });
  });

  describe('syncContacts', () => {
    it('should sync contacts successfully', async () => {
      const userId = 123;
      const expectedResult = {
        status: ContactSyncStatus.COMPLETED,
        syncId: 'sync_123',
        startedAt: new Date(),
        completedAt: new Date(),
        totalContacts: 2,
        processedContacts: 2,
        newContacts: 2,
        updatedContacts: 0,
        deletedContacts: 0,
        errors: [],
        progress: 100,
      };

      mockContactsService.syncContacts.mockResolvedValue(expectedResult);

      const result = await controller.syncContacts(userId.toString());

      expect(result).toEqual(expectedResult);
      expect(mockContactsService.syncContacts).toHaveBeenCalledWith(userId);
    });
  });

  // Note: getContactById method is not implemented in ContactsService
  // This test section has been removed as the method doesn't exist

  // Note: getSessionStatus method is not implemented in TelegramClientController
  // This test section has been removed as the method doesn't exist
});
