/**
 * Utility class for detecting whether a query string is a public address or username
 */
export class AddressDetectorUtil {
  /**
   * Detects if the given query is a public address based on common patterns
   * @param query - The search query to analyze
   * @returns true if the query appears to be a public address, false if it's likely a username
   */
  static isPublicAddress(query: string): boolean {
    if (!query || typeof query !== 'string') {
      return false;
    }

    const trimmedQuery = query.trim();

    // Check if query is too short to be a valid public address
    if (trimmedQuery.length < 26) {
      return false;
    }

    // Common public address patterns
    const patterns = [
      // Ethereum addresses (0x followed by 40 hex characters)
      /^0x[a-fA-F0-9]{40}$/,

      // Bitcoin addresses (legacy P2PKH - starts with 1, 26-35 characters)
      /^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/,

      // Bitcoin addresses (P2SH - starts with 3, 26-35 characters)
      /^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/,

      // Bitcoin Bech32 addresses (starts with bc1, lowercase)
      /^bc1[a-z0-9]{39,59}$/,

      // Solana addresses (base58, typically 32-44 characters)
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,

      // Generic hex addresses (long hex strings)
      /^[a-fA-F0-9]{32,}$/,

      // Addresses with common prefixes
      /^(0x|bc1|ltc1|addr1)[a-zA-Z0-9]+$/,
    ];

    // Check against all patterns
    for (const pattern of patterns) {
      if (pattern.test(trimmedQuery)) {
        return true;
      }
    }

    // Additional heuristics for public addresses
    // Long alphanumeric strings (likely addresses)
    if (trimmedQuery.length >= 26 && /^[a-zA-Z0-9]+$/.test(trimmedQuery)) {
      // Check if it contains mixed case (common in addresses)
      const hasLowerCase = /[a-z]/.test(trimmedQuery);
      const hasUpperCase = /[A-Z]/.test(trimmedQuery);
      const hasNumbers = /[0-9]/.test(trimmedQuery);

      // If it has mixed case and numbers, likely an address
      if (
        (hasLowerCase && hasUpperCase) ||
        (hasNumbers && trimmedQuery.length >= 32)
      ) {
        return true;
      }
    }

    // If none of the patterns match, assume it's a username
    return false;
  }

  /**
   * Validates if a string could be a valid username
   * @param query - The query to validate as username
   * @returns true if the query appears to be a valid username format
   */
  static isValidUsername(query: string): boolean {
    if (!query || typeof query !== 'string') {
      return false;
    }

    const trimmedQuery = query.trim();

    // Username validation rules
    // - Length between 1 and 50 characters
    // - Can contain letters, numbers, underscores, dots, and hyphens
    // - Cannot start or end with special characters
    const usernamePattern =
      /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,48}[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

    return usernamePattern.test(trimmedQuery) && trimmedQuery.length <= 50;
  }
}
