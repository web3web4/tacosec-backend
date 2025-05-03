import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { Password, PasswordSchema } from '../passwords/schemas/password.schema';
import { TelegramAuthGuard } from '../guards/telegram-auth.guard';
import { TelegramDtoAuthGuard } from '../telegram/dto/telegram-dto-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { HttpModule } from '@nestjs/axios';
import { PasswordModule } from '../passwords/password.module';
import { TelegramValidatorService } from '../telegram/telegram-validator.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Password.name, schema: PasswordSchema },
    ]),
    ConfigModule,
    HttpModule,
    forwardRef(() => PasswordModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    TelegramAuthGuard,
    TelegramDtoAuthGuard,
    RolesGuard,
    TelegramValidatorService,
  ],
  exports: [UsersService, RolesGuard],
})
export class UsersModule {}
