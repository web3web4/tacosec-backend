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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PasswordService } from './password.service';
import { Types } from 'mongoose';

interface TelegramInitData {
  telegramId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: Date;
  hash: string;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {}

  @Post('signup')
  async signup(@Body() createUserDto: TelegramInitData) {
    return this.usersService.create(createUserDto);
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

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: Partial<TelegramInitData>) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Post(':id/passwords')
  addPassword(
    @Param('id') userId: string,
    @Body() passwordData: {
      passwordName: string;
      telegramPassword?: string;
      facebookPassword?: string;
    },
  ) {
    return this.usersService.addPassword(userId, passwordData);
  }

  @Get(':id/passwords')
  getUserPasswords(@Param('id') userId: string) {
    return this.passwordService.findByUserId(new Types.ObjectId(userId));
  }

  @Post(':id/passwords/verify')
  async verifyPassword(
    @Param('id') userId: string,
    @Body() verifyData: {
      passwordId: string;
      passwordType: 'telegram' | 'facebook';
      password: string;
    },
  ) {
    const password = await this.passwordService.findByUserId(new Types.ObjectId(userId));
    const targetPassword = password.find(p => p._id.toString() === verifyData.passwordId);
    
    if (!targetPassword) {
      throw new HttpException('Password not found', HttpStatus.NOT_FOUND);
    }

    const hashedPassword = verifyData.passwordType === 'telegram' 
      ? targetPassword.telegramPassword 
      : targetPassword.facebookPassword;

    if (!hashedPassword) {
      throw new HttpException('Password type not found', HttpStatus.NOT_FOUND);
    }

    const isValid = await this.passwordService.verifyPassword(
      hashedPassword,
      verifyData.password,
    );

    return { isValid };
  }
} 