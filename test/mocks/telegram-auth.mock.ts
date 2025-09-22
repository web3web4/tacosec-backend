import { Injectable } from '@nestjs/common';
import { TelegramDtoAuthGuard } from '../../src/guards/telegram-dto-auth.guard';
import { TelegramValidatorService } from '../../src/telegram/telegram-validator.service';
import { TelegramInitDto } from '../../src/telegram/dto/telegram-init.dto';

@Injectable()
export class MockTelegramValidatorService {
  validateTelegramInitData(initData: string): boolean {
    return true;
  }

  validateTelegramDto(data: TelegramInitDto): boolean {
    return true;
  }
}

@Injectable()
export class MockTelegramDtoAuthGuard {
  constructor() {}

  canActivate(): boolean {
    return true;
  }

  parseTelegramInitData(initData: string): TelegramInitDto {
    return {
      telegramId: '123456789',
      firstName: 'Test',
      lastName: 'User',
      username: 'testuser',
      authDate: Math.floor(Date.now() / 1000),
      hash: 'test-hash',
    };
  }
}

export const mockTelegramProviders = [
  {
    provide: TelegramValidatorService,
    useClass: MockTelegramValidatorService,
  },
  {
    provide: TelegramDtoAuthGuard,
    useClass: MockTelegramDtoAuthGuard,
  },
];
