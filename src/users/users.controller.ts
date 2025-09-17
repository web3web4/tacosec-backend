import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PasswordService } from '../passwords/password.service';
import { TelegramInitDto } from '../telegram/dto/telegram-init.dto';
import { TelegramAuth } from '../decorators/telegram-auth.decorator';
import { TelegramDtoAuth } from '../decorators/telegram-dto-auth.decorator';
import { FlexibleAuth } from '../decorators/flexible-auth.decorator';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { Roles, Role } from '../decorators/roles.decorator';
import {
  Pagination,
  PaginationParams,
} from '../decorators/pagination.decorator';
import { GetTelegramProfileDto } from './dto/get-telegram-profile.dto';
import { TelegramService } from '../telegram/telegram.service';
import { HttpService } from '@nestjs/axios';
// import { firstValueFrom } from 'rxjs';
import { SearchUsersDto } from './dto/search-users.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
    private readonly telegramService: TelegramService,
    private readonly httpService: HttpService,
  ) {}

  /**
   *  Register a new user via Telegram init data
   * You can send raw Telegram init data in one of the following ways:
   * 1. In header: X-Telegram-Init-Data
   * 2. In body: initDataRaw
   * 3. In query parameter: tgInitData
   *
   * Example of usage:
   * POST /users/signup
   * X-Telegram-Init-Data: query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22...
   */
  @Post('signup-initData')
  @TelegramAuth()
  // @TelegramDtoAuth()
  async signup(@Body() createUserDto: TelegramInitDto) {
    return this.usersService.createAndUpdateUser(createUserDto);
  }

  /**
   * Alternative way to register a user using structured DTO data in body
   * The authentication is done by validating the hash in the DTO against the TELEGRAM_BOT_TOKEN
   *
   * Example of usage:
   * POST /users/signup-dto
   * {
   *   "telegramId": "123456789",
   *   "firstName": "John",
   *   "lastName": "Doe",
   *   "username": "johndoe",
   *   "authDate": 1619493727,
   *   "hash": "fa92cf66f6a65f793fe5c18ad2e8c68b62ef9a7e68956d361f8364a4895a7eb8"
   * }
   */
  @Post('signup')
  @TelegramDtoAuth()
  async signupDto(@Body() createUserDto: TelegramInitDto) {
    return this.usersService.createAndUpdateUser(createUserDto);
  }

  @Patch(':id')
  @TelegramDtoAuth()
  updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: Partial<TelegramInitDto>,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Get('telegram/profile')
  // @TelegramDtoAuth() // Skip Telegram validation - only check JWT token
  getTelegramProfile(@Query() query: GetTelegramProfileDto) {
    return this.usersService.getTelegramProfile(query.username);
  }

  @Get('username/:username')
  @TelegramDtoAuth()
  findByUsername(@Param('username') username: string) {
    return this.usersService.findByUsername(username);
  }

  @Get()
  @TelegramDtoAuth()
  @Roles(Role.ADMIN)
  findAll(@Request() req: Request, @Pagination() pagination: PaginationParams) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.usersService.findAllExceptMe(
      teleDtoData.telegramId,
      pagination,
    );
  }

  @Get(':id')
  @TelegramDtoAuth()
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get('telegram/:telegramId')
  @TelegramDtoAuth()
  findByTelegramId(@Param('telegramId') telegramId: string) {
    return this.usersService.findByTelegramId(telegramId);
  }

  @Get('search')
  @TelegramDtoAuth()
  async findAllByQuery(@Query('query') query: string) {
    return this.usersService.findByQuery({
      username: { $regex: query, $options: 'i' },
    });
  }

  /**
   * Search users by username with autocomplete functionality
   * Prioritizes previously shared contacts in results
   * Supports both 'starts_with' and 'contains' search modes
   * GET /users/search/autocomplete?query=john&searchType=starts_with&limit=10&skip=0
   * GET /users/search/autocomplete?query=john&searchType=contains&limit=10&skip=0
   * Returns users with isPreviouslyShared flag indicating if they were shared with before
   *
   * Authentication: Supports both JWT token (Bearer) and Telegram init data (x-telegram-init-data header)
   * Priority: JWT token > Telegram init data
   */
  @Get('search/autocomplete')
  @FlexibleAuth()
  async searchUsersAutocomplete(
    @Query() searchDto: SearchUsersDto,
    @Request() req: Request,
  ) {
    let telegramId: string;

    // Check authentication method and extract telegram ID accordingly
    if ((req as any).authMethod === 'jwt') {
      // JWT authentication - get telegramId from user data
      telegramId = (req as any).user.telegramId;
    } else {
      // Telegram authentication - extract from telegram data
      const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
        req.headers['x-telegram-init-data'],
      );
      telegramId = teleDtoData.telegramId;
    }

    return this.usersService.searchUsersByUsername(
      searchDto.query || '',
      telegramId,
      searchDto.searchType,
      searchDto.limit,
      searchDto.skip,
    );
  }

  @Patch('me/privacy-mode')
  @TelegramDtoAuth()
  async updateMyPrivacyMode(
    @Req() req: any,
    @Body() body: { privacyMode: boolean },
  ) {
    // Get current user from JWT token or Telegram data
    const currentUserId = await this.usersService.getCurrentUserId(req);
    return this.usersService.updatePrivacyMode(currentUserId, body.privacyMode);
  }

  @Delete(':id')
  @TelegramDtoAuth()
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  /**
   * Test endpoint to manually trigger a username change notification
   * This endpoint is for testing purposes only and should be secured or removed in production
   */
  //   @Post('test-username-change')
  //   async testUsernameChange(
  //     @Body()
  //     body: {
  //       telegramId: string;
  //       oldUsername: string;
  //       newUsername: string;
  //     },
  //   ): Promise<{ success: boolean }> {
  //     try {
  //       console.log('Testing username change notification:', body);

  //       // Get the bot token from environment
  //       const botToken = process.env.TELEGRAM_BOT_TOKEN;
  //       console.log('Bot token available:', !!botToken);

  //       if (!botToken) {
  //         console.error('ERROR: Telegram bot token is missing!');
  //         return { success: false };
  //       }

  //       // Use axios directly to call the Telegram API
  //       const axios = require('axios');
  //       const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  //       const response = await axios.post(url, {
  //         chat_id: body.telegramId,
  //         text: `<b>🔄 Username Changed</b>

  // It appears that you've recently changed your username.

  // As a result:
  // • ✅ You can still <b>view</b> your old passwords.
  // • 🔐 However, they can <b>no longer be decrypted</b>.
  // • 🚫 You will also <b>lose access</b> to any passwords shared with you by other users.

  // <b>Old username:</b> <code>${body.oldUsername}</code>
  // <b>New username:</b> <code>${body.newUsername}</code>

  // <i>😞 We're sorry for the inconvenience.</i>
  // 🔁 To recover your passwords, please log in again using your old username.`,
  //         parse_mode: 'HTML',
  //       });

  //       console.log('Telegram API response:', response.data);
  //       return { success: response.data.ok === true };
  //     } catch (error) {
  //       console.error('Error in test username change:', error.message);
  //       if (error.response) {
  //         console.error('Error response data:', error.response.data);
  //         console.error('Error response status:', error.response.status);
  //       }
  //       return { success: false };
  //     }
  //   }
}
