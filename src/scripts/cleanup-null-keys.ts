/**
 * Utility script to clean up public addresses with null public keys
 * Run with: npx ts-node src/scripts/cleanup-null-keys.ts
 */
import { connect } from 'mongoose';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function cleanup() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    const connection = await connect(MONGODB_URI);

    console.log(
      'Connected. Finding and removing public addresses with null publicKey...',
    );

    // Get the collection directly for more flexibility
    const publicAddressesCollection =
      connection.connection.collection('publicaddresses');

    // Find and remove documents with null publicKey
    const result = await publicAddressesCollection.deleteMany({
      $or: [
        { publicKey: null },
        { publicKey: '' },
        { publicKey: { $exists: false } },
      ],
    });

    console.log(`Cleanup complete. Removed ${result.deletedCount} documents.`);

    // Close the connection
    await connection.connection.close();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Run the cleanup function
cleanup().catch(console.error);
