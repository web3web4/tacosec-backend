import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from '../../src/passwords/password.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Types } from 'mongoose';
import { User, UserDocument } from '../../src/users/schemas/user.schema';
import {
  Password,
  PasswordDocument,
} from '../../src/passwords/schemas/password.schema';
import {
  Report,
  ReportDocument,
} from '../../src/reports/schemas/report.schema';
import { HttpException, HttpStatus } from '@nestjs/common';
import { SharedWithMeResponse } from '../../src/types/share-with-me-pass.types';
import { TelegramService } from '../../src/telegram/telegram.service';
import { Type } from '../../src/passwords/enums/type.enum';

describe('PasswordService', () => {
  let service: PasswordService;
  let userModel: Model<UserDocument>;
  let passwordModel: Model<PasswordDocument>;
  let reportModel: Model<ReportDocument>;
  let telegramServiceMock;

  // Mock data
  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    telegramId: '123456',
    username: 'johndoe',
    isActive: true,
  };

  const mockPassword = {
    _id: '507f1f77bcf86cd799439012',
    userId: mockUser._id,
    key: 'test_key',
    value: 'test_value',
    isActive: true,
    sharedWith: ['789012'],
    createdAt: new Date(),
    updatedAt: new Date(),
    type: 'text',
    description: 'test_description',
    hidden: false,
  };

  beforeEach(async () => {
    telegramServiceMock = {
      sendMessage: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        {
          provide: getModelToken(User.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn(),
            }),
            find: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                lean: jest.fn().mockReturnThis(),
                exec: jest.fn(),
              }),
            }),
          },
        },
        {
          provide: getModelToken(Password.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn(),
            }),
            find: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                exec: jest.fn(),
              }),
            }),
            findByIdAndUpdate: jest.fn().mockReturnValue({
              exec: jest.fn(),
            }),
            countDocuments: jest.fn().mockReturnValue({
              exec: jest.fn(),
            }),
            save: jest.fn(),
          },
        },
        {
          provide: getModelToken(Report.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        {
          provide: TelegramService,
          useValue: telegramServiceMock,
        },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
    passwordModel = module.get<Model<PasswordDocument>>(
      getModelToken(Password.name),
    );
    reportModel = module.get<Model<ReportDocument>>(getModelToken(Report.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByUserTelegramId', () => {
    /**
     * Test Case: Should return user passwords
     * Steps:
     * 1. Mock userModel.findOne to return user
     * 2. Mock passwordModel.find to return passwords
     * 3. Mock userModel.find to return shared users
     * 4. Call findByUserTelegramId
     * 5. Verify the result
     */
    it('should return user passwords', async () => {
      const mockPasswordsWithId = [
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
          key: 'test_key',
          value: 'test_value',
          description: 'test_description',
          type: Type.PASSWORD,
          sharedWith: [{ username: '789012', invited: true }],
          updatedAt: new Date(),
          createdAt: new Date(),
          hidden: false,
        },
      ];
      const mockSharedUsers = [{ username: 'shareduser' }];

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      } as any);
      jest.spyOn(passwordModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockPasswordsWithId),
        }),
      } as any);
      jest.spyOn(reportModel, 'find').mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      } as any);
      jest.spyOn(userModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockSharedUsers),
        }),
      } as any);

      const result = await service.findByUserTelegramId('123456');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        _id: mockPasswordsWithId[0]._id,
        key: 'test_key',
        value: 'test_value',
        description: 'test_description',
        type: Type.PASSWORD,
        reports: [],
      });
    });

    /**
     * Test Case: Should throw error for invalid telegramId
     * Steps:
     * 1. Mock userModel.findOne to return null
     * 2. Call findByUserTelegramId
     * 3. Verify error is thrown
     */
    it('should throw error for invalid telegramId', async () => {
      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(service.findByUserTelegramId('invalid')).rejects.toThrow(
        new HttpException('telegramId is not valid', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('findByUserTelegramIdWithPagination', () => {
    /**
     * Test Case: Should return paginated user passwords when valid pagination parameters are provided
     * Steps:
     * 1. Mock userModel.findOne to return user
     * 2. Mock passwordModel.find to return passwords
     * 3. Mock userModel.find to return shared users
     * 4. Call findByUserTelegramIdWithPagination with valid pagination
     * 5. Verify the paginated result
     */
    it('should return paginated user passwords with valid pagination parameters', async () => {
      const mockPasswordsWithId = [
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
          key: 'test_key',
          value: 'test_value',
          description: 'test_description',
          type: Type.TEXT,
          sharedWith: [{ username: '789012', invited: true }],
          updatedAt: new Date(),
          createdAt: new Date(),
          hidden: false,
        },
      ];
      const mockSharedUsers = [{ username: 'shareduser' }];
      const page = 1;
      const limit = 10;

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      } as any);
      jest.spyOn(passwordModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(mockPasswordsWithId),
        }),
      } as any);
      jest.spyOn(passwordModel, 'countDocuments').mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      } as any);
      jest.spyOn(reportModel, 'find').mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      } as any);
      jest.spyOn(userModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockSharedUsers),
        }),
      } as any);

      const result = await service.findByUserTelegramIdWithPagination(
        '123456',
        page,
        limit,
      );

      expect(result).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({
            _id: expect.any(Object),
            key: 'test_key',
            value: 'test_value',
            description: 'test_description',
            type: Type.TEXT,
            sharedWith: expect.any(Array),
            reports: [],
            hidden: false,
          }),
        ]),
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          limit: 10,
        },
      });
    });

    /**
     * Test Case: Should return original response when pagination parameters are invalid
     * Steps:
     * 1. Mock userModel.findOne to return user
     * 2. Mock passwordModel.find to return passwords
     * 3. Mock userModel.find to return shared users
     * 4. Call findByUserTelegramIdWithPagination with invalid pagination
     * 5. Verify the original response format
     */
    it('should return original response when pagination parameters are invalid', async () => {
      const mockPasswordsWithId = [
        {
          _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
          key: 'test_key',
          value: 'test_value',
          description: 'test_description',
          type: Type.PASSWORD,
          sharedWith: [{ username: '789012', invited: true }],
          updatedAt: new Date(),
          createdAt: new Date(),
          hidden: false,
          reports: [],
        },
      ];

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      } as any);
      jest.spyOn(passwordModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockPasswordsWithId),
        }),
      } as any);
      jest.spyOn(reportModel, 'find').mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      } as any);
      jest
        .spyOn(service, 'findByUserTelegramId')
        .mockResolvedValue(mockPasswordsWithId);

      const result = await service.findByUserTelegramIdWithPagination(
        '123456',
        undefined,
        undefined,
      );

      expect(result).toEqual(mockPasswordsWithId);
    });

    /**
     * Test Case: Should throw error for invalid telegramId
     * Steps:
     * 1. Mock userModel.findOne to return null
     * 2. Call findByUserTelegramIdWithPagination
     * 3. Verify error is thrown
     */
    it('should throw error for invalid telegramId', async () => {
      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(
        service.findByUserTelegramIdWithPagination('invalid', 1, 10),
      ).rejects.toThrow(
        new HttpException('telegramId is not valid', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('findPasswordsSharedWithMe', () => {
    /**
     * Test Case: Should return passwords shared with user
     * Steps:
     * 1. Mock getSharedWithMe to return shared passwords
     * 2. Call findPasswordsSharedWithMe
     * 3. Verify the result
     */
    it('should return passwords shared with user', async () => {
      const mockSharedPasswords = {
        sharedWithMe: [
          {
            username: 'owner',
            passwords: [
              {
                id: '1',
                key: 'shared_key',
                value: 'shared_value',
                description: '',
              },
            ],
          },
        ],
        userCount: 1,
      };

      jest
        .spyOn(service, 'getSharedWithMe')
        .mockResolvedValue(mockSharedPasswords as SharedWithMeResponse);

      const result = await service.findPasswordsSharedWithMe('testuser');

      expect(result).toEqual(mockSharedPasswords);
      expect(service.getSharedWithMe).toHaveBeenCalledWith('testuser');
    });

    /**
     * Test Case: Should throw error if username is not provided
     * Steps:
     * 1. Mock getSharedWithMe to throw an error
     * 2. Call findPasswordsSharedWithMe
     * 3. Verify error is thrown
     */
    it('should throw error if username is not provided', async () => {
      jest
        .spyOn(service, 'getSharedWithMe')
        .mockRejectedValue(
          new HttpException('Username is required', HttpStatus.BAD_REQUEST),
        );

      await expect(service.findPasswordsSharedWithMe('')).rejects.toThrow(
        new HttpException('Username is required', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('findPasswordsSharedWithMeWithPagination', () => {
    /**
     * Test Case: Should return paginated passwords shared with user when valid pagination parameters are provided
     * Steps:
     * 1. Mock getSharedWithMe to return shared passwords
     * 2. Call findPasswordsSharedWithMeWithPagination with valid pagination
     * 3. Verify the paginated result
     */
    it('should return paginated passwords shared with user with valid pagination parameters', async () => {
      const mockPassword = {
        _id: 'password123',
        key: 'shared_key',
        value: 'shared_value',
        description: 'test description',
        initData: { username: 'owner' },
      };
      const page = 1;
      const limit = 10;

      jest.spyOn(passwordModel, 'countDocuments').mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      } as any);
      jest.spyOn(passwordModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([mockPassword]),
      } as any);

      const result = await service.findPasswordsSharedWithMeWithPagination(
        'testuser',
        page,
        limit,
      );

      expect(result).toEqual({
        data: [
          {
            _id: 'password123',
            key: 'shared_key',
            value: 'shared_value',
            description: 'test description',
            sharedBy: 'owner',
          },
        ],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          limit: 10,
        },
      });
    });

    /**
     * Test Case: Should return original response when pagination parameters are invalid
     * Steps:
     * 1. Mock getSharedWithMe to return shared passwords
     * 2. Call findPasswordsSharedWithMeWithPagination with invalid pagination
     * 3. Verify the original response format
     */
    it('should return original response when pagination parameters are invalid', async () => {
      const mockSharedPasswords = {
        sharedWithMe: [
          {
            username: 'owner',
            passwords: [
              {
                id: '1',
                key: 'shared_key',
                value: 'shared_value',
                description: '',
              },
            ],
          },
        ],
        userCount: 1,
      };

      jest
        .spyOn(service, 'getSharedWithMe')
        .mockResolvedValue(mockSharedPasswords as SharedWithMeResponse);

      const result = await service.findPasswordsSharedWithMeWithPagination(
        'testuser',
        undefined,
        undefined,
      );

      expect(result).toEqual(mockSharedPasswords);
      expect(service.getSharedWithMe).toHaveBeenCalledWith('testuser');
    });

    /**
     * Test Case: Should throw error if username is not provided
     * Steps:
     * 1. Mock getSharedWithMe to throw an error
     * 2. Call findPasswordsSharedWithMeWithPagination
     * 3. Verify error is thrown
     */
    it('should throw error if username is not provided', async () => {
      jest
        .spyOn(service, 'getSharedWithMe')
        .mockRejectedValue(
          new HttpException('Username is required', HttpStatus.BAD_REQUEST),
        );

      await expect(
        service.findPasswordsSharedWithMeWithPagination('', 1, 10),
      ).rejects.toThrow(
        new HttpException('Username is required', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('findSharedWithByTelegramIdWithPagination', () => {
    /**
     * Test Case: Should return paginated shared passwords when valid pagination parameters are provided
     * Steps:
     * 1. Mock userModel.findOne to return user
     * 2. Mock passwordModel.find to return passwords
     * 3. Mock userModel.find to return shared users
     * 4. Call findSharedWithByTelegramIdWithPagination with valid pagination
     * 5. Verify the paginated result
     */
    it('should return paginated shared passwords with valid pagination parameters', async () => {
      const mockPasswords = [mockPassword];
      const mockSharedUsers = [{ username: 'shareduser' }];
      const page = 1;
      const limit = 10;

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      } as any);
      jest.spyOn(passwordModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(mockPasswords),
        }),
      } as any);
      jest.spyOn(passwordModel, 'countDocuments').mockResolvedValue(1);
      jest.spyOn(userModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockSharedUsers),
        }),
      } as any);

      const result = await service.findSharedWithByTelegramIdWithPagination(
        '123456',
        'test_key',
        page,
        limit,
      );

      expect(result).toEqual({
        data: ['789012'],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalCount: 1,
          hasNextPage: false,
          hasPreviousPage: false,
          limit: 10,
        },
      });
    });

    /**
     * Test Case: Should return original response when pagination parameters are invalid
     * Steps:
     * 1. Mock userModel.findOne to return user
     * 2. Mock passwordModel.find to return passwords
     * 3. Mock userModel.find to return shared users
     * 4. Call findSharedWithByTelegramIdWithPagination with invalid pagination
     * 5. Verify the original response format
     */
    it('should return original response when pagination parameters are invalid', async () => {
      const mockPasswords = [mockPassword];
      const mockSharedUsers = [{ username: 'shareduser' }];

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      } as any);
      jest.spyOn(passwordModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockPasswords),
        }),
      } as any);
      jest.spyOn(userModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockSharedUsers),
        }),
      } as any);

      const result = await service.findSharedWithByTelegramIdWithPagination(
        '123456',
        'test_key',
        undefined,
        undefined,
      );

      expect(result).toEqual(['789012']);
    });

    /**
     * Test Case: Should throw error for invalid telegramId
     * Steps:
     * 1. Mock userModel.findOne to return null
     * 2. Call findSharedWithByTelegramIdWithPagination
     * 3. Verify error is thrown
     */
    it('should throw error for invalid telegramId', async () => {
      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(
        service.findSharedWithByTelegramIdWithPagination(
          'invalid',
          'test_key',
          1,
          10,
        ),
      ).rejects.toThrow(HttpException);
    });
  });
});
