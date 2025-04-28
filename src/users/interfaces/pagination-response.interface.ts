export interface PaginationResponse<T> {
  data: T[];
  total: number;
  pages_count: number;
  current_page: number;
  limit: number;
}
