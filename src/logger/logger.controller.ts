import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { LoggerService, AuthenticatedRequest } from './logger.service';
import { CreateLogDto } from './dto/create-log.dto';
import { GetLogsDto, PaginatedLogsResponse } from './dto/get-logs.dto';
import { ErrorLog } from './schemas/error-log.schema';
import { FlexibleAuth } from '../decorators/flexible-auth.decorator';
import { AdminGetLogsDto } from './dto/admin-get-logs.dto';
import { Roles, Role } from '../decorators/roles.decorator';
import { UseGuards } from '@nestjs/common';
import { FlexibleAuthGuard } from '../guards/flexible-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

@Controller('logger')
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  /**
   * Save error log endpoint
   * Supports flexible authentication (JWT token or Telegram init data)
   * POST /logger
   * 
   * Headers:
   * - Authorization: Bearer <jwt_token> (for JWT auth)
   * - x-telegram-init-data: <telegram_init_data> (for Telegram auth)
   * 
   * Body:
   * {
   *   "logData": {
   *     "error": "Error message",
   *     "stack": "Stack trace",
   *     "url": "/api/endpoint",
   *     "method": "POST",
   *     "userAgent": "Browser info",
   *     "timestamp": "2024-01-01T00:00:00Z"
   *   }
   * }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @FlexibleAuth()
  @UsePipes(new ValidationPipe({ transform: true }))
  async saveLog(
    @Body() createLogDto: CreateLogDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<ErrorLog> {
    return this.loggerService.saveLog(createLogDto, req);
  }

  /**
   * Get error logs endpoint with pagination and filtering
   * Supports flexible authentication (JWT token or Telegram init data)
   * GET /logger
   * 
   * Headers:
   * - Authorization: Bearer <jwt_token> (for JWT auth)
   * - x-telegram-init-data: <telegram_init_data> (for Telegram auth)
   * 
   * Query Parameters:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 10)
   * - startDate: Filter logs from this date (ISO string)
   * - endDate: Filter logs until this date (ISO string)
   * - search: Search in log data (message, error, stack)
   */
  @Get()
  @FlexibleAuth()
  @UsePipes(new ValidationPipe({ transform: true }))
  async getLogs(
    @Query() getLogsDto: GetLogsDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<PaginatedLogsResponse> {
    return this.loggerService.getLogs(req, getLogsDto);
  }

  /**
   * Get specific error log by ID
   * Supports flexible authentication (JWT token or Telegram init data)
   * GET /logger/:id
   * 
   * Headers:
   * - Authorization: Bearer <jwt_token> (for JWT auth)
   * - x-telegram-init-data: <telegram_init_data> (for Telegram auth)
   */
  @Get(':id')
  @FlexibleAuth()
  async getLogById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<ErrorLog> {
    return this.loggerService.getLogById(req, id);
  }

  /**
   * Delete error log by ID
   * Supports flexible authentication (JWT token or Telegram init data)
   * DELETE /logger/:id
   * 
   * Headers:
   * - Authorization: Bearer <jwt_token> (for JWT auth)
   * - x-telegram-init-data: <telegram_init_data> (for Telegram auth)
   */
  @Delete(':id')
  @FlexibleAuth()
  async deleteLog(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    return this.loggerService.deleteLog(req, id);
  }

  /**
   * Get error logs statistics
   * Supports flexible authentication (JWT token or Telegram init data)
   * GET /logger/stats/summary
   * 
   * Headers:
   * - Authorization: Bearer <jwt_token> (for JWT auth)
   * - x-telegram-init-data: <telegram_init_data> (for Telegram auth)
   * 
   * Query Parameters:
   * - days: Number of days to include in stats (default: 7)
   */
  @Get('stats/summary')
  @FlexibleAuth()
  async getLogStats(
    @Query('days') days: string = '7',
    @Request() req: AuthenticatedRequest,
  ): Promise<{
    totalLogs: number;
    logsToday: number;
    logsThisWeek: number;
    averagePerDay: number;
  }> {
    // This is a placeholder for future implementation
    // You can implement this method in the service if needed
    return {
      totalLogs: 0,
      logsToday: 0,
      logsThisWeek: 0,
      averagePerDay: 0,
    };
  }

  /**
   * Admin endpoint to get all logs with filtering and pagination
   * Only accessible by users with 'admin' role
   * GET /logger/admin/all
   * 
   * Query Parameters:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 10)
   * - startDate: Filter logs from this date
   * - endDate: Filter logs until this date
   * - search: Search in log data
   * - userId: Filter by specific user ID
   * - telegramId: Filter by specific telegram ID
   * - username: Filter by username (partial match)
   */
  @Get('admin/all')
  @UseGuards(FlexibleAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getLogsForAdmin(
    @Query() adminGetLogsDto: AdminGetLogsDto,
  ): Promise<PaginatedLogsResponse> {
    return this.loggerService.getLogsForAdmin(adminGetLogsDto);
  }

  /**
   * Admin endpoint to get any log by ID
   * Only accessible by users with 'admin' role
   * GET /logger/admin/:id
   */
  @Get('admin/:id')
  @UseGuards(FlexibleAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getLogByIdForAdmin(
    @Param('id') id: string,
  ): Promise<ErrorLog> {
    return this.loggerService.getLogByIdForAdmin(id);
  }
}