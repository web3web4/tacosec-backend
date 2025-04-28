import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';
import { getModelToken } from '@nestjs/mongoose';
import { Password } from './schemas/password.schema';
import { User } from './schemas/user.schema';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('PasswordService - getSharedWithMe', () => {
  let service: PasswordService;
  let passwordModel;
  let userModel;

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
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should throw an error if telegramId is not provided', async () => {
    // Act & Assert
    await expect(service.getSharedWithMe('')).rejects.toThrow(
      new HttpException('Telegram ID is required', HttpStatus.BAD_REQUEST),
    );
  });

  it('should return empty result if no shared passwords are found', async () => {
    // Arrange
    const userId = 'user123';

    passwordModel.exec.mockResolvedValue([]);

    // Act
    const result = await service.getSharedWithMe(userId);

    // Assert
    expect(passwordModel.find).toHaveBeenCalledWith({
      sharedWith: { $in: [userId] },
      isActive: true,
    });
    expect(result).toEqual({ sharedWithMe: [], userCount: 0 });
  });

  it('should group passwords by owner correctly', async () => {
    // Arrange
    const userId = 'user123';
    const sharedPasswords = [
      {
        key: 'facebook',
        value: 'password123',
        initData: { telegramId: 'owner1' },
      },
      {
        key: 'twitter',
        value: 'twitter123',
        initData: { telegramId: 'owner1' },
      },
      {
        key: 'instagram',
        value: 'insta123',
        initData: { telegramId: 'owner2' },
      },
    ];

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // Mock user lookups
    userModel.findOne
      .mockResolvedValueOnce({ username: 'alice' })
      .mockResolvedValueOnce({ username: 'alice' })
      .mockResolvedValueOnce({ username: 'bob' });

    // Act
    const result = await service.getSharedWithMe(userId);

    // Assert
    expect(passwordModel.find).toHaveBeenCalledWith({
      sharedWith: { $in: [userId] },
      isActive: true,
    });

    expect(userModel.findOne).toHaveBeenCalledTimes(3);

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
      key: 'facebook',
      value: 'password123',
    });
    expect(alicePasswords.passwords).toContainEqual({
      key: 'twitter',
      value: 'twitter123',
    });

    const bobPasswords = result.sharedWithMe.find(
      (owner) => owner.username === 'bob',
    );
    expect(bobPasswords).toBeDefined();
    expect(bobPasswords.count).toBe(1);
    expect(bobPasswords.passwords).toHaveLength(1);
    expect(bobPasswords.passwords).toContainEqual({
      key: 'instagram',
      value: 'insta123',
    });
  });

  it('should handle owners with unknown usernames', async () => {
    // Arrange
    const userId = 'user123';
    const sharedPasswords = [
      { key: 'site1', value: 'pass1', initData: { telegramId: 'owner1' } },
      { key: 'site2', value: 'pass2', initData: { telegramId: 'unknown' } },
    ];

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // First user found, second user returns null (unknown)
    userModel.findOne
      .mockResolvedValueOnce({ username: 'known_user' })
      .mockResolvedValueOnce(null);

    // Act
    const result = await service.getSharedWithMe(userId);

    // Assert
    expect(result.sharedWithMe).toHaveLength(1);
    expect(result.userCount).toBe(1);

    // Only the known user's password should be included
    const knownUserPasswords = result.sharedWithMe[0];
    expect(knownUserPasswords.username).toBe('known_user');
    expect(knownUserPasswords.passwords).toHaveLength(1);
    expect(knownUserPasswords.passwords[0]).toEqual({
      key: 'site1',
      value: 'pass1',
    });
  });

  it('should handle passwords with missing key or value', async () => {
    // Arrange
    const userId = 'user123';
    const sharedPasswords = [
      { key: 'site1', value: 'pass1', initData: { telegramId: 'owner1' } },
      { key: '', value: 'pass2', initData: { telegramId: 'owner1' } }, // Missing key
      { key: 'site3', value: '', initData: { telegramId: 'owner1' } }, // Missing value
    ];

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    userModel.findOne.mockResolvedValue({ username: 'user1' });

    // Act
    const result = await service.getSharedWithMe(userId);

    // Assert
    // Only the password with both key and value should be included
    expect(result.sharedWithMe).toHaveLength(1);
    expect(result.sharedWithMe[0].passwords).toHaveLength(1);
    expect(result.sharedWithMe[0].passwords[0]).toEqual({
      key: 'site1',
      value: 'pass1',
    });
  });

  it('should sort owners by number of shared passwords', async () => {
    // Arrange
    const userId = 'user123';
    const sharedPasswords = [
      { key: 'site1', value: 'pass1', initData: { telegramId: 'owner1' } },
      { key: 'site2', value: 'pass2', initData: { telegramId: 'owner2' } },
      { key: 'site3', value: 'pass3', initData: { telegramId: 'owner2' } },
      { key: 'site4', value: 'pass4', initData: { telegramId: 'owner2' } },
      { key: 'site5', value: 'pass5', initData: { telegramId: 'owner3' } },
      { key: 'site6', value: 'pass6', initData: { telegramId: 'owner3' } },
    ];

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // Mock the usernames for each owner
    userModel.findOne.mockImplementation((query) => {
      const mapping = {
        owner1: { username: 'alice' },
        owner2: { username: 'bob' },
        owner3: { username: 'charlie' },
      };
      return Promise.resolve(mapping[query.telegramId]);
    });

    // Act
    const result = await service.getSharedWithMe(userId);

    // Assert
    expect(result.sharedWithMe).toHaveLength(3);

    // The result should be sorted by count (descending)
    expect(result.sharedWithMe[0].username).toBe('bob'); // 3 passwords
    expect(result.sharedWithMe[0].count).toBe(3);

    expect(result.sharedWithMe[1].username).toBe('charlie'); // 2 passwords
    expect(result.sharedWithMe[1].count).toBe(2);

    expect(result.sharedWithMe[2].username).toBe('alice'); // 1 password
    expect(result.sharedWithMe[2].count).toBe(1);
  });

  it('should handle errors during execution', async () => {
    // Arrange
    const userId = 'user123';

    passwordModel.exec.mockRejectedValue(new Error('Database failure'));

    // Act & Assert
    await expect(service.getSharedWithMe(userId)).rejects.toThrow(
      new HttpException('Database failure', HttpStatus.BAD_REQUEST),
    );
  });
});
