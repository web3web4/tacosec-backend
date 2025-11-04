import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerController } from './logger.controller';
import { LoggerService } from './logger.service';
import { ErrorLog, ErrorLogSchema } from './schemas/error-log.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
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
    ]),
    // JWT module for token verification
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '24h'),
        },
      }),
      inject: [ConfigService],
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
