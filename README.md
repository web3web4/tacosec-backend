# Taco Backend

Taco backend API built with NestJS and MongoDB. It provides user identity via Telegram and/or wallet public addresses, JWT-based access for protected routes, password/secret storage features, notifications, reporting, and centralized error logging.

## Tech Stack

- NestJS (TypeScript)
- MongoDB + Mongoose
- JWT authentication
- Telegram authentication (init data validation)
- EVM signature verification via `ethers`

## Key Modules

- `Auth` (`/auth`): Login, token issuance
- `Users` (`/users`): User profile endpoints
- `Public Addresses` (`/public-addresses`): Link wallet addresses to users
- `Passwords` (`/passwords`): Password/secret management
- `Notifications` (`/notifications`): User notifications
- `Reports` (`/reports`): User reporting and restriction checks
- `Logger` (`/logger`): Error/system log collection
- `Telegram` / `Telegram Client`: Telegram validation and client integrations

## Authentication

This API supports multiple authentication mechanisms depending on the endpoint:

- **Telegram init data**: Send `x-telegram-init-data` header (Telegram WebApp init data). In production, init data validation requires `TELEGRAM_BOT_TOKEN`.
- **JWT**: Send `Authorization: Bearer <token>`.
- **Flexible auth** (some endpoints): Accepts either JWT or Telegram init data.

### Wallet Signature Verification

When a wallet public address is used in requests, the API verifies the signature for EVM addresses:

- Message to sign: the same address string sent in the request
- Verification: recover signer using `ethers.verifyMessage(message, signature)`
- Valid signature: recovered address must match the provided address (case-insensitive)

Current implementation validates only EVM-style addresses (`0x` + 40 hex chars).

## Configuration

Create a `.env` file in the project root.

### Required

- `MONGODB_URI`
- `JWT_SECRET`
- `ENCRYPTION_KEY`

`ENCRYPTION_KEY` must be a 32-byte hex string.

Generate one with:

```bash
npx ts-node src/utils/generate-key.ts
```

### Optional

- `NODE_ENV` (default: `development`)
- `JWT_EXPIRES_IN` (default: `24h`)
- `JWT_ACCESS_TOKEN_EXPIRES_IN` (default: `15m`)
- `JWT_REFRESH_TOKEN_EXPIRES_IN` (default: `7d`)
- `IS_STAGING` (default: `true`)

Telegram:

- `TELEGRAM_BOT_TOKEN` (required in production to validate init data)
- `TELEGRAM_BOT_URL`
- `ADMIN_TELEGRAM_ID`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_SESSION_PATH` (default: `./sessions`)
- `TELEGRAM_REQUEST_TIMEOUT` (default: `30000`)
- `TELEGRAM_MAX_RETRIES` (default: `3`)
- `TELEGRAM_RETRY_DELAY` (default: `1000`)
- `TELEGRAM_DEBUG` (default: `false`)
- `TELEGRAM_CACHE_TTL` (default: `300`)
- `TELEGRAM_MAX_CONTACTS_PER_REQUEST` (default: `100`)

Reports:

- `MAX_REPORTS_BEFORE_BAN` (default: `10`)
- `MAX_PERCENTAGE_OF_REPORTS_REQUIRED_FOR_BAN` (default: `0.5`)

## Local Development

Install dependencies:

```bash
npm install
```

Run the API:

```bash
npm run start:dev
```

The server runs on `http://localhost:3000` in non-production environments.

## Scripts

```bash
# lint (auto-fix enabled)
npm run lint

# build
npm run build

# unit tests
npm test

# e2e tests
npm run test:e2e
```

## Selected Endpoints

This is a high-level overview and not a complete API reference.

### Auth

- `POST /auth/login`
  - Telegram-only login: provide `x-telegram-init-data` header and an empty body.
  - Wallet login: provide `{ "publicAddress": "0x...", "signature": "..." }`.
  - Wallet signature is verified only when `publicAddress` is provided.

### Public Addresses

- `POST /public-addresses` (flexible auth)
  - Body: `{ "publicKey": "0x...", "signature": "...", "secret"?: "..." }`
  - Signature is required and must match the provided `publicKey`.
- `GET /public-addresses` (flexible auth)
  - Returns linked addresses for the authenticated user.

### Reports

- `POST /reports` (flexible auth)
- `GET /reports/is-restricted/:userIdentifier` (flexible auth)
- `GET /reports/admin/reported-users` (admin)
- `GET /reports/admin/user/:userIdentifier` (admin)
- `PATCH /reports/admin/resolve/:id` (admin)

## Utilities

- Generate encryption key:

```bash
npx ts-node src/utils/generate-key.ts
```

- Cleanup invalid public addresses (maintenance):

```bash
npx ts-node src/scripts/cleanup-null-keys.ts
```

## Deployment Notes

The application exposes a serverless-compatible `handler` in `src/main.ts` for platforms that require it.

## License

UNLICENSED
