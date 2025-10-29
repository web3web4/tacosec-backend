/**
 * JWT Payload Interface
 * Defines the structure of JWT token payload for authentication
 */
export interface JwtPayload {
  /** User ID from database */
  userId: string;

  /** Subject (same as userId for compatibility) */
  sub: string;

  /** Telegram ID if user has linked Telegram account */
  telegramId?: string;

  /** Username */
  username?: string;

  /** User role */
  role: string;

  /** Latest public address associated with the user */
  publicAddress?: string;

  /** Token type for refresh tokens */
  type?: 'refresh';

  /** Token issued at timestamp */
  iat?: number;

  /** Token expiration timestamp */
  exp?: number;
}
