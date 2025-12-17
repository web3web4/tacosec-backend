import { config } from 'dotenv';
import * as mongoose from 'mongoose';
import { disconnect } from 'mongoose';

// Load environment variables from .env file
config();

export default async function setup() {
  try {
    // Set encryption key for testing if not already set
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing';
    }

    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-jwt-secret';
    }

    // Connect to the database - use regular connection instead of in-memory for CI
    const uri =
      process.env.MONGODB_URI || 'mongodb://localhost:27017/taco-test';
    await mongoose.connect(uri);
  } catch (error) {
    console.error('Error in test setup:', error);
  }
}

// Add a global teardown function to close resources properly
global.afterAll(async () => {
  try {
    // Disconnect from MongoDB
    await disconnect();

    // Add a small delay to ensure all resources are properly released
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    console.error('Error in test teardown:', error);
  }
});
