import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import {
  PublicAddressesService,
  ApiResponse,
  PublicAddressResponse,
} from './public-addresses.service';
import { CreatePublicAddressDto } from './dto/create-public-address.dto';
import { TelegramDtoAuth } from '../decorators/telegram-dto-auth.decorator';
import { TelegramDtoAuthGuard } from '../telegram/dto/telegram-dto-auth.guard';

@Controller('public-addresses')
export class PublicAddressesController {
  constructor(
    private readonly publicAddressesService: PublicAddressesService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
  ) {}

  /**
   * Adds a new public address for a user
   * Accepts a single publicKey with an optional secret
   */
  @Post()
  @TelegramDtoAuth()
  async addPublicAddresses(
    @Request() req: Request,
    @Body() createDto: CreatePublicAddressDto,
  ): Promise<ApiResponse<PublicAddressResponse[]>> {
    // Update the dto with the telegramId from headers
    createDto.telegramInitData = req.headers['x-telegram-init-data'];

    // The service now handles all error scenarios and response formatting
    return this.publicAddressesService.addPublicAddress(createDto);
  }

  /**
   * Gets all public addresses for the authenticated user
   */
  @Get()
  @TelegramDtoAuth()
  async getMyAddresses(
    @Request() req: Request,
  ): Promise<ApiResponse<PublicAddressResponse[]>> {
    // Extract user data from telegram init data in headers
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );

    // The service now handles all error scenarios and response formatting
    return this.publicAddressesService.getAddressesByTelegramId(
      teleDtoData.telegramId,
    );
  }

  /**
   * Gets all public addresses for a specific user
   */
  @Get(':userId')
  @TelegramDtoAuth()
  async getAddressesByUserId(
    @Param('userId') userId: string,
  ): Promise<ApiResponse<PublicAddressResponse[]>> {
    // The service now handles all error scenarios and response formatting
    return this.publicAddressesService.getAddressesByUserId(userId);
  }
}
