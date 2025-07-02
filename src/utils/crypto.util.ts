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
  private readonly iv: Buffer;

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

    // For simplicity, we're using a fixed IV, but in production
    // you might want to store IVs with the encrypted data
    this.iv = Buffer.from('1234567890123456');
  }

  /**
   * Encrypts a string
   * @param text Plain text to encrypt
   * @returns Encrypted text in hex format
   */
  encrypt(text: string): string {
    if (!text) return '';

    const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Decrypts a string
   * @param encryptedText Encrypted text in hex format
   * @returns Decrypted plain text
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText) return '';

    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.key,
        this.iv,
      );
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
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
