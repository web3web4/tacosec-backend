import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  Delete,
  Param,
  Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { GetNotificationsDto } from './dto';
import { FlexibleAuth } from '../decorators/flexible-auth.decorator';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../decorators/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { FlexibleAuthGuard } from '../guards/flexible-auth.guard';
import { UsersService } from '../users/users.service';

@Controller('notifications')
@UseGuards(FlexibleAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Get all notifications with filters and pagination
   */
  @Get()
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async getNotifications(@Query() query: GetNotificationsDto) {
    try {
      return await this.notificationsService.getNotifications(query);
    } catch {
      throw new HttpException(
        'Failed to retrieve notifications',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get notification statistics
   */
  @Get('stats')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async getNotificationStats(@Query('userId') userId?: string) {
    try {
      return await this.notificationsService.getNotificationStats(userId);
    } catch {
      throw new HttpException(
        'Failed to retrieve notification statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get failed notifications for retry
   */
  @Get('failed')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async getFailedNotifications(@Query('maxRetries') maxRetries?: number) {
    try {
      const max = maxRetries ? parseInt(maxRetries.toString()) : 3;
      return await this.notificationsService.getFailedNotificationsForRetry(
        max,
      );
    } catch {
      throw new HttpException(
        'Failed to retrieve failed notifications',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Clean up old notifications
   */
  @Delete('cleanup/:days')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async cleanupOldNotifications(@Param('days') days: string) {
    try {
      const daysOld = parseInt(days);
      if (isNaN(daysOld) || daysOld < 1) {
        throw new HttpException(
          'Invalid days parameter. Must be a positive number.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const deletedCount =
        await this.notificationsService.cleanupOldNotifications(daysOld);
      return {
        success: true,
        message: `Successfully deleted ${deletedCount} old notifications`,
        deletedCount,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to cleanup old notifications',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search notifications by sender
   */
  @Get('by-sender/:senderUserId')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async getNotificationsBySender(
    @Param('senderUserId') senderUserId: string,
    @Query() query: Omit<GetNotificationsDto, 'senderUserId'>,
  ) {
    try {
      const searchQuery = { ...query, senderUserId };
      return await this.notificationsService.getNotifications(searchQuery);
    } catch {
      throw new HttpException(
        'Failed to retrieve notifications by sender',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search notifications by recipient
   */
  @Get('by-recipient/:recipientUserId')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async getNotificationsByRecipient(
    @Param('recipientUserId') recipientUserId: string,
    @Query() query: Omit<GetNotificationsDto, 'recipientUserId'>,
  ) {
    try {
      const searchQuery = { ...query, recipientUserId };
      return await this.notificationsService.getNotifications(searchQuery);
    } catch {
      throw new HttpException(
        'Failed to retrieve notifications by recipient',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search notifications by type
   */
  @Get('by-type/:type')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async getNotificationsByType(
    @Param('type') type: string,
    @Query() query: Omit<GetNotificationsDto, 'type'>,
  ) {
    try {
      const searchQuery = { ...query, type: type as any };
      return await this.notificationsService.getNotifications(searchQuery);
    } catch {
      throw new HttpException(
        'Failed to retrieve notifications by type',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Search notifications by telegram status
   */
  @Get('by-telegram-status/:telegramStatus')
  @FlexibleAuth()
  @Roles(Role.ADMIN)
  async getNotificationsByTelegramStatus(
    @Param('telegramStatus') telegramStatus: string,
    @Query() query: Omit<GetNotificationsDto, 'telegramStatus'>,
  ) {
    try {
      const searchQuery = { ...query, telegramStatus: telegramStatus as any };
      return await this.notificationsService.getNotifications(searchQuery);
    } catch {
      throw new HttpException(
        'Failed to retrieve notifications by telegram status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * User endpoint: get notifications for the currently authenticated user
   * Supports filter "senderOrrecipient" (case-insensitive):
   * - sender: return notifications where senderUserId matches current user
   * - recipient: return notifications where recipientUserId matches current user
   * - all (default): return notifications where either matches
   * Adds an extra field "currentUserRole" to each notification indicating
   * whether the current user is the sender or recipient for that notification.
   */
  @Get('my')
  @FlexibleAuth()
  async getMyNotifications(
    @Query('senderOrrecipient') senderOrrecipient: string,
    @Query()
    query: Omit<GetNotificationsDto, 'senderUserId' | 'recipientUserId'>,
    @Request() req: any,
  ) {
    try {
      const currentUserId = await this.usersService.getCurrentUserId(req);
      return await this.notificationsService.getMyNotifications(
        currentUserId,
        senderOrrecipient,
        query,
      );
    } catch {
      throw new HttpException(
        'Failed to retrieve my notifications',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
