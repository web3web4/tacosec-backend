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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PasswordService } from './password.service';
import { Types } from 'mongoose';
import { TelegramInitDto } from './dto/telegram-init.dto';
import { VerifyPasswordData } from './interfaces/verify-password.interface';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';
import { TelegramAuth } from './decorators/telegram-auth.decorator';
import { TelegramDtoAuth } from './decorators/telegram-dto-auth.decorator';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
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
  @TelegramAuth()
  createPassword(@Body() createPasswordDto: CreatePasswordRequestDto) {
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

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: Partial<TelegramInitDto>,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get('telegram/:telegramId')
  findByTelegramId(@Param('telegramId') telegramId: string) {
    return this.usersService.findByTelegramId(telegramId);
  }

  @Get(':id/passwords')
  getUserPasswords(@Param('id') userId: string) {
    return this.passwordService.findByUserId(new Types.ObjectId(userId));
  }

  @Post(':id/passwords/verify')
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
  async findAllByQuery(@Query('query') query: string) {
    return this.usersService.findByQuery(JSON.parse(query));
  }
}
