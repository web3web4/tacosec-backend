# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Taco Backend** is a NestJS-based server application that provides password management and sharing capabilities with Telegram authentication. It integrates with Telegram Bot API for user authentication and supports dual authentication methods (JWT and Telegram init data).

## Key Architecture Patterns

### Modular Architecture
The application is organized into feature modules, each encapsulating controllers, services, and schemas:

- **AuthModule** (`src/auth/`) - Handles user authentication with both JWT and Telegram
- **UsersModule** (`src/users/`) - User management and profile operations
- **PasswordModule** (`src/passwords/`) - Password storage, encryption, and sharing
- **TelegramModule** (`src/telegram/`) - Telegram bot integration and validation
- **TelegramClientModule** (`src/telegram-client/`) - Telegram client interactions
- **PublicAddressesModule** (`src/public-addresses/`) - Public address management
- **ReportsModule** (`src/reports/`) - User reporting system for moderation
- **LoggerModule** (`src/logger/`) - Centralized exception logging with MongoDB storage
- **DatabaseModule** (`src/database/`) - MongoDB connection configuration

### Authentication System

**Dual Authentication Support:**
- **JWT (Bearer Token)**: Standard OAuth-style token-based auth in Authorization header
- **Telegram Init Data**: Telegram Web App authentication via `x-telegram-init-data` header or request body

**Auth Guards Hierarchy:**
1. `FlexibleAuthGuard` (`src/guards/flexible-auth.guard.ts`) - Accepts either JWT or Telegram auth, priority: JWT > Telegram
2. `TelegramDtoAuthGuard` (`src/guards/telegram-dto-auth.guard.ts`) - Requires JWT or Telegram data in DTO/body format
3. `RolesGuard` (`src/guards/roles.guard.ts`) - Role-based authorization (admin checks)

**Guard Application Pattern:**
- Guards are used as decorators on controller methods: `@UseGuards(FlexibleAuthGuard)`
- User context extracted to `request.user` or `request.telegramData` depending on auth method
- User active status is validated in FlexibleAuthGuard (line 39 in flexible-auth.guard.ts)

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
- Global exception filter registered in `main.ts:36` - automatically catches all exceptions
- `AllExceptionsLoggerFilter` logs exceptions to MongoDB ErrorLog collection
- User context automatically extracted (userId, telegramId, username)
- Supports flexible auth during logging (JWT or Telegram data)
- API endpoints for retrieving logs: `GET /logger`, `GET /logger/:id`, `POST /logger`

### User Reporting System
- Users can report other users by username
- Automatic sharing restrictions applied when user receives 10+ unresolved reports
- Admin endpoints for report management and resolution
- Reports stored in MongoDB with user references

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

## Important Development Notes

### Environment Variables
- **TELEGRAM_BOT_TOKEN** - Required (application exits in production without it)
- **ENCRYPTION_KEY** - Required for password encryption operations
- **NODE_ENV** - Set to 'production' for production mode
- Check `main.ts` for validation logic

### Testing Requirements
- Tests require `ENCRYPTION_KEY=test-key-for-testing` environment variable (automatically set in npm scripts)
- E2E and integration tests use `--forceExit --detectOpenHandles` flags
- Jest configuration files: `jest.config.js` (unit tests) and `test/jest-e2e.json` (e2e tests)

### Request Context Pattern
After authentication guard execution, user data is stored on the request object:
- **JWT Auth**: `request.user` contains `{ id, telegramId, username, firstName, lastName }`
- **Telegram Auth**: `request.telegramData` contains `{ telegramId, firstName, lastName, username, hash, authDate }`
- Controllers/services can access via `@Req() request` parameter

### Circular Module Dependencies
Due to business logic dependencies, some modules require `forwardRef()`:
```typescript
// Example in passwords.module.ts
forwardRef(() => UsersModule),
forwardRef(() => TelegramModule),
forwardRef(() => ReportsModule),
```
When adding new cross-module dependencies, consider if `forwardRef()` is needed to avoid initialization issues.

### Password Encryption Flow
1. Generate encryption key: `npx ts-node src/utils/generate-key.ts`
2. Store in `.env` as `ENCRYPTION_KEY`
3. Crypto service automatically encrypts/decrypts via `src/utils/crypto.util.ts`
4. Cleanup orphaned null keys when needed: `npx ts-node src/scripts/cleanup-null-keys.ts`

### Logger Integration
- Global exception logging is automatic via `AllExceptionsLoggerFilter`
- Manually log errors via `POST /logger` endpoint with authentication
- Retrieve logs via `GET /logger` (user's own logs) or `/logger/admin/all` (admin only)
- Admin endpoints check for admin role from Telegram ID (RolesGuard limitation with JWT)

## Module Exports & Dependency Injection

Key modules that export services for other modules:
- **SharedJwtModule** - Exports `JwtService` for all auth-related modules
- **UsersModule** - Exports `UsersService` and `RolesGuard`
- **PasswordModule** - Exports `PasswordService`
- **TelegramModule** - Provides validation services

When adding new features requiring these services, import the corresponding module instead of creating duplicate services.

## Testing Patterns

- Unit tests use `Test.createTestingModule()` with mocked dependencies
- Integration tests import actual modules and use test database
- Guard testing requires mocking `ExecutionContext` with proper request structure
- DTO validation tests verify class-validator decorators work correctly

## Known Issues & Limitations

- **RolesGuard** only parses admin role from Telegram authentication, JWT token admins cannot access `/logger/admin/*` endpoints
- **No automatic data retention** - logs accumulate indefinitely in MongoDB
- **Stats endpoint** (`GET /logger/stats/summary`) is a stub implementation
- **Unvalidated logData field** - accepts any JSON without schema constraints
