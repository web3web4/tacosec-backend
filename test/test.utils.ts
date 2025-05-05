import { getConnectionToken } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';
import * as mongoose from 'mongoose';

export async function clearDatabase(app: INestApplication): Promise<void> {
  try {
    if (!app) {
      console.warn('App instance is undefined, cannot clear database');
      return;
    }

    const connection = app.get(getConnectionToken());
    if (!connection) {
      console.warn('Database connection not found');
      return;
    }

    const collections = connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
    console.log('Database cleared successfully');
  } catch (error) {
    console.error('Error clearing database:', error);
    // Don't throw, allow tests to continue
  }
}

export async function closeDatabaseConnection(
  app: INestApplication,
): Promise<void> {
  try {
    if (!app) {
      console.warn(
        'App instance is undefined, cannot close database connection',
      );
      return;
    }

    const connection = app.get(getConnectionToken());
    if (connection && connection.readyState === 1) {
      // 1 = connected
      await connection.close();
      console.log('Database connection closed successfully');
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
    // Don't throw, allow tests to continue
  }
}

export async function setupTestDatabase(): Promise<void> {
  try {
    // Make sure any existing connections are closed
    await mongoose.disconnect();
    
    // Connect to the test database if not already connected
    if (mongoose.connection.readyState !== 1) {
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/taco-test';
      await mongoose.connect(uri);
      console.log(`Connected to test database: ${uri}`);
    }
    
    // Clear all collections
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    
    console.log('Test database setup complete');
  } catch (error) {
    console.error('Error setting up test database:', error);
    throw error; // Fail test setup if database connection fails
  }
}

export async function teardownTestDatabase(): Promise<void> {
  try {
    // Close any open MongoDB connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('Test database connection closed');
    }
  } catch (error) {
    console.error('Error tearing down test database:', error);
    throw error;
  }
}
