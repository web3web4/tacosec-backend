import {
  PipeTransform,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';

@Injectable()
export class TelegramUserExistsPipe implements PipeTransform {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async transform(value: any) {
    // Check if the value is a valid telegram ID format
    if (!value || typeof value !== 'string') {
      throw new BadRequestException('Invalid telegram ID format');
    }

    // Check if telegram ID contains only numbers
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('Telegram ID must contain only numbers');
    }

    // Check if user exists in database
    const user = await this.userModel
      .findOne({ telegramId: value, isActive: true })
      .exec();

    if (!user) {
      throw new NotFoundException(
        `User with telegram ID ${value} not found or inactive`,
      );
    }

    return value;
  }
}
