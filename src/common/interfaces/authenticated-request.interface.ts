import { Request } from 'express';

/**
 * User data attached to authenticated requests
 * Contains essential user information extracted from JWT or Telegram auth
 */
export interface AuthenticatedUser {
  id: string;
  telegramId: string;
  username: string;
  firstName?: string;
  lastName?: string;
  publicAddress?: string;
  role?: string;
}

/**
 * Telegram authentication data
 * Parsed from Telegram init data header
 */
export interface TelegramAuthData {
  telegramId: string;
  username: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  authDate?: number;
  hash?: string;
}

/**
 * Authenticated request interface
 * Extends Express Request with user authentication data
 */
export interface AuthenticatedRequest extends Request {
  /**
   * User data from JWT authentication
   */
  user?: AuthenticatedUser;

  /**
   * Telegram authentication data
   */
  telegramData?: TelegramAuthData;

  /**
   * Authentication method used
   */
  authMethod?: 'jwt' | 'telegram';
}

/**
 * Request with required authentication
 * Use this when authentication is mandatory
 */
export interface RequiredAuthRequest extends Request {
  user: AuthenticatedUser;
  authMethod: 'jwt' | 'telegram';
}

/**
 * JWT Payload interface
 * Structure of the JWT token payload
 */
export interface JwtPayloadInterface {
  sub: string; // User ID
  telegramId: string;
  username: string;
  role?: string;
  publicAddress?: string;
  iat?: number; // Issued at
  exp?: number; // Expiration
}
