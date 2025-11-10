/**
 * Migration script to rename notification field 'status' to 'telegramStatus'.
 * It copies the value from 'status' to 'telegramStatus' for existing documents,
 * then removes the old 'status' field.
 *
 * Run with: npx ts-node src/scripts/migrate-notification-status.ts
 */
import { connect } from 'mongoose';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

async function migrate() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI environment variable is not set');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    const connection = await connect(MONGODB_URI);

    console.log('Connected. Migrating notifications status to telegramStatus...');

    const notificationsCollection =
      connection.connection.collection('notifications');

    // Only process documents that still have the old 'status' and lack 'telegramStatus'
    const filter = {
      telegramStatus: { $exists: false },
      status: { $exists: true },
    } as any;

    // Use pipeline update to set telegramStatus from existing status and then remove status
    const result = await notificationsCollection.updateMany(filter, [
      { $set: { telegramStatus: '$status' } },
      { $unset: 'status' },
    ]);

    console.log(
      `Migration complete. Matched ${result.matchedCount}, modified ${result.modifiedCount} documents.`,
    );

    await connection.connection.close();
    console.log('Connection closed.');
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

// Run the migration
migrate().catch(console.error);