# Agent Orchestration Plan: Strat Monitor Electron App

> Build strategy for delegating development tasks across human (Phil), Claude Code direct, and specialised agent types.
>
> **Created:** 2026-02-13 | **Architecture Reference:** `ELECTRON-ARCHITECTURE-RESEARCH.md`

---

## Table of Contents

1. [Agent Capabilities and When to Use Each](#1-agent-capabilities-and-when-to-use-each)
2. [Task Breakdown Structure](#2-task-breakdown-structure)
3. [Agent Assignment Matrix](#3-agent-assignment-matrix)
4. [Testing Strategy](#4-testing-strategy)
5. [Parallel Execution Plan](#5-parallel-execution-plan)
6. [Dependency Graph and Critical Path](#6-dependency-graph-and-critical-path)
7. [Risk Mitigation](#7-risk-mitigation)
8. [Quality Gates](#8-quality-gates)
9. [Session Planning Template](#9-session-planning-template)

---

## 1. Agent Capabilities and When to Use Each

### Agent Types Available

| Agent | Strengths | Weaknesses | Best For |
|-------|-----------|------------|----------|
| **Phil (Human)** | Design decisions, UX judgment, testing feel, business logic, Apple Developer account access, manual testing | Speed on repetitive code, boilerplate generation | Architecture decisions, UX review, manual E2E testing, code signing credentials, final approval |
| **Claude Code Direct** | Multi-file code generation, refactoring, debugging, understanding context across files, code review | Cannot run long processes, no persistent state between sessions, cannot interact with running UI | Writing implementation code, debugging, code review, documentation, test writing |
| **Bash Agent** | Command execution, git operations, npm scripts, file manipulation, build commands | No code understanding, just executes | Project scaffolding, npm installs, build commands, git operations, running test suites |
| **Explore Agent** | Codebase navigation, finding files, understanding existing code structure, searching patterns | Cannot modify files, read-only | Investigating issues, understanding dependencies, finding patterns in existing code, researching node_modules |

### Decision Framework

```
Is it a one-off command or script?
  YES → Bash Agent
  NO  ↓

Does it require understanding existing code to modify it?
  YES → Does it require exploring unfamiliar code first?
    YES → Explore Agent (find) → Claude Code Direct (implement)
    NO  → Claude Code Direct
  NO  ↓

Does it require human judgment (UX, design, business logic)?
  YES → Phil (with Claude Code Direct supporting)
  NO  → Claude Code Direct
```

---

## 2. Task Breakdown Structure

### Epic 1: Project Scaffolding and Configuration
**Priority:** P0 (must do first) | **Estimated effort:** 1 session (2-3 hours)

| ID | Task | Subtasks | Complexity | Dependencies | Owner |
|----|------|----------|------------|--------------|-------|
| 1.1 | Scaffold electron-vite project | `npm create @quick-start/electron@latest` | 1 | None | Bash Agent |
| 1.2 | Install production dependencies | `npm install @anthropic-ai/sdk better-sqlite3 ...` | 1 | 1.1 | Bash Agent |
| 1.3 | Install dev dependencies | `npm install -D vitest @playwright/test ...` | 1 | 1.1 | Bash Agent |
| 1.4 | Configure Tailwind CSS v4 | Install plugin, update `electron.vite.config.ts`, create CSS entry | 2 | 1.1 | Claude Code Direct |
| 1.5 | Initialise shadcn/ui | `npx shadcn@latest init`, install base components | 2 | 1.4 | Bash Agent + Claude Code Direct |
| 1.6 | Configure TypeScript paths | Update `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json` with aliases | 2 | 1.1 | Claude Code Direct |
| 1.7 | Configure electron-builder | Create `electron-builder.yml` with mac/win/linux targets | 2 | 1.1 | Claude Code Direct |
| 1.8 | Rebuild better-sqlite3 for Electron | `npx electron-rebuild -f -w better-sqlite3` | 1 | 1.2 | Bash Agent |
| 1.9 | Set up ESLint + Prettier | Flat config, TypeScript rules, React hooks plugin | 2 | 1.1 | Claude Code Direct |
| 1.10 | Create project structure | Make directories matching architecture spec | 1 | 1.1 | Bash Agent |
| 1.11 | Initialise git repository | `git init`, `.gitignore`, initial commit | 1 | 1.10 | Bash Agent |
| 1.12 | Verify dev server launches | `npm run dev` — confirm HMR works | 1 | All 1.x | Phil + Bash Agent |

**Quality Gate:** `npm run dev` launches successfully, TypeScript compiles cleanly, linter passes.

---

### Epic 2: Core Architecture (Main Process)
**Priority:** P0 | **Estimated effort:** 2 sessions (4-6 hours)

| ID | Task | Subtasks | Complexity | Dependencies | Owner |
|----|------|----------|------------|--------------|-------|
| 2.1 | Main process entry point | `src/main/index.ts` — app lifecycle, security handlers | 3 | Epic 1 | Claude Code Direct |
| 2.2 | Window manager with WebContentsView | `src/main/window.ts` — BaseWindow, split-pane layout, resize handling | 4 | 2.1 | Claude Code Direct |
| 2.3 | TradingView session setup | Session isolation, X-Frame-Options stripping, persistent cookies | 3 | 2.2 | Claude Code Direct |
| 2.4 | Chat renderer preload script | `src/preload/index.ts` — typed contextBridge API | 3 | 2.1 | Claude Code Direct |
| 2.5 | TradingView preload script (minimal) | `src/preload/tradingview.ts` — empty/minimal | 1 | 2.1 | Claude Code Direct |
| 2.6 | Shared IPC types | `src/shared/ipc-types.ts`, `src/shared/models.ts` | 3 | None | Claude Code Direct |
| 2.7 | IPC handler registration system | `src/main/ipc/index.ts` — central registration with sender validation | 3 | 2.4, 2.6 | Claude Code Direct |
| 2.8 | Verify split-pane renders | TradingView loads on left, React app loads on right | 2 | 2.2, 2.3 | Phil (manual testing) |

**Quality Gate:** App launches with TradingView on left, React placeholder on right. IPC round-trip works (renderer calls main, gets response). TypeScript compiles. No security warnings in console.

---

### Epic 3: Database Layer
**Priority:** P0 | **Estimated effort:** 1 session (2-3 hours)

| ID | Task | Subtasks | Complexity | Dependencies | Owner |
|----|------|----------|------------|--------------|-------|
| 3.1 | Database service | `src/main/services/database.ts` — init, migrations, WAL mode | 3 | Epic 1 | Claude Code Direct |
| 3.2 | SQL migrations | `resources/migrations/001_init.sql`, `002_add_screenshots.sql` | 2 | None | Claude Code Direct |
| 3.3 | Trade CRUD operations | Insert, update, get, list trades | 2 | 3.1, 3.2 | Claude Code Direct |
| 3.4 | Conversation/message operations | Save messages, get history, list conversations | 2 | 3.1, 3.2 | Claude Code Direct |
| 3.5 | Database IPC handlers | `src/main/ipc/database.ts` — expose DB ops via IPC | 2 | 3.3, 3.4, 2.7 | Claude Code Direct |
| 3.6 | Database unit tests | In-memory SQLite tests for all CRUD operations | 3 | 3.3, 3.4 | Claude Code Direct |
| 3.7 | Migration runner tests | Test migration ordering, idempotency | 2 | 3.1 | Claude Code Direct |

**Quality Gate:** All database unit tests pass. Migrations run correctly on fresh DB. Trades and messages can be created, read, updated via IPC.

---

### Epic 4: Claude API Integration
**Priority:** P0 | **Estimated effort:** 1-2 sessions (3-5 hours)

| ID | Task | Subtasks | Complexity | Dependencies | Owner |
|----|------|----------|------------|--------------|-------|
| 4.1 | Secure API key storage | `src/main/services/secure-store.ts` — safeStorage wrapper | 2 | Epic 1 | Claude Code Direct |
| 4.2 | Claude API client | `src/main/services/claude.ts` — streaming, vision, prompt caching | 4 | 4.1 | Claude Code Direct |
| 4.3 | System prompt design | Strat trading coach persona, chart analysis instructions | 3 | None | Phil + Claude Code Direct |
| 4.4 | Chat IPC handlers | `src/main/ipc/chat.ts` — send message, stream response, include screenshot | 4 | 4.2, 2.7 | Claude Code Direct |
| 4.5 | Settings IPC handlers | `src/main/ipc/settings.ts` — API key management, split ratio | 2 | 4.1, 2.7 | Claude Code Direct |
| 4.6 | Claude API mock for testing | Mock streaming responses, error cases | 3 | 4.2 | Claude Code Direct |
| 4.7 | Claude API integration test | Real API call with test key (manual) | 2 | 4.2, 4.4 | Phil |

**Quality Gate:** Streaming response arrives in renderer. Screenshot can be sent with message. API key stored/retrieved securely. Mock tests pass. Prompt caching verified (check response headers for cache hit).

---

### Epic 5: Screenshot Capture System
**Priority:** P1 | **Estimated effort:** 1 session (2-3 hours)

| ID | Task | Subtasks | Complexity | Dependencies | Owner |
|----|------|----------|------------|--------------|-------|
| 5.1 | Screenshot service | `src/main/services/screenshot.ts` — capture, optimise, save | 3 | 2.2 | Claude Code Direct |
| 5.2 | Screenshot IPC handler | `src/main/ipc/screenshot.ts` — capture trigger | 2 | 5.1, 2.7 | Claude Code Direct |
| 5.3 | Image optimisation | Resize for Claude API (max 1568px), PNG conversion | 2 | 5.1 | Claude Code Direct |
| 5.4 | Screenshot storage | Save to userData/screenshots, link to trades/messages | 2 | 5.1, 3.1 | Claude Code Direct |
| 5.5 | Screenshot capture test | Verify capture works on TradingView view | 2 | 5.1, 2.8 | Phil (manual) |

**Quality Gate:** Screenshot captures TradingView content correctly. Image is properly sized for Claude API. Screenshot saves to filesystem and links to database.

---

### Epic 6: Chat UI (React Frontend)
**Priority:** P0 | **Estimated effort:** 2-3 sessions (6-9 hours)

| ID | Task | Subtasks | Complexity | Dependencies | Owner |
|----|------|----------|------------|--------------|-------|
| 6.1 | App shell and routing | `App.tsx`, layout structure, dark theme | 2 | Epic 1 (Tailwind) | Claude Code Direct |
| 6.2 | Chat Zustand store | `stores/chat-store.ts` — messages, streaming state, conversation management | 3 | 2.6 | Claude Code Direct |
| 6.3 | Settings Zustand store | `stores/settings-store.ts` — API key status, split ratio, preferences | 2 | 2.6 | Claude Code Direct |
| 6.4 | ChatPanel component | Container for message list + input bar | 3 | 6.2 | Claude Code Direct |
| 6.5 | MessageList component | Scrollable message list with auto-scroll | 3 | 6.4 | Claude Code Direct |
| 6.6 | MessageBubble component | Individual message rendering, user vs assistant styling | 2 | 6.5 | Claude Code Direct |
| 6.7 | StreamingMessage component | Real-time token rendering with cursor | 3 | 6.6 | Claude Code Direct |
| 6.8 | InputBar component | Text input, send button, screenshot toggle, keyboard shortcuts | 3 | 6.4 | Claude Code Direct |
| 6.9 | Markdown rendering | `react-markdown` + `remark-gfm` for assistant messages | 2 | 6.6 | Claude Code Direct |
| 6.10 | TitleBar component | App title, connection status, settings gear | 2 | 6.1 | Claude Code Direct |
| 6.11 | StatusBar component | Streaming indicator, token count, version | 2 | 6.1, 6.2 | Claude Code Direct |
| 6.12 | Settings panel/modal | API key input, split ratio slider, theme toggle | 3 | 6.3 | Claude Code Direct |
| 6.13 | useChat hook | `hooks/use-chat.ts` — send/receive messages via IPC, manage streaming | 3 | 6.2, 2.4 | Claude Code Direct |
| 6.14 | useScreenshot hook | `hooks/use-screenshot.ts` — trigger capture, preview | 2 | 5.2 | Claude Code Direct |
| 6.15 | useSettings hook | `hooks/use-settings.ts` — read/write settings via IPC | 2 | 6.3, 4.5 | Claude Code Direct |
| 6.16 | Component tests | React Testing Library tests for all components | 3 | 6.4-6.12 | Claude Code Direct |
| 6.17 | UX review and polish | Phil reviews look/feel, identifies improvements | 2 | 6.4-6.12 | Phil |

**Quality Gate:** Chat sends message, receives streaming response, renders markdown. Screenshot capture button works. Settings persist. All component tests pass. Phil approves UX.

---

### Epic 7: Auto-Update System
**Priority:** P2 | **Estimated effort:** 1 session (2-3 hours)

| ID | Task | Subtasks | Complexity | Dependencies | Owner |
|----|------|----------|------------|--------------|-------|
| 7.1 | Updater service | `src/main/services/updater.ts` — check, download, install | 3 | Epic 1 | Claude Code Direct |
| 7.2 | Updater IPC handlers | `src/main/ipc/updater.ts` — expose update operations | 2 | 7.1, 2.7 | Claude Code Direct |
| 7.3 | Update notification UI | Banner/modal showing available updates, download progress | 2 | 7.2, 6.1 | Claude Code Direct |
| 7.4 | electron-builder publish config | GitHub Releases integration | 2 | 1.7 | Claude Code Direct |
| 7.5 | Test update flow | Publish test release, verify update mechanism | 3 | 7.1-7.4, Epic 8 | Phil + Bash Agent |

**Quality Gate:** App checks for updates on launch. Update banner appears when update available. Download progress shows. Install-on-quit works.

---

### Epic 8: Build and Distribution Pipeline
**Priority:** P1 (needed before first real release, but not for development) | **Estimated effort:** 2 sessions (4-6 hours)

| ID | Task | Subtasks | Complexity | Dependencies | Owner |
|----|------|----------|------------|--------------|-------|
| 8.1 | GitHub repository setup | Create repo, push initial code, branch protection | 1 | 1.11 | Phil + Bash Agent |
| 8.2 | CI workflow (build.yml) | Lint, typecheck, unit tests, E2E tests on push/PR | 3 | Epics 1-6 | Claude Code Direct |
| 8.3 | Release workflow (release.yml) | Build, sign, notarise, publish on tag push | 4 | 8.2 | Claude Code Direct |
| 8.4 | macOS code signing setup | Apple Developer certificate, keychain import in CI | 4 | 8.3 | Phil (credentials) + Claude Code Direct (workflow) |
| 8.5 | GitHub Secrets configuration | Certificate, passwords, Apple ID, team ID | 2 | 8.4 | Phil |
| 8.6 | macOS entitlements file | `build/entitlements.mac.plist` | 1 | None | Claude Code Direct |
| 8.7 | App icons | Generate .icns, .ico, .png from source artwork | 2 | None | Phil (design) + Bash Agent (conversion) |
| 8.8 | First test build | Build DMG locally, verify it launches | 2 | 8.4, 8.6, 8.7 | Phil + Bash Agent |
| 8.9 | First CI/CD release | Tag v0.1.0, verify GitHub Actions builds and publishes | 3 | 8.1-8.8 | Phil + Bash Agent |

**Quality Gate:** `npm run build:mac` produces a working DMG. CI pipeline passes on all platforms. Release workflow creates GitHub Release with attached binaries.

---

### Epic 9: End-to-End Testing
**Priority:** P1 | **Estimated effort:** 1-2 sessions (3-5 hours)

| ID | Task | Subtasks | Complexity | Dependencies | Owner |
|----|------|----------|------------|--------------|-------|
| 9.1 | Playwright configuration | `playwright.config.ts`, Electron launch setup | 2 | Epic 1 | Claude Code Direct |
| 9.2 | App launch tests | Window creation, title, correct layout | 2 | Epic 2 | Claude Code Direct |
| 9.3 | Chat flow tests | Type message, send, receive response (mocked API) | 3 | Epic 6 | Claude Code Direct |
| 9.4 | Settings flow tests | Enter API key, change split ratio, verify persistence | 2 | Epic 6 | Claude Code Direct |
| 9.5 | Screenshot capture test | Trigger screenshot, verify image returned | 3 | Epic 5 | Claude Code Direct |
| 9.6 | Database persistence test | Create trade, restart app, verify data persists | 3 | Epic 3 | Claude Code Direct |
| 9.7 | Visual regression baseline | Capture screenshots of key screens for comparison | 2 | 9.2-9.6 | Claude Code Direct |

**Quality Gate:** All E2E tests pass locally and in CI. Visual regression baseline established.

---

## 3. Agent Assignment Matrix

### Summary by Agent

| Agent | Tasks Count | Focus Areas |
|-------|-------------|-------------|
| **Phil (Human)** | 12 | Decisions, credentials, manual testing, UX review, design |
| **Claude Code Direct** | 48 | All implementation code, tests, configurations, documentation |
| **Bash Agent** | 11 | Scaffolding, installs, builds, git operations |
| **Explore Agent** | On-demand | Debugging, investigating node_modules, researching patterns |

### Detailed Assignment Rationale

#### Tasks Requiring Phil (Human)

| Task | Why Human? |
|------|-----------|
| 2.8 Split-pane visual verification | Requires seeing the actual UI, judging if TradingView loads correctly |
| 4.3 System prompt design | Business domain expertise — Phil knows The Strat methodology |
| 4.7 Claude API integration test | Requires real API key, manual verification of response quality |
| 5.5 Screenshot capture test | Visual verification that captures are correct |
| 6.17 UX review | Subjective judgment on look/feel, usability |
| 7.5 Test update flow | Requires publishing a test release, verifying OS-level update dialogs |
| 8.1 GitHub repository setup | Account credentials, repository settings, branch protection rules |
| 8.4 macOS code signing | Apple Developer account access, certificate generation |
| 8.5 GitHub Secrets | Entering credentials in GitHub settings UI |
| 8.7 App icons (design) | Aesthetic judgment, brand identity |
| 8.8 First test build | Verify DMG works on real macOS |
| 8.9 First CI/CD release | Verify end-to-end release pipeline |

#### Tasks for Claude Code Direct

All implementation tasks (writing code, tests, configurations) go to Claude Code Direct because:
- Full codebase context awareness across multiple files
- Can generate type-safe code matching shared interfaces
- Can maintain consistency across main/preload/renderer boundaries
- Can write comprehensive tests alongside implementation
- Understands the architecture from `ELECTRON-ARCHITECTURE-RESEARCH.md`

#### Tasks for Bash Agent

| Task | Why Bash? |
|------|-----------|
| 1.1 Scaffold project | Single npm command, no code understanding needed |
| 1.2-1.3 Install deps | npm install commands |
| 1.5 shadcn init | Interactive CLI tool |
| 1.8 Rebuild native module | npx command |
| 1.10 Create directories | mkdir commands |
| 1.11 Git init | git commands |
| 1.12 Verify dev server | npm run dev |
| 8.7 Icon conversion (execution) | ImageMagick/sips commands |
| 8.8-8.9 Build/release | npm run build, git tag, git push |

#### Explore Agent Usage

The Explore Agent is used on-demand, not assigned to specific tasks upfront. Use it when:
- A build error references an unfamiliar dependency in `node_modules`
- You need to understand how electron-vite scaffolds its template
- Debugging why a native module fails to load
- Investigating shadcn/ui component source for customisation
- Understanding Electron API behaviour from the installed version's types

---

## 4. Testing Strategy

### Testing Pyramid

```
         ╱╲
        ╱  ╲        E2E Tests (Playwright)
       ╱ 7  ╲       - Full app flows
      ╱──────╲      - 7 test files
     ╱        ╲
    ╱  Integr.  ╲   Integration Tests (Vitest)
   ╱    ~10     ╲   - IPC handler + service combos
  ╱──────────────╲  - Database operations
 ╱                ╲
╱   Unit Tests     ╲ Unit Tests (Vitest + RTL)
╱      ~25+         ╲ - Services, stores, components
╱────────────────────╲ - Fast, isolated, mockable
```

### Test File Locations

```
src/
  main/
    services/__tests__/
      database.test.ts       # In-memory SQLite CRUD
      claude.test.ts          # Mocked SDK streaming
      screenshot.test.ts      # Mocked NativeImage
      secure-store.test.ts    # Mocked safeStorage
      updater.test.ts         # Mocked autoUpdater
    ipc/__tests__/
      chat.test.ts            # Handler + service integration
      database.test.ts        # Handler + DB integration
      settings.test.ts        # Handler + secure-store integration
  renderer/
    src/
      components/__tests__/
        ChatPanel.test.tsx     # Component rendering
        MessageBubble.test.tsx # Markdown rendering
        InputBar.test.tsx      # User interaction
        StreamingMessage.test.tsx # Streaming display
      stores/__tests__/
        chat-store.test.ts     # State transitions
        settings-store.test.ts # Persistence
      hooks/__tests__/
        use-chat.test.ts       # IPC integration
  shared/__tests__/
    ipc-types.test.ts          # Type assertion tests
e2e/
  app-launch.spec.ts           # Window creation
  chat-flow.spec.ts            # Send/receive message
  settings.spec.ts             # API key + preferences
  screenshot.spec.ts           # Capture flow
  database.spec.ts             # Persistence
  visual-regression.spec.ts    # Screenshot comparison
  update-check.spec.ts         # Update notification
```

### Testing by Component

#### Database (Epic 3)

| Test Type | What | How |
|-----------|------|-----|
| Unit | CRUD operations | In-memory SQLite (`:memory:`), no Electron deps |
| Unit | Migration runner | Temp directory with test migration files |
| Integration | IPC → DB round-trip | Mock IPC event, call handler, verify DB state |
| E2E | Persistence across restart | Create trade, close app, relaunch, verify trade exists |

#### Claude API (Epic 4)

| Test Type | What | How |
|-----------|------|-----|
| Unit | Stream processing | Mock `@anthropic-ai/sdk` with `vi.mock`, yield test chunks |
| Unit | Error handling | Mock API errors (rate limit, auth, network) |
| Unit | Prompt caching | Verify `cache_control` included in request |
| Integration | IPC → Claude → Stream | Mock SDK, verify IPC stream events emitted |
| Manual | Real API call | Phil tests with real key, verifies response quality |

#### Screenshot (Epic 5)

| Test Type | What | How |
|-----------|------|-----|
| Unit | Image optimisation | Mock `NativeImage`, verify resize logic for >1568px |
| Unit | File save | Mock `fs`, verify path construction |
| Integration | IPC trigger → capture | Mock `webContents.capturePage`, verify base64 returned |
| Manual | Real capture | Phil visually verifies screenshot matches TradingView |

#### Chat UI (Epic 6)

| Test Type | What | How |
|-----------|------|-----|
| Unit (RTL) | MessageBubble | Render with markdown content, verify HTML output |
| Unit (RTL) | InputBar | Type text, click send, verify callback fired |
| Unit (RTL) | StreamingMessage | Feed tokens, verify incremental rendering |
| Unit (RTL) | ChatPanel | Verify auto-scroll on new messages |
| Unit | Zustand stores | Test state transitions (add message, start streaming, error) |
| E2E | Full chat flow | Type message, mock API response, verify rendered |

### Acceptance Criteria per Test Level

| Level | Criteria |
|-------|----------|
| **Unit** | All pass, >80% coverage on services, <2 second total runtime |
| **Integration** | All pass, IPC round-trips verified, error paths covered |
| **Component** | All pass, accessibility attributes present, responsive rendering |
| **E2E** | All pass on macOS (primary), pass on Linux CI runner |
| **Manual** | Phil signs off on UX, screenshot quality, streaming smoothness |

---

## 5. Parallel Execution Plan

### What Can Run in Parallel

Within a single Claude Code session, tasks can only truly run in parallel when they touch different files with no shared interfaces. In practice, "parallel" means tasks that can be done in the **same session** without waiting for external input.

#### Session 1: Foundation (2-3 hours)

```
                    ┌──── 1.1 Scaffold ────┐
                    │                      │
                    ├──── 1.2 Prod deps ───┤ Sequential
                    │                      │ (npm install
                    ├──── 1.3 Dev deps ────┤  order matters)
                    │                      │
                    └──── 1.8 Rebuild ─────┘
                              │
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
         1.4 Tailwind    1.6 TS paths    1.9 ESLint    ← PARALLEL (different files)
              │               │               │
              ↓               ↓               │
         1.5 shadcn     1.7 e-builder         │
              │               │               │
              └───────┬───────┘               │
                      ↓                       │
                 1.10 Structure ──────────────┘
                      ↓
                 1.11 Git init
                      ↓
                 1.12 Verify ← Phil confirms
```

#### Session 2: Core Architecture (3-4 hours)

```
         2.6 Shared IPC types (no dependencies)
              │
    ┌─────────┼──────────┐
    ↓         ↓          ↓
  2.1 Main   2.4 Preload  2.5 TV Preload     ← PARALLEL
  entry      (chat)       (minimal)
    │         │
    ↓         │
  2.2 Window  │
  manager     │
    │         │
    ├─────────┘
    ↓
  2.3 TV session
    │
    ↓
  2.7 IPC registration
    │
    ↓
  2.8 Visual verify ← Phil confirms
```

#### Session 3: Data and API (3-4 hours)

```
  ┌──── 3.1-3.4 Database ────┐     ┌──── 4.1 Secure store ────┐
  │  (all sequential)         │     │                           │
  │  3.1 → 3.2 → 3.3 → 3.4  │     │  4.2 Claude client        │
  │                           │     │                           │
  │  3.6 DB unit tests        │     │  4.3 System prompt (Phil) │
  │  3.7 Migration tests      │     │                           │
  └───────────┬───────────────┘     └─────────┬─────────────────┘
              │                               │
              └───────────┬───────────────────┘
                          ↓
                    3.5 DB IPC handlers
                    4.4 Chat IPC handlers
                    4.5 Settings IPC handlers
                          │
                          ↓
                    4.6 Claude mock tests
                    4.7 Manual API test ← Phil
```

#### Session 4: Frontend (4-6 hours — largest session)

```
  6.1 App shell ──→ 6.2 Chat store ──→ 6.3 Settings store
                         │
              ┌──────────┼──────────────┐
              ↓          ↓              ↓
         6.4 ChatPanel  6.10 TitleBar  6.12 Settings    ← PARALLEL
              │          6.11 StatusBar
              ↓
  ┌───────────┼───────────┬───────────┐
  ↓           ↓           ↓           ↓
6.5 MsgList  6.8 Input   6.9 Markdown  ← PARALLEL
  ↓
6.6 MsgBubble
  ↓
6.7 Streaming
              │
              ↓
         6.13-6.15 Hooks (sequential — each depends on stores + IPC)
              │
              ↓
         6.16 Component tests
              │
              ↓
         6.17 UX review ← Phil
```

#### Session 5: Integration and Polish (3-4 hours)

```
  5.1-5.4 Screenshot system
       │
       ↓
  5.5 Manual capture test ← Phil
       │
  ┌────┴────────────────────┐
  ↓                         ↓
  9.1-9.7 E2E tests    7.1-7.4 Auto-updater    ← PARALLEL
       │                    │
       └────────┬───────────┘
                ↓
           8.1-8.9 Build pipeline
                │
                ↓
           7.5 Update flow test ← Phil
```

### Critical Path

The critical path (longest sequential chain):

```
1.1 → 1.2 → 1.4 → 2.1 → 2.2 → 2.3 → 2.7 → 4.4 → 6.2 → 6.4 → 6.5 → 6.7 → 6.13 → 9.3
```

**Estimated critical path duration:** 5 sessions (15-20 hours of active work)

### Bottlenecks

| Bottleneck | Impact | Mitigation |
|------------|--------|------------|
| Phil availability for manual testing | Blocks 2.8, 5.5, 6.17, 8.4-8.9 | Batch manual testing; Phil reviews at end of each session |
| shadcn/ui init (interactive CLI) | Blocks UI component work | Do early in Session 1 |
| better-sqlite3 rebuild | Blocks database work | Do immediately after npm install |
| Apple Developer account | Blocks code signing and notarisation | Phil sets up account early, separate from dev work |
| System prompt iteration | Blocks optimal AI responses | Start with v1 prompt, iterate based on testing |

---

## 6. Dependency Graph and Critical Path

### Epic Dependencies

```
Epic 1 (Scaffolding)
  ├──→ Epic 2 (Architecture)
  │      ├──→ Epic 3 (Database)
  │      │      └──→ Epic 6 (Chat UI) ←── Epic 4 (Claude API)
  │      ├──→ Epic 4 (Claude API)
  │      ├──→ Epic 5 (Screenshot)
  │      └──→ Epic 6 (Chat UI)
  │             └──→ Epic 9 (E2E Tests)
  │                    └──→ Epic 8 (Build Pipeline)
  └──→ Epic 7 (Auto-Update) ← can start after Epic 1
         └──→ Epic 8 (Build Pipeline)
```

### Minimum Viable Product (MVP) Path

For the fastest path to a working app (Phil can start using it):

```
Epic 1 → Epic 2 → Epic 3 + Epic 4 (parallel) → Epic 6 → Epic 5
```

**MVP excludes:** Auto-update (7), Build pipeline (8), E2E tests (9)
**MVP timeline:** 4 sessions (12-16 hours)

### Full Product Path

```
MVP path + Epic 7 + Epic 8 + Epic 9
```

**Full timeline:** 6-7 sessions (20-28 hours)

---

## 7. Risk Mitigation

### Technical Risks

| Risk | Likelihood | Impact | Mitigation | Detection |
|------|-----------|--------|------------|-----------|
| TradingView blocks embedding | Medium | High — core feature broken | Test immediately in Session 2 (task 2.8). Fallback: use TradingView Lightweight Charts library instead | App loads but TradingView shows blank or error page |
| better-sqlite3 fails to rebuild for Electron | Low | High — blocks database | Use `electron-rebuild` with explicit target. Fallback: switch to `sql.js` (pure JS SQLite) | Build error during `npm run postinstall` |
| electron-vite scaffold outdated | Low | Medium — manual config needed | Pin to known-good electron-vite version. Have manual config ready from architecture doc | Scaffold produces unexpected structure |
| Claude API streaming over IPC drops chunks | Medium | Medium — garbled messages | Implement message ID tracking, chunk ordering, and reconnection. Buffer chunks if needed | Missing text in streamed responses |
| Tailwind v4 + shadcn/ui compatibility | Low | Medium — styling broken | Pin compatible versions. Tailwind v4 works with shadcn/ui — confirmed in research | Build errors or unstyled components |
| macOS code signing fails in CI | Medium | Medium — blocks distribution | Test signing locally first. Have manual DMG distribution as fallback | GitHub Actions job fails at signing step |

### Process Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope creep during implementation | High | Medium | Stick to MVP features defined above. No new features until MVP works |
| Claude Code session timeout mid-task | Medium | Low | Save progress frequently. Use git commits as checkpoints. Tasks designed to be completeable in <1 hour |
| Phil loses context between sessions | Medium | Medium | This document serves as the reference. Start each session by reading relevant epic section |
| Tests become brittle | Medium | Medium | Prefer testing behaviour over implementation. Use `data-testid` for E2E. Mock at boundaries only |

### Early Validation Tasks (Do These First)

These tasks validate critical assumptions and should be done before heavy implementation:

1. **Task 2.8:** Does TradingView load in WebContentsView? (validates core architecture)
2. **Task 1.8:** Does better-sqlite3 rebuild for Electron? (validates database choice)
3. **Task 4.7:** Does Claude API streaming work via IPC? (validates communication pattern)
4. **Task 5.5:** Does screenshot capture work on WebContentsView? (validates capture system)

If any of these fail, we know early and can pivot before investing in the full implementation.

---

## 8. Quality Gates

### Per-Epic Quality Gates

| Epic | Gate | Automated | Manual |
|------|------|-----------|--------|
| **1. Scaffolding** | `npm run dev` launches, `npm run typecheck` passes, `npm run lint` passes | Yes (CI) | Phil: confirm HMR works |
| **2. Architecture** | TypeScript compiles, IPC round-trip works, security headers set | Yes (unit tests) | Phil: TradingView loads, split-pane renders |
| **3. Database** | All CRUD tests pass, migrations idempotent, WAL mode enabled | Yes (vitest) | None |
| **4. Claude API** | Stream mock tests pass, error handling works, prompt caching configured | Yes (vitest) | Phil: real API call returns sensible response |
| **5. Screenshot** | Capture returns valid base64 PNG, optimisation resizes correctly | Yes (vitest) | Phil: screenshot matches what's on screen |
| **6. Chat UI** | Component tests pass, store tests pass, responsive at 1920x1080 and 1440x900 | Yes (RTL + vitest) | Phil: UX feels right, streaming smooth, markdown renders |
| **7. Auto-Update** | Update check returns correct status, download progress events fire | Yes (vitest) | Phil: update notification appears, install works |
| **8. Build Pipeline** | CI passes all platforms, DMG/NSIS/AppImage produced, signed (macOS) | Yes (GitHub Actions) | Phil: DMG installs and launches on real macOS |
| **9. E2E Tests** | All Playwright tests pass locally and in CI | Yes (Playwright) | None |

### Code Quality Standards

| Standard | Tool | Threshold |
|----------|------|-----------|
| TypeScript strict mode | `tsc --noEmit` | Zero errors |
| Linting | ESLint flat config | Zero warnings (treat warnings as errors) |
| Formatting | Prettier | All files formatted |
| Unit test coverage | Vitest v8 coverage | >80% on `src/main/services/` |
| Component test coverage | RTL | All user-facing components have at least 1 test |
| E2E test coverage | Playwright | All critical user flows covered |
| Bundle size (renderer) | Vite build output | <500KB JS (excluding node_modules) |
| Build time | electron-vite build | <30 seconds |

### Definition of Done (per Task)

A task is done when:

- [ ] Code is written and TypeScript compiles without errors
- [ ] Linter passes with no warnings
- [ ] Relevant tests are written and pass
- [ ] Code follows patterns established in `ELECTRON-ARCHITECTURE-RESEARCH.md`
- [ ] No `any` types used (explicit typing required)
- [ ] Error handling is present (no unhandled promises, no silent catches)
- [ ] If UI: component renders correctly at 1920x1080
- [ ] If IPC: sender validation is implemented
- [ ] If main process: no renderer-specific imports
- [ ] Changes committed to git with descriptive message

### Security Validation Checklist (Run Before Any Release)

- [ ] `nodeIntegration: false` on all WebContentsView instances
- [ ] `contextIsolation: true` on all WebContentsView instances
- [ ] `sandbox: true` on all WebContentsView instances
- [ ] CSP headers set on chat renderer session
- [ ] X-Frame-Options stripping ONLY on TradingView session
- [ ] IPC sender validation on every handler
- [ ] Navigation restricted to allowlisted domains
- [ ] New window creation denied
- [ ] API key stored via `safeStorage` (never in plaintext)
- [ ] Preload scripts expose minimal APIs (no raw `ipcRenderer`)
- [ ] TradingView preload is empty/minimal
- [ ] No `eval()`, `new Function()`, or `innerHTML` with user content
- [ ] No secrets in source code or environment variables in production build

---

## 9. Session Planning Template

Use this template at the start of each development session:

```markdown
## Session [N] — [Date]

### Goals
- [ ] Complete Epic [X] tasks [Y.Z - Y.Z]
- [ ] Manual testing: [list]

### Pre-session Checklist
- [ ] Read relevant Epic section in this document
- [ ] Read architecture patterns in ELECTRON-ARCHITECTURE-RESEARCH.md
- [ ] Confirm dependencies from previous session are met
- [ ] `git pull` to get latest code

### Tasks (in order)
1. [Task ID] — [Description] — [Owner]
2. [Task ID] — [Description] — [Owner]
...

### Session End Checklist
- [ ] All tasks committed to git
- [ ] Tests pass: `npm run test:unit`
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linter passes: `npm run lint`
- [ ] Notes for next session: [what's next]
```

### Recommended Session Plan

| Session | Epics | Duration | Key Deliverable |
|---------|-------|----------|----------------|
| **1** | Epic 1 (Scaffolding) | 2-3 hrs | Project scaffolded, deps installed, dev server runs |
| **2** | Epic 2 (Architecture) | 3-4 hrs | Split-pane app with TradingView + React placeholder |
| **3** | Epic 3 + 4 (Database + API) | 3-5 hrs | Database operational, Claude API streaming works |
| **4** | Epic 6 (Chat UI) — Part 1 | 3-4 hrs | Chat components rendered, stores working |
| **5** | Epic 6 (Chat UI) — Part 2 + Epic 5 (Screenshot) | 3-4 hrs | Full chat flow with screenshots, MVP complete |
| **6** | Epic 9 (E2E) + Epic 7 (Auto-Update) | 3-4 hrs | Test suite complete, auto-update working |
| **7** | Epic 8 (Build Pipeline) | 3-4 hrs | CI/CD complete, first release published |

**Total estimated effort: 7 sessions, 20-28 hours**

---

## Appendix: Research Sources

### Electron Architecture
- [electron-vite official documentation](https://electron-vite.org/) — Project structure, configuration, distribution
- [LogRocket: Advanced Electron Architecture](https://blog.logrocket.com/advanced-electron-js-architecture/) — Frontend/backend module separation
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security) — webPreferences, CSP, IPC validation
- [WebContentsView migration guide](https://www.electronjs.org/blog/migrate-to-webcontentsview) — BaseWindow + WebContentsView patterns

### Testing
- [Playwright Electron support](https://playwright.dev/docs/api/class-electron) — E2E testing for Electron apps
- [Playwright best practices](https://www.browserstack.com/guide/playwright-best-practices) — Stable locators, auto-waits, POM
- [Vitest documentation](https://vitest.dev/) — Unit testing with Vite ecosystem
- [Testing Electron with Playwright + GitHub Actions](https://til.simonwillison.net/electron/testing-electron-playwright) — CI integration

### Build and Distribution
- [electron-builder documentation](https://www.electron.build/) — Configuration, auto-update, code signing
- [electron-updater auto-update](https://www.electron.build/auto-update.html) — GitHub Releases integration
- [macOS code signing in GitHub Actions](https://discuss.localazy.com/t/how-to-automatically-sign-macos-apps-using-github-actions/782) — Certificate import workflow
- [Electron code signing tutorial](https://github.com/electron/electron/blob/main/docs/tutorial/code-signing.md) — Official guide

### AI-Assisted Development
- [BrightSec: Best Practices for Reviewing AI-Generated Code](https://brightsec.com/blog/5-best-practices-for-reviewing-and-approving-ai-generated-code/) — Behaviour validation over syntax review
- [VirtuosoQA: Software Testing and AI](https://www.virtuosoqa.com/post/software-testing-and-ai) — Multi-gate validation for AI code
- [FooJay: AI-Driven Testing Best Practices](https://foojay.io/today/ai-driven-testing-best-practices/) — Static analysis of AI-generated tests

---

*Last updated: 2026-02-13*
*Reference architecture: `ELECTRON-ARCHITECTURE-RESEARCH.md`*
*Project instructions: `CLAUDE.md`*
