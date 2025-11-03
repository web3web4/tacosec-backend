import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedJwtModule } from '../shared/jwt.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User, UserSchema } from './schemas/user.schema';
import { Password, PasswordSchema } from '../passwords/schemas/password.schema';
import {
  PublicAddress,
  PublicAddressSchema,
} from '../public-addresses/schemas/public-address.schema';
import { Report, ReportSchema } from '../reports/schemas/report.schema';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { FlexibleAuthGuard } from '../guards/flexible-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { HttpModule } from '@nestjs/axios';
import { PasswordModule } from '../passwords/password.module';
import { TelegramValidatorService } from '../telegram/telegram-validator.service';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from '../telegram/telegram.module';
import { ReportsModule } from '../reports/reports.module';
import { PublicAddressesModule } from '../public-addresses/public-addresses.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Password.name, schema: PasswordSchema },
      { name: PublicAddress.name, schema: PublicAddressSchema },
      { name: Report.name, schema: ReportSchema },
    ]),
    SharedJwtModule,
    ConfigModule,
    HttpModule,
    forwardRef(() => PasswordModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => ReportsModule),
    forwardRef(() => PublicAddressesModule),
    NotificationsModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    TelegramDtoAuthGuard,
    FlexibleAuthGuard,
    RolesGuard,
    TelegramValidatorService,
  ],
  exports: [UsersService, RolesGuard],
})
export class UsersModule {}
