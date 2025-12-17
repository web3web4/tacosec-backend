import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedJwtModule } from '../common/jwt/jwt.module';
import { PasswordService } from './password.service';
import { PasswordController } from './password.controller';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Password, PasswordSchema } from './schemas/password.schema';
import { Report, ReportSchema } from '../reports/schemas/report.schema';
import {
  PublicAddress,
  PublicAddressSchema,
} from '../public-addresses/schemas/public-address.schema';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { HttpModule } from '@nestjs/axios';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { ReportsModule } from '../reports/reports.module';
import { PublicAddressesModule } from '../public-addresses/public-addresses.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoggerModule } from '../logger/logger.module';

// Sub-services for better code organization
import { PasswordCrudService } from './services/password-crud.service';
import { PasswordQueryService } from './services/password-query.service';
import { PasswordSharingService } from './services/password-sharing.service';
import { PasswordNotificationService } from './services/password-notification.service';
import { PasswordViewsService } from './services/password-views.service';
import { PasswordServiceFacade } from './password-service.facade';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Password.name, schema: PasswordSchema },
      { name: Report.name, schema: ReportSchema },
      { name: PublicAddress.name, schema: PublicAddressSchema },
    ]),
    SharedJwtModule,
    HttpModule,
    forwardRef(() => UsersModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => ReportsModule),
    forwardRef(() => PublicAddressesModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => LoggerModule),
  ],
  controllers: [PasswordController],
  providers: [
    // Original service (maintained for backward compatibility)
    PasswordService,
    TelegramDtoAuthGuard,

    // New sub-services for better code organization
    PasswordCrudService,
    PasswordQueryService,
    PasswordSharingService,
    PasswordNotificationService,
    PasswordViewsService,
    PasswordServiceFacade,
  ],
  exports: [
    PasswordService,
    // Export sub-services for direct use if needed
    PasswordCrudService,
    PasswordQueryService,
    PasswordSharingService,
    PasswordNotificationService,
    PasswordViewsService,
    PasswordServiceFacade,
  ],
})
export class PasswordModule { }
