import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from './config/app-config.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuthContextService } from './services/auth-context.service';
import { TelegramValidatorService } from '../telegram/telegram-validator.service';
import { TelegramDtoAuthGuard } from '../guards/telegram-dto-auth.guard';

/**
 * Common Module
 * Provides shared utilities, DTOs, and services across the application
 *
 * This module is marked as @Global so its exports are available everywhere
 * without needing to import it in each module
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => ({
        secret: appConfig.jwtSecret,
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [
    AuthContextService,
    TelegramValidatorService,
    TelegramDtoAuthGuard,
  ],
  exports: [AuthContextService, TelegramValidatorService, TelegramDtoAuthGuard],
})
export class CommonModule {}
