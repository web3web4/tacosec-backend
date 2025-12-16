import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Request,
  Query,
  UsePipes,
  ValidationPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportUserDto } from './dto/report-user.dto';
import { GetReportedUsersQueryDto } from './dto/get-reported-users-query.dto';
import { UsersService } from '../users/users.service';

import { TelegramUserExistsPipe } from './pipes/telegram-user-exists.pipe';
import { FlexibleAuth } from '../decorators/flexible-auth.decorator';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { Roles, Role } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import {
  Pagination,
  PaginationParams,
} from '../decorators/pagination.decorator';

@Controller('reports')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @FlexibleAuth()
  async reportUser(
    @Body() reportData: ReportUserDto,
    @Request() req: AuthenticatedRequest,
  ) {
    let reporterUserId: string;

    // Extract reporter user ID based on authentication method
    if ((req as any).authMethod === 'jwt') {
      // JWT authentication - use userId directly
      reporterUserId = (req as any).user.id;
    } else {
      // Telegram authentication - find userId from telegramId
      const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
        req.headers['x-telegram-init-data'] as string,
      );
      // For Telegram authentication, find the user by telegramId to get their userId
      const user = await this.usersService.findByTelegramId(
        teleDtoData.telegramId,
      );
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      reporterUserId = (user as any)._id.toString();
    }

    return this.reportService.reportUser(reporterUserId, reportData);
  }

  @Get('admin/user/:userIdentifier')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getReportsByUser(@Param('userIdentifier') userIdentifier: string) {
    // This method accepts userId, telegramId, or publicAddress as parameter
    // It will find the user first and then search for all reports using both userId and telegramId
    return this.reportService.getReportsByUser(userIdentifier);
  }

  @Get('is-restricted/:userIdentifier')
  @FlexibleAuth()
  @UsePipes(new ValidationPipe({ transform: true }))
  async isUserRestricted(@Param('userIdentifier') userIdentifier: string) {
    // This method accepts userId, telegramId, or publicAddress as parameter
    // It will find the user first and then check if they are restricted
    return this.reportService.isUserRestricted(userIdentifier);
  }

  @Patch('admin/resolve/:id')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async resolveReport(@Param('id') id: string) {
    // This method doesn't need to extract user data from request
    // since it's an admin endpoint that takes report id as parameter
    return this.reportService.resolveReport(id);
  }

  @Get('admin/reported-users')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async getAllReportedUsers(
    @Query() query: GetReportedUsersQueryDto,
    @Pagination() pagination: PaginationParams,
  ) {
    // Return a FLAT list of reports with pagination
    return this.reportService.getAllReportedUsersFlat(query, pagination);
  }

  @Get('admin/:id')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async getReportById(@Param('id') reportId: string) {
    return this.reportService.getReportById(reportId);
  }
}
