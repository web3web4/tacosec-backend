import { Module } from '@nestjs/common';
import { AppConfigService } from '../common/config/app-config.service';
import { CryptoUtil } from './crypto.util';

@Module({
  providers: [
    {
      provide: CryptoUtil,
      useFactory: (appConfig: AppConfigService) => {
        return new CryptoUtil(appConfig.encryptionKey);
      },
      inject: [AppConfigService],
    },
  ],
  exports: [CryptoUtil],
})
export class CryptoModule {}
