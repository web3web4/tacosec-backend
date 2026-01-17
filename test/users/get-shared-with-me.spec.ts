import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from '../../src/passwords/password.service';
import { getModelToken } from '@nestjs/mongoose';
import { Password } from '../../src/passwords/schemas/password.schema';
import { User } from '../../src/users/schemas/user.schema';
import { Report } from '../../src/reports/schemas/report.schema';
import { HttpException, HttpStatus } from '@nestjs/common';
import { TelegramService } from '../../src/telegram/telegram.service';
import { PublicAddress } from '../../src/public-addresses/schemas/public-address.schema';
import { TelegramDtoAuthGuard } from '../../src/guards/telegram-dto-auth.guard';
import { AppConfigService } from '../../src/common/config/app-config.service';
import { PublicAddressesService } from '../../src/public-addresses/public-addresses.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { LoggerService } from '../../src/logger/logger.service';
import { UserFinderUtil } from '../../src/utils/user-finder.util';

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
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    userModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    };

    const publicAddressModel = {
      findOne: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(null),
      }),
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
          provide: getModelToken(PublicAddress.name),
          useValue: publicAddressModel,
        },
        {
          provide: getModelToken(Report.name),
          useValue: {
            find: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(null),
            }),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: TelegramService,
          useValue: telegramServiceMock,
        },
        {
          provide: TelegramDtoAuthGuard,
          useValue: {
            parseTelegramInitData: jest.fn(),
          },
        },
        {
          provide: AppConfigService,
          useValue: {},
        },
        {
          provide: PublicAddressesService,
          useValue: {
            getLatestAddressByTelegramId: jest.fn(),
            getLatestAddressByUserId: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            createNotification: jest.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            saveSystemLog: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should throw an error if username is not provided', async () => {
    // Act & Assert
    await expect(service.getSharedWithMe('')).rejects.toThrow(
      new HttpException(
        'Username, userId, or publicAddress is required',
        HttpStatus.BAD_REQUEST,
      ),
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
      $or: [
        { parent_secret_id: { $exists: false } },
        { parent_secret_id: null },
      ],
    });
    expect(result).toEqual({ sharedWithMe: [], userCount: 0 });
  });

  it('should group passwords by owner correctly', async () => {
    // Arrange
    const username = 'user123';
    const now = new Date('2025-01-01T00:00:00.000Z');
    const sharedPasswords = [
      {
        _id: '1',
        userId: 'owner-alice',
        key: 'facebook',
        value: 'password123',
        description: 'Facebook password',
        initData: { username: 'alice' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
      {
        _id: '2',
        userId: 'owner-alice',
        key: 'twitter',
        value: 'twitter123',
        description: 'Twitter password',
        initData: { username: 'alice' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
      {
        _id: '3',
        userId: 'owner-bob',
        key: 'instagram',
        value: 'insta123',
        description: 'Instagram password',
        initData: { username: 'bob' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
    ];

    jest
      .spyOn(UserFinderUtil, 'findUserByAnyInfo')
      .mockImplementation(async ({ userId }: any) => {
        if (userId === 'owner-alice') {
          return {
            userId,
            username: 'alice',
            telegramId: '',
            publicAddress: '',
          } as any;
        }
        if (userId === 'owner-bob') {
          return {
            userId,
            username: 'bob',
            telegramId: '',
            publicAddress: '',
          } as any;
        }
        return null;
      });

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // Act
    const result = await service.getSharedWithMe(username);

    // Assert
    expect(passwordModel.find).toHaveBeenCalledWith({
      'sharedWith.username': { $regex: new RegExp(`^${username}$`, 'i') },
      isActive: true,
      $or: [
        { parent_secret_id: { $exists: false } },
        { parent_secret_id: null },
      ],
    });

    expect(passwordModel.select).toHaveBeenCalledWith(
      ' _id key value description initData.username sharedWith createdAt updatedAt userId secretViews ',
    );

    expect(result.sharedWithMe).toHaveLength(2); // Two unique owners
    expect(result.userCount).toBe(2);

    // Check that each owner has the correct passwords
    const alicePasswords = result.sharedWithMe.find(
      (owner) => owner.sharedBy.username === 'alice',
    );
    expect(alicePasswords).toBeDefined();
    expect(alicePasswords.count).toBe(2);
    expect(alicePasswords.passwords).toHaveLength(2);
    expect(alicePasswords.passwords).toContainEqual({
      id: '1',
      key: 'facebook',
      value: 'password123',
      description: 'Facebook password',
      reports: [],
      createdAt: now,
      sharedWith: [{ username }],
      updatedAt: now,
      secretViews: [],
      viewsCount: 0,
    });
    expect(alicePasswords.passwords).toContainEqual({
      id: '2',
      key: 'twitter',
      value: 'twitter123',
      description: 'Twitter password',
      reports: [],
      createdAt: now,
      sharedWith: [{ username }],
      updatedAt: now,
      secretViews: [],
      viewsCount: 0,
    });

    const bobPasswords = result.sharedWithMe.find(
      (owner) => owner.sharedBy.username === 'bob',
    );
    expect(bobPasswords).toBeDefined();
    expect(bobPasswords.count).toBe(1);
    expect(bobPasswords.passwords).toHaveLength(1);
    expect(bobPasswords.passwords).toContainEqual({
      id: '3',
      key: 'instagram',
      value: 'insta123',
      description: 'Instagram password',
      reports: [],
      createdAt: now,
      sharedWith: [{ username }],
      updatedAt: now,
      secretViews: [],
      viewsCount: 0,
    });
  });

  it('should handle owners with unknown usernames', async () => {
    // Arrange
    const username = 'user123';
    const now = new Date('2025-01-01T00:00:00.000Z');
    const sharedPasswords = [
      {
        _id: '1',
        userId: 'owner-known',
        key: 'site1',
        value: 'pass1',
        description: 'Site 1',
        initData: { username: 'known_user' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
      {
        _id: '2',
        userId: 'owner-unknown',
        key: 'site2',
        value: 'pass2',
        description: 'Site 2',
        initData: { username: 'unknown' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
    ];

    jest
      .spyOn(UserFinderUtil, 'findUserByAnyInfo')
      .mockImplementation(async ({ userId }: any) => {
        if (userId === 'owner-known') {
          return {
            userId,
            username: 'known_user',
            telegramId: '',
            publicAddress: '',
          } as any;
        }
        if (userId === 'owner-unknown') {
          return {
            userId,
            username: 'unknown',
            telegramId: '',
            publicAddress: '',
          } as any;
        }
        return null;
      });

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // Act
    const result = await service.getSharedWithMe(username);

    // Assert
    expect(result.sharedWithMe).toHaveLength(2);
    expect(result.userCount).toBe(2);

    // The known user's password should be included
    const knownUserPasswords = result.sharedWithMe.find(
      (owner) => owner.sharedBy.username === 'known_user',
    );
    expect(knownUserPasswords).toBeDefined();
    expect(knownUserPasswords.passwords).toHaveLength(1);
    expect(knownUserPasswords.passwords[0]).toEqual({
      id: '1',
      key: 'site1',
      value: 'pass1',
      description: 'Site 1',
      reports: [],
      createdAt: now,
      sharedWith: [{ username }],
      updatedAt: now,
      secretViews: [],
      viewsCount: 0,
    });

    const unknownUserPasswords = result.sharedWithMe.find(
      (owner) => owner.sharedBy.username === 'unknown',
    );
    expect(unknownUserPasswords).toBeDefined();
    expect(unknownUserPasswords.passwords).toHaveLength(1);
  });

  it('should handle passwords with missing key or value', async () => {
    // Arrange
    const username = 'user123';
    const now = new Date('2025-01-01T00:00:00.000Z');
    const sharedPasswords = [
      {
        _id: '1',
        userId: 'owner-user1',
        key: 'site1',
        value: 'pass1',
        description: 'Site 1',
        initData: { username: 'user1' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
      {
        _id: '2',
        userId: 'owner-user1',
        key: '',
        value: 'pass2',
        description: 'Site 2',
        initData: { username: 'user1' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      }, // Missing key
      {
        _id: '3',
        userId: 'owner-user1',
        key: 'site3',
        value: '',
        description: 'Site 3',
        initData: { username: 'user1' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      }, // Missing value
    ];

    jest.spyOn(UserFinderUtil, 'findUserByAnyInfo').mockResolvedValue({
      userId: 'owner-user1',
      username: 'user1',
      telegramId: '',
      publicAddress: '',
    } as any);

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
      reports: [],
      createdAt: now,
      sharedWith: [{ username }],
      updatedAt: now,
      secretViews: [],
      viewsCount: 0,
    });
  });

  it('should sort owners by number of shared passwords', async () => {
    // Arrange
    const username = 'user123';
    const now = new Date('2025-01-01T00:00:00.000Z');
    const sharedPasswords = [
      {
        _id: '1',
        userId: 'owner-userA',
        key: 'site1',
        value: 'pass1',
        description: 'Site 1',
        initData: { username: 'userA' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
      {
        _id: '2',
        userId: 'owner-userB',
        key: 'site2',
        value: 'pass2',
        description: 'Site 2',
        initData: { username: 'userB' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
      {
        _id: '3',
        userId: 'owner-userB',
        key: 'site3',
        value: 'pass3',
        description: 'Site 3',
        initData: { username: 'userB' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
      {
        _id: '4',
        userId: 'owner-userB',
        key: 'site4',
        value: 'pass4',
        description: 'Site 4',
        initData: { username: 'userB' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
      {
        _id: '5',
        userId: 'owner-userC',
        key: 'site5',
        value: 'pass5',
        description: 'Site 5',
        initData: { username: 'userC' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
      {
        _id: '6',
        userId: 'owner-userC',
        key: 'site6',
        value: 'pass6',
        description: 'Site 6',
        initData: { username: 'userC' },
        sharedWith: [{ username }],
        createdAt: now,
        updatedAt: now,
        secretViews: [],
      },
    ];

    jest
      .spyOn(UserFinderUtil, 'findUserByAnyInfo')
      .mockImplementation(async ({ userId }: any) => {
        if (userId === 'owner-userA') {
          return {
            userId,
            username: 'userA',
            telegramId: '',
            publicAddress: '',
          } as any;
        }
        if (userId === 'owner-userB') {
          return {
            userId,
            username: 'userB',
            telegramId: '',
            publicAddress: '',
          } as any;
        }
        if (userId === 'owner-userC') {
          return {
            userId,
            username: 'userC',
            telegramId: '',
            publicAddress: '',
          } as any;
        }
        return null;
      });

    passwordModel.exec.mockResolvedValue(sharedPasswords);

    // Act
    const result = await service.getSharedWithMe(username);

    // Assert
    // userB (3 passwords) should be first, then userC (2 passwords), then userA (1 password)
    expect(result.sharedWithMe).toHaveLength(3);
    expect(result.sharedWithMe[0].sharedBy.username).toBe('userB');
    expect(result.sharedWithMe[0].count).toBe(3);
    expect(result.sharedWithMe[1].sharedBy.username).toBe('userC');
    expect(result.sharedWithMe[1].count).toBe(2);
    expect(result.sharedWithMe[2].sharedBy.username).toBe('userA');
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
