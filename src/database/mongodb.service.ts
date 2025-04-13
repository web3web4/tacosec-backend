import { Injectable, OnModuleInit } from '@nestjs/common';
import { MongoClient, Db, ServerApiVersion } from 'mongodb';

let cachedClient: MongoClient = null;
let cachedDb: Db = null;

@Injectable()
export class MongoDBService implements OnModuleInit {
  private client: MongoClient;
  private db: Db;

  async onModuleInit() {
    try {
      if (cachedClient && cachedDb) {
        this.client = cachedClient;
        this.db = cachedDb;
        return;
      }

      const uri = process.env.MONGODB_URI;
      if (!uri) {
        throw new Error('MONGODB_URI is not defined');
      }

      this.client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
        maxPoolSize: 1,
        minPoolSize: 1,
        connectTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        serverSelectionTimeoutMS: 5000,
        waitQueueTimeoutMS: 5000
      });

      await this.client.connect();
      this.db = this.client.db('user-management');

      // Test the connection
      await this.db.command({ ping: 1 });
      console.log("Connected to MongoDB");

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
    try {
      if (this.client && !cachedClient) {
        await this.client.close(true);
      }
    } catch (error) {
      console.error('Error closing MongoDB connection:', error);
    }
  }
} 