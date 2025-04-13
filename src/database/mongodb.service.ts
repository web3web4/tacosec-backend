import { Injectable, OnModuleInit } from '@nestjs/common';
import { MongoClient, Db, ServerApiVersion } from 'mongodb';

let cachedClient: MongoClient = null;
let cachedDb: Db = null;

@Injectable()
export class MongoDBService implements OnModuleInit {
  private client: MongoClient;
  private db: Db;

  async onModuleInit() {
    if (cachedClient && cachedDb) {
      this.client = cachedClient;
      this.db = cachedDb;
      return;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not defined');
    }

    try {
      this.client = await MongoClient.connect(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
        maxPoolSize: 1,
        minPoolSize: 1,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000,
        waitQueueTimeoutMS: 10000
      });

      this.db = this.client.db('user-management');
      await this.db.command({ ping: 1 });

      cachedClient = this.client;
      cachedDb = this.db;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  getDatabase(): Db {
    if (!this.db) {
      throw new Error('Database connection not established');
    }
    return this.db;
  }

  async onModuleDestroy() {
    if (this.client && !cachedClient) {
      await this.client.close(true);
    }
  }
} 