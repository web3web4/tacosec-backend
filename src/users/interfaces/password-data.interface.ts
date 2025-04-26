import { TelegramInitDto } from '../dto/telegram-init.dto';
import { Type } from '../enums/type.enum';
import { Types } from 'mongoose';
// import { Types } from 'mongoose';
export interface PasswordData {
  userId: Types.ObjectId;
  key: string;
  value: string;
  description?: string;
  initData: TelegramInitDto;
  isActive: boolean;
  type: Type;
  sharedWith?: string[];
}
