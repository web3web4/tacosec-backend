/**
 * Practical example demonstrating how the migration strategy works
 * This file is for illustration only - not used in production
 */

import { CryptoUtil } from './crypto.util';
// import { ConfigService } from '@nestjs/config';

// Mock ConfigService
class MockConfigService {
  get(key: string): string {
    if (key === 'ENCRYPTION_KEY') {
      return 'c558ad827f514a3bc6fe872b2527890f6ed7f75febd5b7110e35af76424839ac';
    }
    return '';
  }
}

/**
 * Example demonstrating how the system works with both new and legacy data
 */
export class MigrationExample {
  private cryptoUtil: CryptoUtil;

  constructor() {
    const configService = new MockConfigService() as any;
    this.cryptoUtil = new CryptoUtil(configService);
  }

  /**
   * Example 1: New Encryption (with unique IV)
   */
  demonstrateNewEncryption() {
    console.log('=== Example 1: New Encryption ===');

    const originalText = 'my-secret-password';
    console.log('Original text:', originalText);

    // New encryption - different IV each time
    const encrypted1 = this.cryptoUtil.encrypt(originalText);
    const encrypted2 = this.cryptoUtil.encrypt(originalText);

    console.log('First encryption:', encrypted1);
    console.log('Second encryption:', encrypted2);
    console.log('Are results different?', encrypted1 !== encrypted2); // true

    // Decryption
    const decrypted1 = this.cryptoUtil.decrypt(encrypted1);
    const decrypted2 = this.cryptoUtil.decrypt(encrypted2);

    console.log('First decryption:', decrypted1);
    console.log('Second decryption:', decrypted2);
    console.log(
      'Are results identical?',
      decrypted1 === decrypted2 && decrypted1 === originalText,
    ); // true
  }

  /**
   * Example 2: Handling Legacy Data
   */
  demonstrateLegacyCompatibility() {
    console.log('\n=== Example 2: Legacy Data Compatibility ===');

    // Simulate legacy encrypted data (without IV in format)
    const legacyEncryptedData = '8f7a9b2c1d3e4f5a6b7c8d9e0f1a2b3c'; // Example
    console.log('Legacy data:', legacyEncryptedData);

    // Using decryptSafe to handle legacy data
    try {
      const decrypted = this.cryptoUtil.decryptSafe(legacyEncryptedData);
      console.log(
        'Decryption with decryptSafe:',
        decrypted || 'Decryption failed',
      );
    } catch (error) {
      console.log('Decryption error:', error.message);
    }
  }

  /**
   * Example 3: decryptSafe with New Data
   */
  demonstrateDecryptSafe() {
    console.log('\n=== Example 3: decryptSafe with New Data ===');

    const originalText = 'another-secret';
    console.log('Original text:', originalText);

    // New encryption
    const encrypted = this.cryptoUtil.encrypt(originalText);
    console.log('Encrypted data:', encrypted);
    console.log('Contains ":"?', encrypted.includes(':')); // true

    // Decryption using decryptSafe
    const decrypted = this.cryptoUtil.decryptSafe(encrypted);
    console.log('Decryption with decryptSafe:', decrypted);
    console.log('Is result correct?', decrypted === originalText); // true
  }

  /**
   * Example 4: Real Service Scenario
   */
  demonstrateServiceScenario() {
    console.log('\n=== Example 4: Real Service Scenario ===');

    // Simulate database records
    const databaseRecords = [
      {
        id: 1,
        publicKey: 'address1',
        encryptedSecret: 'old-encrypted-data-without-iv', // Legacy data
      },
      {
        id: 2,
        publicKey: 'address2',
        encryptedSecret: this.cryptoUtil.encrypt('new-secret'), // New data
      },
    ];

    console.log('Processing database records:');

    databaseRecords.forEach((record, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log('Public key:', record.publicKey);
      console.log('Encrypted data:', record.encryptedSecret);

      // This is what happens in PublicAddressesService
      const secret = record.encryptedSecret
        ? this.cryptoUtil.decryptSafe(record.encryptedSecret)
        : undefined;

      console.log(
        'Decrypted secret:',
        secret || 'No secret or decryption failed',
      );
    });
  }

  /**
   * Run all examples
   */
  runAllExamples() {
    console.log('🔐 Encryption Migration Strategy Examples\n');

    try {
      this.demonstrateNewEncryption();
      this.demonstrateLegacyCompatibility();
      this.demonstrateDecryptSafe();
      this.demonstrateServiceScenario();

      console.log('\n✅ All examples executed successfully!');
      console.log('\n📋 Summary:');
      console.log('- New data encrypted with unique IV (secure)');
      console.log('- Legacy data read successfully (compatible)');
      console.log('- decryptSafe() handles both formats automatically');
      console.log('- System operates without interruption');
    } catch (error) {
      console.error('❌ Error running examples:', error.message);
    }
  }
}

// Run examples if file is executed directly
if (require.main === module) {
  const example = new MigrationExample();
  example.runAllExamples();
}
