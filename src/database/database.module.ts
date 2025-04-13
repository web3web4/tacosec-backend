import { Module } from '@nestjs/common';
import { MongoDBService } from './mongodb.service';

@Module({
  providers: [MongoDBService],
  exports: [MongoDBService],
})
export class DatabaseModule {} 