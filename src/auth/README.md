# Auth Module

## Overview
This module provides authentication functionality without requiring Telegram ID. It uses public wallet addresses for user identification and JWT tokens for authentication.

## API Endpoints

### POST /auth/login

Authenticates a user using their public wallet address.

#### Request Body
```json
{
  "publicAddress": "0x1234567890abcdef...",
  "signature": "any-value-or-empty-string"
}
```

#### Response
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Error Responses

**404 Not Found** - Public address not found
```json
{
  "success": false,
  "message": "Public address not found",
  "error": "Not Found"
}
```

**401 Unauthorized** - User not found or inactive
```json
{
  "success": false,
  "message": "User not found or inactive",
  "error": "Unauthorized"
}
```

## How it Works

1. The API receives a `publicAddress` and `signature` in the request body
2. It searches for the public address in the `PublicAddress` collection
3. If found, it retrieves the associated user information
4. It verifies the user is active
5. It generates a JWT token containing user information
6. Returns only the JWT token (user information is embedded within the token)

## Notes

- The `signature` parameter is currently not validated but must be present in the request
- The JWT token expiration time can be configured via the `JWT_EXPIRES_IN` environment variable (default: 24h)
- The JWT secret can be configured via the `JWT_SECRET` environment variable
- Users must have an active status to successfully authenticate

## Environment Variables

- `JWT_SECRET`: Secret key for signing JWT tokens (required)
- `JWT_EXPIRES_IN`: Token expiration time (optional, default: '24h')
  - Examples: '1h', '24h', '7d', '30d'

## Testing

To test the login endpoint:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "publicAddress": "your-public-address",
    "signature": "test-signature"
  }'
```