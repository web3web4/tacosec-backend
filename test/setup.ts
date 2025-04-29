import { setupTestDatabase } from './test.utils';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

module.exports = async () => {
  console.log('Setting up test environment...');

  // Load test environment variables
  const envTestPath = path.resolve(process.cwd(), '.env.test');
  const envPath = path.resolve(process.cwd(), '.env');

  if (fs.existsSync(envTestPath)) {
    console.log('.env.test file found, loading environment variables');
    dotenv.config({ path: envTestPath });
  } else if (fs.existsSync(envPath)) {
    console.log('.env file found, loading environment variables');
    dotenv.config({ path: envPath });
  } else {
    console.log('No .env files found, using default environment variables');
    // Set default test environment variables if no env files exist
    process.env.MONGODB_URI =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/taco-test';
    process.env.TELEGRAM_BOT_TOKEN =
      process.env.TELEGRAM_BOT_TOKEN || 'test-token';
  }

  process.env.NODE_ENV = 'test';

  // Log environment variables for debugging
  console.log(`MONGODB_URI: ${process.env.MONGODB_URI}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);

  // Setup test database
  await setupTestDatabase();

  console.log('Test environment setup complete');
};
