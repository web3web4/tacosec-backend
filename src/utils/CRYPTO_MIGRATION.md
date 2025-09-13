# CryptoUtil Migration Guide

## Overview

The `CryptoUtil` class has been updated to follow security best practices by using a unique Initialization Vector (IV) for each encryption operation. This document explains the changes and how to migrate existing code.

## What Changed

### Before (Insecure - Fixed IV)
```typescript
// Old implementation used a fixed IV
this.iv = Buffer.from('1234567890123456');
```

### After (Secure - Unique IV per encryption)
```typescript
// New implementation generates a unique IV for each encryption
const iv = crypto.randomBytes(16);
```

## Security Benefits

1. **Unique IV per encryption**: Each encryption operation now uses a cryptographically random IV
2. **Prevents pattern analysis**: Same plaintext will produce different ciphertext each time
3. **Industry best practices**: Follows NIST and cryptographic community recommendations
4. **Forward compatibility**: Prepares the system for future security requirements

## API Changes

### New Methods

#### `encrypt(text: string): string`
- **New behavior**: Returns `IV:EncryptedData` format
- **Example**: `"a1b2c3d4e5f6789012345678:9f8e7d6c5b4a3210fedcba9876543210"`

#### `decrypt(encryptedText: string): string`
- **New behavior**: Expects `IV:EncryptedData` format
- **Automatically extracts IV**: Splits the string and uses the correct IV for decryption

#### `decryptLegacy(encryptedText: string): string` (Deprecated)
- **Purpose**: Decrypt old data encrypted with fixed IV
- **Usage**: Only for backward compatibility
- **Status**: Deprecated - will be removed in future versions

#### `decryptSafe(encryptedText: string): string`
- **Purpose**: Smart decryption that handles both new and legacy formats
- **Logic**: 
  - If data contains `:` → uses new `decrypt()` method
  - If no `:` found → uses legacy `decryptLegacy()` method

## Migration Strategy

### Phase 1: Immediate (Backward Compatible)

1. **Update CryptoUtil**: Already done ✅
2. **Use `decryptSafe()` method**: Replace existing `decrypt()` calls

```typescript
// Before
const decrypted = cryptoUtil.decrypt(encryptedData);

// After (recommended for migration period)
const decrypted = cryptoUtil.decryptSafe(encryptedData);
```

### Phase 2: Re-encryption (Optional but Recommended)

For maximum security, consider re-encrypting existing data:

```typescript
// Example migration script
async function migrateEncryptedData() {
  const records = await findAllEncryptedRecords();
  
  for (const record of records) {
    // Decrypt using legacy method
    const plaintext = cryptoUtil.decryptLegacy(record.encryptedField);
    
    // Re-encrypt with new secure method
    const newEncrypted = cryptoUtil.encrypt(plaintext);
    
    // Update database
    await updateRecord(record.id, { encryptedField: newEncrypted });
  }
}
```

### Phase 3: Cleanup (Future)

After all data is migrated:
1. Remove `decryptLegacy()` method
2. Replace `decryptSafe()` calls with `decrypt()`
3. Remove backward compatibility code

## Testing

### Test New Encryption
```typescript
const cryptoUtil = new CryptoUtil(configService);
const plaintext = "Hello, World!";

// Encrypt
const encrypted = cryptoUtil.encrypt(plaintext);
console.log('Encrypted:', encrypted); // Should contain ':'

// Decrypt
const decrypted = cryptoUtil.decrypt(encrypted);
console.log('Decrypted:', decrypted); // Should equal original plaintext

// Verify uniqueness
const encrypted2 = cryptoUtil.encrypt(plaintext);
console.log('Different each time:', encrypted !== encrypted2); // Should be true
```

### Test Backward Compatibility
```typescript
// Test with old encrypted data (without IV prefix)
const legacyEncrypted = "9f8e7d6c5b4a3210fedcba9876543210";
const decrypted = cryptoUtil.decryptSafe(legacyEncrypted);
console.log('Legacy decryption works:', decrypted);
```

## Important Notes

1. **Data Format Change**: New encrypted data includes IV prefix (`IV:EncryptedData`)
2. **Backward Compatibility**: Old data can still be decrypted using `decryptSafe()` or `decryptLegacy()`
3. **Database Impact**: Encrypted fields may become longer due to IV prefix
4. **Performance**: Minimal impact - IV generation is very fast
5. **Security**: Significantly improved - each encryption is now unique

## Recommendations

1. **Immediate**: Use `decryptSafe()` for all decryption operations
2. **Short-term**: Plan data re-encryption for critical sensitive data
3. **Long-term**: Remove legacy methods after full migration
4. **Monitoring**: Log any legacy decryption attempts to track migration progress

## References

- [NIST SP 800-38A](https://csrc.nist.gov/publications/detail/sp/800-38a/final) - Recommendation for Block Cipher Modes of Operation
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)