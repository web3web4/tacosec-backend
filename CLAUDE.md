# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Taco Backend** is a NestJS-based server application that provides password management and sharing capabilities with Telegram authentication and wallet address linking. It integrates with Telegram Bot API for user authentication and supports dual authentication methods (JWT and Telegram init data). The application includes EVM wallet signature verification using ethers.

## Key Architecture Patterns

### Modular Architecture
The application is organized into feature modules, each encapsulating controllers, services, and schemas:

- **AuthModule** (`src/auth/`) - Handles user authentication with both JWT and Telegram
- **UsersModule** (`src/users/`) - User management and profile operations
- **PasswordModule** (`src/passwords/`) - Password storage, encryption, and sharing
- **TelegramModule** (`src/telegram/`) - Telegram bot integration and init data validation
- **TelegramClientModule** (`src/telegram-client/`) - Telegram client interactions (contacts lookup)
- **PublicAddressesModule** (`src/public-addresses/`) - Wallet public address management with signature verification
- **NotificationsModule** (`src/notifications/`) - User notifications system
- **ReportsModule** (`src/reports/`) - User reporting system for moderation
- **LoggerModule** (`src/logger/`) - Centralized exception logging with MongoDB storage
- **CommonModule** (`src/common/`) - Shared services, pipes, interceptors, and configuration
- **DatabaseModule** (`src/common/database/`) - MongoDB connection configuration
- **CryptoModule** (`src/utils/`) - Encryption utilities

### Authentication System

**Dual Authentication Support:**
- **JWT (Bearer Token)**: Standard OAuth-style token-based auth in Authorization header
- **Telegram Init Data**: Telegram Web App authentication via `x-telegram-init-data` header or request body
- **Wallet Signature**: EVM address verification via `ethers.verifyMessage()` for public address endpoints

**Auth Guards (`src/guards/`):**
1. `FlexibleAuthGuard` - Accepts either JWT or Telegram auth (priority: JWT > Telegram)
2. `TelegramDtoAuthGuard` - Requires JWT or Telegram data in DTO/body format
3. `RolesGuard` - Role-based authorization (admin checks via Telegram ID)

**AuthContextService** (`src/common/services/auth-context.service.ts`):
Centralized authentication logic that extracts user context from requests. All guards and services use this service to avoid duplicating auth logic. Key methods:
- `getCurrentUser(req)` - Get authenticated UserDocument from request
- `getJwtUserAndPayload(token)` - Validate JWT and return user with payload
- `getTelegramAuthDataFromInitData(initData)` - Parse and validate Telegram init data

**Guard Application Pattern:**
- Guards are used as decorators: `@UseGuards(FlexibleAuthGuard)`
- User context extracted to `request.user` (JWT) or `request.telegramData` (Telegram)
- `request.authMethod` indicates which auth method was used ('jwt' | 'telegram')

### Module Dependencies
**Circular Dependencies** are managed via `forwardRef()` in modules that reference each other:
- PasswordModule ↔ UsersModule (forwardRef required)
- PasswordModule ↔ TelegramModule (forwardRef required)
- PasswordModule ↔ ReportsModule (forwardRef required)

The application uses approximately 26 instances of `forwardRef()` to handle circular module imports.

### Password Encryption
Uses Node.js crypto utility (`src/utils/crypto.util.ts`) with:
- **ENCRYPTION_KEY** environment variable (must be set before runtime)
- Key generation utility: `npx ts-node src/utils/generate-key.ts`
- Flexible key management with schema cleanup: `npx ts-node src/scripts/cleanup-null-keys.ts`

### Database & Schema Design
- **MongoDB** with Mongoose ODM
- Schemas in `src/*/schemas/` directories
- Automatic timestamps via `@Schema({ timestamps: true })`
- Indexes defined for performance optimization in schemas

### Exception Handling & Logging
- Global exception filter registered in `main.ts:40`
- `AllExceptionsLoggerFilter` logs exceptions to MongoDB ErrorLog collection
- User context automatically extracted (userId, telegramId, username)
- API endpoints: `GET /logger`, `GET /logger/:id`, `POST /logger`

### User Reporting System
- Users can report other users by username
- Automatic sharing restrictions when user receives reports exceeding thresholds (configurable via `MAX_REPORTS_BEFORE_BAN` and `MAX_PERCENTAGE_OF_REPORTS_REQUIRED_FOR_BAN`)
- Admin endpoints for report management and resolution

### Serverless Deployment
The application exports a serverless handler in `src/main.ts:55` for platforms like Vercel:
```typescript
export const handler = async (request, response) => { ... }
```

## Common Development Commands

### Setup & Installation
```bash
# Install dependencies
npm install

# Create encryption key (required for encryption/decryption operations)
npx ts-node src/utils/generate-key.ts
```

### Development
```bash
# Start in watch mode (recommended)
npm run start:dev

# Start with debug mode
npm run start:debug

# Start in production mode (requires compiled code)
npm run start:prod
```

### Build & Compilation
```bash
# Build TypeScript to dist/
npm run build

# Format code with Prettier
npm run format
```

### Linting
```bash
# Lint and auto-fix code
npm run lint
```

### Testing
```bash
# Run all unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- src/users/users.service.spec.ts

# Run specific integration test
npm run test:integration

# Run with coverage report
npm run test:cov

# Run e2e tests (integration tests against live database)
npm run test:e2e

# Debug tests
npm run test:debug
```

## Environment Variables

**Required:**
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for JWT signing
- `ENCRYPTION_KEY` - 32-byte hex string for password encryption (generate with `npx ts-node src/utils/generate-key.ts`)
- `TELEGRAM_BOT_TOKEN` - Required in production (app exits without it)

**Optional - JWT:**
- `JWT_EXPIRES_IN` (default: `24h`)
- `JWT_ACCESS_TOKEN_EXPIRES_IN` (default: `15m`)
- `JWT_REFRESH_TOKEN_EXPIRES_IN` (default: `7d`)

**Optional - Telegram Client:**
- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` - For Telegram client features
- `ADMIN_TELEGRAM_ID` - Admin user identification

**Optional - Reports:**
- `MAX_REPORTS_BEFORE_BAN` (default: `10`)
- `MAX_PERCENTAGE_OF_REPORTS_REQUIRED_FOR_BAN` (default: `0.5`)

## Important Development Notes

### Testing
- Tests require `ENCRYPTION_KEY=test-key-for-testing` (automatically set in npm scripts)
- Jest configs: `jest.config.js` (unit), `test/jest-e2e.json` (e2e)

### Circular Module Dependencies
When adding cross-module dependencies, use `forwardRef()` to avoid initialization issues:
```typescript
forwardRef(() => UsersModule),
```

### Module Exports
Key modules that export services:
- **SharedJwtModule** (`src/common/jwt/`) - Exports `JwtService`
- **UsersModule** - Exports `UsersService` and `RolesGuard`
- **CommonModule** - Exports `AuthContextService`

Import the corresponding module instead of creating duplicate services.

## Known Limitations

- **RolesGuard** only checks admin role from Telegram ID, not JWT
- **Stats endpoint** (`GET /logger/stats/summary`) is a stub
