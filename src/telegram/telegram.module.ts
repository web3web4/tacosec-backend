import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedJwtModule } from '../shared/jwt.module';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramValidatorService } from './telegram-validator.service';
import { UsersModule } from '../users/users.module';
import { TelegramDtoAuthGuard } from './dto/telegram-dto-auth.guard';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    SharedJwtModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    forwardRef(() => UsersModule),
  ],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramValidatorService, TelegramDtoAuthGuard],
  exports: [TelegramService, TelegramValidatorService],
})
export class TelegramModule {}
