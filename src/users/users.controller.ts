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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PasswordService } from '../passwords/password.service';
import { TelegramInitDto } from '../telegram/dto/telegram-init.dto';
import { TelegramAuth } from '../decorators/telegram-auth.decorator';
import { TelegramDtoAuth } from '../decorators/telegram-dto-auth.decorator';
import { TelegramDtoAuthGuard } from '../telegram/dto/telegram-dto-auth.guard';
import { Roles, Role } from '../decorators/roles.decorator';
import {
  Pagination,
  PaginationParams,
} from '../decorators/pagination.decorator';
import { GetTelegramProfileDto } from './dto/get-telegram-profile.dto';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
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

  @Get('telegram/profile')
  getTelegramProfile(@Query() query: GetTelegramProfileDto) {
    return this.usersService.getTelegramProfile(query.username);
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

  @Patch(':id')
  @TelegramDtoAuth()
  updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: Partial<TelegramInitDto>,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @TelegramDtoAuth()
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
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
}
