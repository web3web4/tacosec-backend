import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import {
  PublicAddressesService,
  ApiResponse,
  PublicAddressResponse,
} from './public-addresses.service';
import { CreatePublicAddressDto } from './dto/create-public-address.dto';
import { FlexibleAuth } from '../decorators/flexible-auth.decorator';
import { CreatePublicAddressChallangeDto } from './dto/create-public-address-challange.dto';

@Controller('public-addresses')
export class PublicAddressesController {
  constructor(
    private readonly publicAddressesService: PublicAddressesService,
  ) {}

  /**
   * Adds a new public address for a user
   * Accepts a single publicKey with an optional secret
   * Supports both JWT token authentication and Telegram init data authentication
   */
  @Post()
  @FlexibleAuth()
  async addPublicAddresses(
    @Request() req: Request,
    @Body() createDto: CreatePublicAddressDto,
  ): Promise<ApiResponse<PublicAddressResponse[] | any>> {
    // Handle authentication data based on the auth method used
    if ((req as any).authMethod === 'jwt') {
      // For JWT authentication, use user data from token
      const user = (req as any).user;
      createDto.telegramInitData = null; // Clear any telegram data
      createDto.jwtUser = user; // Pass JWT user data to service
    } else if ((req as any).authMethod === 'telegram') {
      // For Telegram authentication, use telegram init data from headers
      createDto.telegramInitData = req.headers['x-telegram-init-data'];
      createDto.jwtUser = null; // Clear any JWT data
    }

    // The service now handles all error scenarios and response formatting
    return this.publicAddressesService.addPublicAddress(createDto);
  }

  @Post('challange')
  @FlexibleAuth()
  async createChallange(
    @Body() createDto: CreatePublicAddressChallangeDto,
  ): Promise<
    ApiResponse<{
      challange: string;
      expiresAt: Date;
      expiresInMinutes: number;
    }>
  > {
    return this.publicAddressesService.createChallange(createDto.publicKey);
  }

  /**
   * Gets all public addresses for the authenticated user
   * Supports both JWT token authentication and Telegram init data authentication
   */
  @Get()
  @FlexibleAuth()
  async getMyAddresses(
    @Request() req: Request,
  ): Promise<ApiResponse<PublicAddressResponse[]>> {
    // Handle authentication data based on the auth method used
    if ((req as any).authMethod === 'jwt') {
      // For JWT authentication, use user ID from token to get addresses
      const user = (req as any).user;
      return this.publicAddressesService.getAddressesByUserId(user.id);
    } else if ((req as any).authMethod === 'telegram') {
      // For Telegram authentication, use telegram ID to get addresses
      const telegramData = (req as any).telegramData;
      return this.publicAddressesService.getAddressesByTelegramId(
        telegramData.telegramId,
      );
    }

    // This should not happen due to FlexibleAuth guard, but added for safety
    throw new Error('Authentication method not recognized');
  }

  /**
   * Gets all public addresses for a specific user
   * Supports both JWT token authentication and Telegram init data authentication
   */
  @Get(':userId')
  @FlexibleAuth()
  async getAddressesByUserId(
    @Param('userId') userId: string,
  ): Promise<ApiResponse<PublicAddressResponse[]>> {
    // The service now handles all error scenarios and response formatting
    return this.publicAddressesService.getAddressesByUserId(userId);
  }
}
