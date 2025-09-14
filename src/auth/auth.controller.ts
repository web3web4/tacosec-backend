import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Request,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { AuthService, LoginResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Request as ExpressRequest } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ skipMissingProperties: true }))
  async login(
    @Body() loginDto?: LoginDto,
    @Request() req?: ExpressRequest,
  ): Promise<LoginResponse | any> {
    const telegramInitData = req?.headers['x-telegram-init-data'] as string;
    return this.authService.login(loginDto, telegramInitData);
  }
}
