# Testing Telegram Authentication in Login Endpoint

## Overview
The login endpoint (`POST /auth/login`) now supports Telegram authentication when the `X-Telegram-Init-Data` header is provided.

## Test Scenarios

### Scenario 1: Public address linked to user with existing telegramId
**Expected Result:** Error - "The specified public wallet address is already linked to a real Telegram user"

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Init-Data: user=%7B%22id%22%3A1775924863%2C%22first_name%22%3A%22AAA%22%2C%22username%22%3A%22wad1101%22%7D&auth_date=1775924863&hash=934e098185ffec3add45ed6754c73421c2a58e15a1db7eef18ea0e5287b3c789" \
  -d '{"publicAddress": "existing_address_with_telegram_user"}'
```

### Scenario 2: Public address linked to user with empty telegramId - Valid Telegram data
**Expected Result:** Success - User data updated with Telegram information

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Init-Data: user=%7B%22id%22%3A1775924863%2C%22first_name%22%3A%22AAA%22%2C%22username%22%3A%22wad1101%22%7D&auth_date=1775924863&hash=934e098185ffec3add45ed6754c73421c2a58e15a1db7eef18ea0e5287b3c789" \
  -d '{"publicAddress": "existing_address_without_telegram"}'
```

### Scenario 3: TelegramId already exists in database
**Expected Result:** Error - "User already exists. Linking is only possible with new users"

### Scenario 4: Invalid Telegram signature
**Expected Result:** Error - "Invalid Telegram authentication data or signature"

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Init-Data: user=%7B%22id%22%3A1775924863%2C%22first_name%22%3A%22AAA%22%2C%22username%22%3A%22wad1101%22%7D&auth_date=1775924863&hash=invalid_hash" \
  -d '{"publicAddress": "some_address"}'
```

### Scenario 5: Normal login without Telegram header
**Expected Result:** Normal JWT token response (existing functionality preserved)

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"publicAddress": "some_address"}'
```

## Implementation Details

### Changes Made:

1. **AuthController**: Modified to accept `X-Telegram-Init-Data` header
2. **AuthService**: Added comprehensive Telegram authentication logic
3. **AuthModule**: Added required dependencies (TelegramModule, UsersModule)

### Key Features:

- ✅ Validates public address association
- ✅ Checks if user already has telegramId
- ✅ Validates Telegram init data signature
- ✅ Prevents duplicate telegramId linking
- ✅ Updates user with Telegram information
- ✅ Returns user data similar to signup endpoint
- ✅ Preserves original login functionality

### Error Handling:

- Proper HTTP status codes (409 for conflicts, 401 for unauthorized)
- Descriptive error messages in English
- Graceful fallback to normal login when no Telegram data provided