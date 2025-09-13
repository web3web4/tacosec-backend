import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

/**
 * Default encryption key to use if none is provided in the environment
 * In production, you should ALWAYS override this with your own key
 */
// const DEFAULT_ENCRYPTION_KEY =
//   'c558ad827f514a3bc6fe872b2527890f6ed7f75febd5b7110e35af76424839ac';

/**
 * Utility class for encryption and decryption of sensitive data
 */
export class CryptoUtil {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    // Get encryption key from environment or throw error
    const encryptionKey = this.configService?.get<string>('ENCRYPTION_KEY');

    if (!encryptionKey) {
      console.error('ENCRYPTION_KEY is not defined in environment variables');
      throw new Error(
        'ENCRYPTION_KEY is not configured. Please set this environment variable.',
      );
    }

    // Create a buffer from the hex string key
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  /**
   * Encrypts a string with a unique IV for each encryption
   * @param text Plain text to encrypt
   * @returns Encrypted text with IV prepended in hex format (IV:EncryptedData)
   */
  encrypt(text: string): string {
    if (!text) return '';

    // Generate a unique random IV for each encryption
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Prepend IV to encrypted data (IV:EncryptedData)
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypts a string that was encrypted with a unique IV
   * @param encryptedText Encrypted text with IV prepended in hex format (IV:EncryptedData)
   * @returns Decrypted plain text
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText) return '';

    try {
      // Split IV and encrypted data
      const parts = encryptedText.split(':');
      if (parts.length !== 2) {
        throw new Error(
          'Invalid encrypted data format. Expected IV:EncryptedData',
        );
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return ''; // Return empty string on error
    }
  }

  /**
   * Attempts to decrypt data, trying new format first, then legacy format
   * @param encryptedText Encrypted text (either new format with IV or legacy format)
   * @returns Decrypted plain text
   */
  decryptSafe(encryptedText: string): string {
    if (!encryptedText) return '';

    // Try new format first (contains ':')
    if (encryptedText.includes(':')) {
      return this.decrypt(encryptedText);
    }

    // Fall back to legacy format
    try {
      // Use the old fixed IV for backward compatibility
      const legacyIv = Buffer.from('1234567890123456');

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.key,
        legacyIv,
      );
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Legacy decryption error:', error);
      return ''; // Return empty string on error
    }
  }

  /**
   * Static method to generate a new encryption key
   * @returns A 32-byte encryption key in hex format
   */
  static generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
