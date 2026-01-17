import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigService } from '../config/app-config.service';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: async (appConfig: AppConfigService) => ({
        uri: appConfig.mongodbUri,
        maxPoolSize: 10,
        minPoolSize: 5,
        maxIdleTimeMS: 60000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      }),
      inject: [AppConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
