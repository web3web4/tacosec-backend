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
import { LoggerService } from '../logger/logger.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Request as ExpressRequest } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loggerService: LoggerService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe())
  async login(
    @Body() loginDto?: LoginDto,
    @Request() req?: ExpressRequest,
  ): Promise<LoginResponse | any> {
    try {
      const telegramInitData = req?.headers['x-telegram-init-data'] as string;
      return await this.authService.login(loginDto, telegramInitData);
    } catch (error) {
      try {
        const headers = { ...(req?.headers || {}) } as Record<string, any>;
        if (headers.authorization) headers.authorization = '[redacted]';
        await this.loggerService.logException(error, req as any, {
          requestHeaders: headers,
          requestBody: req?.body,
        });
      } catch {}
      throw error;
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe())
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Request() req?: ExpressRequest,
  ): Promise<LoginResponse> {
    try {
      return await this.authService.refreshToken(refreshTokenDto.refreshToken);
    } catch (error) {
      try {
        const headers = { ...(req?.headers || {}) } as Record<string, any>;
        if (headers.authorization) headers.authorization = '[redacted]';
        await this.loggerService.logException(error, req as any, {
          requestHeaders: headers,
          requestBody: req?.body,
        });
      } catch {}
      throw error;
    }
  }
}
