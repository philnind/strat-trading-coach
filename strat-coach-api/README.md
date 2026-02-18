# Strat Coach API

Backend server for The Strat Coach Electron app. Handles authentication, Claude API proxying, usage tracking, and subscription billing.

## Architecture

- **Framework:** Fastify (Node.js)
- **Database:** PostgreSQL
- **Cache/Rate Limiting:** Redis
- **Authentication:** Clerk JWT
- **Billing:** Stripe
- **AI Provider:** Anthropic Claude API
- **Hosting:** Railway

## Project Structure

```
src/
├── index.ts                 # Main server entry point
├── config/
│   ├── env.ts              # Environment validation
│   └── constants.ts        # Rate limits, tier configs
├── plugins/
│   ├── auth.ts             # Clerk JWT verification
│   ├── database.ts         # PostgreSQL connection
│   ├── redis.ts            # Redis client
│   ├── rate-limiter.ts     # Rate limiting
│   └── stripe.ts           # Stripe client
├── routes/
│   ├── health.ts           # Health checks
│   ├── auth.ts             # Authentication endpoints
│   ├── chat.ts             # Claude proxy (SSE streaming)
│   ├── usage.ts            # Usage tracking
│   └── billing.ts          # Stripe integration
├── services/
│   ├── claude.ts           # Anthropic SDK wrapper
│   ├── usage-tracker.ts    # Token counting
│   └── billing.ts          # Stripe metered billing
├── middleware/
│   └── error-handler.ts    # Global error handling
├── db/
│   ├── migrations/         # SQL migrations
│   └── queries.ts          # Type-safe queries
└── types/
    └── fastify.d.ts        # Fastify type augmentation
```

## Setup

### Prerequisites

- Node.js 20.19+ or 22.12+
- PostgreSQL 16+
- Redis 7+
- Anthropic API key
- Clerk account
- Stripe account

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env

# Run database migrations (after DB setup)
npm run db:migrate

# Start development server
npm run dev
```

## Development

```bash
# Start with hot reload
npm run dev

# Type check
npm run typecheck

# Run tests
npm test
npm run test:unit
npm run test:integration
npm run test:watch
npm run test:ui

# Build for production
npm run build

# Start production server
npm start
```

## API Endpoints

### Health & System

- `GET /api/v1/health` - Health check
- `GET /api/v1/status` - Service status with dependencies

### Authentication

- `POST /api/v1/auth/register` - Create account
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh JWT
- `GET /api/v1/auth/me` - Get user profile
- `POST /api/v1/auth/logout` - Logout
- `DELETE /api/v1/auth/account` - Delete account

### Chat (Claude Proxy)

- `POST /api/v1/chat/stream` - Stream chat completion (SSE)
- `POST /api/v1/chat/multi-timeframe` - Multi-timeframe analysis (SSE)

### Usage & Billing

- `GET /api/v1/usage/current` - Current period usage
- `GET /api/v1/usage/history` - Historical usage
- `POST /api/v1/billing/checkout` - Create Stripe Checkout
- `POST /api/v1/billing/portal` - Stripe Customer Portal
- `GET /api/v1/billing/subscription` - Get subscription
- `POST /api/v1/billing/webhook` - Stripe webhooks

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests (requires DB and Redis)
npm run test:integration

# Watch mode
npm run test:watch

# UI mode
npm run test:ui
```

## Deployment

### Railway

```bash
# Install Railway CLI
npm i -g railway

# Login
railway login

# Link project
railway link

# Deploy
git push

# View logs
railway logs
```

### Environment Variables

See `.env.example` for all required environment variables.

## Implementation Status

### Phase 1: Backend Foundation (Current)

- [x] Task 1.1: Initialize Fastify project ✅
- [ ] Task 1.2: PostgreSQL schema + migrations
- [ ] Task 1.3: Clerk JWT auth plugin
- [ ] Task 1.4: Redis rate limiter plugin
- [ ] Task 1.5: `/chat/stream` SSE proxy
- [ ] Task 1.6: Usage tracking service
- [ ] Task 1.7: `/usage/current` endpoint
- [ ] Task 1.8: Railway deployment
- [ ] Task 1.9: Integration tests

## Documentation

- [PRD: Backend Server](../PRD-BACKEND-SERVER.md) - Full technical specification
- [Task Model Mapping](../BACKEND-TASK-MODEL-MAPPING.md) - Implementation guide
- [PRD: Strat Monitor](../PRD-STRAT-MONITOR.md) - Desktop app context

## License

ISC
