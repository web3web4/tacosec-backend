import {
  IsOptional,
  IsString,
  IsDateString,
  IsNumberString,
} from 'class-validator';

export class GetLogsDto {
  @IsOptional()
  @IsNumberString()
  page?: string = '1';

  @IsOptional()
  @IsNumberString()
  limit?: string = '10';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export interface PaginatedLogsResponse {
  data: any[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    // Additional platform statistics for admin
    totalUsers?: number;
    activeUsers?: number;
    totalSecrets?: number;
    newToday?: number;
    totalViews?: number;
    viewsToday?: number;
    pendingReports?: number;
  };
}
