import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';
import { getModelToken } from '@nestjs/mongoose';
import { Password } from './schemas/password.schema';
import { User } from './schemas/user.schema';
import { Types } from 'mongoose';
import { HttpException, HttpStatus } from '@nestjs/common';

// Mock implementations
const mockPasswordModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findOneAndDelete: jest.fn(),
  findByIdAndDelete: jest.fn(),
  save: jest.fn(),
  exec: jest.fn(),
  lean: jest.fn(),
  select: jest.fn(),
};

const mockUserModel = {
  findOne: jest.fn(),
  find: jest.fn(),
  exec: jest.fn(),
  select: jest.fn(),
};

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        {
          provide: getModelToken(Password.name),
          useValue: mockPasswordModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // describe('create', () => {
  //   it('should create a new password', async () => {
  //     // Arrange
  //     const createPasswordDto = {
  //       userId: new Types.ObjectId(),
  //       key: 'password-key',
  //       value: 'password-value',
  //       description: 'description',
  //       type: 'password',
  //     };

  //     const createdPassword = {
  //       ...createPasswordDto,
  //       isActive: true,
  //     };

  //     mockPasswordModel.save.mockResolvedValue(createdPassword);

  //     // Mock the constructor
  //     mockPasswordModel.constructor = jest.fn().mockImplementation(() => {
  //       return {
  //         save: jest.fn().mockResolvedValue(createdPassword),
  //       };
  //     });

  //     // Act
  //     const result = await service.create(createPasswordDto);

  //     // Assert
  //     expect(mockPasswordModel.constructor).toHaveBeenCalledWith({
  //       ...createPasswordDto,
  //       isActive: true,
  //     });
  //     expect(result).toEqual(createdPassword);
  //   });
  // });

  describe('findByUserTelegramId', () => {
    it('should return passwords for a valid telegramId', async () => {
      // Arrange
      const telegramId = '123456';
      const user = { _id: 'user-id', telegramId };
      const passwords = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
      ];

      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(user),
      });

      mockPasswordModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(passwords),
      });

      // Act
      const result = await service.findByUserTelegramId(telegramId);

      // Assert
      expect(mockUserModel.findOne).toHaveBeenCalledWith({
        telegramId,
        isActive: true,
      });
      expect(mockPasswordModel.find).toHaveBeenCalledWith({
        'initData.telegramId': telegramId,
        isActive: true,
      });
      expect(result).toEqual(passwords);
    });

    it('should throw an error if telegramId is not provided', async () => {
      // Act & Assert
      await expect(service.findByUserTelegramId('')).rejects.toThrow(
        new HttpException('Telegram ID is required', HttpStatus.BAD_REQUEST),
      );
    });

    it('should throw an error if user is not found', async () => {
      // Arrange
      const telegramId = '123456';

      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      // Act & Assert
      await expect(service.findByUserTelegramId(telegramId)).rejects.toThrow(
        new HttpException('telegramId is not valid', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('getSharedWithMe', () => {
    it('should return empty array if no shared passwords are found', async () => {
      // Arrange
      const telegramId = '123456';

      mockPasswordModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      // Act
      const result = await service.getSharedWithMe(telegramId);

      // Assert
      expect(mockPasswordModel.find).toHaveBeenCalledWith({
        sharedWith: { $in: [telegramId] },
        isActive: true,
      });
      expect(result).toEqual({ sharedWithMe: [], userCount: 0 });
    });

    it('should group shared passwords by owner', async () => {
      // Arrange
      const telegramId = '123456';
      const sharedPasswords = [
        {
          key: 'key1',
          value: 'value1',
          initData: { telegramId: 'owner1' },
        },
        {
          key: 'key2',
          value: 'value2',
          initData: { telegramId: 'owner1' },
        },
        {
          key: 'key3',
          value: 'value3',
          initData: { telegramId: 'owner2' },
        },
      ];

      const owner1 = { username: 'owner1_username' };
      const owner2 = { username: 'owner2_username' };

      mockPasswordModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(sharedPasswords),
      });

      // Mock the user findOne calls for each owner
      mockUserModel.findOne
        .mockImplementationOnce(() => ({
          isActive: true,
          ...owner1,
        }))
        .mockImplementationOnce(() => ({
          isActive: true,
          ...owner1,
        }))
        .mockImplementationOnce(() => ({
          isActive: true,
          ...owner2,
        }));

      // Act
      const result = await service.getSharedWithMe(telegramId);

      // Assert
      expect(mockPasswordModel.find).toHaveBeenCalledWith({
        sharedWith: { $in: [telegramId] },
        isActive: true,
      });

      // Should have called findOne for each password's owner
      expect(mockUserModel.findOne).toHaveBeenCalledTimes(3);

      // Verify the result has the correct structure
      expect(result.userCount).toBe(2); // Two unique owners
      expect(result.sharedWithMe).toHaveLength(2);

      // Verify first owner has 2 passwords
      const firstOwner = result.sharedWithMe.find(
        (o) => o.username === 'owner1_username',
      );
      expect(firstOwner).toBeDefined();
      expect(firstOwner.passwords).toHaveLength(2);

      // Verify second owner has 1 password
      const secondOwner = result.sharedWithMe.find(
        (o) => o.username === 'owner2_username',
      );
      expect(secondOwner).toBeDefined();
      expect(secondOwner.passwords).toHaveLength(1);
    });
  });

  describe('findSharedWithByTelegramId', () => {
    it('should return usernames of users shared with for a specific key', async () => {
      // Arrange
      const telegramId = '123456';
      const key = 'password-key';
      const user = { _id: 'user-id', telegramId };
      const passwordKey = { _id: 'password-id', key };
      const sharedWith = [{ sharedWith: ['user1', 'user2'] }];
      const users = [{ username: 'username1' }, { username: 'username2' }];

      mockUserModel.findOne.mockResolvedValue(user);
      mockPasswordModel.findOne.mockResolvedValue(passwordKey);

      mockPasswordModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(sharedWith),
      });

      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(users),
      });

      // Act
      const result = await service.findSharedWithByTelegramId(telegramId, key);

      // Assert
      expect(mockUserModel.findOne).toHaveBeenCalledWith({
        telegramId,
        isActive: true,
      });
      expect(mockPasswordModel.findOne).toHaveBeenCalledWith({
        key,
        isActive: true,
      });
      expect(mockPasswordModel.find).toHaveBeenCalledWith({
        'initData.telegramId': telegramId,
        isActive: true,
        key: key,
      });

      expect(result).toEqual(['username1', 'username2']);
    });

    it('should throw an error if telegramId is not provided', async () => {
      // Act & Assert
      await expect(
        service.findSharedWithByTelegramId('', 'key'),
      ).rejects.toThrow(
        new HttpException('Telegram ID is required', HttpStatus.BAD_REQUEST),
      );
    });

    it('should throw an error if key is not provided', async () => {
      // Arrange
      const telegramId = '123456';
      const user = { _id: 'user-id', telegramId };

      mockUserModel.findOne.mockResolvedValue(user);

      // Act & Assert
      await expect(
        service.findSharedWithByTelegramId(telegramId, ''),
      ).rejects.toThrow(
        new HttpException('Key is required', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('update', () => {
    it('should update a password', async () => {
      // Arrange
      const id = 'password-id';
      const updatePasswordDto = {
        key: 'updated-key',
        value: 'updated-value',
      };

      const updatedPassword = {
        _id: id,
        ...updatePasswordDto,
        isActive: true,
      };

      mockPasswordModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedPassword),
      });

      // Act
      const result = await service.update(id, updatePasswordDto);

      // Assert
      expect(mockPasswordModel.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { ...updatePasswordDto, isActive: true },
        { new: true },
      );
      expect(result).toEqual(updatedPassword);
    });
  });
});
