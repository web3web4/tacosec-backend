import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { PublicAddress } from '../../src/public-addresses/schemas/public-address.schema';
import { User } from '../../src/users/schemas/user.schema';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  const mockPublicAddressModel = {
    findOne: jest.fn(),
  };

  const mockUserModel = {
    findById: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: getModelToken(PublicAddress.name),
          useValue: mockPublicAddressModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return access token on successful login', async () => {
      const loginDto = {
        publicAddress: '0x1234567890abcdef',
        signature: 'test-signature',
      };

      const mockUser = {
        _id: 'user-id',
        telegramId: '123456789',
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser',
        role: 'USER',
        isActive: true,
      };

      const expectedResponse = {
        access_token: 'jwt-token',
      };

      jest.spyOn(service, 'login').mockResolvedValue(expectedResponse);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expectedResponse);
      expect(service.login).toHaveBeenCalledWith(loginDto);
    });
  });
});
