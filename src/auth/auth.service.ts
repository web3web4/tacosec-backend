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
        throw new HttpException(
          {
            success: false,
            message: 'Public address not found',
            error: 'Not Found',
          },
          HttpStatus.NOT_FOUND,
        );
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
