# Backend Implementation - Model Selection Guide

**Purpose:** Map each implementation task to the optimal Claude Code model for token efficiency.

**Model Selection Criteria:**
- **Haiku:** Simple, well-defined tasks (boilerplate, config, straightforward CRUD)
- **Sonnet:** Medium complexity (business logic, API design, standard patterns)
- **Opus:** Complex/critical (architecture decisions, security, streaming logic, novel implementations)

---

## Phase 1: Backend Foundation (8 hours)

| Task | Model | Rationale |
|------|-------|-----------|
| 1.1 Initialize Fastify project | **Haiku** | Standard scaffolding, well-documented |
| 1.2 PostgreSQL schema + migrations | **Sonnet** | Schema design requires domain understanding |
| 1.3 Clerk JWT auth plugin | **Sonnet** | Security-sensitive but standard pattern |
| 1.4 Redis rate limiter plugin | **Sonnet** | Standard pattern, needs token bucket logic |
| 1.5 `/chat/stream` SSE proxy | **Opus** | CRITICAL - streaming proxy is complex and novel |
| 1.6 Usage tracking service | **Sonnet** | Business logic, token counting accuracy matters |
| 1.7 `/usage/current` endpoint | **Haiku** | Simple read endpoint |
| 1.8 Railway deployment | **Haiku** | Configuration, following docs |
| 1.9 Integration tests | **Sonnet** | Test design requires understanding of flows |

**Cost estimate:** ~60K tokens (1 Opus, 5 Sonnet, 3 Haiku tasks)

---

## Phase 2: Billing Integration (4 hours)

| Task | Model | Rationale |
|------|-------|-----------|
| 2.1 Configure Stripe products | **Haiku** | Configuration following Stripe docs |
| 2.2 `/billing/checkout` endpoint | **Sonnet** | Standard Stripe Checkout flow |
| 2.3 `/billing/portal` endpoint | **Haiku** | Simple redirect to Stripe portal |
| 2.4 Stripe webhook handler | **Opus** | CRITICAL - idempotency, security, edge cases |
| 2.5 Usage reset cron job | **Sonnet** | Business logic, date handling |
| 2.6 Overage reporting cron | **Sonnet** | Business logic, Stripe metered billing |
| 2.7 Test billing flows | **Sonnet** | End-to-end test design |

**Cost estimate:** ~40K tokens (1 Opus, 4 Sonnet, 2 Haiku tasks)

---

## Phase 3: Electron Auth Integration (4 hours)

| Task | Model | Rationale |
|------|-------|-----------|
| 3.1 Install Clerk SDK | **Haiku** | Package installation, configuration |
| 3.2 AuthTokenStore (safeStorage) | **Opus** | CRITICAL - security-sensitive encryption |
| 3.3 Login/signup UI | **Sonnet** | React components, form handling |
| 3.4 AuthGuard wrapper | **Sonnet** | React pattern, route protection |
| 3.5 BackendClient service | **Sonnet** | HTTP client with auth headers |
| 3.6 Auth IPC handlers | **Sonnet** | IPC security validation |

**Cost estimate:** ~45K tokens (1 Opus, 5 Sonnet, 1 Haiku task)

---

## Phase 4: Chat Migration (3 hours)

| Task | Model | Rationale |
|------|-------|-----------|
| 4.1 ChatService abstraction | **Opus** | CRITICAL - abstraction layer design, strategy pattern |
| 4.2 BackendProvider (SSE client) | **Opus** | CRITICAL - SSE client with reconnection, error handling |
| 4.3 Update IPC handlers | **Sonnet** | Refactor existing handlers to use abstraction |
| 4.4 Usage display UI | **Haiku** | Simple UI component |
| 4.5 End-to-end testing | **Sonnet** | Integration test design |

**Cost estimate:** ~40K tokens (2 Opus, 2 Sonnet, 1 Haiku task)

---

## Phase 5: Subscription UI + Polish (3 hours)

| Task | Model | Rationale |
|------|-------|-----------|
| 5.1 AccountSettings component | **Sonnet** | React component with multiple sections |
| 5.2 Upgrade flow (Stripe) | **Sonnet** | Standard Stripe Checkout integration |
| 5.3 Quota exceeded UI | **Haiku** | Simple error state component |
| 5.4 Edge case handling | **Sonnet** | Offline mode, token expiry, network errors |
| 5.5 End-to-end testing | **Sonnet** | Integration test coverage |

**Cost estimate:** ~30K tokens (0 Opus, 4 Sonnet, 1 Haiku task)

---

## Phase 6: Cleanup + Documentation (2 hours)

| Task | Model | Rationale |
|------|-------|-----------|
| 6.1 Remove direct API code | **Haiku** | Code deletion, straightforward |
| 6.2 Remove API key storage | **Haiku** | Code deletion |
| 6.3 Update CLAUDE.md/HANDOFF | **Haiku** | Documentation update |
| 6.4 BACKEND-SETUP.md | **Sonnet** | Technical documentation, deployment guide |
| 6.5 Final regression testing | **Sonnet** | Test execution, verification |

**Cost estimate:** ~15K tokens (0 Opus, 2 Sonnet, 3 Haiku tasks)

---

## Total Cost Estimate

| Model | Tasks | Estimated Tokens | Cost @ Input Rate |
|-------|-------|------------------|-------------------|
| **Opus** | 6 tasks | ~120K tokens | ~$1.80 |
| **Sonnet** | 27 tasks | ~150K tokens | ~$0.45 |
| **Haiku** | 11 tasks | ~30K tokens | ~$0.01 |
| **TOTAL** | **44 tasks** | **~300K tokens** | **~$2.26** |

*Note: Assumes average 20K tokens/Opus task, 5.5K tokens/Sonnet task, 2.7K tokens/Haiku task*

---

## Critical Path (Opus-Required Tasks)

These tasks **require Opus** - do not substitute with Sonnet:

1. ✅ **Task 1.5** - `/chat/stream` SSE proxy (streaming is complex)
2. ✅ **Task 2.4** - Stripe webhook handler (security + idempotency critical)
3. ✅ **Task 3.2** - AuthTokenStore with safeStorage (encryption security)
4. ✅ **Task 4.1** - ChatService abstraction layer (architecture design)
5. ✅ **Task 4.2** - BackendProvider SSE client (complex reconnection logic)
6. ⚠️ **Optional Task 0.0** - Initial architecture review (if deviating from PRD)

**Why Opus for these?**
- Novel implementations (not standard patterns)
- Security-critical (one mistake = breach)
- Complex state management (reconnection, retries)
- Architectural decisions (affect all future code)

---

## Usage Instructions for New Chat

When starting the backend implementation chat, provide this context:

```
I'm implementing the backend server for The Strat Coach based on PRD-BACKEND-SERVER.md.

Current phase: [Phase number and name]
Current task: [Task ID and description]
Recommended model: [Opus/Sonnet/Haiku from this mapping]

[Paste relevant PRD sections or task details]
```

**Model override guidance:**
- If a Haiku task proves more complex than expected, escalate to Sonnet
- If a Sonnet task involves security or novel patterns, escalate to Opus
- Never downgrade from Opus to Sonnet for critical path tasks

---

## Token Efficiency Tips

1. **Use Haiku for scaffolding** - Let Haiku generate boilerplate, then Sonnet adds logic
2. **Batch related tasks** - Combine multiple Haiku tasks in one prompt
3. **Reuse context** - Reference PRD sections instead of re-explaining
4. **Start with Opus for Phase 1.5** - Get the streaming proxy right first (everything depends on it)
5. **Use Sonnet for iteration** - After Opus designs, Sonnet can refine/debug

---

**Next Steps:**
1. Create new chat for backend implementation
2. Start with **Phase 1, Task 1.1** (Haiku)
3. Follow this model mapping for each task
4. Reference `PRD-BACKEND-SERVER.md` sections as needed
