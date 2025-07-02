/**
 * Utility script to generate a new encryption key
 * Run with: npx ts-node src/utils/generate-key.ts
 */
import { CryptoUtil } from './crypto.util';

console.log('Generating a new encryption key...');
const key = CryptoUtil.generateEncryptionKey();
console.log('\nAdd this key to your .env file:');
console.log('\nENCRYPTION_KEY=' + key);
console.log('\nThis key will be used to encrypt and decrypt secrets.');
