import { Injectable, OnModuleInit } from '@nestjs/common';
import { MongoClient, Db, ServerApiVersion } from 'mongodb';

let cachedClient = null;
let cachedDb = null;

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
    this.client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      maxPoolSize: 1,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 5000
    });

    try {
      await this.client.connect();
      this.db = this.client.db('user-management');
      
      // Cache the client and db connection
      cachedClient = this.client;
      cachedDb = this.db;
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  getDatabase(): Db {
    return this.db;
  }

  async onModuleDestroy() {
    if (this.client && !cachedClient) {
      await this.client.close();
    }
  }
} 