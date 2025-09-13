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
import { TelegramDtoAuth } from '../decorators/telegram-dto-auth.decorator';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { Roles, Role } from '../decorators/roles.decorator';

@Controller('reports')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
  ) {}

  @Post()
  @TelegramDtoAuth()
  reportUser(@Body() reportData: ReportUserDto, @Request() req: Request) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.reportService.reportUser(teleDtoData.telegramId, reportData);
  }

  @Get('user/:telegramId')
  @TelegramDtoAuth()
  @Roles(Role.ADMIN)
  @UsePipes(new ValidationPipe({ transform: true }))
  getReportsByUser(
    @Param('telegramId', TelegramUserExistsPipe) telegramId: string,
  ) {
    return this.reportService.getReportsByUser(telegramId);
  }

  @Get('is-restricted/:telegramId')
  @TelegramDtoAuth()
  @UsePipes(new ValidationPipe({ transform: true }))
  isUserRestricted(
    @Param('telegramId', TelegramUserExistsPipe) telegramId: string,
  ) {
    return this.reportService.isUserRestricted(telegramId);
  }

  @Patch('resolve/:id')
  @TelegramDtoAuth()
  @Roles(Role.ADMIN)
  resolveReport(@Param('id') id: string) {
    return this.reportService.resolveReport(id);
  }

  @Get('admin/reported-users')
  @TelegramDtoAuth()
  @Roles(Role.ADMIN)
  getAllReportedUsers() {
    return this.reportService.getAllReportedUsers();
  }
}
