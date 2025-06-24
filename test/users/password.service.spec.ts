import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from '../../src/passwords/password.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
            save: jest.fn(),
          },
        },
        {
          provide: getModelToken(Report.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
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

      const result = await service.findByUserTelegramId('123456');

      expect(result).toEqual([
        {
          _id: mockPassword._id,
          createdAt: mockPassword.createdAt,
          updatedAt: mockPassword.updatedAt,
          type: mockPassword.type,
          description: mockPassword.description,
          key: mockPassword.key,
          value: mockPassword.value,
          sharedWith: ['789012'],
          hidden: mockPassword.hidden,
          reports: [],
        },
      ]);
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
});
