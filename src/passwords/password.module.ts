import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedJwtModule } from '../shared/jwt.module';
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
import { ConfigModule } from '@nestjs/config';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Password.name, schema: PasswordSchema },
      { name: Report.name, schema: ReportSchema },
      { name: PublicAddress.name, schema: PublicAddressSchema },
    ]),
    SharedJwtModule,
    ConfigModule,
    HttpModule,
    forwardRef(() => UsersModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => ReportsModule),
  ],
  controllers: [PasswordController],
  providers: [PasswordService, TelegramDtoAuthGuard],
  exports: [PasswordService],
})
export class PasswordModule {}
