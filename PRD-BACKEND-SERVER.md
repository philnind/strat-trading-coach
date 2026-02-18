# PRD: Backend Server Architecture for The Strat Coach

**Version:** 1.0.0
**Created:** 2026-02-15
**Author:** Phil + Claude
**Status:** DRAFT - Ready for Review
**Supersedes:** `BACKEND-IMPLEMENTATION-PLAN.md` (2026-02-14 initial proposal)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [API Design](#4-api-design)
5. [Streaming Implementation](#5-streaming-implementation)
6. [Usage Tracking & Billing](#6-usage-tracking--billing)
7. [Database Design](#7-database-design)
8. [Scalability & Performance](#8-scalability--performance)
9. [DevOps & Deployment](#9-devops--deployment)
10. [Migration Path](#10-migration-path)
11. [Security](#11-security)
12. [Implementation Phases](#12-implementation-phases)
13. [Cost Analysis](#13-cost-analysis)
14. [Risk Assessment](#14-risk-assessment)
15. [Appendices](#15-appendices)

---

## 1. Executive Summary

### Problem

The Strat Coach is an Electron desktop application that provides AI-powered trading coaching using the Anthropic Claude API. Currently, it calls the Claude API directly from the main process using a locally stored API key. This approach works for personal development use but is unacceptable for distribution because:

1. **Security risk**: The Anthropic API key would be embedded in or accessible to every installed client
2. **No usage control**: No ability to meter, limit, or bill for API usage per user
3. **No user identity**: Cannot track who is using the system or personalize experiences
4. **Cost exposure**: A leaked key could drain the entire Anthropic account
5. **No monetization path**: Cannot charge users for the AI coaching service

### Solution

Build a backend server that acts as a secure proxy between the Electron app and the Anthropic Claude API. The server handles authentication, streams Claude responses to clients, tracks token consumption per user, enforces rate limits and quotas, and integrates with Stripe for subscription billing.

### Success Criteria

- Users can sign up, log in, and chat with the AI coach through the backend
- The Anthropic API key never leaves the server
- Token usage is tracked accurately per user per billing period
- Free tier users are capped at 100K tokens/month; paid users get higher limits
- Streaming responses have less than 200ms additional latency vs. direct API calls
- System supports 1,000 concurrent users without degradation
- Upgrade/downgrade flows work end-to-end through Stripe

### Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Framework** | Fastify (Node.js) | 5.6x faster than Express; native async/await; schema validation |
| **Database** | PostgreSQL (via Neon or Railway) | ACID compliance; JSON support; mature tooling; usage tracking |
| **Cache/Rate Limiting** | Redis (Upstash or Railway) | Distributed rate limiting; session caching; sub-ms latency |
| **Auth** | Clerk | Managed user auth; JWT verification; free up to 10K users |
| **Billing** | Stripe | Native metered billing; token-based usage tracking; industry standard |
| **Hosting** | Railway (primary) or Render (alternative) | Integrated Postgres + Redis; Git-based deploy; consumption pricing |
| **Streaming Protocol** | Server-Sent Events (SSE) | One-way server-to-client; HTTP-native; simpler than WebSockets |
| **Methodology Distribution** | Bundled in app + versioned on server | Prompt caching optimization; offline support; consistency |

---

## 2. Architecture Overview

### High-Level Architecture

```
+------------------------------------------------------------------+
|                    THE STRAT COACH (Electron)                     |
|                                                                   |
|  +------------------+    IPC    +---------------------------+     |
|  | Renderer Process | <-------> |      Main Process         |     |
|  | (React 19 UI)    |           | - Screenshot capture      |     |
|  +------------------+           | - Local SQLite (trades)   |     |
|                                 | - HTTP client to backend  |     |
|                                 +-------------+-------------+     |
+-------------------------------|-------------|-|-------------------+
                                |             |
                          HTTPS |        SSE  |
                        (REST)  |   (streaming)|
                                |             |
+-------------------------------|-------------|---------------------+
|                        BACKEND SERVER                             |
|                                                                   |
|  +------------------+  +------------------+  +-----------------+  |
|  |   Auth Layer     |  |  API Gateway     |  |  Rate Limiter   |  |
|  |   (Clerk JWT)    |  |  (Fastify)       |  |  (Redis)        |  |
|  +--------+---------+  +--------+---------+  +--------+--------+  |
|           |                     |                      |          |
|  +--------+---------------------+----------------------+--------+ |
|  |                     Route Handlers                           | |
|  |  /api/auth/*  /api/chat/stream  /api/usage/*  /api/stripe/* | |
|  +--------+---------------------+----------------------+--------+ |
|           |                     |                      |          |
|  +--------+---------+  +-------+--------+  +----------+-------+  |
|  |   PostgreSQL     |  |  Anthropic     |  |     Stripe       |  |
|  |   (Usage, Users) |  |  Claude API    |  |     (Billing)    |  |
|  +------------------+  +----------------+  +------------------+  |
+------------------------------------------------------------------+
```

### Request Flow: Chat Message

```
sequenceDiagram
    participant U as User (Renderer)
    participant M as Main Process
    participant B as Backend (Fastify)
    participant R as Redis
    participant DB as PostgreSQL
    participant C as Claude API

    U->>M: Send message (IPC)
    M->>B: POST /api/chat/stream (JWT + message)
    B->>B: Verify JWT (Clerk)
    B->>R: Check rate limit
    R-->>B: Allowed (tokens remaining)
    B->>DB: Lookup user tier + usage
    DB-->>B: User profile + current period usage
    B->>C: messages.create(stream: true)
    loop SSE Stream
        C-->>B: content_block_delta
        B-->>M: SSE: data: {type: "delta", text: "..."}
        M-->>U: IPC: chat:message-chunk
    end
    C-->>B: message_stop + usage
    B->>DB: INSERT token_usage record
    B->>DB: UPDATE user.tokens_used
    B->>R: Decrement rate limit bucket
    B-->>M: SSE: data: {type: "complete", usage: {...}}
    M-->>U: IPC: chat:message-complete
```

### Component Responsibilities

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| **Electron Main Process** | IPC bridge, screenshot capture, local DB, HTTP client to backend | Node.js (Electron) |
| **Electron Renderer** | UI, chat interface, settings, auth screens | React 19, assistant-ui |
| **Backend API** | Auth verification, Claude proxying, usage tracking, billing | Fastify, Node.js 20+ |
| **PostgreSQL** | User accounts, usage records, billing summaries, conversations (server-side) | PostgreSQL 16 |
| **Redis** | Rate limiting, session caching, request deduplication | Redis 7 / Upstash |
| **Clerk** | User registration, login, JWT issuance, email verification | Clerk SaaS |
| **Stripe** | Subscription management, metered billing, payment processing | Stripe Billing |
| **Claude API** | AI coaching responses, vision analysis, prompt caching | Anthropic API |

---

## 3. Authentication & Authorization

### Auth Strategy: JWT with Clerk

**Why JWT with Clerk (vs. alternatives):**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **JWT + Clerk** | Managed auth; free 10K users; works in Electron; stateless verification | Third-party dependency | **CHOSEN** |
| OAuth 2.0 + PKCE | Standard for desktop apps; secure | Complex to implement from scratch; requires auth server | Good but slower to build |
| Session-based | Simple; server-controlled | Requires sticky sessions; harder to scale horizontally | Not ideal for SSE streaming |
| Self-hosted JWT | Full control; no vendor | Must build user management, email verification, password reset | Too much overhead |

### Authentication Flow

```
1. REGISTRATION
   Renderer -> Main -> Clerk SDK -> Clerk API
   - User enters email + password in Electron app
   - Clerk handles email verification
   - On success: JWT issued, stored in Electron safeStorage
   - User record created in PostgreSQL

2. LOGIN
   Renderer -> Main -> Clerk SDK -> Clerk API
   - User enters credentials
   - Clerk validates and issues JWT (1-day expiry)
   - JWT stored in Electron's safeStorage (OS keychain)
   - Main process includes JWT in all backend requests

3. TOKEN REFRESH
   Main Process -> Clerk SDK (automatic)
   - Clerk SDK handles silent token refresh
   - New JWT stored in safeStorage
   - No user interaction required
   - If refresh fails (offline > 7 days): re-prompt login

4. REQUEST AUTH
   Main -> Backend: Authorization: Bearer <jwt>
   - Fastify middleware verifies JWT signature via Clerk public key
   - Extracts user_id, email, metadata
   - Attaches user context to request
   - Rejects expired/invalid tokens with 401
```

### Token Storage in Electron

```typescript
// Main process: secure token management
import { safeStorage } from 'electron';

class AuthTokenStore {
  private static readonly KEY = 'strat-coach-auth-token';

  static store(token: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage not available');
    }
    const encrypted = safeStorage.encryptString(token);
    // Store encrypted buffer to disk (app data directory)
    fs.writeFileSync(this.getTokenPath(), encrypted);
  }

  static retrieve(): string | null {
    const tokenPath = this.getTokenPath();
    if (!fs.existsSync(tokenPath)) return null;

    const encrypted = fs.readFileSync(tokenPath);
    return safeStorage.decryptString(encrypted);
  }

  static clear(): void {
    const tokenPath = this.getTokenPath();
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
  }

  private static getTokenPath(): string {
    return path.join(app.getPath('userData'), '.auth-token');
  }
}
```

### Authorization Tiers

| Tier | Rate Limit | Monthly Tokens | Features |
|------|-----------|---------------|----------|
| **Free** | 10 req/min, 50 req/hour | 100,000 (~30 messages) | Single timeframe analysis |
| **Pro** | 30 req/min, 300 req/hour | 2,000,000 (~600 messages) | Multi-timeframe, conversation history sync |
| **Enterprise** | 60 req/min, unlimited/hour | 10,000,000 (~3,000 messages) | Priority support, custom methodology |

### JWT Payload Structure

```json
{
  "sub": "user_2abc123",
  "email": "trader@example.com",
  "iat": 1739577600,
  "exp": 1739664000,
  "azp": "strat-coach-electron",
  "metadata": {
    "subscription_tier": "pro",
    "stripe_customer_id": "cus_abc123"
  }
}
```

### SSE Authentication

Since SSE connections are long-lived HTTP requests, authentication is handled at connection initiation:

```typescript
// Client: Electron main process
async function connectStream(message: string, jwt: string): Promise<ReadableStream> {
  const response = await fetch(`${BACKEND_URL}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({ message }),
  });

  if (response.status === 401) {
    // Token expired during stream setup - refresh and retry
    const newJwt = await refreshToken();
    return connectStream(message, newJwt);
  }

  return response.body; // ReadableStream of SSE events
}
```

---

## 4. API Design

### Base URL

- **Development:** `http://localhost:3001/api`
- **Staging:** `https://api-staging.stratcoach.app/api`
- **Production:** `https://api.stratcoach.app/api`

### API Versioning

All endpoints are prefixed with `/api/v1/`. The initial release ships as v1. Breaking changes trigger a new version (v2, etc.) with a 6-month deprecation window for previous versions.

### Endpoint Catalog

#### Health & System

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/health` | None | Health check + version info |
| GET | `/api/v1/status` | None | Service status + dependencies |

#### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | None | Create user account (delegates to Clerk) |
| POST | `/api/v1/auth/login` | None | Authenticate and receive JWT |
| POST | `/api/v1/auth/refresh` | JWT | Refresh expiring token |
| GET | `/api/v1/auth/me` | JWT | Get current user profile + usage |
| POST | `/api/v1/auth/logout` | JWT | Invalidate session |
| DELETE | `/api/v1/auth/account` | JWT | Delete account and all data |

#### Chat (Claude Proxy)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/chat/stream` | JWT | Stream a chat completion (SSE response) |
| POST | `/api/v1/chat/multi-timeframe` | JWT | Multi-timeframe analysis (SSE response) |

#### Usage & Billing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/usage/current` | JWT | Current period usage stats |
| GET | `/api/v1/usage/history` | JWT | Historical usage by period |
| POST | `/api/v1/billing/checkout` | JWT | Create Stripe Checkout session |
| POST | `/api/v1/billing/portal` | JWT | Create Stripe Customer Portal session |
| GET | `/api/v1/billing/subscription` | JWT | Get current subscription details |
| POST | `/api/v1/billing/webhook` | Stripe Sig | Handle Stripe webhook events |

#### Conversations (Server-Side Sync)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/conversations` | JWT | List user's conversations |
| GET | `/api/v1/conversations/:id` | JWT | Get conversation with messages |
| DELETE | `/api/v1/conversations/:id` | JWT | Delete a conversation |
| POST | `/api/v1/conversations/:id/sync` | JWT | Sync local conversation to server |

### Request/Response Formats

#### POST `/api/v1/chat/stream`

**Request:**
```json
{
  "message": "Looking at AAPL, thinking about going long on this 2-2 reversal",
  "conversationId": "conv_abc123",
  "conversationHistory": [
    { "role": "user", "content": "Previous message..." },
    { "role": "assistant", "content": "Previous response..." }
  ],
  "images": [
    {
      "data": "<base64-encoded-png>",
      "mediaType": "image/png",
      "label": "1D chart"
    }
  ],
  "options": {
    "maxTokens": 4096,
    "includeMultiTimeframe": false
  }
}
```

**Response (SSE Stream):**
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Request-Id: req_xyz789
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1739577660

data: {"type":"stream_start","conversationId":"conv_abc123","messageId":"msg_def456"}

data: {"type":"content_delta","text":"I see you're looking at "}

data: {"type":"content_delta","text":"the 2-2 reversal pattern on AAPL's daily chart."}

data: {"type":"content_delta","text":" Let me analyze the setup..."}

data: {"type":"stream_complete","usage":{"inputTokens":1250,"outputTokens":487,"cacheReadTokens":8500,"cacheCreationTokens":0},"tokensRemaining":1998263}

```

#### POST `/api/v1/chat/multi-timeframe`

**Request:**
```json
{
  "message": "What do you think about going long on TSLA?",
  "conversationId": "conv_abc123",
  "images": [
    {
      "data": "<base64-png>",
      "mediaType": "image/png",
      "label": "1D",
      "timeframe": "1D"
    },
    {
      "data": "<base64-png>",
      "mediaType": "image/png",
      "label": "1W",
      "timeframe": "1W"
    },
    {
      "data": "<base64-png>",
      "mediaType": "image/png",
      "label": "1H",
      "timeframe": "1H"
    }
  ]
}
```

**Response:** Same SSE format as `/chat/stream`, with multi-timeframe system prompt applied.

#### GET `/api/v1/usage/current`

**Response:**
```json
{
  "userId": "user_2abc123",
  "tier": "pro",
  "currentPeriod": {
    "startDate": "2026-02-01T00:00:00Z",
    "endDate": "2026-02-28T23:59:59Z",
    "inputTokensUsed": 850000,
    "outputTokensUsed": 320000,
    "totalTokensUsed": 1170000,
    "cachedTokens": 680000,
    "tokenLimit": 2000000,
    "tokensRemaining": 830000,
    "percentUsed": 58.5,
    "requestCount": 342,
    "estimatedCostUsd": 4.28
  },
  "cachePerformance": {
    "hitRate": 0.72,
    "estimatedSavings": 3.15
  }
}
```

#### GET `/api/v1/auth/me`

**Response:**
```json
{
  "id": "user_2abc123",
  "email": "trader@example.com",
  "displayName": "Phil",
  "subscription": {
    "tier": "pro",
    "status": "active",
    "currentPeriodEnd": "2026-03-01T00:00:00Z",
    "cancelAtPeriodEnd": false
  },
  "usage": {
    "tokensUsed": 1170000,
    "tokenLimit": 2000000,
    "percentUsed": 58.5
  },
  "methodology": {
    "version": "1.0.0",
    "lastUpdated": "2026-02-14"
  },
  "createdAt": "2026-02-01T12:00:00Z"
}
```

### Error Response Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "You have exceeded your monthly token limit of 100,000 tokens.",
    "details": {
      "tokensUsed": 100247,
      "tokenLimit": 100000,
      "tier": "free",
      "upgradeUrl": "https://stratcoach.app/upgrade"
    },
    "requestId": "req_xyz789",
    "timestamp": "2026-02-15T14:30:00Z"
  }
}
```

**Error Codes:**

| Code | HTTP Status | Description |
|------|------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `TOKEN_EXPIRED` | 401 | JWT has expired; refresh required |
| `FORBIDDEN` | 403 | User lacks permission for this action |
| `QUOTA_EXCEEDED` | 429 | Monthly token limit reached |
| `RATE_LIMITED` | 429 | Too many requests per time window |
| `INVALID_REQUEST` | 400 | Malformed request body |
| `IMAGE_TOO_LARGE` | 400 | Screenshot exceeds 5MB limit |
| `CLAUDE_API_ERROR` | 502 | Upstream Claude API error |
| `CLAUDE_RATE_LIMITED` | 503 | Anthropic rate limit hit; retry |
| `CLAUDE_OVERLOADED` | 503 | Anthropic servers overloaded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Backend maintenance or dependency down |

---

## 5. Streaming Implementation

### Protocol: Server-Sent Events (SSE)

**Why SSE over WebSockets:**

| Factor | SSE | WebSocket | Decision |
|--------|-----|-----------|----------|
| Direction | Server-to-client (what we need) | Bidirectional (overkill) | SSE wins |
| Protocol | HTTP (standard) | Custom protocol | SSE wins |
| Auth | Standard HTTP headers | Custom handshake | SSE wins |
| Reconnection | Built-in browser support | Manual implementation | SSE wins |
| Load balancer | Standard HTTP routing | Requires special config | SSE wins |
| Complexity | Simple | More complex | SSE wins |
| When to use WS | Need bidirectional real-time | | Not our case |

### SSE Proxy Implementation

```typescript
// backend/src/routes/chat.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Anthropic from '@anthropic-ai/sdk';

interface ChatStreamBody {
  message: string;
  conversationId?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  images?: Array<{ data: string; mediaType: string; label?: string }>;
  options?: { maxTokens?: number };
}

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  fastify.post<{ Body: ChatStreamBody }>(
    '/chat/stream',
    {
      preValidation: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', maxLength: 50000 },
            conversationId: { type: 'string' },
            conversationHistory: { type: 'array' },
            images: { type: 'array', maxItems: 5 },
            options: { type: 'object' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: ChatStreamBody }>, reply: FastifyReply) => {
      const { message, conversationHistory, images, options } = request.body;
      const userId = request.user.id;
      const userTier = request.user.subscription_tier;

      // 1. Check rate limit
      const rateCheck = await fastify.rateLimiter.check(userId, userTier);
      if (!rateCheck.allowed) {
        return reply.code(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: `Rate limit exceeded. Retry after ${rateCheck.retryAfter}s`,
            details: { retryAfter: rateCheck.retryAfter },
          },
        });
      }

      // 2. Check quota
      const quota = await fastify.db.getUserQuota(userId);
      if (quota.tokensRemaining <= 0 && userTier === 'free') {
        return reply.code(429).send({
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Monthly token limit reached.',
            details: {
              tokensUsed: quota.tokensUsed,
              tokenLimit: quota.tokenLimit,
              tier: userTier,
            },
          },
        });
      }

      // 3. Configure SSE response
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': request.id,
        'X-RateLimit-Remaining': String(rateCheck.remaining),
      });

      // 4. Build Claude request
      const contentParts: Anthropic.ContentBlockParam[] = [];

      // Add images (screenshots) if present
      if (images?.length) {
        for (const img of images) {
          contentParts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType as 'image/png',
              data: img.data,
            },
          });
        }
      }

      contentParts.push({ type: 'text', text: message });

      // Build messages array
      const messages: Anthropic.MessageParam[] = [];
      if (conversationHistory) {
        for (const msg of conversationHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      messages.push({ role: 'user', content: contentParts });

      // 5. Stream from Claude
      try {
        const stream = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: options?.maxTokens ?? 4096,
          system: [
            {
              type: 'text',
              text: fastify.coachingPrompt,        // Loaded at startup
              cache_control: { type: 'ephemeral' }, // 90% cost savings
            },
          ],
          messages,
          stream: true,
        });

        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreationTokens = 0;

        // Send stream_start event
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'stream_start', conversationId: request.body.conversationId })}\n\n`
        );

        for await (const event of stream) {
          switch (event.type) {
            case 'message_start':
              inputTokens = event.message.usage.input_tokens;
              cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
              cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0;
              break;

            case 'content_block_delta':
              if (event.delta.type === 'text_delta') {
                reply.raw.write(
                  `data: ${JSON.stringify({ type: 'content_delta', text: event.delta.text })}\n\n`
                );
              }
              break;

            case 'message_delta':
              outputTokens = event.usage.output_tokens;
              break;
          }
        }

        // 6. Record usage
        const totalTokens = inputTokens + outputTokens;
        await fastify.db.recordUsage({
          userId,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          model: 'claude-sonnet-4-20250514',
          conversationId: request.body.conversationId,
        });

        // 7. Report overage to Stripe (if applicable)
        if (userTier !== 'free') {
          const updatedQuota = await fastify.db.getUserQuota(userId);
          if (updatedQuota.tokensUsed > updatedQuota.tokenLimit) {
            const overageTokens = updatedQuota.tokensUsed - updatedQuota.tokenLimit;
            await fastify.stripe.reportUsage(userId, overageTokens);
          }
        }

        // 8. Send completion event
        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'stream_complete',
            usage: { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens },
            tokensRemaining: quota.tokensRemaining - totalTokens,
          })}\n\n`
        );

        reply.raw.end();
      } catch (error) {
        const errorData = {
          type: 'stream_error',
          error: error instanceof Error ? error.message : 'Unknown error',
          code: getErrorCode(error),
        };
        reply.raw.write(`data: ${JSON.stringify(errorData)}\n\n`);
        reply.raw.end();
      }
    }
  );
}
```

### Client-Side SSE Consumption (Electron Main Process)

```typescript
// src/main/services/backend-client.ts

export class BackendClient {
  private baseUrl: string;
  private authStore: AuthTokenStore;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.authStore = new AuthTokenStore();
  }

  async streamChat(
    request: ChatStreamRequest,
    callbacks: {
      onDelta: (text: string) => void;
      onComplete: (usage: UsageData) => void;
      onError: (error: Error) => void;
    }
  ): Promise<void> {
    const jwt = this.authStore.retrieve();
    if (!jwt) throw new Error('Not authenticated');

    const response = await fetch(`${this.baseUrl}/api/v1/chat/stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new BackendError(error.error.code, error.error.message);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';  // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6));

        switch (data.type) {
          case 'content_delta':
            callbacks.onDelta(data.text);
            break;
          case 'stream_complete':
            callbacks.onComplete(data.usage);
            break;
          case 'stream_error':
            callbacks.onError(new Error(data.error));
            break;
        }
      }
    }
  }
}
```

### Handling Disconnections

```typescript
// Retry with exponential backoff for transient failures
async function streamWithRetry(
  client: BackendClient,
  request: ChatStreamRequest,
  callbacks: StreamCallbacks,
  maxRetries = 3
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await client.streamChat(request, callbacks);
      return; // Success
    } catch (error) {
      if (error instanceof BackendError) {
        if (error.code === 'RATE_LIMITED' || error.code === 'CLAUDE_RATE_LIMITED') {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          await sleep(delay);
          continue; // Retry
        }
        // Non-retryable errors: QUOTA_EXCEEDED, UNAUTHORIZED, etc.
        callbacks.onError(error);
        return;
      }
      // Network errors - retry
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        continue;
      }
      callbacks.onError(error as Error);
    }
  }
}
```

---

## 6. Usage Tracking & Billing

### Token Tracking Architecture

```
Claude API Response
       |
       v
+------------------+
| Extract Usage    |
| - input_tokens   |
| - output_tokens  |
| - cache_read     |
| - cache_creation |
+--------+---------+
         |
    +----+----+
    |         |
    v         v
+-------+  +--------+
| token |  | users  |
| _usage|  | table  |
| INSERT|  | UPDATE |
+-------+  +--------+
    |         |
    v         v
+------------------+
| Billing Summary  |
| (materialized    |
|  daily/monthly)  |
+------------------+
         |
         v
+------------------+
| Stripe Metered   |
| Usage Reporting  |
| (daily cron job) |
+------------------+
```

### Token Cost Calculation

Based on current Anthropic pricing (as of 2026-02):

| Token Type | Cost per 1M Tokens | Notes |
|-----------|-------------------|-------|
| Input tokens (standard) | $3.00 | Standard input processing |
| Output tokens | $15.00 | Generated response text |
| Cache creation tokens | $3.75 | 25% premium on first cache write |
| Cache read tokens | $0.30 | 90% discount on cached prompts |

**Prompt caching economics for The Strat Coach:**

The system prompt (coaching methodology + guardrails) is approximately 15,000 tokens. Without caching, every request costs $0.045 in system prompt input. With caching, the first request in a 5-minute window costs $0.056 (cache write), but every subsequent request costs $0.0045 (cache read) -- a 90% savings.

At 100 requests/day, prompt caching saves approximately **$4.05/day or $121.50/month** in system prompt costs alone.

### Pricing Tiers

| Tier | Monthly Price | Included Tokens | Overage Rate | Approx. Messages |
|------|--------------|----------------|-------------|-----------------|
| **Free** | $0 | 100,000 | Blocked | ~30 |
| **Pro** | $29 | 2,000,000 | $0.02/1K tokens | ~600 |
| **Enterprise** | $99 | 10,000,000 | $0.015/1K tokens | ~3,000 |

**Margin analysis (Pro tier example):**

- User sends 600 messages, consuming 2M tokens
- Average split: 40% input (800K), 60% output (1.2M)
- Our cost: (800K * $3/1M) + (1.2M * $15/1M) = $2.40 + $18.00 = $20.40
- With prompt caching (72% hit rate): ~$16.50
- Revenue: $29.00
- **Margin: ~43-57%**

### Stripe Integration

**Subscription Setup:**
```typescript
// Create Stripe products and prices (one-time setup)
const freeProduct = await stripe.products.create({
  name: 'The Strat Coach - Free',
  description: '100K tokens/month. AI trading coaching.',
});

const proProduct = await stripe.products.create({
  name: 'The Strat Coach - Pro',
  description: '2M tokens/month + overage billing.',
});

// Fixed monthly price for Pro
const proBasePrice = await stripe.prices.create({
  product: proProduct.id,
  unit_amount: 2900, // $29.00
  currency: 'usd',
  recurring: { interval: 'month' },
});

// Metered price for Pro overage
const proOveragePrice = await stripe.prices.create({
  product: proProduct.id,
  currency: 'usd',
  recurring: {
    interval: 'month',
    usage_type: 'metered',
  },
  billing_scheme: 'per_unit',
  unit_amount_decimal: '2', // $0.02 per 1K tokens (unit = 1K tokens)
});
```

**Usage Reporting (Daily Cron):**
```typescript
// backend/src/jobs/report-usage.ts
async function reportOverageToStripe(): Promise<void> {
  const usersWithOverage = await db.query(`
    SELECT u.id, u.stripe_subscription_item_id,
           u.tokens_used_current_period - u.token_limit AS overage_tokens
    FROM users u
    WHERE u.subscription_tier IN ('pro', 'enterprise')
      AND u.tokens_used_current_period > u.token_limit
      AND u.last_usage_reported_at < NOW() - INTERVAL '1 day'
  `);

  for (const user of usersWithOverage) {
    const overageUnits = Math.ceil(user.overage_tokens / 1000); // Units = 1K tokens
    await stripe.subscriptionItems.createUsageRecord(
      user.stripe_subscription_item_id,
      {
        quantity: overageUnits,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'set', // Absolute, not incremental
      }
    );
    await db.updateLastUsageReported(user.id);
  }
}
```

**Webhook Handler:**
```typescript
// backend/src/routes/stripe-webhook.ts
fastify.post('/billing/webhook', {
  config: { rawBody: true }, // Need raw body for signature verification
}, async (request, reply) => {
  const sig = request.headers['stripe-signature'] as string;
  const event = stripe.webhooks.constructEvent(
    request.rawBody,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET!
  );

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      await db.updateUserSubscription({
        stripeCustomerId: subscription.customer as string,
        tier: mapPriceToTier(subscription.items.data[0].price.id),
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await db.updateUserSubscription({
        stripeCustomerId: subscription.customer as string,
        tier: 'free',
        status: 'canceled',
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      // Notify user, potentially downgrade after grace period
      await notifyPaymentFailed(invoice.customer as string);
      break;
    }
  }

  return reply.code(200).send({ received: true });
});
```

---

## 7. Database Design

### PostgreSQL Schema

```sql
-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,

  -- Subscription
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  stripe_subscription_item_id TEXT,  -- For metered usage reporting
  subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing')),
  subscription_period_end TIMESTAMPTZ,

  -- Usage tracking (current period)
  tokens_used_current_period BIGINT NOT NULL DEFAULT 0,
  token_limit BIGINT NOT NULL DEFAULT 100000,  -- Based on tier
  period_start_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_usage_reported_at TIMESTAMPTZ,

  -- Metadata
  methodology_version TEXT DEFAULT '1.0.0',
  app_version TEXT,
  last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX idx_users_tier ON users(subscription_tier);

-- ============================================================
-- TOKEN USAGE (Per-Request Granularity)
-- ============================================================
CREATE TABLE token_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT,

  -- Token breakdown
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS
    (input_tokens + output_tokens) STORED,

  -- Metadata
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  request_type TEXT NOT NULL DEFAULT 'chat'
    CHECK (request_type IN ('chat', 'multi_timeframe', 'vision')),
  success BOOLEAN NOT NULL DEFAULT true,
  latency_ms INTEGER,  -- End-to-end response time
  error_code TEXT,

  -- Cost tracking (computed from token counts)
  estimated_cost_usd DECIMAL(10, 6),

  -- Time
  billing_period DATE NOT NULL DEFAULT (CURRENT_DATE - (EXTRACT(DAY FROM CURRENT_DATE)::int - 1) * INTERVAL '1 day')::date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usage_user_period ON token_usage(user_id, billing_period);
CREATE INDEX idx_usage_user_created ON token_usage(user_id, created_at DESC);
CREATE INDEX idx_usage_billing ON token_usage(billing_period, user_id);

-- ============================================================
-- BILLING SUMMARY (Materialized, refreshed daily)
-- ============================================================
CREATE MATERIALIZED VIEW billing_summary AS
SELECT
  user_id,
  billing_period,
  COUNT(*) AS request_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(cache_read_tokens) AS total_cache_read_tokens,
  SUM(cache_creation_tokens) AS total_cache_creation_tokens,
  SUM(total_tokens) AS total_tokens,
  SUM(estimated_cost_usd) AS total_cost_usd,
  AVG(latency_ms) AS avg_latency_ms,
  ROUND(
    SUM(cache_read_tokens)::numeric /
    NULLIF(SUM(input_tokens + cache_read_tokens), 0) * 100,
    1
  ) AS cache_hit_rate_pct
FROM token_usage
WHERE success = true
GROUP BY user_id, billing_period;

CREATE UNIQUE INDEX idx_billing_summary_pk
  ON billing_summary(user_id, billing_period);

-- ============================================================
-- CONVERSATIONS (Server-Side Sync)
-- ============================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trade_id TEXT,  -- Optional link to a trade
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user ON conversations(user_id, last_message_at DESC);

-- ============================================================
-- MESSAGES (Server-Side Sync)
-- ============================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens INTEGER,
  cached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- ============================================================
-- RATE LIMIT EVENTS (Optional: for abuse detection)
-- ============================================================
CREATE TABLE rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('request', 'quota_exceeded', 'rate_limited')),
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rate_events_user ON rate_limit_events(user_id, created_at DESC);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Reset user's monthly usage
CREATE OR REPLACE FUNCTION reset_user_period(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET tokens_used_current_period = 0,
      period_start_date = CURRENT_TIMESTAMP,
      token_limit = CASE subscription_tier
        WHEN 'free' THEN 100000
        WHEN 'pro' THEN 2000000
        WHEN 'enterprise' THEN 10000000
        ELSE 100000
      END
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;
```

### Entity Relationship Diagram

```
+-------------------+        +-------------------+
|      users        |        |   token_usage     |
+-------------------+        +-------------------+
| id (PK)           |<------o| user_id (FK)      |
| clerk_user_id     |        | conversation_id   |
| email             |        | input_tokens      |
| stripe_customer_id|        | output_tokens     |
| subscription_tier |        | cache_read_tokens |
| tokens_used_*     |        | total_tokens      |
| token_limit       |        | model             |
| period_start_date |        | request_type      |
+-------------------+        | billing_period    |
         |                   | created_at        |
         |                   +-------------------+
         |
         |        +-------------------+
         |        |  conversations    |
         +------o>| id (PK)           |
                  | user_id (FK)      |<------+
                  | title             |       |
                  | message_count     |       |
                  +-------------------+       |
                                              |
                           +------------------+
                           |    messages       |
                           +------------------+
                           | id (PK)          |
                           | conversation_id  |
                           | role             |
                           | content          |
                           | tokens           |
                           | created_at       |
                           +------------------+
```

### Data Retention Policy

| Data Type | Retention | Archive Strategy |
|-----------|-----------|-----------------|
| token_usage (detailed) | 90 days | Archive to cold storage, keep billing_summary |
| billing_summary | Indefinite | Materialized view, refreshed daily |
| conversations | Per user preference | Users can delete; auto-archive after 1 year |
| messages | Same as conversation | Cascade delete with conversation |
| rate_limit_events | 30 days | Auto-purge via cron job |

---

## 8. Scalability & Performance

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| SSE first-byte latency | < 200ms added (over direct Claude call) | P95 |
| API response time (non-streaming) | < 100ms | P95 |
| Auth validation | < 10ms | P95 |
| Rate limit check | < 5ms | P95 |
| Usage recording | < 20ms | P95 (async, non-blocking) |
| Concurrent SSE streams | 500 per instance | Load test |
| Total concurrent users | 1,000+ | With 2-3 instances |

### Horizontal Scaling Strategy

```
                    +-------------------+
                    |   Load Balancer   |
                    | (Railway/Render)  |
                    +--------+----------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v--+  +--------v--+  +--------v--+
     | Fastify   |  | Fastify   |  | Fastify   |
     | Instance 1|  | Instance 2|  | Instance 3|
     +-----+-----+  +-----+-----+  +-----+-----+
           |              |              |
     +-----v--------------v--------------v-----+
     |                  Redis                   |
     |   (Rate limits, session cache, dedup)    |
     +--------------------+--------------------+
                          |
     +--------------------v--------------------+
     |              PostgreSQL                  |
     |   (Users, usage, billing, conversations) |
     +------------------------------------------+
```

**Stateless Design Principles:**
- No in-memory session state in Fastify instances
- All shared state in Redis or PostgreSQL
- Any instance can handle any request
- Health checks enable automatic instance replacement

**Scaling triggers:**
- CPU > 70% sustained for 5 minutes: scale up
- Memory > 80%: scale up
- Response latency P95 > 500ms: scale up
- Active SSE streams > 400 per instance: scale up

### Caching Strategy

| Cache Layer | Technology | TTL | Purpose |
|------------|-----------|-----|---------|
| User profile | Redis | 5 min | Avoid DB lookup on every request |
| Rate limit counters | Redis | Per window | Distributed rate limiting |
| Subscription status | Redis | 10 min | Quick tier check without DB |
| Prompt cache | Claude API native | 5 min (Anthropic) | 90% cost reduction on system prompt |
| Billing summary | PostgreSQL materialized view | 24 hours | Fast usage dashboard queries |

### Rate Limiting Implementation

```typescript
// backend/src/plugins/rate-limiter.ts
import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

interface RateLimitConfig {
  free: { perMinute: 10, perHour: 50 };
  pro: { perMinute: 30, perHour: 300 };
  enterprise: { perMinute: 60, perHour: 9999 };
}

const LIMITS: RateLimitConfig = {
  free: { perMinute: 10, perHour: 50 },
  pro: { perMinute: 30, perHour: 300 },
  enterprise: { perMinute: 60, perHour: 9999 },
};

export async function rateLimiterPlugin(fastify: FastifyInstance): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL!);

  fastify.decorate('rateLimiter', {
    async check(userId: string, tier: string): Promise<{
      allowed: boolean;
      remaining: number;
      retryAfter?: number;
    }> {
      const limits = LIMITS[tier as keyof RateLimitConfig] || LIMITS.free;
      const now = Date.now();
      const minuteKey = `rl:${userId}:min:${Math.floor(now / 60000)}`;
      const hourKey = `rl:${userId}:hr:${Math.floor(now / 3600000)}`;

      // Use Redis pipeline for atomic multi-key operation
      const pipeline = redis.pipeline();
      pipeline.incr(minuteKey);
      pipeline.expire(minuteKey, 60);
      pipeline.incr(hourKey);
      pipeline.expire(hourKey, 3600);

      const results = await pipeline.exec();
      const minuteCount = (results?.[0]?.[1] as number) || 0;
      const hourCount = (results?.[2]?.[1] as number) || 0;

      if (minuteCount > limits.perMinute) {
        return {
          allowed: false,
          remaining: 0,
          retryAfter: 60 - (Math.floor(now / 1000) % 60),
        };
      }

      if (hourCount > limits.perHour) {
        return {
          allowed: false,
          remaining: 0,
          retryAfter: 3600 - (Math.floor(now / 1000) % 3600),
        };
      }

      return {
        allowed: true,
        remaining: Math.min(
          limits.perMinute - minuteCount,
          limits.perHour - hourCount
        ),
      };
    },
  });
}
```

### Connection Pool Configuration

```typescript
// backend/src/plugins/database.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                       // Max connections per instance
  idleTimeoutMillis: 30000,      // Close idle connections after 30s
  connectionTimeoutMillis: 5000,  // Fail fast if can't connect in 5s
  statement_timeout: 10000,       // Kill queries running > 10s
});

// With 3 instances * 20 connections = 60 total
// Railway PostgreSQL default max_connections = 100
// Leaves 40 connections for admin, migrations, cron jobs
```

---

## 9. DevOps & Deployment

### Hosting Recommendation: Railway

**Why Railway over alternatives:**

| Factor | Railway | Render | Vercel | AWS |
|--------|---------|--------|--------|-----|
| Integrated Postgres | Yes ($5/mo) | Yes ($7/mo) | Via Neon | RDS ($30+/mo) |
| Integrated Redis | Yes ($5/mo) | Yes ($10/mo) | Via Upstash | ElastiCache ($15+/mo) |
| Git deploy | Yes | Yes | Yes | Via CodePipeline |
| SSE/streaming | Full support | Full support | Edge runtime limits | Full support |
| Cron jobs | Via plugins | Built-in | Built-in | CloudWatch Events |
| Pricing model | Consumption | Fixed tier | Consumption | Pay-per-resource |
| DX (speed to ship) | Excellent | Good | Excellent | Poor (complex) |
| Cost at 100 users | ~$15/mo | ~$25/mo | ~$0-20/mo | ~$60+/mo |
| Cost at 1000 users | ~$40/mo | ~$50/mo | ~$30-50/mo | ~$100+/mo |
| Long-running streams | Unlimited | Unlimited | 30s (Serverless), 300s (Edge) | Unlimited |

**Key factor: Vercel Edge Functions have a 30-second timeout for serverless functions.** Claude streaming responses can take 30-60 seconds for complex multi-timeframe analyses. This makes Vercel unsuitable for the streaming proxy use case without significant workarounds. This supersedes the earlier `BACKEND-IMPLEMENTATION-PLAN.md` recommendation for Vercel.

**Railway is chosen** because:
1. No timeout limits on streaming connections
2. Integrated PostgreSQL and Redis at low cost
3. Consumption-based pricing fits early-stage
4. Excellent developer experience (deploy in minutes)
5. Can migrate to Render or AWS later without code changes

### Project Structure

```
strat-coach-api/                   # Separate repository
├── src/
│   ├── index.ts                   # Fastify server entry point
│   ├── config/
│   │   ├── env.ts                 # Environment variable validation
│   │   └── constants.ts           # Rate limits, tier configs
│   ├── plugins/
│   │   ├── auth.ts                # Clerk JWT verification plugin
│   │   ├── database.ts            # PostgreSQL connection pool plugin
│   │   ├── redis.ts               # Redis client plugin
│   │   ├── rate-limiter.ts        # Rate limiting plugin
│   │   ├── stripe.ts              # Stripe client plugin
│   │   └── coaching.ts            # Load coaching methodology
│   ├── routes/
│   │   ├── health.ts              # GET /health, /status
│   │   ├── auth.ts                # /auth/* endpoints
│   │   ├── chat.ts                # /chat/stream, /chat/multi-timeframe
│   │   ├── usage.ts               # /usage/current, /usage/history
│   │   ├── billing.ts             # /billing/* endpoints
│   │   └── conversations.ts       # /conversations/* endpoints
│   ├── services/
│   │   ├── claude.ts              # Anthropic SDK wrapper
│   │   ├── usage-tracker.ts       # Token counting + DB recording
│   │   └── billing.ts             # Stripe metered billing logic
│   ├── middleware/
│   │   └── error-handler.ts       # Global error handling
│   ├── db/
│   │   ├── migrations/            # SQL migration files
│   │   │   ├── 001_initial.sql
│   │   │   ├── 002_add_billing.sql
│   │   │   └── ...
│   │   └── queries.ts             # Type-safe query functions
│   └── types/
│       ├── fastify.d.ts           # Fastify type augmentation
│       └── api.ts                 # Shared API types
├── coaching/                      # Copied from Electron app
│   ├── THE-STRAT-GUARDRAILS.md
│   ├── TRADING-COACH-SYSTEM-PROMPT.md
│   └── version.json
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── Dockerfile                     # For Railway deployment
├── docker-compose.yml             # Local development
├── package.json
├── tsconfig.json
├── .env.example
└── railway.toml                   # Railway configuration
```

### Environment Variables

```bash
# .env.example

# Server
PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:pass@host:5432/strat_coach

# Redis
REDIS_URL=redis://default:pass@host:6379

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Clerk
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
STRIPE_PRO_OVERAGE_PRICE_ID=price_...
STRIPE_ENTERPRISE_OVERAGE_PRICE_ID=price_...

# App
BACKEND_URL=https://api.stratcoach.app
CORS_ORIGIN=electron://strat-coach
```

### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy Backend

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: strat_coach_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports: ['6379:6379']

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:unit
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/strat_coach_test
          REDIS_URL: redis://localhost:6379

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Railway
        uses: bervProject/railway-deploy@main
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: strat-coach-api
```

### Monitoring & Observability

**Logging (Structured JSON):**
```typescript
// Fastify built-in Pino logger
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,  // JSON in production
  },
});

// Request logging includes:
// - Request ID (auto-generated)
// - User ID (from JWT)
// - Endpoint
// - Response time
// - Status code
// - Token usage (for chat endpoints)
```

**Health Check Endpoint:**
```typescript
// GET /api/v1/health
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "dependencies": {
    "database": { "status": "connected", "latency_ms": 2 },
    "redis": { "status": "connected", "latency_ms": 1 },
    "anthropic": { "status": "reachable" },
    "stripe": { "status": "reachable" }
  }
}
```

**Key Metrics to Monitor:**

| Metric | Alert Threshold | Tool |
|--------|----------------|------|
| Response latency P95 | > 500ms | Railway metrics |
| Error rate | > 5% of requests | Railway metrics |
| SSE stream failures | > 2% of streams | Custom logging |
| Database connection pool utilization | > 80% | Custom logging |
| Redis memory usage | > 80% of limit | Redis monitoring |
| Claude API error rate | > 5% | Custom logging |
| Cache hit rate | < 50% (expected 70%+) | Custom dashboard |
| Active subscriptions | Decreasing trend | Stripe dashboard |
| Monthly token cost vs. revenue | Margin < 30% | Custom dashboard |

**Recommended Observability Stack (Phase 2):**
- **Logs:** Railway built-in (Phase 1) -> Datadog or Axiom (Phase 2)
- **Metrics:** Railway metrics (Phase 1) -> Prometheus + Grafana (Phase 2)
- **Tracing:** Request IDs in logs (Phase 1) -> OpenTelemetry (Phase 2)
- **Alerting:** Railway alerts (Phase 1) -> PagerDuty or Opsgenie (Phase 2)

### Local Development Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build: .
    ports:
      - '3001:3001'
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://dev:dev@postgres:5432/strat_coach
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./src:/app/src  # Hot reload

  postgres:
    image: postgres:16-alpine
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: strat_coach
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  pgdata:
```

---

## 10. Migration Path

### Current Architecture (Direct API Calls)

```
Electron App
├── Main Process
│   ├── ClaudeService (calls Anthropic API directly)
│   ├── SecureStoreService (stores API key locally)
│   └── IPC Handlers (bridges renderer <-> services)
└── Renderer Process
    └── Calls window.electronAPI.sendMessage()
```

### Target Architecture (Backend Proxy)

```
Electron App                          Backend Server
├── Main Process                      ├── Auth (Clerk)
│   ├── BackendClient (HTTP/SSE)  --> ├── Chat Proxy (Claude)
│   ├── AuthTokenStore (JWT)          ├── Usage Tracker
│   └── IPC Handlers (unchanged)      ├── Billing (Stripe)
└── Renderer Process                  └── PostgreSQL + Redis
    └── Calls window.electronAPI.*
```

### Migration Strategy: Parallel Mode

The migration uses a **feature flag** approach where both modes coexist temporarily:

```typescript
// src/main/services/chat-service.ts (new abstraction layer)

interface ChatProvider {
  sendMessage(options: ChatMessageOptions): Promise<ChatResult>;
  isAvailable(): boolean;
}

class DirectClaudeProvider implements ChatProvider {
  // Existing ClaudeService, uses local API key
  async sendMessage(options: ChatMessageOptions): Promise<ChatResult> {
    return this.claudeService.sendMessage(options);
  }

  isAvailable(): boolean {
    return this.secureStore.getApiKey() !== null;
  }
}

class BackendProvider implements ChatProvider {
  // New: calls backend API
  async sendMessage(options: ChatMessageOptions): Promise<ChatResult> {
    return this.backendClient.streamChat(options);
  }

  isAvailable(): boolean {
    return this.authStore.hasValidToken();
  }
}

class ChatService {
  private providers: ChatProvider[];

  constructor(useBackend: boolean) {
    this.providers = useBackend
      ? [new BackendProvider(), new DirectClaudeProvider()]  // Backend first, fallback to direct
      : [new DirectClaudeProvider()];                         // Legacy mode
  }

  async sendMessage(options: ChatMessageOptions): Promise<ChatResult> {
    for (const provider of this.providers) {
      if (provider.isAvailable()) {
        return provider.sendMessage(options);
      }
    }
    throw new Error('No chat provider available');
  }
}
```

### Step-by-Step Migration

**Phase M1: Backend Foundation (No client changes)**
1. Deploy backend server with health endpoint
2. Set up PostgreSQL and Redis
3. Implement auth endpoints
4. Implement `/chat/stream` endpoint
5. Test with curl/Postman
6. **Client unchanged, still uses direct API**

**Phase M2: Auth Integration**
1. Add `@clerk/clerk-js` to Electron app
2. Create login/signup screens
3. Add `AuthTokenStore` for JWT persistence
4. Add `BackendClient` service
5. **Feature flag:** `USE_BACKEND=false` (default)
6. Test auth flow end-to-end

**Phase M3: Parallel Mode**
1. Add `ChatService` abstraction layer
2. Update IPC handlers to use `ChatService`
3. Enable `USE_BACKEND=true` for beta testers
4. Both modes work simultaneously
5. Direct API key entry still available in settings

**Phase M4: Backend Primary**
1. Default to backend mode for new installs
2. Existing users prompted to create account
3. Local API key fallback still available
4. Usage tracking active for backend users

**Phase M5: Backend Only**
1. Remove direct Claude API calls from client
2. Remove `@anthropic-ai/sdk` from Electron dependencies
3. Remove local API key storage
4. All users must have accounts
5. Settings UI shows usage/subscription instead of API key

### IPC Layer Changes

The IPC layer requires minimal changes. The renderer calls the same `window.electronAPI.sendMessage()` -- the main process decides whether to route to backend or direct API:

**Current IPC handler (simplified):**
```typescript
// BEFORE: Direct API call
handleWithValidation(IPC_CHANNELS.CHAT_SEND_MESSAGE, async (request) => {
  const claudeService = getClaudeService();
  await claudeService.sendMessage({
    message: request.message,
    onChunk: (chunk) => chatView.webContents.send('chat:message-chunk', chunk),
    onComplete: (content) => chatView.webContents.send('chat:message-complete', content),
  });
});
```

**Migrated IPC handler:**
```typescript
// AFTER: Backend proxy (renderer-facing API unchanged)
handleWithValidation(IPC_CHANNELS.CHAT_SEND_MESSAGE, async (request) => {
  const chatService = getChatService(); // Abstraction layer
  await chatService.sendMessage({
    message: request.message,
    onChunk: (chunk) => chatView.webContents.send('chat:message-chunk', chunk),
    onComplete: (content) => chatView.webContents.send('chat:message-complete', content),
  });
});
```

### Data Migration

**What stays local (Electron SQLite):**
- Trade journal entries (personal data)
- Screenshot files
- App settings (theme, split ratio)
- Offline conversation cache

**What moves to server (PostgreSQL):**
- User accounts and subscriptions
- Token usage records
- Conversation history (synced)
- Billing data

**Sync strategy:**
- Conversations written to both local SQLite and server PostgreSQL
- Local is the source of truth for immediate display
- Server is the source of truth for cross-device access (future)
- Background sync job pushes local conversations to server every 5 minutes

---

## 11. Security

### Security Architecture

```
+-------------------+     HTTPS/TLS 1.3     +-------------------+
| Electron App      | <-------------------> | Backend Server    |
| - safeStorage     |                        | - JWT validation  |
| - contextIsolation|                        | - Rate limiting   |
| - sandbox: true   |                        | - Input validation|
| - No API key      |                        | - API key vault   |
+-------------------+                        +-------------------+
                                                      |
                                              +-------v-------+
                                              |  Anthropic    |
                                              |  (API key     |
                                              |   never sent  |
                                              |   to client)  |
                                              +---------------+
```

### Threat Model & Mitigations

| Threat | Risk | Mitigation |
|--------|------|------------|
| API key extraction from client | **Eliminated** | Key only exists on backend server |
| JWT theft from Electron | Medium | safeStorage (OS keychain); short expiry (1 day) |
| Man-in-the-middle | Low | HTTPS enforced; certificate pinning (optional) |
| Brute force login | Medium | Clerk handles rate limiting + lockout |
| Account sharing | Medium | Device fingerprinting; concurrent session limits |
| SQL injection | Low | Parameterized queries only; input validation |
| XSS in Electron | Low | contextIsolation: true; sandbox: true |
| Webhook forgery | Low | Stripe signature verification |
| Free tier abuse (multi-account) | Medium | Email verification; IP-based rate limiting |
| DDoS | Medium | Railway DDoS protection; Redis rate limiting |
| Database breach | Medium | Encryption at rest; minimal PII storage |

### Input Validation

```typescript
// All endpoints validate input with JSON Schema
const chatStreamSchema = {
  body: {
    type: 'object',
    required: ['message'],
    properties: {
      message: {
        type: 'string',
        minLength: 1,
        maxLength: 50000,  // ~12K tokens max per message
      },
      conversationId: { type: 'string', format: 'uuid' },
      conversationHistory: {
        type: 'array',
        maxItems: 20,  // Limit context window
        items: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            role: { type: 'string', enum: ['user', 'assistant'] },
            content: { type: 'string', maxLength: 50000 },
          },
        },
      },
      images: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          required: ['data', 'mediaType'],
          properties: {
            data: { type: 'string', maxLength: 7000000 },  // ~5MB base64
            mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'] },
          },
        },
      },
    },
    additionalProperties: false,
  },
};
```

### CORS Configuration

```typescript
fastify.register(cors, {
  origin: (origin, cb) => {
    // Allow Electron app (file:// or localhost in dev)
    if (!origin || origin === 'null' || origin.startsWith('file://')) {
      cb(null, true);
      return;
    }
    if (origin.includes('localhost') && process.env.NODE_ENV === 'development') {
      cb(null, true);
      return;
    }
    // Block all other origins
    cb(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  credentials: true,
});
```

### Secret Management

| Secret | Storage | Rotation |
|--------|---------|----------|
| Anthropic API key | Railway env var | Quarterly |
| Clerk secret key | Railway env var | Annually |
| Stripe secret key | Railway env var | Annually |
| Stripe webhook secret | Railway env var | When endpoint changes |
| Database password | Railway managed | Auto-rotated |
| Redis password | Railway managed | Auto-rotated |
| JWT signing key | Clerk managed | Clerk handles rotation |

---

## 12. Implementation Phases

### Phase 1: Backend Foundation (8 hours)

| Task | Description | Time | Dependencies |
|------|-------------|------|-------------|
| 1.1 | Initialize Fastify project with TypeScript | 30 min | None |
| 1.2 | Set up PostgreSQL schema + migrations | 1 hr | 1.1 |
| 1.3 | Implement Clerk JWT auth plugin | 1 hr | 1.1 |
| 1.4 | Implement Redis rate limiter plugin | 45 min | 1.1 |
| 1.5 | Build `/chat/stream` SSE proxy endpoint | 2 hr | 1.2, 1.3, 1.4 |
| 1.6 | Build usage tracking service | 1 hr | 1.2 |
| 1.7 | Build `/usage/current` endpoint | 30 min | 1.6 |
| 1.8 | Deploy to Railway + set up DB/Redis | 1 hr | 1.1-1.7 |
| 1.9 | Integration tests (auth + stream + usage) | 30 min | 1.8 |

**Deliverable:** Working backend that authenticates users, streams Claude responses, and tracks usage. Testable with curl.

### Phase 2: Billing Integration (4 hours)

| Task | Description | Time | Dependencies |
|------|-------------|------|-------------|
| 2.1 | Configure Stripe products and prices | 30 min | Phase 1 |
| 2.2 | Build `/billing/checkout` endpoint | 45 min | 2.1 |
| 2.3 | Build `/billing/portal` endpoint | 30 min | 2.1 |
| 2.4 | Build Stripe webhook handler | 1 hr | 2.1 |
| 2.5 | Build usage reset cron job | 30 min | Phase 1 |
| 2.6 | Build overage reporting cron job | 30 min | 2.1, 2.5 |
| 2.7 | Test billing flows end-to-end | 15 min | 2.1-2.6 |

**Deliverable:** Complete billing integration. Users can upgrade, manage subscriptions, and overages are billed.

### Phase 3: Electron Auth Integration (4 hours)

| Task | Description | Time | Dependencies |
|------|-------------|------|-------------|
| 3.1 | Install Clerk SDK in Electron | 15 min | Phase 1 |
| 3.2 | Build AuthTokenStore (safeStorage) | 30 min | 3.1 |
| 3.3 | Build login/signup UI components | 1.5 hr | 3.1, 3.2 |
| 3.4 | Build AuthGuard wrapper component | 30 min | 3.3 |
| 3.5 | Build BackendClient service | 45 min | Phase 1, 3.2 |
| 3.6 | Add auth IPC handlers | 30 min | 3.2-3.5 |

**Deliverable:** Users can sign up, log in, and persist sessions across app restarts.

### Phase 4: Chat Migration (3 hours)

| Task | Description | Time | Dependencies |
|------|-------------|------|-------------|
| 4.1 | Build ChatService abstraction layer | 45 min | Phase 3 |
| 4.2 | Build BackendProvider (SSE client) | 1 hr | 3.5, 4.1 |
| 4.3 | Update IPC handlers to use ChatService | 30 min | 4.1, 4.2 |
| 4.4 | Add usage display in UI | 30 min | 4.3 |
| 4.5 | Test streaming end-to-end | 15 min | 4.1-4.4 |

**Deliverable:** Chat works through backend. Usage displayed in UI. Feature flag controls mode.

### Phase 5: Subscription UI + Polish (3 hours)

| Task | Description | Time | Dependencies |
|------|-------------|------|-------------|
| 5.1 | Build AccountSettings component | 1 hr | Phase 3, Phase 4 |
| 5.2 | Build upgrade flow (Stripe Checkout) | 30 min | Phase 2, 5.1 |
| 5.3 | Build quota exceeded UI | 30 min | 5.1 |
| 5.4 | Handle edge cases (offline, token expired, etc.) | 30 min | 5.1-5.3 |
| 5.5 | End-to-end testing | 30 min | 5.1-5.4 |

**Deliverable:** Complete subscription management. Users can upgrade, view usage, and manage billing.

### Phase 6: Cleanup + Documentation (2 hours)

| Task | Description | Time | Dependencies |
|------|-------------|------|-------------|
| 6.1 | Remove direct Claude API code from Electron | 30 min | Phase 4 stable |
| 6.2 | Remove local API key storage | 15 min | 6.1 |
| 6.3 | Update CLAUDE.md and HANDOFF.md | 30 min | 6.1, 6.2 |
| 6.4 | Write BACKEND-SETUP.md deployment guide | 30 min | All phases |
| 6.5 | Final regression testing | 15 min | 6.1-6.4 |

**Deliverable:** Clean codebase with no legacy direct API code. Full documentation.

### Timeline Summary

| Phase | Effort | Calendar Days | Dependencies |
|-------|--------|--------------|-------------|
| Phase 1: Backend Foundation | 8 hours | 2 days | Phil creates Railway + Clerk accounts |
| Phase 2: Billing | 4 hours | 1 day | Phil creates Stripe account |
| Phase 3: Electron Auth | 4 hours | 1 day | Phase 1 deployed |
| Phase 4: Chat Migration | 3 hours | 1 day | Phase 3 |
| Phase 5: Subscription UI | 3 hours | 1 day | Phase 2 + Phase 4 |
| Phase 6: Cleanup | 2 hours | 0.5 days | All phases |
| **Total** | **24 hours** | **6-7 business days** | |

---

## 13. Cost Analysis

### Infrastructure Costs (Monthly)

#### At 100 Users

| Service | Cost | Notes |
|---------|------|-------|
| Railway (API server) | $5 | ~512MB RAM, low CPU |
| Railway PostgreSQL | $5 | < 1GB storage |
| Railway Redis | $5 | < 100MB |
| Clerk | $0 | Free up to 10K users |
| Stripe | ~$30 | 2.9% + $0.30 per transaction |
| Anthropic API | ~$200-500 | Depends on usage mix |
| Domain + SSL | $15 | Annual, amortized |
| **Total infra** | **~$60-555** | |

#### At 1,000 Users

| Service | Cost | Notes |
|---------|------|-------|
| Railway (2 instances) | $20 | Auto-scaled |
| Railway PostgreSQL | $15 | ~5GB storage |
| Railway Redis | $10 | ~500MB |
| Clerk | $25 | Over free tier |
| Stripe | ~$300 | Processing fees |
| Anthropic API | ~$2,000-5,000 | Depends on usage mix |
| Monitoring (Datadog) | $30 | Basic plan |
| **Total infra** | **~$2,400-5,400** | |

### Revenue Projections

**Conservative scenario (1,000 users):**

| Tier | Users | Revenue/User | Monthly Revenue |
|------|-------|-------------|----------------|
| Free | 700 | $0 | $0 |
| Pro | 250 | $29 | $7,250 |
| Enterprise | 50 | $99 | $4,950 |
| **Total** | **1,000** | | **$12,200** |

**Costs at 1,000 users:**
- Infrastructure: ~$400/mo
- Anthropic API: ~$4,000/mo (assumes 72% cache hit rate)
- Payment processing: ~$350/mo
- **Total costs: ~$4,750/mo**

**Margin: ~61% ($7,450/mo profit)**

### Break-Even Analysis

- **Fixed costs:** ~$60/mo (infrastructure minimum)
- **Variable cost per Pro user:** ~$16.50/mo (Anthropic API after caching)
- **Revenue per Pro user:** $29/mo
- **Contribution margin per Pro user:** $12.50/mo
- **Break-even:** ~5 Pro subscribers ($72.50 revenue vs. $60 infra + $82.50 API = $142.50)
- **Actually break-even at:** ~12 Pro subscribers (to cover API costs at scale)

---

## 14. Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Vercel/Railway streaming timeout | Low | High | Railway has no timeout; tested before deployment |
| Anthropic API outage | Low | High | Graceful error handling; retry logic; status page monitoring |
| Token counting inaccuracy | Medium | Medium | Use Anthropic's official counts from response, not estimation |
| Database connection exhaustion | Low | High | Connection pooling; circuit breaker; monitoring |
| Redis cache failure | Low | Medium | Fallback to DB queries; Redis not in critical path |
| JWT token leak from Electron | Low | Medium | safeStorage encryption; short expiry; device binding |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Anthropic price increase | Medium | High | 50%+ margin buffer; switch models if needed |
| Free tier abuse (many accounts) | Medium | Medium | Email verification; IP limiting; device fingerprinting |
| Low conversion (free -> paid) | High | High | Generous free trial; value demonstration; upgrade prompts |
| Churn after first month | Medium | Medium | Usage-based notifications; coaching improvements |
| Competitor launches similar product | Low | Medium | Focus on Strat methodology niche; community |

### Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Key rotation disrupts service | Low | Medium | Zero-downtime key rotation procedure |
| Database migration failure | Low | High | Tested migrations; rollback scripts; backups |
| Stripe webhook missed | Low | Medium | Idempotent handlers; reconciliation cron; manual override |
| Usage reporting lag | Medium | Low | Async reporting; daily reconciliation; grace periods |

---

## 15. Appendices

### Appendix A: Technology Decision Records

#### ADR-001: Fastify over Express

**Context:** Need a Node.js HTTP framework for the backend API.

**Decision:** Use Fastify instead of Express.

**Rationale:**
- 5.6x higher throughput in benchmarks (114K vs. 20K req/s)
- Built-in schema validation (JSON Schema, compiled at startup)
- Native async/await (no callback hell)
- Plugin-based architecture aligns with our modular design
- Lower memory footprint = fewer instances needed
- Active development and growing ecosystem

**Consequences:**
- Smaller middleware ecosystem than Express (but growing)
- Team needs to learn Fastify patterns (plugin system)
- Some Express middleware needs Fastify equivalents

#### ADR-002: Railway over Vercel for Hosting

**Context:** Need to host a Node.js backend that handles long-running SSE streaming connections.

**Decision:** Use Railway instead of Vercel Edge Functions.

**Rationale:**
- Vercel Serverless Functions have a 10-second timeout (free) / 60-second (Pro)
- Vercel Edge Functions have a 30-second timeout
- Claude multi-timeframe analysis can take 30-60 seconds
- Railway has no timeout limits on HTTP connections
- Railway includes integrated PostgreSQL and Redis
- Railway pricing is consumption-based (similar to Vercel)

**Consequences:**
- Need to manage containers (Railway handles most of this)
- No edge network by default (single region, can add CDN later)
- Less integration with Next.js ecosystem (not relevant for API-only server)

#### ADR-003: SSE over WebSockets for Streaming

**Context:** Need to stream Claude API responses to the Electron client in real time.

**Decision:** Use Server-Sent Events (SSE) via HTTP POST instead of WebSockets.

**Rationale:**
- Claude responses are unidirectional (server -> client)
- SSE works over standard HTTP (no protocol upgrade)
- Authentication via standard HTTP headers (simpler than WS handshake)
- Load balancers handle SSE transparently
- Built-in reconnection in browser EventSource API
- Claude API itself uses SSE

**Consequences:**
- Cannot send client messages mid-stream (not needed)
- Need custom parsing in Electron (no native EventSource for POST requests)
- Must handle connection cleanup on client disconnect

#### ADR-004: Clerk over Self-Hosted Auth

**Context:** Need user authentication and account management for the backend.

**Decision:** Use Clerk as the authentication provider.

**Rationale:**
- Free up to 10,000 monthly active users
- Handles email verification, password reset, MFA
- JWT-based, works well with Electron via `@clerk/clerk-js`
- Eliminates need to store password hashes
- SOC 2 compliant
- 15-minute integration time vs. days for self-hosted

**Consequences:**
- Third-party dependency for auth (vendor lock-in risk, but mitigatable)
- Monthly cost at scale ($25/mo at 10K+ users)
- Must handle Clerk outages gracefully (cache JWT validation keys)

#### ADR-005: Stripe for Billing

**Context:** Need subscription management with metered usage billing for token consumption.

**Decision:** Use Stripe Billing with metered pricing.

**Rationale:**
- Native metered usage API (report token consumption directly)
- Industry standard; users trust Stripe checkout
- Customer portal for self-service subscription management
- 2.9% + $0.30 per transaction (lowest among options)
- Webhook reliability for real-time subscription updates
- Supports free tier, trials, and tiered pricing

**Alternatives considered:**
- Lemon Squeezy: No native metered billing; 5% + $0.50 fees (72% more expensive)
- Paddle: No native metered billing; 5% + $0.50 fees; better for tax compliance
- Self-hosted: Massive engineering effort for payments + compliance

### Appendix B: Coaching Methodology Distribution

The Strat methodology system prompt (~15,000 tokens) needs to be available to the backend for prompt caching. The distribution strategy:

1. **Coaching files live in the Electron app** at `src/shared/coaching/`:
   - `THE-STRAT-GUARDRAILS.md` (965 lines, canonical Strat rules)
   - `TRADING-COACH-SYSTEM-PROMPT.md` (personality, teaching method)
   - `version.json` (methodology version tracking)

2. **Coaching files are also deployed with the backend** at `coaching/`:
   - Same files, copied during build
   - Loaded at server startup
   - Used as Claude system prompt with `cache_control: { type: 'ephemeral' }`

3. **Version synchronization:**
   - Backend always uses the latest methodology version
   - Electron app bundles the version at build time
   - Mismatch is fine: the backend's prompt is what Claude sees
   - `GET /api/v1/auth/me` returns `methodology.version` so the app can display it

4. **Update workflow:**
   - Edit coaching files in `src/shared/coaching/`
   - Copy to `strat-coach-api/coaching/`
   - Bump `methodology_version` in both `version.json` files
   - Deploy backend (immediate for all users)
   - Release new Electron build (users get it via auto-updater)

### Appendix C: Offline Mode Considerations

When the user has no internet connection:

1. **Chat:** Disabled with message "AI coaching requires an internet connection"
2. **Trade journal:** Fully functional (local SQLite)
3. **Screenshots:** Fully functional (local capture)
4. **TradingView:** Not available (web-based)
5. **Conversation history:** Available from local cache
6. **Auth state:** Cached JWT checked at startup; re-auth required when JWT expires

The Electron app should detect network state and gracefully degrade:

```typescript
// Main process: network state monitoring
import { net } from 'electron';

function isOnline(): boolean {
  return net.isOnline();
}

// Check before making backend requests
if (!isOnline()) {
  chatView.webContents.send('chat:message-error', {
    error: 'No internet connection. AI coaching requires an online connection.',
    code: 'OFFLINE',
  });
  return;
}
```

### Appendix D: Future Considerations

Items explicitly out of scope for v1 but worth tracking:

1. **Multi-device sync:** Conversations accessible from multiple devices
2. **Admin dashboard:** Web UI for managing users, viewing analytics
3. **Custom model selection:** Let Enterprise users choose Claude model (Sonnet vs. Opus)
4. **API for third-party integrations:** Public API for other trading tools
5. **WebSocket support:** If bidirectional real-time features are needed later
6. **Edge deployment:** Deploy to multiple regions for lower latency
7. **Prompt marketplace:** Let users share/sell custom coaching prompts
8. **Team/organization accounts:** Shared billing for trading firms
9. **Audit logging:** Detailed logs for compliance (financial industry)
10. **Data export:** Let users export all their data (GDPR compliance)

---

## Glossary

| Term | Definition |
|------|-----------|
| **SSE** | Server-Sent Events: HTTP-based protocol for server-to-client streaming |
| **JWT** | JSON Web Token: Compact token format for authentication claims |
| **PKCE** | Proof Key for Code Exchange: OAuth extension for public clients |
| **safeStorage** | Electron API for OS-level encrypted credential storage |
| **Prompt caching** | Anthropic feature to cache system prompts across requests (90% cost savings) |
| **Metered billing** | Stripe billing model that charges based on reported usage |
| **FTFC** | Full Timeframe Continuity: Strat concept where all timeframes align |
| **Token** | Unit of text processing in LLMs (~0.75 words per token) |
| **Connection pooling** | Reusing database connections across requests for efficiency |
| **Circuit breaker** | Pattern that fails fast when a dependency is down, avoiding cascading failures |

---

*This document is the comprehensive technical specification for The Strat Coach backend server. It supersedes `BACKEND-IMPLEMENTATION-PLAN.md` with more thorough research, updated hosting recommendations (Railway over Vercel), and detailed implementation guidance.*

*Last updated: 2026-02-15*
