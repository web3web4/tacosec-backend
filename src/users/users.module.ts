import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { Password, PasswordSchema } from './schemas/password.schema';
import { PasswordService } from './password.service';
import { TelegramValidatorService } from './telegram-validator.service';
import { TelegramAuthGuard } from './guards/telegram-auth.guard';
import { TelegramDtoAuthGuard } from './guards/telegram-dto-auth.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Password.name, schema: PasswordSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    PasswordService,
    TelegramValidatorService,
    TelegramAuthGuard,
    TelegramDtoAuthGuard,
  ],
  exports: [UsersService, PasswordService, TelegramValidatorService],
})
export class UsersModule {}
