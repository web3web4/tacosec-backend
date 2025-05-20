import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from '../../src/passwords/password.service';
import { getModelToken } from '@nestjs/mongoose';
import { Password } from '../../src/passwords/schemas/password.schema';
import { User } from '../../src/users/schemas/user.schema';
import { HttpException, HttpStatus } from '@nestjs/common';
import { TelegramService } from '../../src/telegram/telegram.service';

describe('PasswordService - getSharedWithMe', () => {
  let service: PasswordService;
  let passwordModel;
  let userModel;
  let telegramServiceMock;

  beforeEach(async () => {
    jest.clearAllMocks();

    passwordModel = {
      find: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    userModel = {
      findOne: jest.fn(),
    };

    telegramServiceMock = {
      sendMessage: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        {
          provide: getModelToken(Password.name),
          useValue: passwordModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
        {
          provide: TelegramService,
          useValue: telegramServiceMock,
        },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should throw an error if username is not provided', async () => {
    // Act & Assert
    await expect(service.getSharedWithMe('')).rejects.toThrow(
      new HttpException('Username is required', HttpStatus.BAD_REQUEST),
    );
  });

  it('should return empty result if no shared passwords are found', async () => {
    // Arrange
    const username = 'user123';

    passwordModel.exec.mockResolvedValue([]);

    // Act
    const result = await service.getSharedWithMe(username);

    // Assert
    expect(passwordModel.find).toHaveBeenCalledWith({
      'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') },
      isActive: true,
    });
    expect(result).toEqual({ sharedWithMe: [], userCount: 0 });
  });

  it('should group passwords by owner correctly', async () => {
    // Arrange
    const username = 'user123';
    const sharedPasswords = [
      {
        _id: '1',
        key: 'facebook',
        value: 'password123',
        description: 'Facebook password',
        initData: { username: 'alice' },
      },
      {
        _id: '2',
        key: 'twitter',
        value: 'twitter123',
        description: 'Twitter password',
        initData: { username: 'alice' },
      },
      {
        _id: '3',
        key: 'instagram',
        value: 'insta123',
        description: 'Instagram password',
        initData: { username: 'bob' },
      },
    ];

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // Act
    const result = await service.getSharedWithMe(username);

    // Assert
    expect(passwordModel.find).toHaveBeenCalledWith({
      'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') },
      isActive: true,
    });

    expect(passwordModel.select).toHaveBeenCalledWith(
      ' _id key value description initData.username ',
    );

    expect(result.sharedWithMe).toHaveLength(2); // Two unique owners
    expect(result.userCount).toBe(2);

    // Check that each owner has the correct passwords
    const alicePasswords = result.sharedWithMe.find(
      (owner) => owner.username === 'alice',
    );
    expect(alicePasswords).toBeDefined();
    expect(alicePasswords.count).toBe(2);
    expect(alicePasswords.passwords).toHaveLength(2);
    expect(alicePasswords.passwords).toContainEqual({
      id: '1',
      key: 'facebook',
      value: 'password123',
      description: 'Facebook password',
    });
    expect(alicePasswords.passwords).toContainEqual({
      id: '2',
      key: 'twitter',
      value: 'twitter123',
      description: 'Twitter password',
    });

    const bobPasswords = result.sharedWithMe.find(
      (owner) => owner.username === 'bob',
    );
    expect(bobPasswords).toBeDefined();
    expect(bobPasswords.count).toBe(1);
    expect(bobPasswords.passwords).toHaveLength(1);
    expect(bobPasswords.passwords).toContainEqual({
      id: '3',
      key: 'instagram',
      value: 'insta123',
      description: 'Instagram password',
    });
  });

  it('should handle owners with unknown usernames', async () => {
    // Arrange
    const username = 'user123';
    const sharedPasswords = [
      {
        _id: '1',
        key: 'site1',
        value: 'pass1',
        description: 'Site 1',
        initData: { username: 'known_user' },
      },
      {
        _id: '2',
        key: 'site2',
        value: 'pass2',
        description: 'Site 2',
        initData: { username: 'unknown' },
      },
    ];

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // Act
    const result = await service.getSharedWithMe(username);

    // Assert
    // The implementation removes 'unknown' usernames, so we expect 1 in the result
    expect(result.sharedWithMe).toHaveLength(1);
    expect(result.userCount).toBe(1);

    // The known user's password should be included
    const knownUserPasswords = result.sharedWithMe.find(
      (owner) => owner.username === 'known_user',
    );
    expect(knownUserPasswords).toBeDefined();
    expect(knownUserPasswords.passwords).toHaveLength(1);
    expect(knownUserPasswords.passwords[0]).toEqual({
      id: '1',
      key: 'site1',
      value: 'pass1',
      description: 'Site 1',
    });
  });

  it('should handle passwords with missing key or value', async () => {
    // Arrange
    const username = 'user123';
    const sharedPasswords = [
      {
        _id: '1',
        key: 'site1',
        value: 'pass1',
        description: 'Site 1',
        initData: { username: 'user1' },
      },
      {
        _id: '2',
        key: '',
        value: 'pass2',
        description: 'Site 2',
        initData: { username: 'user1' },
      }, // Missing key
      {
        _id: '3',
        key: 'site3',
        value: '',
        description: 'Site 3',
        initData: { username: 'user1' },
      }, // Missing value
    ];

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // Act
    const result = await service.getSharedWithMe(username);

    // Assert
    // Only the password with both key and value should be included
    expect(result.sharedWithMe).toHaveLength(1);
    expect(result.sharedWithMe[0].passwords).toHaveLength(1);
    expect(result.sharedWithMe[0].passwords[0]).toEqual({
      id: '1',
      key: 'site1',
      value: 'pass1',
      description: 'Site 1',
    });
  });

  it('should sort owners by number of shared passwords', async () => {
    // Arrange
    const username = 'user123';
    const sharedPasswords = [
      {
        _id: '1',
        key: 'site1',
        value: 'pass1',
        description: 'Site 1',
        initData: { username: 'userA' },
      },
      {
        _id: '2',
        key: 'site2',
        value: 'pass2',
        description: 'Site 2',
        initData: { username: 'userB' },
      },
      {
        _id: '3',
        key: 'site3',
        value: 'pass3',
        description: 'Site 3',
        initData: { username: 'userB' },
      },
      {
        _id: '4',
        key: 'site4',
        value: 'pass4',
        description: 'Site 4',
        initData: { username: 'userB' },
      },
      {
        _id: '5',
        key: 'site5',
        value: 'pass5',
        description: 'Site 5',
        initData: { username: 'userC' },
      },
      {
        _id: '6',
        key: 'site6',
        value: 'pass6',
        description: 'Site 6',
        initData: { username: 'userC' },
      },
    ];

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // Act
    const result = await service.getSharedWithMe(username);

    // Assert
    // userB (3 passwords) should be first, then userC (2 passwords), then userA (1 password)
    expect(result.sharedWithMe).toHaveLength(3);
    expect(result.sharedWithMe[0].username).toBe('userB');
    expect(result.sharedWithMe[0].count).toBe(3);
    expect(result.sharedWithMe[1].username).toBe('userC');
    expect(result.sharedWithMe[1].count).toBe(2);
    expect(result.sharedWithMe[2].username).toBe('userA');
    expect(result.sharedWithMe[2].count).toBe(1);
  });

  it('should handle errors during execution', async () => {
    // Arrange
    const username = 'user123';

    passwordModel.exec.mockRejectedValue(new Error('Database failure'));

    // Act & Assert
    await expect(service.getSharedWithMe(username)).rejects.toThrow(
      new HttpException('Database failure', HttpStatus.BAD_REQUEST),
    );
  });
});
