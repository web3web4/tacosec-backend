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
// import { PasswordData } from './interfaces/password-data.interface';
import { VerifyPasswordData } from './interfaces/verify-password.interface';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {}

  @Post('signup')
  async signup(@Body() createUserDto: TelegramInitDto) {
    return this.usersService.create(createUserDto);
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
