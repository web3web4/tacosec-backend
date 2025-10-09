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
import { RefreshTokenDto } from './dto/refresh-token.dto';
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

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe())
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<LoginResponse> {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }
}
