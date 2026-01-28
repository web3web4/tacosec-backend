<p align="center">
  <img src="public/logo512.png" width="128" alt="TACoSec Logo" />
</p>

<h1 align="center">TACoSec Backend</h1>

<p align="center">
  A secure, scalable backend API for password management and sharing with multi-factor authentication support.<br/>
  Built with modern technologies and designed for both Web2 and Web3 authentication paradigms.
</p>

<p align="center">
  <a href="https://nestjs.com/"><img src="https://img.shields.io/badge/NestJS-10.x-E0234E?style=flat-square&logo=nestjs" alt="NestJS" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript" alt="TypeScript" /></a>
  <a href="https://www.mongodb.com/"><img src="https://img.shields.io/badge/MongoDB-8.x-47A248?style=flat-square&logo=mongodb" alt="MongoDB" /></a>
  <a href="https://taco.build"><img src="https://img.shields.io/badge/Powered%20by-TACo-7C3AED?style=flat-square" alt="Powered by TACo" /></a>
  <img src="https://img.shields.io/badge/License-UNLICENSED-red?style=flat-square" alt="License" />
</p>

## Built With

[![Nest.js](https://img.shields.io/badge/Nest.js-E0234E?logo=nestjs)](https://nestjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Telegram](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?logo=telegram)](https://core.telegram.org/bots)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Encryption & Security](#encryption--security)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Authentication](#authentication)
- [Testing](#testing)
- [Deployment](#deployment)
- [License](#license)

---

## Overview

TACoSec is a NestJS-based server application that provides secure password/secret management and sharing capabilities. It uniquely supports dual authentication through both Telegram and EVM wallet signatures, making it suitable for both traditional Web2 users and Web3 crypto-native users.

Powered by [TACo](https://taco.build), TACoSec leverages cutting-edge cryptographic primitives to ensure your secrets remain secure and private.

The application enables users to:
- Securely store encrypted passwords and secrets
- Share secrets with other users via Telegram usernames or wallet addresses
- Manage multiple wallet public addresses per account
- Receive notifications about shared secrets
- Report malicious users with automatic restriction enforcement

---

## Features

### Core Features
- **Encrypted Password Storage** - AES-256-CBC encryption for all stored secrets
- **Secret Sharing** - Share passwords with other users securely
- **Hierarchical Secrets** - Support for parent-child secret relationships
- **View Tracking** - Track when shared secrets are viewed

### Authentication
- **Telegram Authentication** - Native Telegram WebApp init data validation
- **JWT Authentication** - Standard Bearer token authentication with refresh tokens
- **Wallet Authentication** - EVM signature verification using ethers.js
- **Flexible Auth Guards** - Endpoints can accept either auth method

### User Management
- **User Profiles** - Linked Telegram accounts and wallet addresses
- **Privacy Mode** - User-controlled privacy settings
- **Admin Dashboard** - User management with filtering and search

### Security & Moderation
- **User Reporting System** - Community-driven moderation
- **Automatic Restrictions** - Users with excessive reports get sharing restricted
- **Centralized Error Logging** - All exceptions logged to database
- **Request Validation** - Comprehensive DTO validation with class-validator

---

## Technology Stack

### Core Framework
| Technology | Version | Purpose |
|------------|---------|---------|
| [NestJS](https://nestjs.com/) | 10.x | Progressive Node.js framework for building scalable server-side applications |
| [TypeScript](https://www.typescriptlang.org/) | 5.x | Type-safe JavaScript superset |
| [Express](https://expressjs.com/) | 4.x | Underlying HTTP server (via @nestjs/platform-express) |

### Database
| Technology | Version | Purpose |
|------------|---------|---------|
| [MongoDB](https://www.mongodb.com/) | 5.x+ | NoSQL document database |
| [Mongoose](https://mongoosejs.com/) | 8.x | MongoDB ODM for schema modeling and validation |
| [@nestjs/mongoose](https://docs.nestjs.com/techniques/mongodb) | 11.x | NestJS MongoDB integration |

### Authentication & Security
| Technology | Version | Purpose |
|------------|---------|---------|
| [@nestjs/jwt](https://docs.nestjs.com/security/authentication) | 11.x | JWT token generation and verification |
| [bcrypt](https://github.com/kelektiv/node.bcrypt.js) | 5.x | Password hashing |
| [ethers](https://docs.ethers.org/) | 6.x | EVM wallet signature verification |
| Node.js Crypto | Built-in | AES-256-CBC encryption for secrets |

### Telegram Integration
| Technology | Version | Purpose |
|------------|---------|---------|
| [telegram](https://github.com/gram-js/gramjs) | 2.x | Telegram client library (GramJS) |
| [nestjs-telegram-bot-api](https://www.npmjs.com/package/nestjs-telegram-bot-api) | 1.x | Telegram Bot API integration |

### Validation & Transformation
| Technology | Version | Purpose |
|------------|---------|---------|
| [class-validator](https://github.com/typestack/class-validator) | 0.14.x | Decorator-based validation |
| [class-transformer](https://github.com/typestack/class-transformer) | 0.5.x | Object transformation and serialization |

### HTTP & Networking
| Technology | Version | Purpose |
|------------|---------|---------|
| [@nestjs/axios](https://docs.nestjs.com/techniques/http-module) | 4.x | HTTP client for external API calls |
| [axios](https://axios-http.com/) | 1.x | Promise-based HTTP client |

### Development & Testing
| Technology | Version | Purpose |
|------------|---------|---------|
| [Jest](https://jestjs.io/) | 29.x | Testing framework |
| [Supertest](https://github.com/ladjs/supertest) | 7.x | HTTP assertion library for e2e tests |
| [ESLint](https://eslint.org/) | 8.x | Code linting |
| [Prettier](https://prettier.io/) | 3.x | Code formatting |

### Deployment
| Technology | Version | Purpose |
|------------|---------|---------|
| [@vendia/serverless-express](https://github.com/vendia/serverless-express) | 4.x | Serverless deployment adapter |

---

## Encryption & Security

TACoSec employs military-grade encryption to protect your secrets. Here's a deep dive into how the encryption works and why it's secure.

### Encryption Algorithm: AES-256-CBC

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AES-256-CBC ENCRYPTION FLOW                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐ │
│   │   Plaintext  │    │  Random IV   │    │     256-bit Secret Key       │ │
│   │   (Secret)   │    │  (16 bytes)  │    │       (32 bytes hex)         │ │
│   └──────┬───────┘    └──────┬───────┘    └──────────────┬───────────────┘ │
│          │                   │                           │                  │
│          │                   │                           │                  │
│          ▼                   ▼                           ▼                  │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                                                                      │ │
│   │                     AES-256-CBC CIPHER                               │ │
│   │                                                                      │ │
│   │   Block 1: IV ⊕ Plaintext[0:16] → AES → Ciphertext[0:16]            │ │
│   │   Block 2: Ciphertext[0:16] ⊕ Plaintext[16:32] → AES → ...          │ │
│   │   Block N: Ciphertext[N-1] ⊕ Plaintext[N] → AES → Ciphertext[N]     │ │
│   │                                                                      │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│                    ┌───────────────────────────────────┐                   │
│                    │      Encrypted Output Format      │                   │
│                    │     IV (hex) : Ciphertext (hex)   │                   │
│                    │   "a1b2c3...f0" : "e4d5f6...9a"   │                   │
│                    └───────────────────────────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why AES-256-CBC is Secure

| Security Aspect | Implementation | Protection Level |
|-----------------|----------------|------------------|
| **Key Size** | 256 bits (32 bytes) | 2²⁵⁶ possible combinations - computationally infeasible to brute force |
| **Algorithm** | AES (Rijndael) | NIST-approved, used by US government for TOP SECRET data |
| **Mode** | CBC (Cipher Block Chaining) | Each block depends on previous block, preventing pattern analysis |
| **IV Generation** | Cryptographically random 16 bytes | Unique per encryption, prevents identical plaintext detection |

### How Encryption Works

#### 1. Key Generation
```bash
# Generate a cryptographically secure 256-bit key
npx ts-node src/utils/generate-key.ts

# Output: 64-character hex string (32 bytes)
# Example: c558ad827f514a3bc6fe872b2527890f6ed7f75febd5b7110e35af76424839ac
```

The key is generated using Node.js `crypto.randomBytes(32)`, which uses the operating system's cryptographically secure pseudorandom number generator (CSPRNG).

#### 2. Encryption Process

```typescript
// For each secret, a unique random IV is generated
const iv = crypto.randomBytes(16);  // 128-bit IV

// AES-256-CBC cipher is created with key and IV
const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

// Plaintext is encrypted
let encrypted = cipher.update(plaintext, 'utf8', 'hex');
encrypted += cipher.final('hex');

// Output format: IV:Ciphertext
// Example: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4:e4d5f6..."
```

#### 3. Decryption Process

```typescript
// Extract IV and ciphertext from stored value
const [ivHex, ciphertext] = encryptedData.split(':');
const iv = Buffer.from(ivHex, 'hex');

// Create decipher with same key and extracted IV
const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

// Decrypt
let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
decrypted += decipher.final('utf8');
```

### Security Properties

#### ✅ Confidentiality
- **256-bit encryption** ensures secrets cannot be read without the key
- Even with the fastest supercomputers, brute-forcing would take longer than the age of the universe

#### ✅ Semantic Security
- **Unique IV per encryption** means encrypting the same password twice produces different ciphertexts.
- Attackers cannot determine if two users have the same password.

#### ✅ Tamper Evidence
- CBC mode's block chaining ensures any modification to ciphertext corrupts decryption
- Altered data fails to decrypt properly, alerting to tampering.

#### ✅ Key Security
- Encryption key is **never stored in code** - only in environment variables
- Key is loaded into memory only at runtime
- Server-side encryption means client devices never see the raw key

### Encryption Key Best Practices

```bash
# ✅ DO: Generate a new key for production
npx ts-node src/utils/generate-key.ts

# ✅ DO: Store in environment variable
ENCRYPTION_KEY=your-64-char-hex-string

# ✅ DO: Use different keys for different environments
# Production, staging, and development should have separate keys

# ❌ DON'T: Commit keys to version control
# ❌ DON'T: Share keys via insecure channels
# ❌ DON'T: Reuse keys across unrelated systems
```

### Comparison with Other Encryption Methods

| Method | Key Size | Security Level | TACoSec Uses |
|--------|----------|----------------|--------------|
| AES-128 | 128 bits | Strong | ❌ |
| **AES-256-CBC** | **256 bits** | **Military-grade** | **✅** |
| AES-256-GCM | 256 bits | Military-grade + Auth | Future consideration |
| RSA-2048 | 2048 bits | Strong (asymmetric) | For signatures only |
| ChaCha20 | 256 bits | Strong | ❌ |

---

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  (Telegram WebApp / Web Browser / Mobile App / Wallet)          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │ JWT Guard   │  │ Telegram     │  │ Flexible Auth Guard │    │
│  │             │  │ Auth Guard   │  │ (JWT + Telegram)    │    │
│  └─────────────┘  └──────────────┘  └─────────────────────┘    │
│                    ┌──────────────┐                              │
│                    │ Roles Guard  │                              │
│                    │ (Admin/User) │                              │
│                    └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Controller Layer                            │
│  ┌────────┐ ┌───────┐ ┌───────────┐ ┌────────────────────────┐ │
│  │  Auth  │ │ Users │ │ Passwords │ │ Public Addresses       │ │
│  └────────┘ └───────┘ └───────────┘ └────────────────────────┘ │
│  ┌─────────────────┐ ┌─────────┐ ┌────────┐ ┌───────────────┐  │
│  │ Notifications   │ │ Reports │ │ Logger │ │ Telegram      │  │
│  └─────────────────┘ └─────────┘ └────────┘ └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AuthContextService (Centralized Auth)       │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌──────────────┐ ┌────────────────┐ ┌────────────────────┐   │
│  │ UsersService │ │ PasswordService│ │ NotificationsService│   │
│  └──────────────┘ └────────────────┘ └────────────────────┘   │
│  ┌──────────────────┐ ┌──────────────────┐                     │
│  │ TelegramValidator│ │ CryptoUtil       │                     │
│  └──────────────────┘ └──────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                    MongoDB (Mongoose)                       ││
│  │  ┌───────┐ ┌──────────┐ ┌───────────────┐ ┌────────────┐  ││
│  │  │ Users │ │ Passwords│ │ PublicAddresses│ │ Notifications│ ││
│  │  └───────┘ └──────────┘ └───────────────┘ └────────────┘  ││
│  │  ┌─────────┐ ┌───────────┐ ┌────────────┐                  ││
│  │  │ Reports │ │ ErrorLogs │ │ Challenges │                  ││
│  │  └─────────┘ └───────────┘ └────────────┘                  ││
│  └────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```



### Data Flow

1. **Request Reception** → Express receives HTTP request
2. **Global Pipes** → ValidationPipe validates and transforms DTOs
3. **Guard Execution** → Auth guards verify JWT/Telegram credentials
4. **Controller Handling** → Route handler processes request
5. **Service Logic** → Business logic execution
6. **Database Operations** → Mongoose queries MongoDB
7. **Response Transformation** → Data serialization
8. **Exception Handling** → Global filter logs errors to database

---

## Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher (or yarn)
- **MongoDB** 5.x or higher (local or cloud instance)
- **Telegram Bot Token** (for production Telegram auth validation)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd tacosec-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Generate encryption key**
   ```bash
   npx ts-node src/utils/generate-key.ts
   ```
   Copy the generated key for the `.env` file.

### Configuration

Create a `.env` file in the project root:

```env
# ===================
# Required Variables
# ===================

# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/tacosec

# JWT secret for token signing (use a strong random string)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Encryption key for password storage (32-byte hex string)
# Generate with: npx ts-node src/utils/generate-key.ts
ENCRYPTION_KEY=your-generated-encryption-key

# ===================
# Optional Variables
# ===================

# Environment
NODE_ENV=development

# JWT Token Expiration
JWT_EXPIRES_IN=24h
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# ===================
# Telegram Configuration
# ===================

# Required in production for init data validation
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_BOT_URL=https://t.me/your_bot

# Admin identification
ADMIN_TELEGRAM_ID=123456789

# Telegram Client (for contacts lookup features)
TELEGRAM_API_ID=your-api-id
TELEGRAM_API_HASH=your-api-hash
TELEGRAM_SESSION_PATH=./sessions
TELEGRAM_REQUEST_TIMEOUT=30000
TELEGRAM_MAX_RETRIES=3
TELEGRAM_RETRY_DELAY=1000
TELEGRAM_DEBUG=false
TELEGRAM_CACHE_TTL=300
TELEGRAM_MAX_CONTACTS_PER_REQUEST=100

# ===================
# Reports Configuration
# ===================

# Number of reports before automatic restriction
MAX_REPORTS_BEFORE_BAN=10

# Percentage threshold for restriction
MAX_PERCENTAGE_OF_REPORTS_REQUIRED_FOR_BAN=0.5

# ===================
# Feature Flags
# ===================

IS_STAGING=true
```

### Running the Application

```bash
# Development mode (with hot reload)
npm run start:dev

# Debug mode (with inspector)
npm run start:debug

# Production mode (requires build first)
npm run build
npm run start:prod
```

The server starts on `http://localhost:3000` in development mode.

---

## API Reference

### Authentication Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/auth/challange` | Create wallet auth challenge | None |
| `POST` | `/auth/login` | Login with Telegram or wallet | Telegram Header |
| `POST` | `/auth/refresh` | Refresh access token | None |

### User Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/users/signup` | Register via Telegram DTO | Telegram |
| `POST` | `/users/signup-initData` | Register via init data header | Telegram |
| `GET` | `/users/me` | Get current user info | Flexible |
| `PATCH` | `/users/update-info` | Update user profile | Flexible |
| `GET` | `/users/search/autocomplete` | Search users by username | Flexible |
| `PATCH` | `/users/me/privacy-mode` | Toggle privacy mode | Flexible |
| `GET` | `/users/admin/all` | List all users (admin) | Admin |
| `PATCH` | `/users/admin/active-status/:id` | Toggle user status (admin) | Admin |

### Password/Secret Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/passwords` | Create new secret | Telegram DTO |
| `GET` | `/passwords` | Get user's secrets | Telegram DTO |
| `PATCH` | `/passwords/:id` | Update secret | Telegram DTO |
| `DELETE` | `/passwords/:id` | Delete secret | Telegram DTO |
| `GET` | `/passwords/shared-with-me` | Get secrets shared with user | Telegram DTO |
| `PATCH` | `/passwords/secret-view/:id` | Record secret view | Flexible |
| `GET` | `/passwords/children/:parentId` | Get child secrets | Flexible |
| `GET` | `/passwords/admin/all` | List all secrets (admin) | Admin |

### Public Address Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/public-addresses` | Link wallet address | Flexible |
| `POST` | `/public-addresses/challange` | Create signing challenge | Flexible |
| `GET` | `/public-addresses` | Get user's addresses | Flexible |
| `GET` | `/public-addresses/:userId` | Get addresses by user ID | Flexible |

### Notification Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/notifications/my` | Get current user's notifications | Flexible |
| `GET` | `/notifications` | List all notifications (admin) | Admin |
| `GET` | `/notifications/stats` | Get notification stats (admin) | Admin |
| `DELETE` | `/notifications/cleanup/:days` | Clean old notifications (admin) | Admin |

### Report Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/reports` | Report a user | Flexible |
| `GET` | `/reports/is-restricted/:userIdentifier` | Check if user is restricted | Flexible |
| `GET` | `/reports/admin/reported-users` | List reported users (admin) | Admin |
| `PATCH` | `/reports/admin/resolve/:id` | Resolve a report (admin) | Admin |

### Logger Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/logger` | Save error log | Flexible |
| `GET` | `/logger/:id` | Get log by ID | Flexible |
| `DELETE` | `/logger/:id` | Delete log | Flexible |
| `GET` | `/logger` | List all logs (admin) | Admin |
| `GET` | `/logger/admin/all` | List logs with filters (admin) | Admin |

---

## Authentication

### Telegram Init Data Authentication

Send Telegram WebApp init data in the request header:

```http
POST /users/signup HTTP/1.1
x-telegram-init-data: query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22John%22%7D&auth_date=1619493727&hash=fa92cf66...
```

The server validates the hash against `TELEGRAM_BOT_TOKEN` to verify authenticity.

### JWT Bearer Token Authentication

After login, use the access token in subsequent requests:

```http
GET /users/me HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Wallet Signature Authentication

For wallet-based authentication:

1. **Get Challenge**
   ```http
   POST /auth/challange
   Content-Type: application/json

   {
     "publicAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f..."
   }
   ```

2. **Sign the challenge** with your wallet

3. **Login with signature**
   ```http
   POST /auth/login
   Content-Type: application/json

   {
     "publicAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f...",
     "signature": "0x..."
   }
   ```

The signature is verified using `ethers.verifyMessage()`.

### Flexible Authentication

Many endpoints accept either authentication method. The system prioritizes JWT if both are provided:

```
Priority: JWT Bearer Token > Telegram Init Data Header
```

---

## Testing

```bash
# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- src/users/users.service.spec.ts

# Run e2e tests
npm run test:e2e

# Run integration tests
npm run test:integration

# Generate coverage report
npm run test:cov
```

### Test Configuration

- Unit tests: `jest.config.js`
- E2E tests: `test/jest-e2e.json`
- Test encryption key is automatically set via `cross-env`

---

## Deployment

### Serverless Deployment

The application exports a serverless-compatible handler for platforms like Vercel, AWS Lambda, etc:

```typescript
// src/main.ts
export const handler = async (request, response) => {
  const app = await bootstrap();
  const httpAdapter = app.getHttpAdapter();
  return httpAdapter.getInstance()(request, response);
};
```


### Yarn Scripts (equivalents)

```bash
# lint (auto-fix enabled)
yarn run lint

# build
yarn run build

# start (dev watch)
yarn run start:dev

# start (non-watch)
yarn run start

# start production (run compiled dist)
yarn run start:prod

# unit tests
yarn run test

# e2e tests
yarn run test:e2e

# integration tests (selected)
yarn run test:integration

# format code with Prettier
yarn run format

# Vercel build (CI)
yarn run vercel-build
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
# Generate new encryption key
npx ts-node src/utils/generate-key.ts

# Cleanup invalid public addresses (maintenance)
npx ts-node src/scripts/cleanup-null-keys.ts
```

---

## License

This project is **UNLICENSED** - proprietary software.

---

## Powered By

🏗️ **[Nest.js](https://nestjs.com/)** — Progressive Node.js framework  
🗄️ **[MongoDB](https://www.mongodb.com/)** — Document database for encrypted data  
🔐 **[Telegram Bot API](https://core.telegram.org/bots)** — Authentication for Telegram Mini App users  
🔑 **[ethers.js](https://docs.ethers.org/)** — Wallet address authentication 

### Authentication

- **Web Users:** Validated via seed phrase wallet signatures.
- **Telegram Access:** Telegram Mini App & Bot API authentication + seed phrase wallet signatures for the data access.

---

**TACoSec** • [Frontend](https://github.com/yourorg/tacosec-frontend) • [Backend](https://github.com/yourorg/tacosec-backend) (you are here) • *Powered by [TACo](https://taco.build) 💚* • **Built with ❤️ by [Web3Web4](https://web3web4.com)**


