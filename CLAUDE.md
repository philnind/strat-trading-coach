# CLAUDE.md - STRAT Trading Coach Electron App

> **Project-specific instructions for Claude Code development sessions**
>
> **Created:** 2026-02-13 | **Project:** strat-monitor

---

## Project Identity

- **Name:** strat-monitor
- **Type:** Electron desktop application
- **Purpose:** AI-powered trading coach for The Strat methodology with embedded TradingView charts
- **Tech Stack:** electron-vite, React 19, TypeScript 5.x, Tailwind CSS v4, better-sqlite3, @anthropic-ai/sdk
- **Architecture:** Split-pane (TradingView left, AI chat right), BaseWindow + WebContentsView

## File Preservation Rules

**CRITICAL: The following files must NEVER be deleted or moved:**

- `PRD-STRAT-MONITOR.md` - Complete product requirements document
- `AGENT-ORCHESTRATION-PLAN.md` - Task breakdown and agent assignments
- `ELECTRON-ARCHITECTURE-RESEARCH.md` - Technical architecture patterns and examples
- `ELECTRON-VS-TAURI-COMPARISON.md` - Framework selection rationale
- `MONETIZATION-RESEARCH-REPORT.md` - Business model research
- `CLAUDE.md` - This file
- `HANDOFF.md` - Session continuity tracking (created during development)

**Rationale:** These are research artifacts that inform the entire project. They live at the repository root alongside the application code.

## Project Structure Strategy

### Scaffolding Approach

When scaffolding the electron-vite project:

1. **Scaffold to temporary subdirectory:**
   ```bash
   npm create @quick-start/electron@latest strat-monitor-temp -- --template=react-ts
   ```

2. **Move application files to root:**
   ```bash
   # Move app structure to root
   mv strat-monitor-temp/* .
   mv strat-monitor-temp/.* . 2>/dev/null || true
   rm -rf strat-monitor-temp
   ```

3. **Result:** Clean root with both research docs and app structure coexisting

### Final Directory Structure

```
/Users/phil/Projects/STRAT-trading-coach/
├── PRD-STRAT-MONITOR.md           # Research docs (preserve)
├── AGENT-ORCHESTRATION-PLAN.md
├── ELECTRON-ARCHITECTURE-RESEARCH.md
├── CLAUDE.md
├── HANDOFF.md
├── package.json                    # App code (scaffold)
├── electron.vite.config.ts
├── tsconfig.json
├── src/
│   ├── main/
│   ├── preload/
│   ├── renderer/
│   └── shared/
├── build/
├── resources/
└── test/
```

## Code Standards

### TypeScript

- **Strict mode:** `true` in all tsconfig files
- **No `any` types:** Use `unknown` and type narrowing instead
- **Path aliases:** `@main`, `@renderer`, `@shared` configured in tsconfig
- **Explicit return types:** On all exported functions

### Security (Non-Negotiable)

All WebContentsView instances MUST have:
```typescript
webPreferences: {
  nodeIntegration: false,        // NEVER true
  contextIsolation: true,        // NEVER false
  sandbox: true,                 // NEVER false
  webSecurity: true,
  allowRunningInsecureContent: false,
  preload: path.join(__dirname, '../preload/index.js')
}
```

**IPC Security:**
- ALL handlers MUST validate sender origin
- NO raw `ipcRenderer` exposed to renderer
- Use `contextBridge.exposeInMainWorld` exclusively
- Parameterized SQL queries only (prevent injection)

### Testing Requirements

| Test Type | Tool | Coverage Target | Scope |
|-----------|------|----------------|-------|
| **Unit** | Vitest | >80% | Services, stores, utilities |
| **Component** | React Testing Library + Vitest | All major components | UI components |
| **Integration** | Vitest | All IPC handlers | Main ↔ Renderer communication |
| **E2E** | Playwright | Critical user flows | Full application workflows |

**Test execution required before marking task complete.**

### Code Quality Thresholds

Before any commit:
- ✅ `npm run typecheck` — zero TypeScript errors
- ✅ `npm run lint` — zero ESLint warnings (treat warnings as errors)
- ✅ `npm run test:unit` — all tests passing
- ✅ No `console.log` in production code (use proper logging)
- ✅ No `TODO` comments without linked issue number

## Autonomous vs Ask-First Boundaries

### ✅ Proceed Autonomously

You have full authority to:

- Scaffold project, install dependencies, run builds
- Write implementation code, tests, and configuration files
- Create/edit files within the project structure
- Run test suites and fix failing tests
- Commit completed work to git
- Refactor code for better patterns (within epic scope)
- Fix bugs discovered during implementation
- Update documentation (README, inline comments)

### 🚫 Ask First

You MUST ask Phil before:

- Deleting or moving any `.md` research files
- Changing core architecture decisions (e.g., switching from Zustand to Redux)
- Modifying security settings (relaxing sandbox, enabling nodeIntegration)
- Adding/removing major dependencies not in PRD
- Changing database schema after migrations are deployed
- Tasks explicitly assigned to Phil (credentials, UX review, manual testing)
- Pushing to remote repository (git push)
- Publishing releases or creating git tags

## Git Workflow

### Commit Strategy

- **Frequency:** Commit after each completed task
- **Message format:**
  ```
  [Task X.Y] Brief description

  Detailed explanation if needed.

  Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
  ```
- **Example:**
  ```
  [Task 1.4] Configure Tailwind CSS v4

  - Installed tailwindcss@4.0.0 and dependencies
  - Updated electron.vite.config.ts with PostCSS config
  - Created src/renderer/src/index.css with Tailwind directives

  Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
  ```

### Branch Strategy (for now)

- Work directly on `main` branch during initial development
- Create feature branches only when needed for experimentation
- No force-push, no rebase of pushed commits

## Session Management

### Token Limit Strategy

- **Handoff after each Epic** to avoid hitting context limits
- Current plan: 9 Epics, so 9 handoffs
- Use `/handoff` skill to create/update `HANDOFF.md`

### Handoff Protocol

**At end of each Epic:**

1. Run `/handoff` skill
2. Capture in `HANDOFF.md`:
   - ✅ Completed tasks (with IDs)
   - 🏗️ Current state (what's working, what's not)
   - ⏭️ Next epic to start
   - 🚧 Blockers or issues
   - 📝 Notes for next session

**At start of each session:**

1. Read `HANDOFF.md` to restore context
2. Read relevant Epic section in `AGENT-ORCHESTRATION-PLAN.md`
3. Continue from next task

### Epic Completion Checklist

Before handoff, verify:

- [ ] All tasks in epic marked as completed
- [ ] Quality gate passed (TypeScript, linting, tests)
- [ ] Manual testing completed (if applicable)
- [ ] Git commits pushed (if ready)
- [ ] Handoff document updated

## Quality Gates (Per Epic)

### Epic 1: Project Scaffolding

- ✅ `npm run dev` launches successfully
- ✅ TypeScript compiles with no errors
- ✅ ESLint passes with no warnings
- ✅ Hot reload works for renderer changes

### Epic 2: Core Architecture

- ✅ App launches with split-pane layout
- ✅ TradingView loads on left (user can log in)
- ✅ React app loads on right
- ✅ Resize divider works smoothly
- ✅ IPC ping-pong test passes
- ✅ No console errors or security warnings

### Epic 3: Database Layer

- ✅ Database initializes on app start
- ✅ Migrations run successfully
- ✅ All CRUD operations work (unit tested)
- ✅ Unit test coverage >80%
- ✅ No SQL injection vulnerabilities

### Epic 4: Claude API Integration

- ✅ API key stored securely
- ✅ Streaming works (main → renderer)
- ✅ Image analysis returns structured insights
- ✅ Error handling (rate limits, network errors)
- ✅ Unit test coverage >80%

### Epic 5: Screenshot Capture

- ✅ Screenshot captures TradingView pane only
- ✅ <50ms capture latency
- ✅ HiDPI/Retina support
- ✅ Images optimized for Claude API (<5MB)

### Epic 6: Chat UI

- ✅ All UI components render correctly
- ✅ Chat streaming works smoothly
- ✅ Screenshot capture button works
- ✅ Trade journal CRUD works
- ✅ No React warnings
- ✅ Component test coverage >70%

### Epic 7: Auto-Update

- ✅ Update check works (test with mock server)
- ✅ Silent download doesn't block UI
- ✅ User notified when update ready

### Epic 8: Build & Distribution

- ✅ DMG builds successfully on Mac
- ✅ Signed builds install without warnings
- ✅ CI pipeline passes on all platforms

### Epic 9: E2E Testing

- ✅ All E2E tests pass
- ✅ Tests run in CI
- ✅ <2 min total E2E runtime

## Dependencies Management

### Production Dependencies

Approved for installation (from PRD):
- `@anthropic-ai/sdk` — Claude API client
- `better-sqlite3` — SQLite database
- `electron-updater` — Auto-update system
- `zustand` — State management
- `lucide-react` — Icons
- `react-markdown` — Markdown rendering
- `tailwind-merge`, `clsx` — Tailwind utilities
- `@radix-ui/*` — shadcn/ui dependencies

### Dev Dependencies

Approved for installation:
- `vitest`, `@testing-library/react` — Testing
- `@playwright/test` — E2E testing
- `electron-rebuild` — Native module rebuilding
- `eslint`, `prettier` — Code quality
- `typescript` — Type checking

**Require approval for:**
- Any dependency not in the PRD
- Major version upgrades (e.g., React 19 → 20)
- Alternative libraries (e.g., replacing Zustand with Redux)

## Common Patterns

### IPC Communication

**Main process handler:**
```typescript
ipcMain.handle('channel-name', async (event, arg) => {
  // Validate sender
  if (!isValidSender(event.senderFrame)) {
    throw new Error('Invalid sender');
  }

  // Handle request
  const result = await someService.doSomething(arg);
  return result;
});
```

**Preload exposure:**
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  doSomething: (arg: ArgType): Promise<ResultType> =>
    ipcRenderer.invoke('channel-name', arg)
});
```

**Renderer usage:**
```typescript
const result = await window.electronAPI.doSomething(arg);
```

### Database Queries

**Always use parameterized queries:**
```typescript
// ✅ CORRECT
db.prepare('SELECT * FROM trades WHERE ticker = ?').get(ticker);

// ❌ WRONG - SQL injection vulnerability
db.prepare(`SELECT * FROM trades WHERE ticker = '${ticker}'`).get();
```

### Error Handling

**All async operations must handle errors:**
```typescript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', { error });
  throw new AppError('User-friendly message', { cause: error });
}
```

## Troubleshooting Guide

### Common Issues

**"better-sqlite3 not found" error:**
```bash
npx electron-rebuild -f -w better-sqlite3
```

**TypeScript can't find @main, @renderer, @shared:**
- Check `tsconfig.json` paths configuration
- Restart TypeScript server in IDE

**TradingView won't load (X-Frame-Options):**
- Verify `webRequest.onHeadersReceived` strips header
- Check session partition is `persist:tradingview`

**IPC handler not responding:**
- Verify handler registered before app.ready
- Check sender validation isn't blocking legitimate calls
- Confirm preload script compiled and loaded

## Reference Documents

- **Architecture patterns:** `ELECTRON-ARCHITECTURE-RESEARCH.md`
- **Task breakdown:** `AGENT-ORCHESTRATION-PLAN.md`
- **Product requirements:** `PRD-STRAT-MONITOR.md`
- **Session continuity:** `HANDOFF.md` (created during development)

---

## Current Session Tracking

**Session 1 Goals:** Complete Epic 1 (Project Scaffolding) - Tasks 1-12

**Expected Outcome:** `npm run dev` launches app with hot reload working

**Next Session:** Epic 2 (Core Architecture) - Tasks 13-20

---

*This file is the single source of truth for Claude Code behavior in this project. Update as the project evolves.*
