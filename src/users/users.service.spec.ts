import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { getModelToken } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Password, PasswordDocument } from './schemas/password.schema';
import { PasswordService } from './password.service';
import { TelegramInitDto } from './dto/telegram-init.dto';
import { Types } from 'mongoose';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';
import { Type } from './enums/type.enum';
// Better mock implementations with chainable methods
const mockUserModel = () => ({
  findOne: jest.fn().mockReturnThis(),
  findById: jest.fn().mockReturnThis(),
  findByIdAndUpdate: jest.fn().mockReturnThis(),
  find: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  save: jest.fn(),
  constructor: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
  })),
  toObject: jest.fn(),
});

const mockPasswordModel = () => ({
  findOne: jest.fn().mockReturnThis(),
  find: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  save: jest.fn(),
  toObject: jest.fn(),
});

const mockPasswordService = () => ({
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let userModel;
  let passwordModel;
  let passwordService;

  beforeEach(async () => {
    jest.clearAllMocks();

    userModel = mockUserModel();
    passwordModel = mockPasswordModel();
    passwordService = mockPasswordService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: userModel,
        },
        {
          provide: getModelToken(Password.name),
          useValue: passwordModel,
        },
        {
          provide: PasswordService,
          useValue: passwordService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userModel = module.get(getModelToken('User'));
    // passwordModel = module.get(getModelToken('Password'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAndUpdateUser', () => {
    it('should create or update a user', async () => {
      // Arrange
      const telegramInitDto: TelegramInitDto = {
        telegramId: '123456',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        photoUrl: 'https://example.com/photo.jpg',
        authDate: 1234567890,
        hash: 'hash123',
      };

      const userId = new Types.ObjectId();
      const expectedUser = {
        _id: userId,
        telegramId: '123456',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        photoUrl: 'https://example.com/photo.jpg',
        authDate: new Date(1234567890 * 1000),
        hash: 'hash123',
      };

      // Mock createOrUpdateUser with implementation
      jest.spyOn(service, 'createOrUpdateUser').mockImplementation(async () => {
        return {
          ...expectedUser,
          toObject: () => expectedUser,
        } as unknown as User;
      });

      // Act
      const result = await service.createAndUpdateUser(telegramInitDto);

      // Assert
      expect(service.createOrUpdateUser).toHaveBeenCalledWith({
        telegramId: '123456',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        photoUrl: 'https://example.com/photo.jpg',
        authDate: expect.any(Date),
        hash: 'hash123',
      });

      expect(result).toEqual({
        telegramId: '123456',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
        photoUrl: 'https://example.com/photo.jpg',
        authDate: expect.any(Date),
        hash: 'hash123',
      });
    });
  });

  // describe('createOrUpdateUser', () => {
  //   it('should update an existing user', async () => {
  //     // Arrange
  //     const userData = {
  //       telegramId: '123456',
  //       firstName: 'John',
  //       lastName: 'Doe',
  //     };

  //     const existingUser = {
  //       _id: '680e4969fa23f4784abf0232',
  //       firstName: 'OldName',
  //       lastName: 'OldLastName',
  //       telegramId: '123456',
  //     };

  //     const updatedUser = {
  //       _id: '680e4969fa23f4784abf0232',
  //       telegramId: '123456',
  //       firstName: 'John',
  //       lastName: 'Doe',
  //     };

  //     userModel.findOne.mockImplementation(() => ({
  //       exec: jest.fn().mockResolvedValue(existingUser),
  //     }));

  //     userModel.findByIdAndUpdate.mockResolvedValue(updatedUser);

  //     // Act
  //     const result = await service.createOrUpdateUser(userData);

  //     // Assert
  //     expect(userModel.findOne).toHaveBeenCalledWith({
  //       telegramId: '123456',
  //     });
  //     // jest.spyOn(userModel, 'findOne').mockResolvedValue(existingUser);
  //     expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
  //       'user_id',
  //       userData,
  //       { new: true },
  //     );

  //     expect(result).toEqual(updatedUser);
  //   });

  //   it('should create a new user if it does not exist', async () => {
  //     // Arrange
  //     const userData = {
  //       telegramId: '123456',
  //       firstName: 'John',
  //       lastName: 'Doe',
  //     };

  //     const newUser = {
  //       telegramId: '123456',
  //       firstName: 'John',
  //       lastName: 'Doe',
  //     };

  //     userModel.findOne.mockImplementation(() => ({
  //       exec: jest.fn().mockResolvedValue(null),
  //     }));

  //     // Mock the constructor and save behavior
  //     jest.spyOn(userModel, 'constructor').mockImplementation(() => {
  //       return {
  //         save: jest.fn().mockResolvedValue(newUser),
  //       };
  //     });

  //     // Act
  //     const result = await service.createOrUpdateUser(userData);

  //     // Assert
  //     expect(userModel.findOne).toHaveBeenCalledWith({
  //       telegramId: '123456',
  //     });

  //     expect(userModel.constructor).toHaveBeenCalledWith(userData);
  //     expect(result).toBeDefined();
  //   });

  //   it('should handle errors when creating or updating a user', async () => {
  //     // Arrange
  //     const userData = {
  //       telegramId: '123456',
  //     };

  //     userModel.findOne.mockImplementation(() => {
  //       throw new Error('Database error');
  //     });

  //     // Act & Assert
  //     await expect(service.createOrUpdateUser(userData)).rejects.toThrow(
  //       new HttpException('Database error', HttpStatus.BAD_REQUEST),
  //     );
  //   });
  // });
  //////////////////////////////
  describe('createOrUpdateUser', () => {
    const mockUserData = {
      firstName: 'John',
      lastName: 'Doe',
      telegramId: '123456',
    };

    const mockExistingUser = {
      _id: '680e4969fa23f4784abf0232',
      ...mockUserData,
      save: jest.fn(),
    };

    it('should update existing user when found', async () => {
      // Arrange
      userModel.findOne.mockResolvedValue(mockExistingUser);
      userModel.findByIdAndUpdate.mockResolvedValue({
        ...mockUserData,
        firstName: 'UpdatedName',
      });

      // Act
      const result = await service.createOrUpdateUser(mockUserData);

      // Assert
      expect(userModel.findOne).toHaveBeenCalledWith({
        telegramId: mockUserData.telegramId,
      });

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockExistingUser._id,
        mockUserData,
        { new: true },
      );

      expect(result.firstName).toBe('UpdatedName');
    });

    it('should create new user when not found', async () => {
      // Arrange
      userModel.findOne.mockResolvedValue(null);
      const mockNewUser = { ...mockUserData, _id: 'new-id', save: jest.fn() };
      userModel.create.mockResolvedValue(mockNewUser);

      // Act
      const result = await service.createOrUpdateUser(mockUserData);

      // Assert
      expect(userModel.findOne).toHaveBeenCalledWith({
        telegramId: mockUserData.telegramId,
      });

      expect(userModel.create).toHaveBeenCalledWith(mockUserData);
      expect(result).toEqual(mockNewUser);
    });

    it('should throw HttpException on error', async () => {
      // Arrange
      userModel.findOne.mockRejectedValue(new Error('DB Error'));

      // Act & Assert
      await expect(service.createOrUpdateUser(mockUserData)).rejects.toThrow(
        HttpException,
      );
    });
  });
  /////////////////////////////
  describe('findAllExceptMe', () => {
    it('should return all users except the one with the given telegramId', async () => {
      // Arrange
      const telegramId = '123456';
      const user = { telegramId, isActive: true };
      const users = [{ username: 'user1' }, { username: 'user2' }];

      userModel.findOne.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(user),
      }));

      userModel.find.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(users),
      }));

      // Act
      const result = await service.findAllExceptMe(telegramId);

      // Assert
      expect(userModel.findOne).toHaveBeenCalledWith({
        telegramId,
        isActive: true,
      });

      expect(userModel.find).toHaveBeenCalledWith({
        telegramId: { $ne: telegramId },
        isActive: true,
      });

      expect(result).toEqual(users);
    });

    it('should throw an error if the user with the given telegramId is not found', async () => {
      // Arrange
      const telegramId = '123456';

      userModel.findOne.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(null),
      }));

      // Act & Assert
      await expect(service.findAllExceptMe(telegramId)).rejects.toThrow(
        new HttpException('invalid telegramId', HttpStatus.BAD_REQUEST),
      );
    });

    it('should handle errors when finding users', async () => {
      // Arrange
      const telegramId = '123456';

      userModel.findOne.mockImplementation(() => ({
        exec: jest.fn().mockRejectedValue(new Error('Database error')),
      }));

      // Act & Assert
      await expect(service.findAllExceptMe(telegramId)).rejects.toThrow(
        new HttpException('Database error', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('findByTelegramId', () => {
    it('should return a user by telegramId', async () => {
      // Arrange
      const telegramId = '123456';
      const user = { telegramId, username: 'testuser', isActive: true };

      userModel.findOne.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(user),
      }));

      // Act
      const result = await service.findByTelegramId(telegramId);

      // Assert
      expect(userModel.findOne).toHaveBeenCalledWith({
        telegramId,
        isActive: true,
      });

      expect(result).toEqual(user);
    });
  });

  describe('addPassword', () => {
    it('should add a password and return it with shared usernames', async () => {
      // Arrange
      const passwordData: CreatePasswordRequestDto = {
        key: 'test-key',
        value: 'test-value',
        description: 'Test password',
        type: Type.PASSWORD,
        isActive: true,
        sharedWith: ['user1', 'user2'],
        initData: {
          telegramId: '123456',
          authDate: 1234567890,
          hash: 'hash123',
        },
      };

      const user = {
        _id: new Types.ObjectId(),
        telegramId: '123456',
        username: 'testuser',
        isActive: true,
      };

      const sharedUsers = [
        { telegramId: 'telegram1', username: 'user1' },
        { telegramId: 'telegram2', username: 'user2' },
      ];

      const createdPassword = {
        userId: user._id,
        _id: new Types.ObjectId(),
        key: 'test-key',
        value: 'test-value',
        description: 'Test password',
        isActive: true,
        type: Type.PASSWORD,
        sharedWith: ['telegram1', 'telegram2'],
        initData: {
          telegramId: '123456',
          authDate: new Date(1234567890 * 1000),
          hash: 'hash123',
        },
        toObject: jest.fn().mockReturnValue({
          userId: user._id,
          _id: new Types.ObjectId(),
          key: 'test-key',
          value: 'test-value',
          description: 'Test password',
          isActive: true,
          type: Type.PASSWORD,
          sharedWith: ['telegram1', 'telegram2'],
          initData: {
            telegramId: '123456',
            authDate: new Date(1234567890 * 1000),
            hash: 'hash123',
          },
        }),
      };

      // Mock the user findOne for getting the user by telegramId
      userModel.findOne.mockImplementationOnce(() => ({
        exec: jest.fn().mockResolvedValue(user),
      }));

      // Mock the userModel findOne for each shared user
      userModel.findOne.mockImplementationOnce(() => ({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ telegramId: 'telegram1' }),
      }));

      userModel.findOne.mockImplementationOnce(() => ({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({ telegramId: 'telegram2' }),
      }));

      // Mock createOrUpdatePassword
      jest
        .spyOn(service, 'createOrUpdatePassword')
        .mockResolvedValue(createdPassword as unknown as Password);

      // Mock finding usernames for sharedWith array
      userModel.findOne.mockImplementationOnce(() =>
        Promise.resolve(sharedUsers[0]),
      );
      userModel.findOne.mockImplementationOnce(() =>
        Promise.resolve(sharedUsers[1]),
      );

      // Act
      const result = await service.addPassword(passwordData);

      // Assert
      expect(userModel.findOne).toHaveBeenCalledWith({
        telegramId: '123456',
        isActive: true,
      });

      expect(service.createOrUpdatePassword).toHaveBeenCalled();

      expect(result).toEqual({
        key: 'test-key',
        value: 'test-value',
        description: 'Test password',
        isActive: true,
        type: Type.PASSWORD,
        sharedWith: ['user1', 'user2'],
        initData: expect.objectContaining({
          telegramId: '123456',
        }),
      });
    });

    it('should throw error if user is not found', async () => {
      // Arrange
      const passwordData: CreatePasswordRequestDto = {
        key: 'test-key',
        value: 'test-value',
        description: 'Test password',
        type: Type.PASSWORD,
        isActive: true,
        sharedWith: ['user1'],
        initData: {
          telegramId: '123456',
          authDate: 1234567890,
          hash: 'hash123',
        },
      };

      userModel.findOne.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(null),
      }));

      // Act & Assert
      await expect(service.addPassword(passwordData)).rejects.toThrow(
        new HttpException('User not found', HttpStatus.NOT_FOUND),
      );
    });

    it('should throw error if user tries to share password with themselves', async () => {
      // Arrange
      const user = {
        _id: new Types.ObjectId(),
        telegramId: '123456',
        username: 'testuser',
        isActive: true,
      };

      const passwordData: CreatePasswordRequestDto = {
        key: 'test-key',
        value: 'test-value',
        description: 'Test password',
        type: Type.PASSWORD,
        isActive: true,
        sharedWith: ['testuser'], // Same as user's username
        initData: {
          telegramId: '123456',
          authDate: 1234567890,
          hash: 'hash123',
        },
      };

      userModel.findOne.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(user),
      }));

      // Act & Assert
      await expect(service.addPassword(passwordData)).rejects.toThrow(
        new HttpException(
          'User cannot share password with himself',
          HttpStatus.BAD_REQUEST,
        ),
      );
    });
  });
});
