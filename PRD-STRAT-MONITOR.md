# Product Requirements Document: Strat Monitor

> **Desktop AI Trading Coach for The Strat Methodology**
>
> **Created:** 2026-02-13
> **Version:** 1.0
> **Status:** Ready for Implementation
> **Est. Development Time:** 20-28 hours (7 sessions)
> **MVP Time:** 12-16 hours (4 sessions)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision](#2-product-vision)
3. [Technical Architecture](#3-technical-architecture)
4. [Complete Task Breakdown](#4-complete-task-breakdown)
5. [Agent Assignment Matrix](#5-agent-assignment-matrix)
6. [Testing Strategy](#6-testing-strategy)
7. [Tools, Dependencies & MCPs](#7-tools-dependencies--mcps)
8. [Development Timeline](#8-development-timeline)
9. [Risk Management](#9-risk-management)
10. [Success Criteria](#10-success-criteria)

---

## 1. Executive Summary

### What We're Building

A split-screen desktop application that embeds TradingView charts alongside an AI coaching chat interface powered by Claude. The app captures chart screenshots on demand, sends them to Claude API for analysis with The Strat methodology context, and maintains a trade journal database.

### Why Electron Was Chosen

After extensive research comparing Electron vs Tauri:
- **TradingView embedding is proven** in Electron (3 existing open-source projects)
- **Native screenshot capture API** (`webContents.capturePage()`)
- **Reliable session persistence** for TradingView login
- **Cross-platform rendering consistency** (bundled Chromium)
- **40-60% faster development time** (JavaScript only, no Rust)
- **Score: Electron 8.8/10 vs Tauri 5.6/10**

### Key Metrics

| Metric | Target |
|--------|--------|
| **Development Time** | 20-28 hours total |
| **MVP Time** | 12-16 hours (Sessions 1-4) |
| **Bundle Size** | ~100 MB (acceptable for trading tool) |
| **Memory Usage** | 250-400 MB (comparable to browser tab) |
| **Startup Time** | <2 seconds |
| **Screenshot Latency** | <50ms capture time |
| **Test Coverage** | >80% on services/stores |

---

## 2. Product Vision

### User Experience Flow

```
┌──────────────────────────────────────────────────────────┐
│  Strat Monitor (Electron Desktop App)                    │
├────────────────────────────┬─────────────────────────────┤
│                            │                             │
│   TradingView              │   AI Coach Chat             │
│   (WebContentsView)        │   (React + TypeScript)      │
│                            │                             │
│   ┌──────────────────────┐ │   ┌───────────────────────┐ │
│   │                      │ │   │ What do you see? 🤔   │ │
│   │  [AAPL Chart]        │ │   └───────────────────────┘ │
│   │  with Strat          │ │   ┌───────────────────────┐ │
│   │  indicators          │ │   │ 2-1-2 bull, FTFC     │ │
│   │                      │ │   │ aligned D/4H/1H up    │ │
│   │  [User logged in]    │ │   └───────────────────────┘ │
│   │                      │ │   ┌───────────────────────┐ │
│   └──────────────────────┘ │   │ [AI analyzes chart]   │ │
│                            │   │ Correct! But check    │ │
│                            │   │ magnitude - you're    │ │
│                            │   │ near 4H high...       │ │
│                            │   └───────────────────────┘ │
│                            │   [📷 Capture] [💬 Send]   │
└────────────────────────────┴─────────────────────────────┘
```

### Core Features (MVP)

1. **Split-Screen Layout**
   - Left pane: TradingView chart (user's own account, custom Strat indicators)
   - Right pane: AI chat interface
   - Resizable divider
   - Persistent window size/position

2. **Screenshot Capture**
   - One-click capture of TradingView pane
   - Automatic base64 encoding for Claude API
   - HiDPI/Retina support
   - <50ms capture latency

3. **AI Coaching Chat**
   - Streaming Claude API responses
   - Image (screenshot) analysis with vision
   - The Strat methodology context in system prompt
   - Conversation history persistence
   - Message editing and regeneration

4. **Trade Journal Database**
   - SQLite database (better-sqlite3)
   - Trade entries with screenshots
   - Search and filter
   - Export to CSV

5. **Auto-Update System**
   - Background update checks
   - Silent download
   - Notify user on restart
   - GitHub Releases integration

### Deferred Features (Post-MVP)

- Multi-monitor support (detach TradingView to separate window)
- Voice input for chat
- Trade alerts/notifications
- Cloud sync for trade journal
- Mobile companion app (view journal on phone)
- Collaborative features (share trades with coach)

---

## 3. Technical Architecture

### Tech Stack (Validated via Research)

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **Desktop Framework** | Electron | 40.x | Stable WebContentsView, Chromium M144, proven TradingView embedding |
| **Build Tool** | electron-vite | 5.x | Best DX with HMR, faster than Electron Forge's experimental Vite plugin |
| **Packager** | electron-builder | 26.x | Mature code signing, DMG/NSIS/AppImage, auto-update support |
| **Node.js** | Node.js | 20.19+ or 22.12+ | Required by electron-vite 5.x |
| **UI Framework** | React | 19.x | Dominant ecosystem, excellent TypeScript support |
| **Language** | TypeScript | 5.x | Type safety across main/preload/renderer |
| **Styling** | Tailwind CSS | 4.x | Utility-first, tiny production bundles |
| **Components** | shadcn/ui | latest | Accessible, Radix UI-based, copy-paste components |
| **State Management** | Zustand | 5.x | Minimal boilerplate, no Provider, handles React 19 concurrency |
| **AI SDK** | @anthropic-ai/sdk | 0.74.x | Official TypeScript SDK, streaming, vision, prompt caching |
| **Database** | better-sqlite3 | 12.x | Synchronous, fast, runs in main process |
| **Auto-Update** | electron-updater | 6.x | GitHub Releases integration, delta updates |
| **Testing** | Vitest + Playwright | 3.x / 1.x | Fast unit tests, reliable E2E with Electron support |

### Project Structure

```
strat-monitor/
├── .github/workflows/          # CI/CD pipelines
│   ├── build.yml               # Lint, test, build
│   └── release.yml             # Sign, notarize, publish
├── build/                      # Build resources
│   ├── icon.icns               # macOS icon
│   ├── icon.ico                # Windows icon
│   ├── icon.png                # Linux icon
│   └── entitlements.mac.plist  # macOS entitlements
├── resources/                  # Non-bundled assets
│   └── migrations/             # SQL migration files
│       ├── 001_init.sql
│       └── 002_add_screenshots.sql
├── src/
│   ├── main/                   # Electron main process (Node.js)
│   │   ├── index.ts            # App entry, lifecycle
│   │   ├── window.ts           # WebContentsView manager
│   │   ├── ipc/                # IPC handlers
│   │   │   ├── index.ts        # Registration + validation
│   │   │   ├── screenshot.ts   # Capture handlers
│   │   │   ├── claude.ts       # AI API handlers
│   │   │   └── database.ts     # Trade journal handlers
│   │   ├── services/
│   │   │   ├── database.ts     # better-sqlite3 service
│   │   │   ├── claude.ts       # Anthropic SDK client
│   │   │   └── screenshot.ts   # Screenshot capture service
│   │   └── utils/
│   │       └── security.ts     # API key storage (safeStorage)
│   ├── preload/
│   │   ├── index.ts            # Chat renderer API
│   │   └── tradingview.ts      # TradingView (minimal)
│   ├── renderer/               # React app (chat UI)
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── components/     # React components
│   │   │   │   ├── chat/
│   │   │   │   │   ├── ChatPanel.tsx
│   │   │   │   │   ├── MessageList.tsx
│   │   │   │   │   ├── MessageInput.tsx
│   │   │   │   │   └── StreamingMessage.tsx
│   │   │   │   ├── trade-journal/
│   │   │   │   │   ├── TradeList.tsx
│   │   │   │   │   └── TradeForm.tsx
│   │   │   │   └── ui/         # shadcn/ui components
│   │   │   ├── hooks/
│   │   │   │   ├── useChat.ts
│   │   │   │   └── useTrades.ts
│   │   │   ├── stores/
│   │   │   │   ├── chat.ts     # Zustand chat store
│   │   │   │   └── trades.ts   # Zustand trades store
│   │   │   ├── lib/
│   │   │   │   └── utils.ts    # shadcn utils
│   │   │   └── types/
│   │   │       └── electron.d.ts
│   │   └── index.html
│   └── shared/                 # Shared types
│       ├── ipc-types.ts        # IPC contracts
│       └── models.ts           # Data models
├── test/
│   ├── unit/                   # Vitest unit tests
│   ├── integration/            # Vitest integration tests
│   └── e2e/                    # Playwright E2E tests
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── tailwind.config.js
└── package.json
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  BaseWindow                              │
│                                                          │
│  ┌────────────────────┐  ┌─────────────────────────┐   │
│  │  WebContentsView   │  │  WebContentsView        │   │
│  │  (TradingView)     │  │  (Chat UI)              │   │
│  │                    │  │                         │   │
│  │  Chromium renderer │  │  React + TypeScript     │   │
│  │  No Node.js access │  │  No Node.js access      │   │
│  │  Minimal preload   │  │  Typed preload API      │   │
│  └─────────┬──────────┘  └───────────┬─────────────┘   │
│            │                          │                  │
└────────────┼──────────────────────────┼──────────────────┘
             │                          │
             │         IPC (typed)      │
             │                          │
             └────────┬─────────────────┘
                      │
          ┌───────────▼────────────┐
          │   Main Process         │
          │   (Node.js context)    │
          │                        │
          │  ┌──────────────────┐  │
          │  │  IPC Handlers    │  │
          │  │  (validation)    │  │
          │  └──────────────────┘  │
          │                        │
          │  ┌──────────────────┐  │
          │  │  Services        │  │
          │  │  - Database      │  │
          │  │  - Claude API    │  │
          │  │  - Screenshot    │  │
          │  └──────────────────┘  │
          └────────────────────────┘
                      │
          ┌───────────┼───────────┐
          │           │           │
          ▼           ▼           ▼
     SQLite      Claude API   File System
    (trades.db)  (streaming)  (screenshots)
```

### Security Model

**Configuration:**
```typescript
// Chat renderer webPreferences
{
  nodeIntegration: false,         // No Node.js in renderer
  contextIsolation: true,         // Isolated contexts
  sandbox: true,                  // Chromium sandbox
  webSecurity: true,              // Enforce web security
  allowRunningInsecureContent: false,
  preload: path.join(__dirname, '../preload/index.js')
}

// TradingView webPreferences
{
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  partition: 'persist:tradingview',  // Persistent session
  preload: path.join(__dirname, '../preload/tradingview.js')
}
```

**IPC Security:**
- All IPC handlers validate sender origin
- No direct Node.js access from renderer
- Typed contracts via `contextBridge.exposeInMainWorld`
- API keys stored with `safeStorage` (OS keychain)

**TradingView Session:**
- Separate `persist:tradingview` partition
- X-Frame-Options headers stripped via `webRequest.onHeadersReceived`
- No communication between TradingView and chat renderer

---

## 4. Complete Task Breakdown

### Overview: 9 Epics, 68 Tasks, 7 Sessions

**Epic Priority Legend:**
- **P0:** Must complete for MVP
- **P1:** Nice-to-have for MVP, required for v1.0
- **P2:** Post-MVP enhancements

### Epic 1: Project Scaffolding (P0)
**Effort:** 1 session (2-3 hours) | **Tasks:** 12

| ID | Task | Subtasks | Complexity | Owner | Dependencies |
|----|------|----------|------------|-------|--------------|
| 1.1 | Scaffold electron-vite project | `npm create @quick-start/electron@latest strat-monitor -- --template=react-ts` | 1 | Bash Agent | None |
| 1.2 | Install production dependencies | Install: @anthropic-ai/sdk, better-sqlite3, electron-updater, zustand, lucide-react | 1 | Bash Agent | 1.1 |
| 1.3 | Install dev dependencies | Install: vitest, @playwright/test, @testing-library/react, typescript, eslint, prettier | 1 | Bash Agent | 1.1 |
| 1.4 | Configure Tailwind CSS v4 | Install, update electron.vite.config.ts, create CSS entry in renderer | 2 | Claude Direct | 1.1 |
| 1.5 | Initialize shadcn/ui | Run `npx shadcn@latest init`, install button, input, card, scroll-area | 2 | Bash + Claude | 1.4 |
| 1.6 | Configure TypeScript paths | Update tsconfig files with `@main`, `@renderer`, `@shared` aliases | 2 | Claude Direct | 1.1 |
| 1.7 | Configure electron-builder | Create `electron-builder.yml` with mac (DMG), windows (NSIS), linux (AppImage) | 2 | Claude Direct | 1.1 |
| 1.8 | Rebuild better-sqlite3 | `npx electron-rebuild -f -w better-sqlite3` | 1 | Bash Agent | 1.2 |
| 1.9 | Setup ESLint + Prettier | Flat config, TypeScript rules, React hooks plugin, format on save | 2 | Claude Direct | 1.1 |
| 1.10 | Create project structure | Make all src directories matching architecture spec | 1 | Bash Agent | 1.1 |
| 1.11 | Initialize git repository | `git init`, create `.gitignore`, initial commit | 1 | Bash Agent | 1.10 |
| 1.12 | Verify dev server | `npm run dev` — confirm app launches, HMR works, TypeScript compiles | 1 | Phil + Bash | All 1.x |

**Quality Gate:**
- ✅ `npm run dev` launches successfully
- ✅ TypeScript compiles with no errors
- ✅ ESLint passes
- ✅ Hot reload works for renderer changes

**Tests:**
```bash
npm run typecheck  # No TypeScript errors
npm run lint       # No ESLint errors
npm run dev        # App launches, React loads
```

---

### Epic 2: Core Architecture (P0)
**Effort:** 2 sessions (4-6 hours) | **Tasks:** 8

| ID | Task | Subtasks | Complexity | Owner | Dependencies |
|----|------|----------|------------|-------|--------------|
| 2.1 | Main process entry point | Create `src/main/index.ts` — app lifecycle (ready, window-all-closed, activate), security handlers | 3 | Claude Direct | Epic 1 |
| 2.2 | Window manager with WebContentsView | Create `src/main/window.ts` — BaseWindow creation, split-pane (50/50), resize handler | 4 | Claude Direct | 2.1 |
| 2.3 | TradingView session setup | Create TradingView WebContentsView with `persist:tradingview`, strip X-Frame-Options | 3 | Claude Direct | 2.2 |
| 2.4 | Chat renderer preload | Create `src/preload/index.ts` — expose typed API via contextBridge | 3 | Claude Direct | 2.1 |
| 2.5 | TradingView preload (minimal) | Create `src/preload/tradingview.ts` — empty or minimal (no API exposure) | 1 | Claude Direct | 2.1 |
| 2.6 | Shared IPC types | Create `src/shared/ipc-types.ts`, `src/shared/models.ts` — TypeScript contracts | 3 | Claude Direct | None |
| 2.7 | IPC handler registration | Create `src/main/ipc/index.ts` — central registration, sender validation | 3 | Claude Direct | 2.4, 2.6 |
| 2.8 | Verify split-pane renders | Manual test: TradingView loads left, React right, can resize | 2 | Phil | 2.2, 2.3 |

**Quality Gate:**
- ✅ App launches with split-pane layout
- ✅ TradingView loads on left (user can log in)
- ✅ React app loads on right
- ✅ Resize divider works smoothly
- ✅ IPC ping-pong test passes (renderer → main → renderer)
- ✅ No console errors or security warnings

**Tests:**
```typescript
// Manual test checklist
- [ ] TradingView loads and accepts login
- [ ] React "Hello World" visible on right
- [ ] Window resize updates both panes proportionally
- [ ] DevTools accessible (Cmd+Opt+I)

// Automated test
test('IPC roundtrip', async () => {
  const result = await window.electronAPI.ping('test');
  expect(result).toBe('pong: test');
});
```

**Early Risk Validation (CRITICAL):**
Before proceeding to Epic 3, validate these assumptions:

1. **TradingView login persists across restarts**
   ```typescript
   // Test: Close app, reopen, check if still logged in
   ```

2. **Custom Strat indicators render correctly**
   ```typescript
   // Test: Load chart with TheStrat Teach V2, verify candles numbered
   ```

3. **Screenshot capture works**
   ```typescript
   // Test: Capture TradingView pane, verify image quality
   const image = await tvView.webContents.capturePage();
   fs.writeFileSync('test-capture.png', image.toPNG());
   ```

If any fail, investigate before continuing. These are architectural assumptions.

---

### Epic 3: Database Layer (P0)
**Effort:** 1 session (2-3 hours) | **Tasks:** 7

| ID | Task | Subtasks | Complexity | Owner | Dependencies |
|----|------|----------|------------|-------|--------------|
| 3.1 | Database service | Create `src/main/services/database.ts` — better-sqlite3 setup, migration runner | 3 | Claude Direct | Epic 1 |
| 3.2 | SQL migrations | Create migration files: `001_init.sql` (trades, conversations, messages tables) | 2 | Claude Direct | None |
| 3.3 | Trade CRUD operations | Methods: createTrade, getTrade, listTrades, updateTrade, deleteTrade | 3 | Claude Direct | 3.1, 3.2 |
| 3.4 | Conversation CRUD | Methods: createConversation, getConversation, listConversations | 2 | Claude Direct | 3.1, 3.2 |
| 3.5 | Message CRUD | Methods: createMessage, getMessages, deleteMessage | 2 | Claude Direct | 3.1, 3.2 |
| 3.6 | Database IPC handlers | Create `src/main/ipc/database.ts` — expose DB operations to renderer | 3 | Claude Direct | 3.1, 3.3-3.5, 2.7 |
| 3.7 | Database unit tests | Vitest tests for all CRUD operations, migrations, edge cases | 3 | Claude Direct | 3.1-3.5 |

**Quality Gate:**
- ✅ Database initializes on app start
- ✅ Migrations run successfully
- ✅ All CRUD operations work (tested via unit tests)
- ✅ Unit test coverage >80%
- ✅ No SQL injection vulnerabilities (parameterized queries)

**Tests:**
```typescript
// Unit tests (Vitest)
describe('DatabaseService', () => {
  let db: DatabaseService;

  beforeEach(() => {
    db = new DatabaseService(':memory:');
  });

  test('creates trade', () => {
    const trade = db.createTrade({
      date: '2026-02-13',
      ticker: 'AAPL',
      direction: 'LONG'
    });
    expect(trade.id).toBeDefined();
  });

  test('lists trades with filters', () => {
    // ... create test data
    const trades = db.listTrades({ ticker: 'AAPL' });
    expect(trades.length).toBe(1);
  });

  // ... more tests
});
```

---

### Epic 4: Claude API Integration (P0)
**Effort:** 1-2 sessions (3-5 hours) | **Tasks:** 7

| ID | Task | Subtasks | Complexity | Owner | Dependencies |
|----|------|----------|------------|-------|--------------|
| 4.1 | Claude service | Create `src/main/services/claude.ts` — Anthropic SDK client, streaming, vision | 4 | Claude Direct | Epic 1 |
| 4.2 | API key management | Secure storage with `safeStorage` API, prompt user if missing | 2 | Claude Direct | 2.1 |
| 4.3 | Streaming response handler | IPC streaming implementation (main → renderer via events) | 4 | Claude Direct | 4.1, 2.7 |
| 4.4 | Image analysis integration | Base64 screenshot → Claude vision API → structured response | 3 | Claude Direct | 4.1 |
| 4.5 | Prompt templates | System prompts for The Strat coaching, few-shot examples | 2 | Claude Direct | None |
| 4.6 | Claude IPC handlers | Create `src/main/ipc/claude.ts` — sendMessage, streamMessage, analyzeScreenshot | 3 | Claude Direct | 4.1, 4.3, 2.7 |
| 4.7 | Claude service unit tests | Mock Anthropic SDK, test streaming, error handling, prompt caching | 3 | Claude Direct | 4.1 |

**Quality Gate:**
- ✅ API key stored securely
- ✅ Streaming works (main → renderer)
- ✅ Image analysis returns structured insights
- ✅ Error handling (rate limits, network errors)
- ✅ Unit test coverage >80%

**Tests:**
```typescript
// Unit tests (Vitest with mocks)
describe('ClaudeService', () => {
  let claude: ClaudeService;
  let mockAnthropic: MockAnthropic;

  beforeEach(() => {
    mockAnthropic = new MockAnthropic();
    claude = new ClaudeService(mockAnthropic);
  });

  test('streams response', async () => {
    const chunks: string[] = [];
    await claude.streamMessage(
      'Hello',
      (chunk) => chunks.push(chunk)
    );
    expect(chunks.join('')).toBe('Test response');
  });

  test('analyzes screenshot', async () => {
    const result = await claude.analyzeScreenshot(
      'base64image',
      'Analyze this chart'
    );
    expect(result).toHaveProperty('setup');
    expect(result).toHaveProperty('risk');
  });
});
```

---

### Epic 5: Screenshot Capture (P0)
**Effort:** 1 session (2-3 hours) | **Tasks:** 5

| ID | Task | Subtasks | Complexity | Owner | Dependencies |
|----|------|----------|------------|-------|--------------|
| 5.1 | Screenshot service | Create `src/main/services/screenshot.ts` — capturePage wrapper, HiDPI handling | 3 | Claude Direct | 2.2 |
| 5.2 | Image optimization | Resize/compress for Claude API (max 5MB), preserve quality | 2 | Claude Direct | 5.1 |
| 5.3 | Screenshot storage | Save to `app.getPath('userData')/screenshots`, link to trades | 2 | Claude Direct | 5.1, 3.1 |
| 5.4 | Screenshot IPC handlers | Create `src/main/ipc/screenshot.ts` — captureChart, getCaptureHistory | 2 | Claude Direct | 5.1, 2.7 |
| 5.5 | Screenshot unit tests | Test capture, resize, storage, cleanup | 2 | Claude Direct | 5.1-5.3 |

**Quality Gate:**
- ✅ Screenshot captures TradingView pane only (not chat)
- ✅ <50ms capture latency
- ✅ HiDPI/Retina support (correct resolution)
- ✅ Images optimized for Claude API (<5MB)
- ✅ Storage cleanup (delete old screenshots)

**Tests:**
```typescript
describe('ScreenshotService', () => {
  test('captures view', async () => {
    const screenshot = new ScreenshotService(mockWebContents);
    const base64 = await screenshot.capture();
    expect(base64).toMatch(/^iVBORw0KGgo/);
  });

  test('optimizes large images', async () => {
    const optimized = await screenshot.optimize(largeImage);
    expect(optimized.length).toBeLessThan(5 * 1024 * 1024);
  });
});
```

---

### Epic 6: Chat UI (P0)
**Effort:** 2-3 sessions (5-7 hours) | **Tasks:** 17

| ID | Task | Subtasks | Complexity | Owner | Dependencies |
|----|------|----------|------------|-------|--------------|
| 6.1 | Chat store (Zustand) | Create `src/renderer/src/stores/chat.ts` — messages, conversations, UI state | 3 | Claude Direct | Epic 1 |
| 6.2 | Trades store (Zustand) | Create `src/renderer/src/stores/trades.ts` — trade list, filters, form state | 2 | Claude Direct | Epic 1 |
| 6.3 | ChatPanel component | Container component with header, message list, input | 2 | Claude Direct | 6.1 |
| 6.4 | MessageList component | Virtualized list, auto-scroll, message grouping | 3 | Claude Direct | 6.1 |
| 6.5 | MessageInput component | Textarea with Cmd+Enter submit, file upload (future), shortcuts | 2 | Claude Direct | 6.1 |
| 6.6 | StreamingMessage component | Real-time rendering of streaming Claude responses with markdown | 3 | Claude Direct | 6.1 |
| 6.7 | TradeList component | Table view with filters (ticker, date range), search | 2 | Claude Direct | 6.2 |
| 6.8 | TradeForm component | Add/edit trade with screenshot attachment | 2 | Claude Direct | 6.2 |
| 6.9 | useChat hook | Custom hook for chat operations (send, stream, edit, regenerate) | 3 | Claude Direct | 6.1 |
| 6.10 | useTrades hook | Custom hook for trade CRUD operations | 2 | Claude Direct | 6.2 |
| 6.11 | App layout | Main App.tsx with navigation, state management provider setup | 2 | Claude Direct | Epic 1 |
| 6.12 | Chat IPC integration | Connect useChat hook to IPC handlers (window.electronAPI) | 3 | Claude Direct | 6.9, 4.6 |
| 6.13 | Database IPC integration | Connect useTrades hook to database IPC | 2 | Claude Direct | 6.10, 3.6 |
| 6.14 | Screenshot IPC integration | "Capture Chart" button → IPC → store screenshot → send to Claude | 3 | Claude Direct | 5.4, 6.9 |
| 6.15 | Markdown rendering | Install react-markdown, syntax highlighting, proper styling | 2 | Claude Direct | 6.6 |
| 6.16 | Component unit tests | React Testing Library tests for all major components | 3 | Claude Direct | 6.3-6.8 |
| 6.17 | Manual UI testing | Phil tests all user flows, provides feedback on UX | 2 | Phil | All 6.x |

**Quality Gate:**
- ✅ All UI components render correctly
- ✅ Chat streaming works smoothly (no lag)
- ✅ Screenshot capture button works
- ✅ Trade journal CRUD operations work
- ✅ No React warnings in console
- ✅ Responsive layout (supports 1366x768 minimum)
- ✅ Component test coverage >70%

**Tests:**
```typescript
// Component tests (Vitest + React Testing Library)
describe('ChatPanel', () => {
  test('renders messages', () => {
    const { getByText } = render(<ChatPanel />);
    expect(getByText('What do you see?')).toBeInTheDocument();
  });

  test('sends message on Cmd+Enter', async () => {
    const { getByRole } = render(<ChatPanel />);
    const input = getByRole('textbox');
    await userEvent.type(input, 'Test message{Meta>}{Enter}');
    expect(mockSendMessage).toHaveBeenCalled();
  });
});
```

---

### Epic 7: Auto-Update (P1)
**Effort:** 1 session (2-3 hours) | **Tasks:** 5

| ID | Task | Subtasks | Complexity | Owner | Dependencies |
|----|------|----------|------------|-------|--------------|
| 7.1 | electron-updater setup | Install, configure autoUpdater in main process | 2 | Claude Direct | Epic 1, 2.1 |
| 7.2 | Update check on launch | Check for updates 30s after app ready | 1 | Claude Direct | 7.1 |
| 7.3 | Silent download | Download updates in background, notify on ready | 2 | Claude Direct | 7.1 |
| 7.4 | Update UI notification | Show toast/banner when update ready: "Restart to update" | 2 | Claude Direct | 7.1 |
| 7.5 | Manual update check | Add "Check for Updates" menu item | 1 | Claude Direct | 7.1 |

**Quality Gate:**
- ✅ Update check works (test with mock server)
- ✅ Silent download doesn't block UI
- ✅ User notified when update ready
- ✅ "Restart and Install" button works

**Tests:**
```typescript
// Integration test
test('auto-updater checks on launch', async () => {
  const mockUpdater = new MockAutoUpdater();
  // ... trigger update check
  expect(mockUpdater.checkForUpdates).toHaveBeenCalled();
});
```

---

### Epic 8: Build & Distribution (P1)
**Effort:** 2 sessions (4-6 hours) | **Tasks:** 9

| ID | Task | Subtasks | Complexity | Owner | Dependencies |
|----|------|----------|------------|-------|--------------|
| 8.1 | Create app icons | Generate icns/ico/png in all required sizes | 1 | Phil | None |
| 8.2 | macOS entitlements | Create `entitlements.mac.plist` with required permissions | 2 | Claude Direct | None |
| 8.3 | Code signing config | electron-builder.yml: certificateSubjectName, identity | 2 | Claude Direct | 1.7 |
| 8.4 | Build DMG (Mac) | `npm run build:mac` — test universal binary | 2 | Bash Agent | 8.2, 8.3 |
| 8.5 | Build NSIS (Windows) | `npm run build:win` — test on Windows VM or CI | 2 | Bash Agent | 8.3 |
| 8.6 | GitHub Actions CI | Create `.github/workflows/build.yml` — lint, typecheck, test, build | 3 | Claude Direct | All previous |
| 8.7 | GitHub Actions Release | Create `.github/workflows/release.yml` — sign, notarize, publish | 4 | Claude Direct | 8.6 |
| 8.8 | Apple Developer setup | Phil: Enroll in Apple Developer Program ($99/year), generate certs | 1 | Phil | None |
| 8.9 | Windows code signing | Phil: Obtain EV cert or set up Azure Trusted Signing | 2 | Phil + Claude | None |

**Quality Gate:**
- ✅ DMG builds successfully on Mac
- ✅ NSIS builds successfully on Windows
- ✅ Signed builds install without warnings
- ✅ CI pipeline passes on all platforms
- ✅ Release workflow publishes to GitHub Releases

**Tests:**
```bash
# Manual testing checklist
- [ ] Install DMG on fresh Mac — no Gatekeeper warning
- [ ] Install EXE on fresh Windows — no SmartScreen warning
- [ ] App launches after install
- [ ] Auto-update works (test with staged release)
```

---

### Epic 9: E2E Testing (P2)
**Effort:** 1-2 sessions (3-5 hours) | **Tasks:** 7

| ID | Task | Subtasks | Complexity | Owner | Dependencies |
|----|------|----------|------------|-------|--------------|
| 9.1 | Playwright Electron setup | Configure @playwright/test for Electron app testing | 2 | Claude Direct | Epic 1 |
| 9.2 | E2E: App launch | Test app launches, windows appear, no crashes | 2 | Claude Direct | 9.1 |
| 9.3 | E2E: TradingView loads | Test left pane loads tradingview.com | 2 | Claude Direct | 9.1 |
| 9.4 | E2E: Chat interaction | Test send message → streaming response → message appears | 3 | Claude Direct | 9.1 |
| 9.5 | E2E: Screenshot capture | Test capture button → screenshot taken → sent to Claude | 3 | Claude Direct | 9.1 |
| 9.6 | E2E: Trade journal | Test create trade → save → appears in list → edit → delete | 3 | Claude Direct | 9.1 |
| 9.7 | E2E: Full workflow | Test complete flow: capture → analyze → log trade → view journal | 4 | Claude Direct | 9.1-9.6 |

**Quality Gate:**
- ✅ All E2E tests pass
- ✅ Tests run in CI (GitHub Actions)
- ✅ Tests cover critical user paths
- ✅ <2 min total E2E test runtime

**Tests:**
```typescript
// E2E tests (Playwright)
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('full workflow', async () => {
  const app = await electron.launch({ args: ['main.js'] });
  const window = await app.firstWindow();

  // Wait for split-pane
  await expect(window.locator('.tv-pane')).toBeVisible();
  await expect(window.locator('.chat-pane')).toBeVisible();

  // Capture screenshot
  await window.locator('[data-testid="capture-btn"]').click();
  await expect(window.locator('.screenshot-preview')).toBeVisible();

  // Send to Claude
  await window.locator('[data-testid="send-btn"]').click();
  await expect(window.locator('.streaming-message')).toBeVisible();

  // ... more assertions

  await app.close();
});
```

---

## 5. Agent Assignment Matrix

### Agent Allocation Summary

| Agent Type | Tasks Assigned | % of Total | Typical Task Types |
|------------|----------------|------------|-------------------|
| **Claude Code Direct** | 48 tasks | 71% | Implementation, tests, config files |
| **Bash Agent** | 11 tasks | 16% | Scaffolding, npm commands, builds |
| **Phil (Human)** | 9 tasks | 13% | Design, credentials, UX review, manual testing |
| **Explore Agent** | As needed | 0% | On-demand debugging (not pre-assigned) |

### Why This Distribution?

1. **Claude Code Direct dominates implementation work** because:
   - Excels at multi-file code generation
   - Can maintain context across files
   - Faster than human at boilerplate
   - Writes tests alongside code

2. **Bash Agent handles commands** because:
   - Simple task execution
   - No code understanding needed
   - Faster than Claude for one-liners

3. **Phil handles judgment calls** because:
   - Only human can evaluate UX feel
   - Apple Developer credentials (cannot delegate)
   - Final acceptance of design decisions
   - Manual testing of real trading workflows

4. **Explore Agent used reactively** because:
   - Only needed when something breaks
   - Used to investigate unfamiliar code
   - Not needed for greenfield project (yet)

### Task Assignment by Epic

| Epic | Claude Direct | Bash Agent | Phil | Total |
|------|---------------|------------|------|-------|
| 1. Scaffolding | 5 | 6 | 1 | 12 |
| 2. Core Architecture | 7 | 0 | 1 | 8 |
| 3. Database | 7 | 0 | 0 | 7 |
| 4. Claude API | 7 | 0 | 0 | 7 |
| 5. Screenshot | 5 | 0 | 0 | 5 |
| 6. Chat UI | 15 | 0 | 2 | 17 |
| 7. Auto-Update | 5 | 0 | 0 | 5 |
| 8. Build Pipeline | 4 | 3 | 2 | 9 |
| 9. E2E Testing | 7 | 0 | 0 | 7 |
| **Total** | **48** | **11** | **9** | **68** |

### Parallel Execution Opportunities

**Within Epic 1 (Scaffolding):**
- Can run in parallel:
  - 1.2 (install prod deps) + 1.3 (install dev deps)
  - 1.4 (Tailwind) + 1.6 (TypeScript) + 1.7 (electron-builder) + 1.9 (ESLint)
- Sequential dependency:
  - 1.1 → 1.2/1.3 → 1.4 → 1.5 → 1.8 → 1.12

**Within Epic 3 (Database):**
- Can run in parallel:
  - 3.2 (migrations) + 3.1 (service) → then 3.3 + 3.4 + 3.5 in parallel → 3.6 → 3.7

**Within Epic 6 (Chat UI):**
- Can run in parallel:
  - 6.1 (chat store) + 6.2 (trades store)
  - 6.3 + 6.4 + 6.5 (all UI components)
  - 6.9 (useChat) + 6.10 (useTrades)

**Critical Path (Sequential):**
```
Scaffold (1.1) → Tailwind (1.4) → Main entry (2.1) → Window manager (2.2)
→ TradingView session (2.3) → IPC setup (2.7) → Claude handlers (4.6)
→ Chat store (6.1) → ChatPanel (6.3) → MessageList (6.4) → Streaming (6.6)
→ useChat hook (6.9) → IPC integration (6.12) → E2E tests (9.4)
```

**Estimated critical path time:** 18-22 hours

---

## 6. Testing Strategy

### Testing Pyramid

```
              ┌──────────────┐
              │  E2E Tests   │  7 test files
              │  (Playwright)│  ~15 tests total
              └──────┬───────┘
                     │
            ┌────────▼────────┐
            │ Integration Tests│  ~10 tests
            │    (Vitest)      │
            └────────┬─────────┘
                     │
         ┌───────────▼───────────┐
         │    Unit Tests         │  ~25+ tests
         │    (Vitest)           │
         └───────────────────────┘
```

### Unit Tests (Vitest)

**What to test:**
- All services (database, claude, screenshot)
- All stores (Zustand)
- Utility functions
- IPC handlers (with mocks)
- React hooks (custom)

**Coverage targets:**
- Services: >80%
- Stores: >80%
- Utils: >90%
- Overall: >75%

**Example test files:**
```
test/unit/
├── services/
│   ├── database.test.ts         # ~8 tests
│   ├── claude.test.ts           # ~6 tests
│   └── screenshot.test.ts       # ~4 tests
├── stores/
│   ├── chat.test.ts             # ~5 tests
│   └── trades.test.ts           # ~4 tests
└── hooks/
    ├── useChat.test.ts          # ~5 tests
    └── useTrades.test.ts        # ~3 tests
```

**Running unit tests:**
```bash
npm run test:unit           # Run all unit tests
npm run test:unit:watch     # Watch mode
npm run test:unit:coverage  # With coverage report
```

### Integration Tests (Vitest)

**What to test:**
- IPC handler + service combinations
- Database + IPC round-trip
- Claude API + IPC streaming
- Screenshot capture + storage

**Example test files:**
```
test/integration/
├── ipc-database.test.ts    # Database IPC handlers work end-to-end
├── ipc-claude.test.ts      # Claude streaming works via IPC
└── ipc-screenshot.test.ts  # Screenshot capture via IPC
```

**Running integration tests:**
```bash
npm run test:integration
```

### E2E Tests (Playwright)

**What to test:**
- Critical user paths
- App launches successfully
- TradingView loads
- Chat interaction works
- Screenshot capture → analysis → trade log workflow

**Test files (from Epic 9):**
```
test/e2e/
├── app-launch.spec.ts       # App starts, no crashes
├── tradingview.spec.ts      # TradingView loads, session persists
├── chat.spec.ts             # Send message, streaming, markdown
├── screenshot.spec.ts       # Capture button, preview, send to Claude
├── trade-journal.spec.ts    # CRUD operations
├── full-workflow.spec.ts    # End-to-end user journey
└── auto-update.spec.ts      # Update notification, download
```

**Running E2E tests:**
```bash
npm run test:e2e            # Run all E2E tests
npm run test:e2e:debug      # Debug mode (headed)
```

### Quality Thresholds

**Before merging code:**
- ✅ All tests pass
- ✅ Unit test coverage >80% on services/stores
- ✅ No TypeScript errors
- ✅ No ESLint errors (or justified exceptions)
- ✅ E2E tests pass on CI (Mac + Windows)

**Performance benchmarks:**
- ✅ Unit test suite: <2s runtime
- ✅ Integration tests: <10s runtime
- ✅ E2E tests: <2min runtime
- ✅ Screenshot capture: <50ms latency
- ✅ App startup: <2s on Mac Mini M4

---

## 7. Tools, Dependencies & MCPs

### Development Dependencies (package.json)

```json
{
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.74.0",
    "@electron-toolkit/eslint-config-ts": "^3.0.0",
    "@electron-toolkit/tsconfig": "^2.0.0",
    "@playwright/test": "^1.49.0",
    "@testing-library/react": "^16.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.17.10",
    "@types/react": "^18.2.79",
    "@types/react-dom": "^18.2.25",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "electron": "^40.0.0",
    "electron-builder": "^26.0.0",
    "electron-rebuild": "^3.2.9",
    "electron-vite": "^5.0.0",
    "eslint": "^9.17.0",
    "eslint-plugin-react": "^7.37.2",
    "playwright": "^1.49.0",
    "postcss": "^8.4.49",
    "prettier": "^3.4.2",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.3",
    "vite": "^6.0.3",
    "vitest": "^3.0.5"
  },
  "dependencies": {
    "@radix-ui/react-scroll-area": "^1.2.2",
    "@radix-ui/react-slot": "^1.1.1",
    "better-sqlite3": "^12.1.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "electron-updater": "^6.3.9",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^10.0.0",
    "tailwind-merge": "^2.6.0",
    "zustand": "^5.0.3"
  }
}
```

### Build Tools Required

**On development machine:**
```bash
# Node.js 20.19+ or 22.12+
node --version

# pnpm (recommended) or npm
pnpm --version

# Xcode Command Line Tools (Mac)
xcode-select --install

# Python 3 (for node-gyp, to rebuild better-sqlite3)
python3 --version
```

**For code signing:**
- **macOS:** Apple Developer Program ($99/year), Xcode, Developer ID cert
- **Windows:** EV Code Signing cert ($200-500/year) OR Azure Trusted Signing

### MCP Servers Required

**None required for this project.**

The app is self-contained Electron + Claude API. No additional MCP servers needed.

**Optional (for development):**
- TradingView MCP (if we wanted to programmatically fetch charts from Phil's account)
  - Current approach: User logs into TradingView manually in left pane
  - Screenshot capture works without MCP
  - **Decision: Not needed**

### External APIs

| API | Purpose | Cost | Rate Limits |
|-----|---------|------|-------------|
| **Anthropic Claude API** | AI coaching, screenshot analysis | $3 input / $15 output per 1M tokens (Sonnet 4.5) | 50 RPM, 40k TPM (Tier 1) |
| **TradingView** | Chart display (embedded, no API) | Free (user's own account) | N/A |
| **GitHub Releases** | Auto-update distribution | Free | N/A |

**API key management:**
- Claude API key stored with Electron `safeStorage` (OS keychain)
- Prompt user for key on first launch
- Validate key before saving

---

## 8. Development Timeline

### Session-Based Plan (7 Sessions)

**MVP Target: 4 sessions (12-16 hours)**

| Session | Duration | Epics Covered | Deliverables | Cumulative Hours |
|---------|----------|---------------|--------------|------------------|
| **Session 1** | 2-3h | Epic 1 (Scaffolding) | Project setup, dev server running | 2-3h |
| **Session 2** | 3-4h | Epic 2 (Core Arch) | Split-pane working, IPC connected | 5-7h |
| **Session 3** | 2-3h | Epic 3 (Database) | Trade journal backend complete | 7-10h |
| **Session 4** | 3-4h | Epic 4 (Claude API) | AI chat working with streaming | 10-14h |
| **Session 5** | 2-3h | Epic 5 (Screenshot) + Epic 6 (UI 40%) | Screenshot capture + basic chat UI | 12-17h |
| **Session 6** | 3-4h | Epic 6 (UI 60%) + Epic 7 (Auto-update) | Full chat UI + trade journal UI | 15-21h |
| **Session 7** | 3-5h | Epic 8 (Build) + Epic 9 (E2E) | Production builds, E2E tests | 20-28h |

**MVP After Session 4:**
- ✅ Split-screen with TradingView + Chat
- ✅ AI coaching works (send text, get streaming response)
- ✅ Database stores trades and conversations
- ❌ Screenshot capture (Session 5)
- ❌ Trade journal UI (Session 6)
- ❌ Production build (Session 7)

**Fully Featured After Session 6:**
- ✅ Screenshot capture and analysis
- ✅ Full chat UI with streaming
- ✅ Trade journal with CRUD
- ✅ Auto-update system
- ❌ E2E tests (Session 7)
- ❌ Code signing (Session 7)

### Calendar Timeline

**Assumptions:**
- 2 sessions per week (Mon/Wed or Tue/Thu)
- 2-4 hours per session
- Phil's availability

**Estimated completion:**
- Start: Week 1 (Feb 17-21, 2026)
- MVP Ready: Week 3 (Mar 3-7, 2026) — 4 sessions
- Fully Featured: Week 4 (Mar 10-14, 2026) — 6 sessions
- Production Ready: Week 5 (Mar 17-21, 2026) — 7 sessions

**Parallel work opportunities:**
- Session 1: Can delegate 1.2 + 1.3 (install deps) to Bash while working on 1.4 (Tailwind)
- Session 3: Can run 3.3 + 3.4 + 3.5 (CRUD operations) in parallel
- Session 6: Can work on UI components in parallel (6.3 + 6.4 + 6.5)

---

## 9. Risk Management

### Technical Risks

| Risk | Probability | Impact | Mitigation | Detection |
|------|-------------|--------|------------|-----------|
| **TradingView login doesn't persist** | Medium | Critical | Early validation in Session 2 (Task 2.8), use `persist:tradingview` partition | Test logout/login, close app, reopen |
| **Custom Strat indicators don't render** | Low | Critical | Proven in Electron research (3 projects), but test with Phil's layout | Visual inspection in Session 2 |
| **Screenshot quality degraded** | Low | High | Use `capturePage()` with HiDPI handling, test on Retina displays | Compare captured image to actual chart |
| **Claude API streaming too slow** | Low | Medium | Use prompt caching, optimize message size, Sonnet 4.5 (fast model) | Measure latency in Session 4 tests |
| **better-sqlite3 rebuild fails** | Medium | Medium | Use `electron-rebuild`, include in setup docs, test on clean machine | Run `npm run dev` in Session 1 |
| **Memory leak in long-running app** | Low | Medium | Proper event listener cleanup, periodic GC, test with DevTools | Monitor memory in long-running E2E tests |

### Process Risks

| Risk | Probability | Impact | Mitigation | Detection |
|------|-------------|--------|------------|-----------|
| **Scope creep** | High | Medium | Strict MVP definition, defer features to post-MVP | Review backlog weekly |
| **Agent-generated code bugs** | Medium | Medium | Comprehensive test coverage, manual testing by Phil | Unit tests catch most |
| **Phil unavailable for credentials** | Low | High | Document credential setup process, do early in Session 7 | Plan ahead for Session 7 |
| **CI/CD pipeline failures** | Medium | Low | Test locally first, iterate on CI config, use caching | GitHub Actions logs |

### Early Validation Tasks (Do First!)

**Session 2 — After Epic 2 Complete:**

1. **TradingView Session Persistence Test**
   ```
   [ ] Log into TradingView in left pane
   [ ] Close app completely
   [ ] Reopen app
   [ ] Verify still logged in (no re-login prompt)
   [ ] If FAILS: Investigate persist:tradingview partition, cookies
   ```

2. **Custom Strat Indicators Test**
   ```
   [ ] Load Phil's chart layout (miWzIESY)
   [ ] Verify TheStrat Teach V2 indicator loads
   [ ] Verify candles are numbered (1s, 2s, 3s)
   [ ] Verify FTFC levels are marked
   [ ] If FAILS: Check if indicator is public or private
   ```

3. **Screenshot Capture Quality Test**
   ```
   [ ] Capture TradingView pane
   [ ] Save to file, open in Preview
   [ ] Zoom to 200%, verify chart details visible
   [ ] Check candle numbering readable
   [ ] If FAILS: Adjust capturePage scaleFactor
   ```

4. **Claude API Vision Test**
   ```
   [ ] Send screenshot to Claude
   [ ] Ask "What candle pattern do you see?"
   [ ] Verify Claude can read candle numbers
   [ ] Verify Claude can identify patterns
   [ ] If FAILS: Check image quality, base64 encoding
   ```

**If any validation fails, STOP and fix before continuing.**

---

## 10. Success Criteria

### MVP Success Criteria (After Session 4)

**Functional:**
- ✅ App launches with split-screen layout
- ✅ TradingView loads in left pane (user can log in)
- ✅ AI chat works in right pane (send message, get streaming response)
- ✅ Database stores trades and conversations
- ✅ No crashes or freezes during 30min usage

**Non-Functional:**
- ✅ <2s app startup time
- ✅ <100ms IPC round-trip latency
- ✅ Streaming response feels real-time (no lag)
- ✅ TypeScript compiles with no errors
- ✅ ESLint passes with no errors

### Full Feature Success Criteria (After Session 6)

**Functional:**
- ✅ All MVP criteria met
- ✅ Screenshot capture works (<50ms capture)
- ✅ Claude analyzes screenshots (vision API)
- ✅ Trade journal UI works (CRUD operations)
- ✅ Auto-update checks on launch
- ✅ Conversation history persists across sessions
- ✅ Window size/position persists across sessions

**Non-Functional:**
- ✅ Unit test coverage >80% on services
- ✅ All integration tests pass
- ✅ Memory usage <400 MB after 1 hour
- ✅ No memory leaks (DevTools heap snapshot)

### Production Ready Success Criteria (After Session 7)

**Functional:**
- ✅ All full feature criteria met
- ✅ DMG installs on Mac without Gatekeeper warning
- ✅ EXE installs on Windows without SmartScreen warning
- ✅ Auto-update downloads and installs successfully
- ✅ All E2E tests pass on CI (Mac + Windows)

**Non-Functional:**
- ✅ E2E test coverage on critical paths
- ✅ Code signing works (Mac and Windows)
- ✅ GitHub Actions CI/CD pipeline fully automated
- ✅ Release notes generated automatically
- ✅ Error tracking/logging implemented

### User Acceptance Criteria (Phil's Checklist)

**Trading Workflow:**
```
[ ] I can see my TradingView chart with Strat indicators
[ ] I stay logged in to TradingView between sessions
[ ] I can capture the chart with one click
[ ] I can ask Claude to analyze the chart
[ ] Claude gives me Strat-specific feedback
[ ] I can log a trade with the screenshot attached
[ ] I can review my trade journal anytime
```

**Quality of Life:**
```
[ ] The app feels fast and responsive
[ ] Chat streaming doesn't lag or stutter
[ ] I can resize the panes to my preference
[ ] Window size persists when I reopen
[ ] The UI is clean and not distracting
[ ] No crashes during a full trading session (6+ hours)
```

**Trust & Reliability:**
```
[ ] My TradingView credentials are secure
[ ] My Claude API key is stored safely
[ ] My trade journal data is backed up
[ ] Auto-updates don't interrupt my trading
[ ] I can roll back to a previous version if needed
```

---

## Appendix A: Quick Reference Commands

### Development Commands

```bash
# Setup
npm install                      # Install dependencies
npm run rebuild                  # Rebuild native modules (better-sqlite3)

# Development
npm run dev                      # Start dev server with HMR
npm run dev:debug                # Start with DevTools open

# Testing
npm run test:unit                # Run unit tests
npm run test:unit:watch          # Watch mode
npm run test:unit:coverage       # With coverage report
npm run test:integration         # Run integration tests
npm run test:e2e                 # Run E2E tests
npm run test:e2e:debug           # E2E in headed mode
npm run test                     # Run all tests

# Code Quality
npm run typecheck                # TypeScript type checking
npm run lint                     # ESLint
npm run lint:fix                 # ESLint with auto-fix
npm run format                   # Prettier format
npm run format:check             # Prettier check only

# Build
npm run build                    # Build for current platform
npm run build:mac                # Build DMG for macOS
npm run build:win                # Build NSIS for Windows
npm run build:linux              # Build AppImage for Linux
npm run build:all                # Build for all platforms

# Distribution
npm run dist                     # Build installers
npm run dist:dir                 # Build unpacked directory
npm run release                  # Tag and trigger release workflow
```

### Debugging

**Open DevTools:**
- Chat renderer: `Cmd+Opt+I` (Mac) or `Ctrl+Shift+I` (Windows)
- Main process: `--inspect` flag (see electron-vite docs)

**Check database:**
```bash
sqlite3 ~/Library/Application\ Support/strat-monitor/trades.db
.tables
.schema trades
SELECT * FROM trades;
```

**View logs:**
```bash
# macOS
tail -f ~/Library/Logs/strat-monitor/main.log

# Windows
type %USERPROFILE%\AppData\Roaming\strat-monitor\logs\main.log
```

---

## Appendix B: Architecture Reference Files

**Full technical details in:**
- `/Users/phil/Trading/ELECTRON-ARCHITECTURE-RESEARCH.md` (2,304 lines)
  - Complete code examples for all patterns
  - Security configuration details
  - Testing strategy breakdown
  - Build pipeline setup
  - 26 gotchas and pitfalls

- `/Users/phil/Trading/AGENT-ORCHESTRATION-PLAN.md` (1,250+ lines)
  - Detailed task breakdown with dependencies
  - Agent assignment rationale
  - Parallel execution opportunities
  - Session planning templates

- `/Users/phil/Trading/ELECTRON-VS-TAURI-COMPARISON.md` (1,011 lines)
  - Full Electron vs Tauri comparison
  - TradingView embedding validation
  - Real-world examples
  - Risk assessment

---

## Sign-Off

**Document Status:** ✅ Ready for Implementation

**Next Steps:**
1. Phil reviews PRD (this document)
2. Phil approves plan
3. Start Session 1: Project Scaffolding
4. Follow epic-by-epic execution

**Questions or Concerns:**
- Any technical uncertainty? → Review `ELECTRON-ARCHITECTURE-RESEARCH.md`
- Any task allocation concerns? → Review `AGENT-ORCHESTRATION-PLAN.md`
- Need to revisit Electron choice? → Review `ELECTRON-VS-TAURI-COMPARISON.md`

**Approval:**
- [ ] Phil approves scope
- [ ] Phil approves timeline (7 sessions, 20-28 hours)
- [ ] Phil approves tech stack
- [ ] Phil commits to providing credentials (Apple Developer, code signing)

**Ready to build when approved.**

---

*PRD compiled from extensive research using Opus + Perplexity agents.*
*Total research time: ~3 hours across 2 agents + 5 Perplexity queries.*
*This document represents the complete blueprint for building Strat Monitor.*
