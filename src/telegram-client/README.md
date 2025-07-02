# Telegram Client Module

This module provides real access to user contacts using the Telegram Client API (MTProto) with the `telegram` (gramjs) library.

## Features

- **Real Contact Access**: Access actual user contacts through Telegram Client API
- **Authentication Management**: Handle Telegram authentication with phone verification
- **Contact Operations**: Get, search, sync, and manage user contacts
- **Session Management**: Persistent session handling for authenticated users
- **Caching**: Efficient contact caching to reduce API calls

## Setup

### 1. Install Dependencies

```bash
npm install telegram
```

### 2. Environment Variables

Add the following required environment variables to your `.env` file:

```env
# Required for Telegram Client API
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# Optional: Session storage path
TELEGRAM_SESSION_PATH=./sessions
```

### 3. Get API Credentials

1. Go to [my.telegram.org](https://my.telegram.org)
2. Log in with your phone number
3. Go to "API Development Tools"
4. Create a new application
5. Copy your `api_id` and `api_hash`

## Usage

### Authentication Flow

1. **Send Code**: Send authentication code to user's phone
2. **Verify Code**: Verify the received code
3. **Access Contacts**: Once authenticated, access user contacts

### API Endpoints

#### Authentication

- `POST /telegram-client/auth/send-code` - Send authentication code
- `POST /telegram-client/auth/verify-code` - Verify authentication code
- `GET /telegram-client/auth/status` - Check authentication status
- `POST /telegram-client/auth/logout` - Logout user

#### Contacts

- `GET /telegram-client/contacts` - Get user contacts
- `GET /telegram-client/contacts/search` - Search contacts
- `POST /telegram-client/contacts/sync` - Sync contacts
- `GET /telegram-client/contacts/:id` - Get contact details

### Example Usage

```typescript
// Send authentication code
const sendCodeResponse = await fetch('/telegram-client/auth/send-code', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phoneNumber: '+1234567890',
    userId: 123
  })
});

// Verify code
const verifyResponse = await fetch('/telegram-client/auth/verify-code', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: '12345',
    phoneNumber: '+1234567890',
    phoneCodeHash: 'hash_from_send_code',
    userId: 123
  })
});

// Get contacts
const contactsResponse = await fetch('/telegram-client/contacts?limit=50&offset=0');
const contacts = await contactsResponse.json();
```

## Architecture

### Services

- **TelegramClientService**: Core service for Telegram Client API connection
- **AuthService**: Handles authentication flow and session management
- **ContactsService**: Manages contact operations and caching

### DTOs

- **SendCodeDto/VerifyCodeDto**: Authentication DTOs
- **GetContactsDto/SearchContactsDto**: Contact operation DTOs
- **ContactDto**: Contact data transfer object

### Interfaces

- **ITelegramRealContact**: Real contact interface
- **IContactSync**: Contact synchronization interface

## Security Considerations

1. **API Credentials**: Keep `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` secure
2. **Session Storage**: Store session files securely
3. **Rate Limiting**: Implement rate limiting for API endpoints
4. **User Consent**: Ensure user consent before accessing contacts

## Limitations

1. **Rate Limits**: Telegram API has rate limits
2. **Session Management**: Sessions need to be maintained
3. **Phone Verification**: Requires phone number verification
4. **API Limits**: Subject to Telegram's API limitations

## Error Handling

The module includes comprehensive error handling for:

- Authentication failures
- Network errors
- Rate limiting
- Invalid sessions
- API errors

## Caching

Contacts are cached to improve performance:

- **Memory Cache**: In-memory caching for frequently accessed contacts
- **TTL**: Configurable time-to-live for cached data
- **Invalidation**: Smart cache invalidation on updates

## Testing

Run tests with:

```bash
npm run test telegram-client
```

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Use English for comments

## License

This module is part of the Taco Backend project.