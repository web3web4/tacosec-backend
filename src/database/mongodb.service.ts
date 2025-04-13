import { Injectable, OnModuleInit } from '@nestjs/common';
import { MongoClient, Db, ServerApiVersion } from 'mongodb';

@Injectable()
export class MongoDBService implements OnModuleInit {
  private client: MongoClient;
  private db: Db;

  async onModuleInit() {
    const uri = process.env.MONGODB_URI;
    this.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });
    await this.client.connect();
    this.db = this.client.db('user-management');
  }

  getDatabase(): Db {
    return this.db;
  }

  async onModuleDestroy() {
    await this.client.close();
  }
} 