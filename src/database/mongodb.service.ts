import { Injectable, OnModuleInit } from '@nestjs/common';
import { MongoClient, Db, ServerApiVersion } from 'mongodb';
import { AppConfigService } from '../common/config/app-config.service';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

@Injectable()
export class MongoDBService implements OnModuleInit {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  constructor(private readonly appConfig: AppConfigService) {}

  async onModuleInit() {
    try {
      if (cachedClient && cachedDb) {
        this.client = cachedClient;
        this.db = cachedDb;
        return;
      }

      const uri = this.appConfig.mongodbUri;
      if (!uri) {
        console.error('MONGODB_URI is not defined');
        return;
      }

      this.client = await MongoClient.connect(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: false,
          deprecationErrors: false,
        },
        maxPoolSize: 10,
        minPoolSize: 5,
        maxIdleTimeMS: 60000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });

      this.db = this.client.db('user-management');

      // Cache the connection
      cachedClient = this.client;
      cachedDb = this.db;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      // Don't throw the error, just log it
    }
  }

  getDatabase(): Db {
    if (!this.db) {
      throw new Error('Database connection not established');
    }
    return this.db;
  }

  async onModuleDestroy() {
    try {
      if (this.client && !cachedClient) {
        await this.client.close();
      }
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }
}
