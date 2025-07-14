import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PublicAddress,
  PublicAddressDocument,
} from '../public-addresses/schemas/public-address.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { LoginDto } from './dto/login.dto';
import { Role } from '../decorators/roles.decorator';

export interface LoginResponse {
  access_token: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(PublicAddress.name)
    private publicAddressModel: Model<PublicAddressDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const { publicAddress } = loginDto;

    try {
      // Find the public address in the database
      const addressRecord = await this.publicAddressModel
        .findOne({ publicKey: publicAddress })
        .populate('userId')
        .exec();

      if (!addressRecord) {
        // Create a new user when public address is not found
        const newUser = new this.userModel({
          username: '',
          telegramId: '',
          firstName: '',
          lastName: '',
          hash: '',
          role: Role.USER,
          isActive: true,
        });

        const savedUser = await newUser.save();

        // Create a new public address record for the new user
        const newAddressRecord = new this.publicAddressModel({
          publicKey: publicAddress,
          userId: savedUser._id,
        });

        await newAddressRecord.save();

        // Create JWT payload for the new user
        const payload = {
          sub: savedUser._id.toString(),
          telegramId: savedUser.telegramId,
          username: savedUser.username,
          role: savedUser.role,
        };

        // Generate JWT token
        const access_token = this.jwtService.sign(payload);

        return {
          access_token,
        };
      }

      // Get the user information
      const user = addressRecord.userId as UserDocument;

      if (!user || !user.isActive) {
        throw new HttpException(
          {
            success: false,
            message: 'User not found or inactive',
            error: 'Unauthorized',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Create JWT payload
      const payload = {
        sub: user._id.toString(),
        telegramId: user.telegramId,
        username: user.username,
        role: user.role,
      };

      // Generate JWT token
      const access_token = this.jwtService.sign(payload);

      return {
        access_token,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: 'Internal server error during login',
          error: 'Internal Server Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
