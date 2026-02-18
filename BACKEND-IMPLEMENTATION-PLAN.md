# Backend + Claude Integration Implementation Plan

**Created:** 2026-02-14
**Status:** 🔴 **NOT STARTED** - Architectural proposal for centralized API key + usage-based billing
**Replaces:** Epic 4 (original local API key storage approach)

---

## Overview

**Goal:** Replace local API key storage with centralized backend that handles authentication, Claude API proxying, token usage tracking, and subscription management.

**Timeline:** ~3-4 days of focused development (14 hours)
**Complexity:** Medium-High (new backend infrastructure)

---

## Architecture Decision: Serverless Backend

**Recommended Stack:**
- **Clerk** - Auth & user management (free up to 10k users, great DX)
- **Vercel Edge Functions** - API proxy for Claude requests (generous free tier)
- **Vercel Postgres** - Track usage/tokens per user
- **Stripe** - Subscription billing (Free/Pro/Enterprise tiers)

**Why this stack:**
- ✅ Fast to build (auth is done for you)
- ✅ Scales automatically
- ✅ Low/no cost until you have real users
- ✅ Everything integrates cleanly
- ✅ You can manage subscriptions in Stripe dashboard (no custom admin UI needed initially)

---

## Pricing Tiers (Example - you can adjust)

| Tier | Monthly Price | Tokens Included | Overage |
|------|---------------|-----------------|---------|
| **Free** | $0 | 100,000 tokens (~30 messages) | Blocked |
| **Pro** | $29 | 2,000,000 tokens (~600 messages) | $0.02/1k tokens |
| **Enterprise** | $99 | 10,000,000 tokens (~3000 messages) | $0.015/1k tokens |

**Unit Economics:**
- Claude Sonnet costs ~$3/million input tokens, ~$15/million output tokens
- Your pricing gives you ~50% margin on token costs

---

## Phase 1: Backend Infrastructure Setup

### Task 4.1: Initialize Vercel Project

**What we're building:**
- Vercel project for serverless functions
- Postgres database for usage tracking
- Environment variables for API keys

**Steps:**
1. Create new Vercel project: `strat-monitor-api`
2. Set up Vercel Postgres database
3. Configure environment variables:
   - `ANTHROPIC_API_KEY` (your Claude API key)
   - `CLERK_SECRET_KEY` (for auth verification)
   - `STRIPE_SECRET_KEY` (for billing)
   - `STRIPE_WEBHOOK_SECRET` (for webhooks)

**Deliverables:**
- `api/` directory in project root (or separate repo if you prefer)
- `/api/health` endpoint (test that deployment works)
- Database connection working

**Time:** 30 min

---

### Task 4.2: Set Up Clerk Authentication

**What we're building:**
- Clerk application for user management
- JWT verification in API endpoints
- User metadata for subscription tier

**Steps:**
1. Create Clerk account + application
2. Configure Clerk:
   - Enable email/password auth
   - Set up user metadata fields: `subscriptionTier`, `stripeCustomerId`
3. Add Clerk middleware to Vercel functions
4. Create `/api/auth/me` endpoint (returns current user + usage stats)

**Database Schema:**
```sql
CREATE TABLE users (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  stripe_customer_id TEXT,
  subscription_tier TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  tokens_used_current_period INTEGER DEFAULT 0,
  period_start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX idx_users_stripe_id ON users(stripe_customer_id);
```

**Deliverables:**
- Clerk app configured
- User table created
- `/api/auth/me` endpoint working
- JWT verification middleware

**Time:** 1 hour

---

### Task 4.3: Set Up Stripe Subscriptions

**What we're building:**
- Stripe products for Free/Pro/Enterprise tiers
- Webhook handler for subscription events
- Customer portal for managing subscriptions

**Steps:**
1. Create Stripe account (if not exists)
2. Create products in Stripe dashboard:
   - **Free Tier** (Price: $0)
   - **Pro Tier** (Price: $29/month, metered billing for overages)
   - **Enterprise Tier** (Price: $99/month, metered billing for overages)
3. Set up metered billing for token overages
4. Create webhook endpoint: `/api/stripe/webhook`
   - Handle `customer.subscription.created`
   - Handle `customer.subscription.updated`
   - Handle `customer.subscription.deleted`
5. Create `/api/stripe/create-checkout-session` (for upgrades)
6. Create `/api/stripe/create-portal-session` (for managing subscription)

**Deliverables:**
- Stripe products configured
- Webhook handler working
- Checkout flow working
- Customer portal link working

**Time:** 1.5 hours

---

### Task 4.4: Build Claude API Proxy

**What we're building:**
- `/api/claude/stream` endpoint that proxies requests to Anthropic
- Token counting and usage tracking
- Rate limiting per tier
- Streaming response support

**API Endpoint Spec:**

```typescript
POST /api/claude/stream

Headers:
  Authorization: Bearer <clerk-jwt-token>

Body:
{
  messages: Array<{role: 'user' | 'assistant', content: string}>,
  image?: string, // base64 encoded screenshot
  max_tokens?: number
}

Response: Server-Sent Events (SSE) stream
  - event: message_start
  - event: content_block_delta (streaming text)
  - event: message_stop
  - event: usage (final token count)
```

**Token Limits by Tier:**

| Tier | Monthly Tokens | Hard Limit |
|------|---------------|------------|
| Free | 100,000 | Block when exceeded |
| Pro | 2,000,000 | Allow overages (billed) |
| Enterprise | 10,000,000 | Allow overages (billed) |

**Steps:**
1. Create `/api/claude/stream` endpoint
2. Verify Clerk JWT
3. Look up user's subscription tier
4. Check token usage against limit
5. If allowed, proxy to Claude API
6. Stream response back to client
7. Count tokens in response
8. Update `users.tokens_used_current_period`
9. If overage, report to Stripe metered billing

**Database Schema Addition:**
```sql
CREATE TABLE api_requests (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  request_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  model TEXT,
  success BOOLEAN,
  error_message TEXT,
  FOREIGN KEY (clerk_user_id) REFERENCES users(clerk_user_id)
);

CREATE INDEX idx_requests_user ON api_requests(clerk_user_id);
CREATE INDEX idx_requests_timestamp ON api_requests(request_timestamp);
```

**Deliverables:**
- `/api/claude/stream` endpoint working
- Token counting accurate
- Usage tracking in database
- Rate limiting enforced
- Streaming works end-to-end

**Time:** 2 hours

---

### Task 4.5: Usage Reset & Billing Cycle

**What we're building:**
- Cron job to reset token usage monthly
- Stripe metered billing reports for overages

**Steps:**
1. Create Vercel cron job (runs daily at midnight UTC)
2. Check each user's `period_start_date`
3. If >30 days ago:
   - Report overage tokens to Stripe (if any)
   - Reset `tokens_used_current_period` to 0
   - Update `period_start_date` to now
4. Create `/api/usage/current` endpoint (for app to display usage)

**Deliverables:**
- Cron job deployed
- Usage resets monthly
- Overage billing works
- Usage endpoint returns accurate data

**Time:** 1 hour

---

## Phase 2: Electron App Integration

### Task 4.6: Add Authentication UI

**What we're building:**
- Login screen (shown on first launch)
- Sign up screen
- Account settings page (show usage, manage subscription)

**New Components:**
```
src/renderer/src/components/auth/
  ├── LoginScreen.tsx          # Email/password login
  ├── SignupScreen.tsx         # Email/password signup
  ├── AccountSettings.tsx      # Usage stats + manage subscription
  └── AuthGuard.tsx            # Wrapper that shows login if not authed
```

**Clerk Integration:**
- Use `@clerk/clerk-js` (lightweight, works in Electron)
- Store session token in Electron's `safeStorage`
- Add IPC handlers for auth state

**Steps:**
1. Install `@clerk/clerk-js`
2. Create login/signup UI components
3. Add IPC handlers:
   - `auth:login` → calls Clerk API
   - `auth:signup` → calls Clerk API
   - `auth:logout` → clears stored token
   - `auth:get-session` → returns stored token
4. Create `AuthGuard` component that wraps main app
5. Store JWT in `safeStorage` after successful login

**Deliverables:**
- Login screen works
- Signup screen works
- Session persists across app restarts
- Logout clears session

**Time:** 2 hours

---

### Task 4.7: Replace Claude SDK with Backend API

**What we're changing:**
- Remove `@anthropic-ai/sdk` from renderer
- Replace with HTTP client that calls `/api/claude/stream`
- Add token usage display in UI

**Steps:**
1. Create `src/renderer/src/api/backend.ts`:
   ```typescript
   export async function streamChatCompletion(
     messages: Message[],
     screenshot?: string
   ): Promise<AsyncIterable<StreamEvent>>
   ```
2. Update chat store to use new API
3. Add usage display component:
   - Show tokens used this month
   - Show tokens remaining
   - Show subscription tier
   - Add "Upgrade" button if on Free tier
4. Handle quota exceeded errors gracefully

**UI Changes:**
```
Chat Header:
  [Your plan: Pro] [1.2M / 2M tokens used] [⚙️ Settings]

When quota exceeded (Free tier):
  ⚠️ You've used all 100k tokens this month.
  [Upgrade to Pro] to continue chatting.
```

**Deliverables:**
- All Claude API calls go through backend
- Usage stats display in UI
- Quota exceeded handled gracefully
- Upgrade flow works

**Time:** 2 hours

---

### Task 4.8: Add Subscription Management

**What we're building:**
- "Upgrade" flow (opens Stripe Checkout)
- "Manage Subscription" flow (opens Stripe Customer Portal)
- Handle subscription status changes

**Steps:**
1. Add IPC handler: `stripe:create-checkout-session`
   - Calls `/api/stripe/create-checkout-session`
   - Opens checkout URL in external browser
2. Add IPC handler: `stripe:create-portal-session`
   - Calls `/api/stripe/create-portal-session`
   - Opens portal URL in external browser
3. Add subscription status polling (check every 5 min)
   - Call `/api/auth/me` to get latest tier
   - Update UI if subscription changed

**Deliverables:**
- Upgrade button works
- Manage subscription button works
- Subscription changes reflected in app within 5 min

**Time:** 1.5 hours

---

## Phase 3: Testing & Deployment

### Task 4.9: Backend Testing

**What we're testing:**
1. Auth flow (signup, login, logout)
2. Claude API proxy (streaming, token counting)
3. Usage limits (Free tier blocks, Pro tier allows)
4. Stripe webhooks (subscription changes update DB)
5. Usage reset cron job

**Test Script:**
```bash
# Test auth
curl -X POST https://api.stratmonitor.com/api/auth/signup \
  -d '{"email":"test@example.com","password":"test123"}'

# Test Claude proxy (with JWT)
curl -X POST https://api.stratmonitor.com/api/claude/stream \
  -H "Authorization: Bearer $JWT" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'

# Test usage endpoint
curl https://api.stratmonitor.com/api/usage/current \
  -H "Authorization: Bearer $JWT"
```

**Deliverables:**
- All endpoints respond correctly
- Error handling works (invalid JWT, quota exceeded, etc.)
- No console errors

**Time:** 1 hour

---

### Task 4.10: Electron App Testing

**What we're testing:**
1. First launch shows login screen
2. Signup flow creates account
3. Login flow stores session
4. Chat sends messages through backend
5. Token usage updates in real-time
6. Quota exceeded shows upgrade prompt
7. Upgrade flow opens Stripe Checkout
8. Session persists after app restart

**Manual Test Checklist:**
- [ ] Launch app → see login screen
- [ ] Sign up with new email → account created
- [ ] Log in → chat screen appears
- [ ] Send message → response streams back
- [ ] Check usage stats → accurate token count
- [ ] Exhaust free tier → blocked with upgrade prompt
- [ ] Click upgrade → Stripe Checkout opens
- [ ] Complete payment → tier updates to Pro
- [ ] Send message → works again (Pro tier)
- [ ] Quit app, relaunch → still logged in

**Deliverables:**
- All flows work end-to-end
- No runtime errors
- Session persistence works

**Time:** 1 hour

---

### Task 4.11: Update Documentation

**What we're updating:**
1. `CLAUDE.md` - Remove Task 4.1 (local API key storage), add new tasks
2. `README.md` - Add backend setup instructions
3. `PRD-STRAT-MONITOR.md` - Update monetization section
4. Create `BACKEND-SETUP.md` - Step-by-step guide for deploying backend

**Deliverables:**
- All docs reflect new architecture
- Setup instructions for future developers

**Time:** 30 min

---

## Deployment Checklist

**Before launch:**
- [ ] Vercel project deployed to production
- [ ] Environment variables set in Vercel
- [ ] Database migrations run
- [ ] Stripe products created
- [ ] Stripe webhook endpoint configured
- [ ] Clerk production instance configured
- [ ] Cron job enabled
- [ ] Test accounts created (Free, Pro, Enterprise)
- [ ] End-to-end test passed on production backend

**Post-launch monitoring:**
- [ ] Monitor Vercel logs for errors
- [ ] Monitor Stripe dashboard for failed payments
- [ ] Monitor usage stats (are limits reasonable?)
- [ ] Check token cost vs revenue margin

---

## Technology Stack Summary

| Component | Technology | Why |
|-----------|-----------|-----|
| **Backend API** | Vercel Edge Functions | Serverless, fast, generous free tier |
| **Database** | Vercel Postgres (or Neon) | Managed PostgreSQL, easy integration |
| **Auth** | Clerk | User management done for you |
| **Billing** | Stripe | Industry standard, metered billing support |
| **Electron HTTP Client** | `fetch` API | Native, no extra deps |

**Total New Dependencies:**
- `@clerk/clerk-js` (Electron app only)

---

## Cost Estimates (Monthly)

**At 100 users:**
- Vercel: $0 (within free tier)
- Vercel Postgres: $0 (within free tier)
- Clerk: $0 (free up to 10k users)
- Stripe: ~$30 (payment processing fees)
- Claude API: Variable (depends on usage, but you have 50% margin built in)

**At 1000 users:**
- Vercel: ~$20/mo (edge function invocations)
- Vercel Postgres: ~$30/mo (storage + queries)
- Clerk: $25/mo (over free tier)
- Stripe: ~$300 (payment processing)
- Claude API: Variable (still profitable with 50% margin)

---

## Risk Mitigation

**Risk 1: Token counting inaccurate**
*Mitigation:* Use Anthropic's official token count from API response, not client-side estimation

**Risk 2: Users abuse free tier with multiple accounts**
*Mitigation:* Require email verification, rate limit by IP, monitor signup patterns

**Risk 3: Backend API key leaked**
*Mitigation:* Never expose in client, use Vercel env vars, rotate if compromised

**Risk 4: Stripe webhook replay attacks**
*Mitigation:* Verify webhook signatures, use idempotency keys

**Risk 5: Database grows too large**
*Mitigation:* Archive old API requests after 90 days, keep only aggregated stats

---

## Success Metrics

After Epic 4 complete, we should have:
- ✅ Users can sign up/login
- ✅ Users can send messages (proxied through backend)
- ✅ Token usage tracked accurately
- ✅ Free tier blocks at 100k tokens
- ✅ Pro tier allows 2M tokens + overages
- ✅ Upgrade flow works (Stripe Checkout)
- ✅ Subscription changes update in app
- ✅ 50%+ profit margin on token costs

---

## Timeline

| Phase | Tasks | Time | Dependencies |
|-------|-------|------|--------------|
| **Phase 1** | Backend setup (4.1-4.5) | 6 hours | None (can start now) |
| **Phase 2** | Electron integration (4.6-4.8) | 5.5 hours | Phase 1 complete |
| **Phase 3** | Testing & docs (4.9-4.11) | 2.5 hours | Phase 2 complete |
| **Total** | | **14 hours** | |

**Realistic timeline:** 3-4 days (accounting for testing, debugging, iteration)

---

## Next Steps

**When ready to implement:**

1. **You create accounts:**
   - Clerk account
   - Vercel account
   - Stripe account

2. **I implement:**
   - All backend tasks (4.1-4.5)
   - All Electron integration (4.6-4.8)
   - All testing (4.9-4.11)

3. **You provide:**
   - Credentials/API keys when needed
   - Review and deploy

---

*This plan replaces the original Epic 4 (local API key storage) with a centralized backend approach.*
*Created: 2026-02-14*
*Status: Proposal - awaiting implementation decision*
