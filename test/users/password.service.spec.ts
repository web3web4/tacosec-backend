import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from '../../src/users/password.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../src/users/schemas/user.schema';
import {
  Password,
  PasswordDocument,
} from '../../src/users/schemas/password.schema';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('PasswordService', () => {
  let service: PasswordService;
  let userModel: Model<UserDocument>;
  let passwordModel: Model<PasswordDocument>;

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
  };

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
    passwordModel = module.get<Model<PasswordDocument>>(
      getModelToken(Password.name),
    );
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
          key: mockPassword.key,
          value: mockPassword.value,
          sharedWith: ['shareduser'],
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
     * 1. Mock userModel.findOne to return user
     * 2. Mock getSharedWithMe to return shared passwords
     * 3. Call findPasswordsSharedWithMe
     * 4. Verify the result
     */
    it('should return passwords shared with user', async () => {
      const mockSharedPasswords = {
        sharedWithMe: [
          {
            username: 'owner',
            passwords: [{ key: 'shared_key', value: 'shared_value' }],
            count: 1,
          },
        ],
        userCount: 1,
      };

      jest.spyOn(userModel, 'findOne').mockResolvedValue(mockUser);
      jest
        .spyOn(service, 'getSharedWithMe')
        .mockResolvedValue(mockSharedPasswords);

      const result = await service.findPasswordsSharedWithMe('123456');

      expect(result).toEqual(mockSharedPasswords);
    });

    /**
     * Test Case: Should throw error for invalid telegramId
     * Steps:
     * 1. Mock userModel.findOne to return null
     * 2. Call findPasswordsSharedWithMe
     * 3. Verify error is thrown
     */
    it('should throw error for invalid telegramId', async () => {
      jest.spyOn(userModel, 'findOne').mockResolvedValue(null);

      await expect(
        service.findPasswordsSharedWithMe('invalid'),
      ).rejects.toThrow(
        new HttpException('telegramId is not valid', HttpStatus.BAD_REQUEST),
      );
    });
  });
});
