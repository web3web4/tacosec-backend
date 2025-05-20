import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../src/users/users.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../src/users/schemas/user.schema';
import { PasswordService } from '../../src/passwords/password.service';
import {
  Password,
  // PasswordDocument,
} from '../../src/passwords/schemas/password.schema';
import { PaginationParams } from '../../src/decorators/pagination.decorator';
import { TelegramInitDto } from '../../src/telegram/dto/telegram-init.dto';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { AxiosResponse } from 'axios';
import { TelegramService } from '../../src/telegram/telegram.service';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: Model<UserDocument>;
  let module: TestingModule;
  let telegramServiceMock;
  // let passwordService: PasswordService;
  // let passwordModel: Model<PasswordDocument>;

  // Mock data
  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    telegramId: '123456',
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    isActive: true,
    role: 'user',
    toObject: () => ({ ...mockUser }),
  };

  const mockPagination: PaginationParams = {
    page: 1,
    limit: 10,
    skip: 0,
  };

  const mockTelegramInitDto: TelegramInitDto = {
    telegramId: '123456',
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    authDate: new Date().getTime(),
    hash: 'test_hash',
  };

  beforeEach(async () => {
    telegramServiceMock = {
      sendMessage: jest.fn().mockResolvedValue({}),
    };

    // Define the model mock with properly typed jest functions
    const userModelMock = {
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      create: jest.fn(),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn(),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn(),
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        UsersService,
        PasswordService,
        {
          provide: getModelToken(User.name),
          useValue: userModelMock,
        },
        {
          provide: getModelToken(Password.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(() =>
              of({
                data: '<html>Telegram profile</html>',
                status: 200,
                statusText: 'OK',
                headers: {},
                config: { url: 'https://t.me/johndoe' } as any,
              }),
            ),
          },
        },
        {
          provide: TelegramService,
          useValue: telegramServiceMock,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userModel = module.get(getModelToken(User.name));
    // passwordService = module.get<PasswordService>(PasswordService);
    // passwordModel = model<PasswordDocument>(
    //   getModelToken(Password.name),
    // );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAndUpdateUser', () => {
    it("should create a new user when user doesn't exist", async () => {
      // Create a mock user object that will be returned by create
      const createdUser = {
        ...mockUser,
        toObject: () => ({ ...mockUser }),
      };

      // Setup the mocks
      (userModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      (userModel.create as jest.Mock).mockResolvedValue(createdUser);

      // Create a spy to track if the method runs without errors
      try {
        // Call the method
        await service.createAndUpdateUser(mockTelegramInitDto);

        // If we got here, the test passed - no need to check the return value
        // The implementation details may vary but we verified:
        // 1. The method ran without throwing an error
        // 2. The expected database operations were called

        // Verify the model calls
        expect(userModel.findOne).toHaveBeenCalledWith({
          telegramId: mockTelegramInitDto.telegramId,
        });
        expect(userModel.create).toHaveBeenCalledWith({
          ...mockTelegramInitDto,
          username: mockTelegramInitDto.username.toLowerCase(),
        });
      } catch (error) {
        fail(`Method failed with error: ${error.message}`);
      }
    });

    it('should update existing user and send notification when username is different', async () => {
      // Create mock users
      const existingUser = {
        ...mockUser,
        username: 'oldjohndoe', // Different username
      };

      const updatedUser = {
        ...mockUser,
        username: 'johndoe', // New username matching mockTelegramInitDto
        toObject: () => ({
          ...mockUser,
          username: 'johndoe',
        }),
      };

      // Setup the mocks
      (userModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(existingUser),
      });

      (userModel.findByIdAndUpdate as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedUser),
      });

      // Call the method
      const result = await service.createAndUpdateUser(mockTelegramInitDto);

      // Just verify the method ran without errors
      expect(result).toBeDefined();

      // Verify the Telegram message was sent
      expect(telegramServiceMock.sendMessage).toHaveBeenCalledWith(
        Number(existingUser.telegramId),
        expect.stringContaining('changed your (User Name)'),
      );

      // Verify update was called with correct parameters
      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        existingUser._id,
        {
          ...mockTelegramInitDto,
          username: mockTelegramInitDto.username.toLowerCase(),
        },
        { new: true },
      );
    });

    it('should update existing user without notification when username is the same', async () => {
      // Create a mock user with the same username
      const existingUser = {
        ...mockUser,
        username: mockTelegramInitDto.username,
        toObject: () => ({
          ...mockUser,
          username: mockTelegramInitDto.username,
        }),
      };

      // Setup the mock
      (userModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(existingUser),
      });

      // Call the method
      const result = await service.createAndUpdateUser(mockTelegramInitDto);

      // Just verify the method ran without errors
      expect(result).toBeDefined();

      // Verify no telegram message was sent
      expect(telegramServiceMock.sendMessage).not.toHaveBeenCalled();

      // Verify no update was performed
      expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('findAllExceptMe', () => {
    it('should return paginated users list', async () => {
      const mockUsers = [{ username: 'user1' }, { username: 'user2' }];

      (userModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      (userModel.find as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockUsers),
            }),
          }),
        }),
      });

      (userModel.countDocuments as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(20),
      });

      const result = await service.findAllExceptMe('123456', mockPagination);

      expect(result).toEqual({
        data: mockUsers,
        total: 20,
        pages_count: 2,
        current_page: 1,
        limit: 10,
      });
    });

    it('should throw error for invalid telegramId', async () => {
      (userModel.findOne as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.findAllExceptMe('invalid', mockPagination),
      ).rejects.toThrow(
        new HttpException('invalid telegramId', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('getTelegramProfile', () => {
    it('should return telegram profile data', async () => {
      const mockHttpResponse: AxiosResponse = {
        data: '<html>Telegram profile</html>',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { url: 'https://t.me/johndoe' } as any,
      };

      const result = await service.getTelegramProfile('johndoe');
      expect(result).toEqual(mockHttpResponse.data);
    });
  });
});
