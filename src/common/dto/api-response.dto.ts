/**
 * Standardized API Response DTOs
 * These DTOs ensure consistent response format across all endpoints
 */

/**
 * Generic API response wrapper
 * Used for all API responses to maintain consistency
 */
export class ApiResponseDto<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;

  constructor(data: T, success = true, message?: string) {
    this.success = success;
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Create a successful response
   */
  static success<T>(data: T, message?: string): ApiResponseDto<T> {
    return new ApiResponseDto(data, true, message);
  }

  /**
   * Create an error response
   */
  static error<T>(data: T, message: string): ApiResponseDto<T> {
    return new ApiResponseDto(data, false, message);
  }
}

/**
 * Paginated response wrapper
 * Used for endpoints that return lists with pagination
 */
export class PaginatedResponseDto<T> {
  success: boolean;
  data: T[];
  pagination: PaginationMeta;
  timestamp: string;

  constructor(data: T[], pagination: PaginationMeta) {
    this.success = true;
    this.data = data;
    this.pagination = pagination;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Create pagination metadata from query params and total count
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Response for bulk operations
 */
export class BulkOperationResponseDto<T> {
  success: boolean;
  data: T[];
  total: number;
  processed: number;
  failed: number;
  duplicatesSkipped?: number;
  message?: string;
  timestamp: string;

  constructor(
    data: T[],
    total: number,
    processed: number,
    failed = 0,
    duplicatesSkipped = 0,
    message?: string,
  ) {
    this.success = failed === 0;
    this.data = data;
    this.total = total;
    this.processed = processed;
    this.failed = failed;
    this.duplicatesSkipped = duplicatesSkipped;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }
}
