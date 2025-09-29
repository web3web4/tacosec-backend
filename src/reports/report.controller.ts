import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportUserDto } from './dto/report-user.dto';

import { TelegramUserExistsPipe } from './pipes/telegram-user-exists.pipe';
import { FlexibleAuth } from '../decorators/flexible-auth.decorator';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { Roles, Role } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../passwords/password.service';

@Controller('reports')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
  ) {}

  @Post()
  @FlexibleAuth()
  async reportUser(
    @Body() reportData: ReportUserDto,
    @Request() req: AuthenticatedRequest,
  ) {
    let reporterIdentifier: string;

    // Extract reporter identifier based on authentication method
    if ((req as any).authMethod === 'jwt') {
      // JWT authentication - use userId as identifier
      reporterIdentifier = (req as any).user.id;
    } else {
      // Telegram authentication - use telegramId as identifier
      const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
        req.headers['x-telegram-init-data'] as string,
      );
      reporterIdentifier = teleDtoData.telegramId;
    }

    return this.reportService.reportUser(
      reporterIdentifier,
      reportData,
      (req as any).authMethod,
    );
  }

  @Get('user/:telegramId')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getReportsByUser(
    @Param('telegramId', TelegramUserExistsPipe) telegramId: string,
  ) {
    // This method doesn't need to extract user data from request
    // since it's an admin endpoint that takes telegramId as parameter
    return this.reportService.getReportsByUser(telegramId);
  }

  @Get('is-restricted/:telegramId')
  @FlexibleAuth()
  @UsePipes(new ValidationPipe({ transform: true }))
  async isUserRestricted(
    @Param('telegramId', TelegramUserExistsPipe) telegramId: string,
  ) {
    // This method doesn't need to extract user data from request
    // since it takes telegramId as parameter
    return this.reportService.isUserRestricted(telegramId);
  }

  @Patch('resolve/:id')
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
  async getAllReportedUsers() {
    // This method doesn't need to extract user data from request
    // since it's an admin endpoint that returns all reported users
    return this.reportService.getAllReportedUsers();
  }
}
