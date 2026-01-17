import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { TelegramClientService } from './telegram-client.service';
import { ContactsService } from './services/contacts.service';
import { AuthService } from './services/auth.service';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import {
  SendCodeDto,
  VerifyCodeDto,
  GetContactsDto,
  SearchContactsDto,
} from './dto';

/**
 * Telegram Client Controller
 * Handles HTTP requests for Telegram Client API operations
 * Provides endpoints for authentication and contact management
 */
@Controller('telegram-client')
@UseGuards(TelegramDtoAuthGuard)
export class TelegramClientController {
  constructor(
    private readonly telegramClientService: TelegramClientService,
    private readonly contactsService: ContactsService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Send authentication code to phone number
   * @param sendCodeDto - Phone number and user info
   * @returns Code hash and other auth info
   */
  @Post('auth/send-code')
  @HttpCode(HttpStatus.OK)
  async sendCode(@Body() sendCodeDto: SendCodeDto) {
    return this.authService.sendCode(sendCodeDto);
  }

  /**
   * Verify authentication code and complete login
   * @param verifyCodeDto - Code, phone number, and code hash
   * @returns Authentication result with session
   */
  @Post('auth/verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCode(@Body() verifyCodeDto: VerifyCodeDto) {
    return this.authService.verifyCode(verifyCodeDto);
  }

  /**
   * Check authentication status for a user
   * @param userId - User ID
   * @returns Authentication status
   */
  @Get('auth/status/:userId')
  async getAuthStatus(@Param('userId') userId: string) {
    return this.authService.getAuthStatus(parseInt(userId));
  }

  /**
   * Logout user and clear session
   * @param userId - User ID
   * @returns Logout result
   */
  @Post('auth/logout/:userId')
  @HttpCode(HttpStatus.OK)
  async logout(@Param('userId') userId: string) {
    return this.authService.logout(parseInt(userId));
  }

  /**
   * Get user's contacts from Telegram
   * @param userId - User ID
   * @param getContactsDto - Query parameters
   * @returns List of contacts
   */
  @Get('contacts/:userId')
  async getContacts(
    @Param('userId') userId: string,
    @Query() getContactsDto: GetContactsDto,
  ) {
    return this.contactsService.getContacts(parseInt(userId), getContactsDto);
  }

  /**
   * Search contacts by query
   * @param userId - User ID
   * @param searchContactsDto - Search parameters
   * @returns Filtered contacts
   */
  @Get('contacts/:userId/search')
  async searchContacts(
    @Param('userId') userId: string,
    @Query() searchContactsDto: SearchContactsDto,
  ) {
    return this.contactsService.searchContacts(
      parseInt(userId),
      searchContactsDto,
    );
  }

  /**
   * Sync contacts from Telegram
   * @param userId - User ID
   * @returns Sync result
   */
  @Post('contacts/:userId/sync')
  @HttpCode(HttpStatus.OK)
  async syncContacts(@Param('userId') userId: string) {
    return this.contactsService.syncContacts(parseInt(userId));
  }

  /**
   * Get contact details by contact ID
   * @param userId - User ID
   * @param contactId - Contact ID
   * @returns Contact details
   */
  @Get('contacts/:userId/:contactId')
  async getContactDetails(
    @Param('userId') userId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.contactsService.getContactDetails(
      parseInt(userId),
      parseInt(contactId),
    );
  }
}
