# TACoSec Backend

Backend API for TACoSec - Secure secret storage and sharing with dual authentication (Telegram + Ethereum wallet signatures).

> [Frontend Repository](https://github.com/web3web4/tacosec-frontend) | **Backend Repository** (you are here)

## Built With

[![Nest.js](https://img.shields.io/badge/Nest.js-E0234E?logo=nestjs)](https://nestjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ethers.js](https://img.shields.io/badge/ethers.js-2535a0?logo=ethereum&logoColor=white)](https://docs.ethers.org/)
[![Telegram](https://img.shields.io/badge/Telegram-Mini%20App-26A5E4?logo=telegram)](https://core.telegram.org/bots/webapps)

## Installation

```bash
npm install

# Generate encryption key
npx ts-node src/utils/generate-key.ts
```

## Configuration

Create `.env` file:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/tacosec

# Security
JWT_SECRET=your-strong-random-secret-min-32-chars
ENCRYPTION_KEY=your-generated-64-char-hex-key

# Telegram (required for production)
TELEGRAM_BOT_TOKEN=your-bot-token
ADMIN_TELEGRAM_ID=your-admin-telegram-id

# Optional
NODE_ENV=development
JWT_EXPIRES_IN=24h
MAX_REPORTS_BEFORE_BAN=10
```

## Running

```bash
npm run start:dev      # Development with hot reload
npm run start:debug    # Debug mode
npm run build          # Build for production
npm run start:prod     # Production mode
```

Server runs on `http://localhost:3000`

## Authentication

### Dual Authentication Support

**Telegram Users:**
```http
POST /users/signup
x-telegram-init-data: query_id=...&user={...}&auth_date=...&hash=...
```

**Wallet Users:**
```http
# 1. Get challenge
POST /auth/challange
{ "publicAddress": "0x..." }

# 2. Sign challenge with wallet

# 3. Login with signature
POST /auth/login
{ "publicAddress": "0x...", "signature": "0x..." }
```

**JWT Token:**
```http
GET /users/me
Authorization: Bearer <token>
```

## API Endpoints

### Authentication
- `POST /auth/challange` — Create wallet challenge
- `POST /auth/login` — Login (Telegram or wallet)
- `POST /auth/refresh` — Refresh access token

### Users
- `POST /users/signup` — Register via Telegram
- `GET /users/me` — Get current user
- `PATCH /users/update-info` — Update profile
- `GET /users/search/autocomplete` — Search users
- `PATCH /users/me/privacy-mode` — Toggle privacy

### Secrets (Passwords)
- `POST /passwords` — Create secret
- `GET /passwords` — Get user's secrets
- `GET /passwords/shared-with-me` — Get received secrets
- `PATCH /passwords/:id` — Update secret
- `DELETE /passwords/:id` — Delete secret
- `PATCH /passwords/secret-view/:id` — Record view

### Public Addresses
- `POST /public-addresses` — Link wallet address
- `GET /public-addresses` — Get user's addresses

### Notifications
- `GET /notifications/my` — Get user notifications

### Reports
- `POST /reports` — Report user
- `GET /reports/is-restricted/:userIdentifier` — Check restriction status

### Admin (Admin role required)
- `GET /users/admin/all` — List all users
- `GET /passwords/admin/all` — List all secrets
- `GET /reports/admin/reported-users` — List reports
- `GET /logger/admin/all` — View error logs

## Encryption

Secrets are encrypted server-side using **AES-256-CBC**:

- **Key**: 256-bit (32 bytes) generated via `crypto.randomBytes(32)`
- **IV**: Unique 16-byte random IV per encryption
- **Format**: `<IV-hex>:<ciphertext-hex>`

Generate new key:
```bash
npx ts-node src/utils/generate-key.ts
```

## Testing

```bash
npm run test           # Unit tests
npm run test:e2e       # E2E tests
npm run test:cov       # Coverage report
```

## Deployment

Serverless-ready with `@vendia/serverless-express` adapter. Compatible with Vercel, AWS Lambda, etc.

```bash
npm run build
npm run start:prod
```

## Architecture

```
┌─────────────────────────────────────┐
│     Guards (JWT/Telegram/Roles)     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│        Controllers (Routes)         │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Services (Business Logic)        │
│  - AuthContext (centralized auth)   │
│  - Users, Passwords, Notifications  │
│  - TelegramValidator, CryptoUtil    │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      MongoDB (Mongoose ODM)         │
│  Users | Passwords | PublicAddresses│
│  Notifications | Reports | ErrorLogs│
└─────────────────────────────────────┘
```

## License

MIT

---

**TACoSec** • [Frontend](https://github.com/web3web4/tacosec-frontend) • [Backend](https://github.com/web3web4/tacosec-backend) (you are here) • *Powered by [TACo](https://taco.build) 💚* • **Built with ❤️ by [Web3Web4](https://web3web4.com)**
