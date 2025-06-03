import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CryptoUtil } from './crypto.util';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CryptoUtil,
      useFactory: (configService: ConfigService) => {
        return new CryptoUtil(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [CryptoUtil],
})
export class CryptoModule {}
