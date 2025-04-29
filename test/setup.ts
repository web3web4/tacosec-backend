import { setupTestDatabase } from './test.utils';

module.exports = async () => {
  console.log('Setting up test environment...');

  // Load test environment variables

  process.env.NODE_ENV = 'test';

  // Setup test database
  await setupTestDatabase();

  console.log('Test environment setup complete');
};
