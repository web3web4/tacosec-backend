import { getConnectionToken } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';

export async function clearDatabase(app: INestApplication): Promise<void> {
  try {
    const connection = app.get(getConnectionToken());
    const collections = connection.collections;

    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  } catch (error) {
    console.error('Error clearing database:', error);
    throw error;
  }
}

export async function closeDatabaseConnection(
  app: INestApplication,
): Promise<void> {
  try {
    const connection = app.get(getConnectionToken());
    if (connection.readyState === 1) {
      // 1 = connected
      await connection.close();
    }
  } catch (error) {
    console.error('Error closing database connection:', error);
    throw error;
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
