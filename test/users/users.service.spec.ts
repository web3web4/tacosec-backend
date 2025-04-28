import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../src/users/users.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../src/users/schemas/user.schema';
import { PasswordService } from '../../src/users/password.service';
import { Password, PasswordDocument } from '../../src/users/schemas/password.schema';
import { PaginationParams } from '../../src/users/interfaces/pagination.interface';

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
  };

  const mockPagination: PaginationParams = {
    page: 1,
    limit: 10,
    skip: 0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        PasswordService,
        {
          provide: getModelToken(User.name),
          useValue: {
            findOne: jest.fn(),
            findByIdAndUpdate: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            countDocuments: jest.fn(),
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
     * 2. Mock save to return the new user
     * 3. Call createAndUpdateUser
     * 4. Verify the result
     */
    it('should create a new user when user doesn\'t exist', async () => {
      const userData = {
        telegramId: '123456',
        firstName: 'John',
        lastName: 'Doe',
      };

      jest.spyOn(userModel, 'findOne').mockResolvedValue(null);
      jest.spyOn(userModel, 'save').mockResolvedValue(mockUser);

      const result = await service.createAndUpdateUser(userData);
      expect(result).toEqual(mockUser);
      expect(userModel.findOne).toHaveBeenCalledWith({ telegramId: userData.telegramId });
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
      const userData = {
        telegramId: '123456',
        firstName: 'John',
        lastName: 'Doe',
      };

      jest.spyOn(userModel, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(userModel, 'findByIdAndUpdate').mockResolvedValue({
        ...mockUser,
        firstName: 'Updated John',
      });

      const result = await service.createAndUpdateUser(userData);
      expect(result.firstName).toBe('Updated John');
      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUser._id,
        userData,
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

      jest.spyOn(userModel, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(userModel, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockUsers),
            }),
          }),
        }),
      } as any);
      jest.spyOn(userModel, 'countDocuments').mockResolvedValue(20);

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
      jest.spyOn(userModel, 'findOne').mockResolvedValue(null);

      await expect(service.findAllExceptMe('invalid', mockPagination)).rejects.toThrow(
        'invalid telegramId',
      );
    });
  });
}); 