import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../src/users/users.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../src/users/schemas/user.schema';
import { PasswordService } from '../../src/users/password.service';
import { Password, PasswordDocument } from '../../src/users/schemas/password.schema';
import { PaginationParams } from '../../src/users/interfaces/pagination.interface';
import { TelegramInitDto } from '../../src/users/dto/telegram-init.dto';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: Model<UserDocument>;
  let passwordService: PasswordService;
  let passwordModel: Model<PasswordDocument>;

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        PasswordService,
        {
          provide: getModelToken(User.name),
          useValue: {
            findOne: jest.fn().mockReturnValue({
              exec: jest.fn(),
            }),
            findByIdAndUpdate: jest.fn().mockReturnValue({
              exec: jest.fn(),
            }),
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
          },
        },
        {
          provide: getModelToken(Password.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
    passwordService = module.get<PasswordService>(PasswordService);
    passwordModel = module.get<Model<PasswordDocument>>(getModelToken(Password.name));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAndUpdateUser', () => {
    /**
     * Test Case: Should create a new user when user doesn't exist
     * Steps:
     * 1. Mock findOne to return null (user doesn't exist)
     * 2. Mock create to return the new user
     * 3. Call createAndUpdateUser
     * 4. Verify the result
     */
    it('should create a new user when user doesn\'t exist', async () => {
      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);
      jest.spyOn(userModel, 'create').mockResolvedValue(mockUser as any);

      const result = await service.createAndUpdateUser(mockTelegramInitDto);
      const { _id, ...expectedUser } = mockUser;
      expect(result).toEqual(expectedUser);
      expect(userModel.findOne).toHaveBeenCalledWith({ telegramId: mockTelegramInitDto.telegramId });
    });

    /**
     * Test Case: Should update existing user
     * Steps:
     * 1. Mock findOne to return existing user
     * 2. Mock findByIdAndUpdate to return updated user
     * 3. Call createAndUpdateUser
     * 4. Verify the result
     */
    it('should update existing user', async () => {
      const updatedUser = {
        ...mockUser,
        firstName: 'Updated John',
      };

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      } as any);
      jest.spyOn(userModel, 'findByIdAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...updatedUser,
          toObject: () => ({ ...updatedUser }),
        }),
      } as any);

      const result = await service.createAndUpdateUser(mockTelegramInitDto);
      const { _id, ...expectedUser } = updatedUser;
      expect(result).toEqual(expectedUser);
      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUser._id,
        mockTelegramInitDto,
        { new: true },
      );
    });
  });

  describe('findAllExceptMe', () => {
    /**
     * Test Case: Should return paginated users list
     * Steps:
     * 1. Mock findOne to return current user
     * 2. Mock find to return users list
     * 3. Mock countDocuments to return total count
     * 4. Call findAllExceptMe
     * 5. Verify the paginated response
     */
    it('should return paginated users list', async () => {
      const mockUsers = [
        { username: 'user1' },
        { username: 'user2' },
      ];

      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      } as any);
      jest.spyOn(userModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockUsers),
            }),
          }),
        }),
      } as any);
      jest.spyOn(userModel, 'countDocuments').mockReturnValue({
        exec: jest.fn().mockResolvedValue(20),
      } as any);

      const result = await service.findAllExceptMe('123456', mockPagination);

      expect(result).toEqual({
        data: mockUsers,
        total: 20,
        pages_count: 2,
        current_page: 1,
        limit: 10,
      });
    });

    /**
     * Test Case: Should throw error for invalid telegramId
     * Steps:
     * 1. Mock findOne to return null (user not found)
     * 2. Call findAllExceptMe
     * 3. Verify error is thrown
     */
    it('should throw error for invalid telegramId', async () => {
      jest.spyOn(userModel, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(service.findAllExceptMe('invalid', mockPagination)).rejects.toThrow(
        new HttpException('invalid telegramId', HttpStatus.BAD_REQUEST),
      );
    });
  });
}); 