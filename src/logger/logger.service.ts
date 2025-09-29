import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { ErrorLog, ErrorLogDocument } from './schemas/error-log.schema';
import { CreateLogDto } from './dto/create-log.dto';
import { GetLogsDto, PaginatedLogsResponse } from './dto/get-logs.dto';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { AdminGetLogsDto } from './dto/admin-get-logs.dto';

// Extend Request interface to include user property for flexible authentication
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    telegramId: string;
    username: string;
    firstName: string;
    lastName: string;
  };
  authMethod?: 'jwt' | 'telegram';
  telegramData?: any;
}

@Injectable()
export class LoggerService {
  constructor(
    @InjectModel(ErrorLog.name) private errorLogModel: Model<ErrorLogDocument>,
    private telegramDtoAuthGuard: TelegramDtoAuthGuard,
  ) {}

  /**
   * Extract user authentication data from request
   * Supports both JWT and Telegram authentication
   * @param req The authenticated request object
   * @returns Object containing userId, telegramId, and username
   */
  private extractUserAuthData(req: AuthenticatedRequest): {
    userId?: string;
    telegramId?: string;
    username?: string;
  } {
    // Priority 1: JWT token authentication
    if (req?.user && req.user.id) {
      return {
        userId: req.user.id,
        telegramId: req.user.telegramId,
        username: req.user.username,
      };
    }

    // Priority 2: Telegram authentication
    if (req?.headers?.['x-telegram-init-data']) {
      const headerInitData = req.headers['x-telegram-init-data'] as string;
      const parsedData = this.telegramDtoAuthGuard.parseTelegramInitData(headerInitData);
      return {
        telegramId: parsedData.telegramId,
        username: parsedData.username,
      };
    }

    throw new HttpException(
      'No authentication data provided',
      HttpStatus.BAD_REQUEST,
    );
  }

  /**
   * Save error log with flexible authentication
   * @param createLogDto The log data to save
   * @param req The authenticated request object
   * @returns The saved error log
   */
  async saveLog(
    createLogDto: CreateLogDto,
    req: AuthenticatedRequest,
  ): Promise<ErrorLog> {
    try {
      // Extract user authentication data
      const { userId, telegramId, username } = this.extractUserAuthData(req);

      // Create new error log entry
      const errorLog = new this.errorLogModel({
        userId,
        telegramId,
        username,
        logData: createLogDto.logData,
        // createdAt and updatedAt are handled automatically by schema
      });

      // Save to database
      const savedLog = await errorLog.save();
      return savedLog;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to save error log',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get error logs with flexible authentication and pagination
   * @param req The authenticated request object
   * @param getLogsDto Query parameters for filtering and pagination
   * @returns Paginated error logs filtered by user
   */
  async getLogs(
    req: AuthenticatedRequest,
    getLogsDto: GetLogsDto,
  ): Promise<PaginatedLogsResponse> {
    try {
      // Extract user authentication data
      const { userId, telegramId } = this.extractUserAuthData(req);

      // Build query filter based on authentication method
      const filter: any = {};
      if (userId) {
        filter.userId = userId;
      } else if (telegramId) {
        filter.telegramId = telegramId;
      }

      // Add date range filter if provided
      if (getLogsDto.startDate || getLogsDto.endDate) {
        filter.createdAt = {};
        if (getLogsDto.startDate) {
          filter.createdAt.$gte = new Date(getLogsDto.startDate);
        }
        if (getLogsDto.endDate) {
          filter.createdAt.$lte = new Date(getLogsDto.endDate);
        }
      }

      // Add search filter if provided (search in logData)
      if (getLogsDto.search) {
        filter.$or = [
          { 'logData.message': { $regex: getLogsDto.search, $options: 'i' } },
          { 'logData.error': { $regex: getLogsDto.search, $options: 'i' } },
          { 'logData.stack': { $regex: getLogsDto.search, $options: 'i' } },
        ];
      }

      // Set pagination defaults and convert to numbers
      const page = parseInt(getLogsDto.page) || 1;
      const limit = parseInt(getLogsDto.limit) || 10;
      const skip = (page - 1) * limit;

      // Execute query with pagination
      const [logs, totalCount] = await Promise.all([
        this.errorLogModel
          .find(filter)
          .sort({ createdAt: -1 }) // Sort by newest first
          .skip(skip)
          .limit(limit)
          .exec(),
        this.errorLogModel.countDocuments(filter).exec(),
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      return {
        data: logs,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage,
          hasPrevPage,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retrieve error logs',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get error log by ID with user ownership validation
   * @param req The authenticated request object
   * @param logId The ID of the log to retrieve
   * @returns The error log if found and owned by user
   */
  async getLogById(
    req: AuthenticatedRequest,
    logId: string,
  ): Promise<ErrorLog> {
    try {
      // Extract user authentication data
      const { userId, telegramId } = this.extractUserAuthData(req);

      // Build query filter based on authentication method
      const filter: any = { _id: logId };
      if (userId) {
        filter.userId = userId;
      } else if (telegramId) {
        filter.telegramId = telegramId;
      }

      // Find the log
      const log = await this.errorLogModel.findOne(filter).exec();

      if (!log) {
        throw new HttpException(
          'Error log not found or access denied',
          HttpStatus.NOT_FOUND,
        );
      }

      return log;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retrieve error log',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete error log by ID with user ownership validation
   * @param req The authenticated request object
   * @param logId The ID of the log to delete
   * @returns Success message
   */
  async deleteLog(
    req: AuthenticatedRequest,
    logId: string,
  ): Promise<{ message: string }> {
    try {
      // Extract user authentication data
      const { userId, telegramId } = this.extractUserAuthData(req);

      // Build query filter based on authentication method
      const filter: any = { _id: logId };
      if (userId) {
        filter.userId = userId;
      } else if (telegramId) {
        filter.telegramId = telegramId;
      }

      // Delete the log
      const result = await this.errorLogModel.deleteOne(filter).exec();

      if (result.deletedCount === 0) {
        throw new HttpException(
          'Error log not found or access denied',
          HttpStatus.NOT_FOUND,
        );
      }

      return { message: 'Error log deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to delete error log',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Admin method to get all logs with optional user filtering and pagination
   * No user restrictions - can access all logs
   */
  async getLogsForAdmin(
    adminGetLogsDto: AdminGetLogsDto,
  ): Promise<PaginatedLogsResponse> {
    try {
      const page = parseInt(adminGetLogsDto.page || '1', 10);
      const limit = parseInt(adminGetLogsDto.limit || '10', 10);
      const skip = (page - 1) * limit;

      // Build filter query
      const filter: any = {};

      // User filtering options for admin
      if (adminGetLogsDto.userId) {
        filter.userId = adminGetLogsDto.userId;
      }
      if (adminGetLogsDto.telegramId) {
        filter.telegramId = adminGetLogsDto.telegramId;
      }
      if (adminGetLogsDto.username) {
        filter.username = { $regex: adminGetLogsDto.username, $options: 'i' };
      }

      // Date filtering
      if (adminGetLogsDto.startDate || adminGetLogsDto.endDate) {
        filter.createdAt = {};
        if (adminGetLogsDto.startDate) {
          filter.createdAt.$gte = new Date(adminGetLogsDto.startDate);
        }
        if (adminGetLogsDto.endDate) {
          filter.createdAt.$lte = new Date(adminGetLogsDto.endDate);
        }
      }

      // Search in logData
      if (adminGetLogsDto.search) {
        filter.$or = [
          { 'logData.message': { $regex: adminGetLogsDto.search, $options: 'i' } },
          { 'logData.error': { $regex: adminGetLogsDto.search, $options: 'i' } },
          { 'logData.stack': { $regex: adminGetLogsDto.search, $options: 'i' } },
        ];
      }

      // Execute queries
      const [logs, totalCount] = await Promise.all([
        this.errorLogModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.errorLogModel.countDocuments(filter).exec(),
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        data: logs,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      throw new HttpException(
        'Failed to fetch logs for admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Admin method to get any log by ID without user restrictions
   */
  async getLogByIdForAdmin(logId: string): Promise<ErrorLog> {
    try {
      const log = await this.errorLogModel.findById(logId).exec();

      if (!log) {
        throw new HttpException('Log not found', HttpStatus.NOT_FOUND);
      }

      return log;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to fetch log for admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}