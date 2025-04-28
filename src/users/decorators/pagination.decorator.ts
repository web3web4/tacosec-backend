import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PaginationParams } from '../interfaces/pagination.interface';

export const Pagination = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): PaginationParams => {
    const request = ctx.switchToHttp().getRequest();
    const page = parseInt(request.query.page as string) || 1;
    const limit = parseInt(request.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    return {
      page,
      limit,
      skip,
    };
  },
);
