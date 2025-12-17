import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedJwtModule } from '../shared/jwt.module';
import { Report, ReportSchema } from './schemas/report.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../guards/roles.guard';
import { Password, PasswordSchema } from '../passwords/schemas/password.schema';
import {
  PublicAddress,
  PublicAddressSchema,
} from '../public-addresses/schemas/public-address.schema';
import { PublicAddressesModule } from '../public-addresses/public-addresses.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: User.name, schema: UserSchema },
      { name: Password.name, schema: PasswordSchema },
      { name: PublicAddress.name, schema: PublicAddressSchema },
    ]),
    SharedJwtModule,
    forwardRef(() => TelegramModule),
    forwardRef(() => UsersModule),
    forwardRef(() => PublicAddressesModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => LoggerModule),
  ],
  controllers: [ReportController],
  providers: [ReportService, TelegramDtoAuthGuard, RolesGuard],
  exports: [ReportService],
})
export class ReportsModule {}
