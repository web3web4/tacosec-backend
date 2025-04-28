import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpException,
  HttpStatus,
  Query,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PasswordService } from './password.service';
import { Types } from 'mongoose';
import { TelegramInitDto } from './dto/telegram-init.dto';
import { VerifyPasswordData } from './interfaces/verify-password.interface';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';
import { TelegramAuth } from './decorators/telegram-auth.decorator';
import { TelegramDtoAuth } from './decorators/telegram-dto-auth.decorator';
import { TelegramDtoAuthGuard } from './guards/telegram-dto-auth.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from './enums/role.enum';
import { Pagination } from './decorators/pagination.decorator';
import { PaginationParams } from './interfaces/pagination.interface';

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

  /**
   * Create a new password
   * Requires Telegram init data for authentication
   * You can send raw Telegram init data in one of the following ways:
   * 1. In header: X-Telegram-Init-Data
   * 2. In body: initDataRaw
   * 3. In query parameter: tgInitData
   */
  @Post('/passwords-initData')
  // @TelegramAuth()
  @TelegramDtoAuth()
  createPasswordInitData(@Body() createPasswordDto: CreatePasswordRequestDto) {
    return this.usersService.addPassword(createPasswordDto);
  }

  /**
   * Alternative way to create a new password using structured DTO
   * The authentication is done by validating the hash in the initData against the TELEGRAM_BOT_TOKEN
   *
   * Example of usage:
   * POST /users/passwords-dto
   * {
   *   "key": "my_password",
   *   "value": "secure_password",
   *   "type": "CREDENTIALS",
   *   "initData": {
   *     "telegramId": "123456789",
   *     "authDate": 1619493727,
   *     "hash": "fa92cf66f6a65f793fe5c18ad2e8c68b62ef9a7e68956d361f8364a4895a7eb8"
   *   }
   * }
   */
  @Post('/passwords')
  @TelegramDtoAuth()
  createPasswordDto(@Body() createPasswordDto: CreatePasswordRequestDto) {
    return this.usersService.addPassword(createPasswordDto);
  }

  // @Post('/passwords-without-auth')
  // createPasswordWithoutAuth(
  //   @Body() createPasswordDto: CreatePasswordRequestDto,
  // ) {
  //   return this.usersService.addPassword(createPasswordDto);
  // }
  @Get('passwords')
  @TelegramDtoAuth()
  getUserPasswords(@Request() req: Request) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.passwordService.findByUserTelegramId(teleDtoData.telegramId);
  }

  /**
   * Get all users who
   * @param req
   * @returns
   */
  @Get('passwords/shared-with')
  @TelegramDtoAuth()
  getUserBySharedWith(@Request() req: Request, @Body() body: { key: string }) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.passwordService.findSharedWithByTelegramId(
      teleDtoData.telegramId,
      body.key,
    );
  }

  /**
   * Get all passwords shared with the user
   * @param req
   * @returns
   */
  @Get('passwords/shared-with-me')
  @TelegramDtoAuth()
  getPasswordsSharedWithMe(@Request() req: Request) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    console.log('teleDtoData.telegramId', teleDtoData.telegramId);
    return this.passwordService.findPasswordsSharedWithMe(
      teleDtoData.telegramId,
    );
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
  update(
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

  @Post(':id/passwords/verify')
  @TelegramDtoAuth()
  async verifyPassword(
    @Param('id') userId: string,
    @Body() verifyData: VerifyPasswordData,
  ) {
    const password = await this.passwordService.findByUserId(
      new Types.ObjectId(userId),
    );
    const targetPassword = password.find(
      (p) => p._id.toString() === verifyData.passwordId,
    );

    if (!targetPassword) {
      throw new HttpException('Password not found', HttpStatus.NOT_FOUND);
    }

    const hashedPassword = targetPassword.value;

    if (!hashedPassword) {
      throw new HttpException('Password type not found', HttpStatus.NOT_FOUND);
    }

    const isValid = await this.passwordService.verifyPassword(
      hashedPassword,
      verifyData.password,
    );

    return { isValid };
  }

  @Get('search')
  @TelegramDtoAuth()
  async findAllByQuery(@Query('query') query: string) {
    return this.usersService.findByQuery(JSON.parse(query));
  }
}
