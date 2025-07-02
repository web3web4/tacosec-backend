import { teardownTestDatabase } from './test.utils';

module.exports = async () => {
  console.log('Tearing down test environment...');

  try {
    await teardownTestDatabase();
    console.log('Test environment teardown complete');
  } catch (error) {
    console.error('Error during test environment teardown:', error);
    process.exit(1);
  }
};
