import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  // HttpException,
  // HttpStatus,
  Request,
} from '@nestjs/common';

// Extend Request interface to include user property
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    telegramId: string;
    username: string;
    firstName: string;
    lastName: string;
    [key: string]: any;
  };
}
import { PasswordService } from './password.service';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';

import { TelegramDtoAuth } from '../decorators/telegram-dto-auth.decorator';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { TelegramService } from '../telegram/telegram.service';
// import { Types } from 'mongoose';
// import { VerifyPasswordData } from './interfaces/verify-password.interface';
import { Password } from './schemas/password.schema';

@Controller('passwords')
export class PasswordController {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly telegramDtoAuthGuard: TelegramDtoAuthGuard,
    private readonly telegramService: TelegramService,
  ) {}

  @Post()
  @TelegramDtoAuth(true)
  createPassword(
    @Body() createPasswordDto: CreatePasswordRequestDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.passwordService.addPassword(createPasswordDto, req);
  }

  @Patch(':id')
  @TelegramDtoAuth(true)
  updatePassword(
    @Param('id') id: string,
    @Body() body: Partial<Password>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.passwordService.updatePasswordWithAuth(id, body, req);
  }

  @Get()
  @TelegramDtoAuth(true)
  getUserPasswords(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Parse pagination parameters if provided
    const pageNumber = page ? parseInt(page, 10) : undefined;
    const limitNumber = limit ? parseInt(limit, 10) : undefined;

    // Use the service method that handles authentication logic
    return this.passwordService.getUserPasswordsWithAuth(
      req,
      pageNumber,
      limitNumber,
    );
  }

  @Get('shared-with')
  @TelegramDtoAuth(true)
  getUserBySharedWith(
    @Request() req: AuthenticatedRequest,
    @Body() body: { key: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Parse pagination parameters if provided
    const pageNumber = page ? parseInt(page, 10) : undefined;
    const limitNumber = limit ? parseInt(limit, 10) : undefined;

    return this.passwordService.getSharedWithByAuth(
      req,
      body.key,
      pageNumber,
      limitNumber,
    );
  }

  @Get('shared-with-me')
  @TelegramDtoAuth(true)
  getPasswordsSharedWithMe(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const username = this.passwordService.extractUsernameFromRequest(req);

    // Parse pagination parameters if provided
    const pageNumber = page ? parseInt(page, 10) : undefined;
    const limitNumber = limit ? parseInt(limit, 10) : undefined;

    // Use pagination-enabled method
    return this.passwordService.findPasswordsSharedWithMeWithPagination(
      username,
      pageNumber,
      limitNumber,
    );
  }

  @Delete(':id')
  @TelegramDtoAuth(true)
  remove(@Param('id') id: string) {
    return this.passwordService.delete(id);
  }

  @Delete('owner/:id')
  @TelegramDtoAuth(true)
  deleteByOwner(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.passwordService.deletePasswordByOwnerWithAuth(req, id);
  }

  @Patch('hide/:id')
  @TelegramDtoAuth(true)
  hidePassword(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    // If JWT token exists, use userId; otherwise use telegramId
    if (req?.user && req.user.id) {
      return this.passwordService.hidePasswordByUserId(id, req.user.id);
    } else {
      const telegramId = this.passwordService.extractTelegramIdFromRequest(req);
      return this.passwordService.hidePassword(id, telegramId);
    }
  }

  @Get('children/:parentId')
  @TelegramDtoAuth(true)
  getChildPasswords(
    @Param('parentId') parentId: string,
    @Query('page') page: string = '1',
    @Query('secret_count') secretCount: string = '10',
    @Request() req: AuthenticatedRequest,
  ) {
    const pageNumber = parseInt(page, 10) || 1;
    const limit = parseInt(secretCount, 10) || 10;

    return this.passwordService.getChildPasswordsWithAuth(
      req,
      parentId,
      pageNumber,
      limit,
    );
  }

  // @Post('verify')
  // @TelegramDtoAuth()
  // async verifyPassword(
  //   @Body() verifyData: { userId: string } & VerifyPasswordData,
  // ) {
  //   const password = await this.passwordService.findByUserId(
  //     new Types.ObjectId(verifyData.userId),
  //   );
  //   const targetPassword = password.find(
  //     (p) => p._id.toString() === verifyData.passwordId,
  //   );

  //   if (!targetPassword) {
  //     throw new HttpException('Password not found', HttpStatus.NOT_FOUND);
  //   }

  //   const hashedPassword = targetPassword.value;

  //   if (!hashedPassword) {
  //     throw new HttpException('Password type not found', HttpStatus.NOT_FOUND);
  //   }

  //   const isValid = await this.passwordService.verifyPassword(
  //     hashedPassword,
  //     verifyData.password,
  //   );

  //   return { isValid };
  // }
}
