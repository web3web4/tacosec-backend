import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from './schemas/report.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { TelegramDtoAuthGuard } from '../telegram/dto/telegram-dto-auth.guard';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../guards/roles.guard';
import { ConfigModule } from '@nestjs/config';
import {
  PublicAddress,
  PublicAddressSchema,
} from '../public-addresses/schemas/public-address.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: User.name, schema: UserSchema },
      { name: PublicAddress.name, schema: PublicAddressSchema },
    ]),
    forwardRef(() => TelegramModule),
    forwardRef(() => UsersModule),
    ConfigModule,
  ],
  controllers: [ReportController],
  providers: [ReportService, TelegramDtoAuthGuard, RolesGuard],
  exports: [ReportService],
})
export class ReportsModule {}
