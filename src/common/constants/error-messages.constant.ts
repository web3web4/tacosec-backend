/**
 * Centralized error messages
 * All error messages should be defined here for consistency and maintainability
 */

export const ERROR_MESSAGES = {
  // User related errors
  USER: {
    NOT_FOUND: 'User not found',
    INACTIVE: 'User account is inactive',
    ALREADY_EXISTS: 'User already exists',
    UPDATE_FAILED: 'Failed to update user',
    DELETE_FAILED: 'Failed to delete user',
    SHARING_RESTRICTED: 'User is restricted from sharing',
  },

  // Authentication related errors
  AUTH: {
    REQUIRED:
      'Authentication required: provide either JWT token or Telegram init data',
    INVALID_CREDENTIALS: 'Invalid credentials',
    INVALID_TOKEN: 'Invalid or expired token',
    TOKEN_EXPIRED: 'Token has expired',
    INVALID_SIGNATURE: 'Signature does not match the provided address',
    SIGNATURE_REQUIRED: 'Signature is required for this operation',
    INVALID_TELEGRAM_DATA: 'Invalid Telegram authentication data',
    SIGNATURE_VERIFICATION_FAILED: 'Signature verification failed',
  },

  // Password/Secret related errors
  PASSWORD: {
    NOT_FOUND: 'Secret not found',
    ACCESS_DENIED: 'Access denied to this secret',
    ALREADY_SHARED: 'Secret is already shared with this user',
    SHARE_FAILED: 'Failed to share secret',
    UPDATE_FAILED: 'Failed to update secret',
    DELETE_FAILED: 'Failed to delete secret',
    ENCRYPTION_FAILED: 'Failed to encrypt secret',
    DECRYPTION_FAILED: 'Failed to decrypt secret',
    INVALID_KEY: 'Secret key cannot be null or empty',
    CANNOT_SHARE_WITH_SELF: 'Cannot share secret with yourself',
  },

  // Public Address related errors
  PUBLIC_ADDRESS: {
    NOT_FOUND: 'Public address not found',
    ALREADY_EXISTS: 'Public address already exists in the system',
    INVALID: 'Invalid public address format',
    UPDATE_FAILED: 'Failed to update public address',
    DELETE_FAILED: 'Failed to delete public address',
  },

  // Report related errors
  REPORT: {
    NOT_FOUND: 'Report not found',
    ALREADY_EXISTS: 'Report already exists',
    CREATE_FAILED: 'Failed to create report',
  },

  // Notification related errors
  NOTIFICATION: {
    NOT_FOUND: 'Notification not found',
    SEND_FAILED: 'Failed to send notification',
  },

  // Generic errors
  GENERIC: {
    INTERNAL_ERROR: 'Internal server error',
    BAD_REQUEST: 'Bad request',
    NOT_FOUND: 'Resource not found',
    FORBIDDEN: 'Access forbidden',
    UNAUTHORIZED: 'Unauthorized access',
    VALIDATION_FAILED: 'Validation failed',
    OPERATION_FAILED: 'Operation failed',
  },

  // Database errors
  DATABASE: {
    CONNECTION_FAILED: 'Database connection failed',
    OPERATION_FAILED: 'Database operation failed',
    DUPLICATE_KEY: 'Duplicate key error',
  },
} as const;

/**
 * Success messages for consistent API responses
 */
export const SUCCESS_MESSAGES = {
  USER: {
    CREATED: 'User created successfully',
    UPDATED: 'User updated successfully',
    DELETED: 'User deleted successfully',
  },

  PASSWORD: {
    CREATED: 'Secret created successfully',
    UPDATED: 'Secret updated successfully',
    DELETED: 'Secret deleted successfully',
    SHARED: 'Secret shared successfully',
    UNSHARED: 'Secret unshared successfully',
  },

  PUBLIC_ADDRESS: {
    CREATED: 'Public address added successfully',
    UPDATED: 'Public address updated successfully',
    DELETED: 'Public address deleted successfully',
  },

  AUTH: {
    LOGIN_SUCCESS: 'Login successful',
    LOGOUT_SUCCESS: 'Logout successful',
    TOKEN_REFRESHED: 'Token refreshed successfully',
  },

  NOTIFICATION: {
    SENT: 'Notification sent successfully',
    MARKED_READ: 'Notification marked as read',
  },
} as const;
