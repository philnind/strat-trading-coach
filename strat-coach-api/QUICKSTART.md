# Backend Quick Start Guide

Get the backend running locally in 5 minutes.

## Prerequisites

- Node.js 20.19+ installed
- PostgreSQL 16+ running locally OR Railway account
- Redis 7+ running locally OR Railway account
- Anthropic API key
- Clerk account (free tier)

---

## Step 1: Install Dependencies

```bash
cd /Users/phil/projects/strat-trading-coach/strat-coach-api
npm install
```

**Expected output:** ~166 packages installed successfully

---

## Step 2: Set Up PostgreSQL (Local)

### Option A: Use Existing PostgreSQL

If you have PostgreSQL running locally:

```bash
createdb strat_coach
```

### Option B: Use Docker

```bash
docker run --name strat-postgres \
  -e POSTGRES_DB=strat_coach \
  -e POSTGRES_USER=dev \
  -e POSTGRES_PASSWORD=dev \
  -p 5432:5432 \
  -d postgres:16-alpine
```

### Option C: Use Railway (Recommended)

1. Go to https://railway.app
2. Sign up (free tier available)
3. Create new project → Add PostgreSQL
4. Copy `DATABASE_URL` from settings

---

## Step 3: Set Up Redis (Local)

### Option A: Use Existing Redis

If you have Redis running locally, skip this step.

### Option B: Use Docker

```bash
docker run --name strat-redis \
  -p 6379:6379 \
  -d redis:7-alpine
```

### Option C: Use Railway (Recommended)

1. In your Railway project → Add Redis
2. Copy `REDIS_URL` from settings

---

## Step 4: Set Up Clerk

1. Go to https://clerk.com
2. Sign up (free up to 10K users)
3. Create new application: "The Strat Coach"
4. Copy API keys from dashboard:
   - `CLERK_SECRET_KEY` (starts with `sk_test_`)
   - `CLERK_PUBLISHABLE_KEY` (starts with `pk_test_`)

---

## Step 5: Configure Environment

Edit `.env`:

```bash
nano .env
```

**Minimum required for local development:**

```env
# Server
PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# Database (choose one)
# Local:
DATABASE_URL=postgresql://dev:dev@localhost:5432/strat_coach
# Railway:
DATABASE_URL=<paste from Railway>

# Redis (choose one)
# Local:
REDIS_URL=redis://localhost:6379
# Railway:
REDIS_URL=<paste from Railway>

# Anthropic
ANTHROPIC_API_KEY=<your Claude API key>

# Clerk
CLERK_SECRET_KEY=<from Clerk dashboard>
CLERK_PUBLISHABLE_KEY=<from Clerk dashboard>

# CORS (allow Electron app in dev)
CORS_ORIGIN=http://localhost:5173
```

---

## Step 6: Run Database Migrations

```bash
# Build TypeScript first
npm run build

# Run migrations
npm run db:migrate
```

**Expected output:**

```
🔄 Starting database migrations...

▶️  Running migration 001_initial.sql...
✅ Migration 001_initial.sql completed

🎉 All migrations completed successfully
```

---

## Step 7: Copy Coaching Files (Optional)

```bash
# Copy from your Trading vault
cp ~/Trading/THE-STRAT-GUARDRAILS.md coaching/
cp ~/Trading/TRADING-COACH-SYSTEM-PROMPT.md coaching/
```

**Note:** The server uses a placeholder system prompt if these files are missing.

---

## Step 8: Start Development Server

```bash
npm run dev
```

**Expected output:**

```
[17:00:00] INFO: 🚀 Server listening on http://0.0.0.0:3001
[17:00:00] INFO: 📊 Environment: development
[17:00:00] INFO: 🏥 Health check: http://0.0.0.0:3001/api/v1/health
[17:00:00] INFO: 📊 Database connected (2ms latency)
[17:00:00] INFO: 📡 Redis connected
[17:00:00] INFO: 🔐 Auth plugin initialized
[17:00:00] INFO: ⏱️  Rate limiter plugin initialized
[17:00:00] INFO: 🤖 Claude service initialized
```

---

## Step 9: Test the API

### Health Check

```bash
curl http://localhost:3001/api/v1/health
```

**Expected:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-02-15T...",
  "uptime": 42
}
```

### Status Check (with dependencies)

```bash
curl http://localhost:3001/api/v1/status
```

**Expected:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "environment": "development",
  "dependencies": {
    "database": { "status": "connected", "latency_ms": 2 },
    "redis": { "status": "connected" },
    "anthropic": { "status": "pending" },
    "stripe": { "status": "pending" }
  }
}
```

---

## Step 10: Test Authenticated Endpoint (Requires Clerk Setup)

### Create Test User in Clerk

1. Go to Clerk dashboard → Users
2. Create test user
3. Copy user ID

### Get JWT Token

Use Clerk's test mode or the Electron app to get a JWT.

### Test Chat Stream

```bash
curl -X POST http://localhost:3001/api/v1/chat/stream \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, test message"
  }'
```

**Expected:** SSE stream with Claude response

---

## Common Issues

### "better-sqlite3 not found"

This is expected - the backend uses PostgreSQL, not SQLite. Ignore this error.

### "ANTHROPIC_API_KEY not configured"

Make sure your `.env` file has `ANTHROPIC_API_KEY=sk-ant-...`

### "Database connection failed"

1. Check PostgreSQL is running: `psql -U dev -d strat_coach`
2. Check `DATABASE_URL` is correct in `.env`
3. Check network connectivity to Railway (if using)

### "Redis connection failed"

1. Check Redis is running: `redis-cli ping`
2. Check `REDIS_URL` is correct in `.env`
3. Server will continue with rate limiting disabled (graceful degradation)

---

## Development Commands

```bash
# Start with hot reload
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start

# Type check only (no build)
npm run typecheck

# Run tests (when implemented)
npm test

# Run migrations
npm run db:migrate
```

---

## Next Steps

1. ✅ Get backend running locally
2. ✅ Test all endpoints
3. 🔲 Deploy to Railway (see IMPLEMENTATION-STATUS.md)
4. 🔲 Integrate with Electron app
5. 🔲 Implement Phase 2 (Billing)

---

## Need Help?

- Check logs in terminal for detailed error messages
- Check `IMPLEMENTATION-STATUS.md` for complete setup instructions
- Check `README.md` for API documentation

