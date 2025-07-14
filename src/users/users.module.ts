import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedJwtModule } from '../shared/jwt.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { Password, PasswordSchema } from '../passwords/schemas/password.schema';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { HttpModule } from '@nestjs/axios';
import { PasswordModule } from '../passwords/password.module';
import { TelegramValidatorService } from '../telegram/telegram-validator.service';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from '../telegram/telegram.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Password.name, schema: PasswordSchema },
    ]),
    SharedJwtModule,
    ConfigModule,
    HttpModule,
    forwardRef(() => PasswordModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => ReportsModule),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    TelegramDtoAuthGuard,
    RolesGuard,
    TelegramValidatorService,
  ],
  exports: [UsersService, RolesGuard],
})
export class UsersModule {}
