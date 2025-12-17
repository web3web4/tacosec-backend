import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '../common/config/app-config.service';
import { LoggerController } from './logger.controller';
import { LoggerService } from './logger.service';
import { ErrorLog, ErrorLogSchema } from './schemas/error-log.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Password, PasswordSchema } from '../passwords/schemas/password.schema';
import { Report, ReportSchema } from '../reports/schemas/report.schema';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';
import { FlexibleAuthGuard } from '../guards/flexible-auth.guard';
import { TelegramValidatorService } from '../telegram/telegram-validator.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    // Register ErrorLog schema for MongoDB
    MongooseModule.forFeature([
      { name: ErrorLog.name, schema: ErrorLogSchema },
      { name: User.name, schema: UserSchema }, // Required for authentication guards
      { name: Password.name, schema: PasswordSchema },
      { name: Report.name, schema: ReportSchema },
    ]),
    // JWT module for token verification
    JwtModule.registerAsync({
      useFactory: async (appConfig: AppConfigService) => ({
        secret: appConfig.jwtSecret,
        signOptions: {
          expiresIn: appConfig.jwtExpiresIn,
        },
      }),
      inject: [AppConfigService],
    }),
    // Import UsersModule to access UsersService for RolesGuard
    forwardRef(() => UsersModule),
  ],
  controllers: [LoggerController],
  providers: [
    LoggerService,
    TelegramDtoAuthGuard,
    FlexibleAuthGuard,
    TelegramValidatorService,
    // RolesGuard is now available through UsersModule import
  ],
  exports: [LoggerService], // Export service for use in other modules if needed
})
export class LoggerModule {}
