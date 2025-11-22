import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
  NotificationStatus,
} from './schemas/notification.schema';
import { CreateNotificationDto, GetNotificationsDto } from './dto';

export interface NotificationLogData {
  message: string;
  type: NotificationType;
  recipientUserId: Types.ObjectId;
  recipientTelegramId?: string;
  recipientUsername?: string;
  senderUserId?: Types.ObjectId;
  senderTelegramId?: string;
  senderUsername?: string;
  reason?: string;
  subject?: string;
  relatedEntityId?: Types.ObjectId;
  relatedEntityType?: string;
  parentId?: Types.ObjectId;
  telegramChatId?: string;
  telegramMessageId?: number;
  tabName ?: string;
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  telegramMessageId?: number;
  telegramResponse?: string;
  errorMessage?: string;
  error?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) {}

  /**
   * Log a new notification before sending
   */
  async logNotification(
    data: NotificationLogData,
  ): Promise<NotificationDocument> {
    try {
      // Convert identifiers to ObjectId if they are strings
      const processedData = {
        ...data,
        recipientUserId:
          typeof data.recipientUserId === 'string'
            ? new Types.ObjectId(data.recipientUserId)
            : data.recipientUserId,
        senderUserId:
          data.senderUserId && typeof data.senderUserId === 'string'
            ? new Types.ObjectId(data.senderUserId)
            : data.senderUserId,
        relatedEntityId:
          data.relatedEntityId && typeof data.relatedEntityId === 'string'
            ? new Types.ObjectId(data.relatedEntityId)
            : data.relatedEntityId,
        parentId:
          data.parentId && typeof data.parentId === 'string'
            ? new Types.ObjectId(data.parentId)
            : data.parentId,
      };

      const notification = new this.notificationModel({
        ...processedData,
        telegramStatus: NotificationStatus.PENDING,
        retryCount: 0,
      });

      const savedNotification = await notification.save();
      this.logger.log(`Notification logged with ID: ${savedNotification._id}`);

      return savedNotification;
    } catch (error) {
      this.logger.error('Error logging notification:', error);
      throw error;
    }
  }

  /**
   * Update notification status after sending
   */
  async updateNotificationStatus(
    notificationId: string,
    result: NotificationResult,
  ): Promise<void> {
    try {
      const updateData: any = {
        telegramStatus: result.success
          ? NotificationStatus.SENT
          : NotificationStatus.FAILED,
        telegramResponse: result.telegramResponse,
        errorMessage: result.errorMessage,
      };

      if (result.success) {
        updateData.sentAt = new Date();
        updateData.telegramMessageId = result.telegramMessageId;
      } else {
        updateData.failedAt = new Date();
        updateData.$inc = { retryCount: 1 };
      }

      await this.notificationModel.findByIdAndUpdate(
        notificationId,
        updateData,
      );

      this.logger.log(
        `Notification ${notificationId} status updated to ${updateData.telegramStatus}`,
      );
    } catch (error) {
      this.logger.error('Error updating notification status:', error);
    }
  }

  /**
   * Log a notification with the result directly (for simplified usage)
   */
  async logNotificationWithResult(
    data: NotificationLogData,
    result: NotificationResult,
  ): Promise<NotificationDocument> {
    try {
      const notification = new this.notificationModel({
        ...data,
        telegramStatus: result.success
          ? NotificationStatus.SENT
          : NotificationStatus.FAILED,
        telegramMessageId: result.telegramMessageId,
        telegramResponse: result.telegramResponse,
        errorMessage: result.errorMessage,
        sentAt: result.success ? new Date() : undefined,
        failedAt: !result.success ? new Date() : undefined,
        retryCount: result.success ? 0 : 1,
      });

      const savedNotification = await notification.save();
      this.logger.log(
        `Notification logged with result, ID: ${savedNotification._id}, Status: ${savedNotification.telegramStatus}`,
      );

      return savedNotification;
    } catch (error) {
      this.logger.error('Error logging notification with result:', error);
      throw error;
    }
  }

  /**
   * Get notifications with filters and pagination
   */
  async getNotifications(query: GetNotificationsDto) {
    try {
      const {
        page = 1,
        limit = 10,
        recipientUserId,
        recipientTelegramId,
        recipientUsername,
        senderUserId,
        senderTelegramId,
        senderUsername,
        type,
        telegramStatus,
        startDate,
        endDate,
        search,
        relatedEntityId,
        relatedEntityType,
        parentId,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query;

      // Build search filters
      const filter: any = {};

      if (recipientUserId) {
        filter.recipientUserId = Types.ObjectId.isValid(recipientUserId)
          ? new Types.ObjectId(recipientUserId)
          : recipientUserId;
      }
      if (recipientTelegramId) filter.recipientTelegramId = recipientTelegramId;
      if (recipientUsername) {
        filter.recipientUsername = new RegExp(recipientUsername, 'i');
      }
      if (senderUserId) {
        filter.senderUserId = Types.ObjectId.isValid(senderUserId)
          ? new Types.ObjectId(senderUserId)
          : senderUserId;
      }
      if (senderTelegramId) filter.senderTelegramId = senderTelegramId;
      if (senderUsername) {
        filter.senderUsername = new RegExp(senderUsername, 'i');
      }
      if (type) filter.type = type;
      if (telegramStatus) filter.telegramStatus = telegramStatus;
      if (relatedEntityId) {
        filter.relatedEntityId = Types.ObjectId.isValid(relatedEntityId)
          ? new Types.ObjectId(relatedEntityId)
          : relatedEntityId;
      }
      if (relatedEntityType) filter.relatedEntityType = relatedEntityType;
      if (parentId) {
        filter.parentId = Types.ObjectId.isValid(parentId)
          ? new Types.ObjectId(parentId)
          : parentId;
      }

      // Date filter
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      // Text search
      if (search) {
        filter.$or = [
          { message: new RegExp(search, 'i') },
          { subject: new RegExp(search, 'i') },
          { reason: new RegExp(search, 'i') },
          { recipientUsername: new RegExp(search, 'i') },
          { senderUsername: new RegExp(search, 'i') },
        ];
      }

      // Calculate skip and sort
      const skip = (page - 1) * limit;
      const sortOptions: any = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [notifications, total] = await Promise.all([
        this.notificationModel
          .find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
        this.notificationModel.countDocuments(filter).exec(),
      ]);

      // Calculate pagination information
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return {
        notifications,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage,
          hasPrevPage,
        },
      };
    } catch (error) {
      this.logger.error('Error getting notifications:', error);
      throw error;
    }
  }

  /**
   * Get notifications for the current authenticated user with sender/recipient/all filter.
   * This encapsulates the business logic previously placed in the controller.
   */
  async getMyNotifications(
    currentUserId: string,
    senderOrRecipientRaw?: string,
    query: Omit<GetNotificationsDto, 'senderUserId' | 'recipientUserId'> = {},
  ) {
    try {
      // Normalize filter (case-insensitive), default to 'all'.
      const normalized = String(
        senderOrRecipientRaw || (query as any).senderOrRecipient || 'all',
      ).toLowerCase();
      const filterChoice: 'sender' | 'recipient' | 'all' =
        normalized === 'sender'
          ? 'sender'
          : normalized === 'recipient'
            ? 'recipient'
            : 'all';

      // Extract common query params (same handling as getNotifications)
      const {
        page = 1,
        limit = 10,
        recipientTelegramId,
        recipientUsername,
        senderTelegramId,
        senderUsername,
        type,
        telegramStatus,
        startDate,
        endDate,
        search,
        relatedEntityId,
        relatedEntityType,
        parentId,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query as GetNotificationsDto;

      // Build filter using a unified $and pipeline so totalItems is counted AFTER applying ALL filters
      const conditions: any[] = [];

      // User-specific part
      const userIdObj = Types.ObjectId.isValid(currentUserId)
        ? new Types.ObjectId(currentUserId)
        : currentUserId;
      if (filterChoice === 'sender') {
        conditions.push({ senderUserId: userIdObj });
      } else if (filterChoice === 'recipient') {
        conditions.push({ recipientUserId: userIdObj });
      } else {
        conditions.push({
          $or: [{ senderUserId: userIdObj }, { recipientUserId: userIdObj }],
        });
      }

      // Other filters
      if (recipientTelegramId) conditions.push({ recipientTelegramId });
      if (recipientUsername)
        conditions.push({
          recipientUsername: new RegExp(recipientUsername, 'i'),
        });
      if (senderTelegramId) conditions.push({ senderTelegramId });
      if (senderUsername)
        conditions.push({ senderUsername: new RegExp(senderUsername, 'i') });
      if (type) conditions.push({ type });
      if (telegramStatus) conditions.push({ telegramStatus });
      if (relatedEntityId) {
        const relId = Types.ObjectId.isValid(relatedEntityId)
          ? new Types.ObjectId(relatedEntityId)
          : relatedEntityId;
        conditions.push({ relatedEntityId: relId });
      }
      if (relatedEntityType) conditions.push({ relatedEntityType });
      if (parentId) {
        const pId = Types.ObjectId.isValid(parentId)
          ? new Types.ObjectId(parentId)
          : parentId;
        conditions.push({ parentId: pId });
      }

      // Date range
      if (startDate || endDate) {
        const createdAtRange: any = {};
        if (startDate) createdAtRange.$gte = new Date(startDate);
        if (endDate) createdAtRange.$lte = new Date(endDate);
        conditions.push({ createdAt: createdAtRange });
      }

      // Text search
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        const orSearch = [
          { message: searchRegex },
          { subject: searchRegex },
          { reason: searchRegex },
          { recipientUsername: searchRegex },
          { senderUsername: searchRegex },
        ];
        conditions.push({ $or: orSearch });
      }

      const filter: any = conditions.length > 0 ? { $and: conditions } : {};

      // Pagination and sorting
      const skip = (page - 1) * limit;
      const sortOptions: any = {};
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Execute query
      const [notifications, total] = await Promise.all([
        this.notificationModel
          .find(filter)
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
        this.notificationModel.countDocuments(filter).exec(),
      ]);

      // Enrich with currentUserRole
      const currentIdStr = String(userIdObj);
      const enriched = (notifications || []).map((n: any) => {
        const senderIdStr = n.senderUserId ? String(n.senderUserId) : undefined;
        const recipientIdStr = n.recipientUserId
          ? String(n.recipientUserId)
          : undefined;
        let role: 'sender' | 'recipient' | undefined = undefined;
        if (senderIdStr === currentIdStr) role = 'sender';
        else if (recipientIdStr === currentIdStr) role = 'recipient';
        else if (filterChoice !== 'all') role = filterChoice; // fallback
        return { ...n, currentUserRole: role };
      });

      // Pagination info
      const totalPages = Math.ceil(total / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return {
        notifications: enriched,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
          hasNextPage,
          hasPrevPage,
        },
      };
    } catch (error) {
      this.logger.error('Error getting my notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId?: string) {
    try {
      const filter = userId
        ? {
            $or: [
              {
                recipientUserId: Types.ObjectId.isValid(userId)
                  ? new Types.ObjectId(userId)
                  : userId,
              },
              {
                senderUserId: Types.ObjectId.isValid(userId)
                  ? new Types.ObjectId(userId)
                  : userId,
              },
            ],
          }
        : {};

      const stats = await this.notificationModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            sent: {
              $sum: {
                $cond: [
                  { $eq: ['$telegramStatus', NotificationStatus.SENT] },
                  1,
                  0,
                ],
              },
            },
            failed: {
              $sum: {
                $cond: [
                  { $eq: ['$telegramStatus', NotificationStatus.FAILED] },
                  1,
                  0,
                ],
              },
            },
            pending: {
              $sum: {
                $cond: [
                  { $eq: ['$telegramStatus', NotificationStatus.PENDING] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      const typeStats = await this.notificationModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
          },
        },
      ]);

      return {
        total: stats[0]?.total || 0,
        sent: stats[0]?.sent || 0,
        failed: stats[0]?.failed || 0,
        pending: stats[0]?.pending || 0,
        byType: typeStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      };
    } catch (error) {
      this.logger.error('Error getting notification stats:', error);
      throw error;
    }
  }

  /**
   * Delete old notifications (for maintenance)
   */
  async cleanupOldNotifications(daysOld: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.notificationModel.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      this.logger.log(`Cleaned up ${result.deletedCount} old notifications`);
      return result.deletedCount;
    } catch (error) {
      this.logger.error('Error cleaning up old notifications:', error);
      throw error;
    }
  }

  /**
   * Retry failed notifications
   */
  async getFailedNotificationsForRetry(maxRetries: number = 3) {
    try {
      return await this.notificationModel
        .find({
          telegramStatus: NotificationStatus.FAILED,
          retryCount: { $lt: maxRetries },
        })
        .sort({ failedAt: 1 })
        .limit(100)
        .exec();
    } catch (error) {
      this.logger.error('Error getting failed notifications for retry:', error);
      throw error;
    }
  }
}
