import { getConnectionToken } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';

export async function clearDatabase(app: INestApplication): Promise<void> {
  try {
    if (!app) {
      console.warn('App instance is undefined, cannot clear database');
      return;
    }

    const connection = app.get(getConnectionToken());
    const collections = connection.collections;

    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
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
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
    // Don't throw, allow tests to continue
  }
}

export async function setupTestDatabase(): Promise<void> {
  // Add any additional test database setup here
  // For example, creating indexes or setting up test data
  console.log('Setting up test database...');
}

export async function teardownTestDatabase(): Promise<void> {
  // Add any additional test database cleanup here
  console.log('Tearing down test database...');
}
