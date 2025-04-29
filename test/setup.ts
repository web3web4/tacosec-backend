import { setupTestDatabase } from './test.utils';
import * as dotenv from 'dotenv';

module.exports = async () => {
  console.log('Setting up test environment...');

  // Load test environment variables
  dotenv.config({ path: '.env.test' });
  process.env.NODE_ENV = 'test';

  // Setup test database
  await setupTestDatabase();

  console.log('Test environment setup complete');
};
