import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PasswordService } from './password.service';
import { PasswordController } from './password.controller';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Password, PasswordSchema } from './schemas/password.schema';
import { TelegramDtoAuthGuard } from '../telegram/dto/telegram-dto-auth.guard';
import { HttpModule } from '@nestjs/axios';
import { TelegramValidatorService } from '../telegram/telegram-validator.service';
import { UsersModule } from '../users/users.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Password.name, schema: PasswordSchema },
    ]),
    ConfigModule,
    HttpModule,
    forwardRef(() => UsersModule),
  ],
  controllers: [PasswordController],
  providers: [PasswordService, TelegramDtoAuthGuard, TelegramValidatorService],
  exports: [PasswordService],
})
export class PasswordModule {}
