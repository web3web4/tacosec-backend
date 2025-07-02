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
import { PasswordService } from './password.service';
import { CreatePasswordRequestDto } from './dto/create-password-request.dto';
import { LinkPasswordsDto } from './dto/link-passwords.dto';
import { TelegramDtoAuth } from '../decorators/telegram-dto-auth.decorator';
import { TelegramDtoAuthGuard } from '../telegram/dto/telegram-dto-auth.guard';
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
  @TelegramDtoAuth()
  createPassword(@Body() createPasswordDto: CreatePasswordRequestDto) {
    return this.passwordService.addPassword(createPasswordDto);
  }

  @Patch(':id')
  @TelegramDtoAuth()
  updatePassword(@Param('id') id: string, @Body() body: Partial<Password>) {
    return this.passwordService.findByIdAndUpdate(id, body);
  }

  @Get()
  @TelegramDtoAuth()
  getUserPasswords(@Request() req: Request) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.passwordService.findByUserTelegramId(teleDtoData.telegramId);
  }

  @Get('shared-with')
  @TelegramDtoAuth()
  getUserBySharedWith(@Request() req: Request, @Body() body: { key: string }) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.passwordService.findSharedWithByTelegramId(
      teleDtoData.telegramId,
      body.key,
    );
  }

  @Get('shared-with-me')
  @TelegramDtoAuth()
  getPasswordsSharedWithMe(@Request() req: Request) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.passwordService.findPasswordsSharedWithMe(teleDtoData.username);
  }

  @Delete(':id')
  @TelegramDtoAuth()
  remove(@Param('id') id: string) {
    return this.passwordService.delete(id);
  }

  @Delete('owner/:id')
  @TelegramDtoAuth()
  deleteByOwner(@Param('id') id: string, @Request() req: Request) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.passwordService.deletePasswordByOwner(
      id,
      teleDtoData.telegramId,
    );
  }

  @Patch('hide/:id')
  @TelegramDtoAuth()
  hidePassword(@Param('id') id: string, @Request() req: Request) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.passwordService.hidePassword(id, teleDtoData.telegramId);
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

  /**
   * Generate a unique threadId for a password
   * POST /passwords/:id/generate-thread-id
   */
  @Post(':id/generate-thread-id')
  @TelegramDtoAuth()
  generateThreadId(@Param('id') id: string, @Request() req: Request) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.passwordService.generateThreadId(id, teleDtoData.telegramId);
  }

  /**
   * Link two passwords by unifying their threadId
   * POST /passwords/link
   * Body: { password1Id: string, password2Id: string }
   */
  @Post('link')
  @TelegramDtoAuth()
  linkPasswords(@Body() linkData: LinkPasswordsDto, @Request() req: Request) {
    const teleDtoData = this.telegramDtoAuthGuard.parseTelegramInitData(
      req.headers['x-telegram-init-data'],
    );
    return this.passwordService.linkPasswords(
      linkData.password1Id,
      linkData.password2Id,
      teleDtoData.telegramId,
    );
  }

  /**
   * Get all passwords that share the same threadId
   * GET /passwords/thread/:threadId?sortOrder=asc|desc
   */
  @Get('thread/:threadId')
  @TelegramDtoAuth()
  getPasswordsByThreadId(
    @Param('threadId') threadId: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.passwordService.getPasswordsByThreadId(
      threadId,
      sortOrder || 'asc',
    );
  }
}
