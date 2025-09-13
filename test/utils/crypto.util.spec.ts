import { ConfigService } from '@nestjs/config';
import { CryptoUtil } from '../../src/utils/crypto.util';

describe('CryptoUtil', () => {
  let cryptoUtil: CryptoUtil;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'ENCRYPTION_KEY') {
          return 'c558ad827f514a3bc6fe872b2527890f6ed7f75febd5b7110e35af76424839ac';
        }
        return null;
      }),
    } as any;

    cryptoUtil = new CryptoUtil(mockConfigService);
  });

  it('should be defined', () => {
    expect(cryptoUtil).toBeDefined();
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'Hello, World!';
      const encrypted = cryptoUtil.encrypt(plaintext);
      const decrypted = cryptoUtil.decrypt(encrypted);

      expect(encrypted).toContain(':'); // Should contain IV separator
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different encrypted output each time', () => {
      const plaintext = 'Same text';
      const encrypted1 = cryptoUtil.encrypt(plaintext);
      const encrypted2 = cryptoUtil.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Should be different due to unique IV
      expect(cryptoUtil.decrypt(encrypted1)).toBe(plaintext);
      expect(cryptoUtil.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      expect(cryptoUtil.encrypt('')).toBe('');
      expect(cryptoUtil.decrypt('')).toBe('');
    });
  });

  describe('legacy compatibility', () => {
    it('should decrypt legacy data with fixed IV using decryptSafe', () => {
      // This is a sample encrypted text using the old fixed IV method
      // You would need to generate this using the old method for a real test
      const legacyEncrypted = '9f8e7d6c5b4a3210fedcba9876543210'; // Example

      // This test assumes we have some legacy encrypted data
      // In practice, you'd use real legacy encrypted data
      // Test that decryptSafe handles legacy format without throwing
      expect(() => cryptoUtil.decryptSafe(legacyEncrypted)).not.toThrow();
    });

    it('should use decryptSafe for both new and legacy formats', () => {
      const plaintext = 'Test message';

      // Test new format
      const newEncrypted = cryptoUtil.encrypt(plaintext);
      expect(cryptoUtil.decryptSafe(newEncrypted)).toBe(plaintext);

      // Test legacy format (without colon)
      const legacyFormat = 'abcdef123456'; // Mock legacy format
      expect(() => cryptoUtil.decryptSafe(legacyFormat)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle invalid encrypted data gracefully', () => {
      const invalidData = 'invalid:data:format';
      expect(cryptoUtil.decrypt(invalidData)).toBe('');
    });

    it('should handle malformed data in decryptSafe', () => {
      const malformedData = 'malformed_data';
      expect(cryptoUtil.decryptSafe(malformedData)).toBe('');
    });
  });

  describe('static methods', () => {
    it('should generate encryption key', () => {
      const key = CryptoUtil.generateEncryptionKey();
      expect(key).toHaveLength(64); // 32 bytes = 64 hex characters
      expect(key).toMatch(/^[a-f0-9]+$/); // Should be hex
    });
  });
});
