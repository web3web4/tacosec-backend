import { TelegramInitDto } from '../dto/telegram-init.dto';

export interface PasswordData {
  key: string;
  value: string;
  description?: string;
  initData: TelegramInitDto;
  isActive: boolean;
}
