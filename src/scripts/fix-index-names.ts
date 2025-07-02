/**
 * Utility script to fix index name discrepancy
 * This script drops the incorrect 'publicAddress' index and ensures 'publicKey' index exists
 * Run with: npx ts-node src/scripts/fix-index-names.ts
 */
import { connect } from 'mongoose';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function fixIndexes() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    const connection = await connect(MONGODB_URI);

    console.log('Connected. Checking existing indexes...');

    // Get the collection directly
    const publicAddressesCollection =
      connection.connection.collection('publicaddresses');

    // List existing indexes
    const indexes = await publicAddressesCollection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Check if publicAddress index exists and drop it
    const hasPublicAddressIndex = indexes.some(
      (idx) => idx.name === 'publicAddress_1',
    );
    if (hasPublicAddressIndex) {
      console.log('Dropping incorrect publicAddress index...');
      await publicAddressesCollection.dropIndex('publicAddress_1');
      console.log('Index dropped successfully.');
    } else {
      console.log('No incorrect publicAddress index found.');
    }

    // Check if publicKey index exists, if not create it
    const hasPublicKeyIndex = indexes.some((idx) => idx.name === 'publicKey_1');
    if (!hasPublicKeyIndex) {
      console.log('Creating publicKey index...');
      await publicAddressesCollection.createIndex(
        { publicKey: 1 },
        { unique: true, background: true },
      );
      console.log('publicKey index created successfully.');
    } else {
      console.log('publicKey index already exists.');
    }

    // Verify the indexes after changes
    const updatedIndexes = await publicAddressesCollection.indexes();
    console.log('Updated indexes:', JSON.stringify(updatedIndexes, null, 2));

    // Close the connection
    await connection.connection.close();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Error during index fix:', error);
  }
}

// Run the function
fixIndexes().catch(console.error);
