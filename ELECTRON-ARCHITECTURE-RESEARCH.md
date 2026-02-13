# Electron Architecture Research: TradingView + AI Chat Split-Screen Desktop App

> Comprehensive research document covering architecture, tech stack, security, testing, and distribution for a split-screen desktop application combining TradingView charts with an AI chat interface powered by Claude.
>
> **Researched:** 2026-02-13 | **Target Electron Version:** 40.x | **Node.js:** 20.19+ or 22.12+

---

## Table of Contents

1. [Recommended Tech Stack](#1-recommended-tech-stack)
2. [Project Structure](#2-project-structure)
3. [Architecture Overview](#3-architecture-overview)
4. [Security Configuration](#4-security-configuration)
5. [Code Examples](#5-code-examples)
6. [Testing Strategy](#6-testing-strategy)
7. [Build Pipeline](#7-build-pipeline)
8. [Dependencies List](#8-dependencies-list)
9. [Development Workflow](#9-development-workflow)
10. [Gotchas and Pitfalls](#10-gotchas-and-pitfalls)

---

## 1. Recommended Tech Stack

### Core Framework

| Component | Choice | Version | Rationale |
|-----------|--------|---------|-----------|
| **Desktop Framework** | Electron | 40.x | Latest stable (Feb 2026), Chromium M144. WebContentsView is stable. |
| **Build Tool** | electron-vite | 5.x | Vite-based, best DX with HMR, pre-configured for Electron's 3-process model. Faster than Electron Forge's Vite plugin (which is still experimental). |
| **Packager/Installer** | electron-builder | 26.x | Mature, supports DMG/NSIS/AppImage, auto-update integration, code signing. |
| **Node.js** | Node.js | 20.19+ or 22.12+ | Required by electron-vite 5.x. |

**Why electron-vite over Electron Forge?**
- electron-vite is purpose-built around Vite with a single unified config for main/preload/renderer.
- Electron Forge's Vite support is marked experimental as of v7.5.0 with potential breaking changes.
- electron-vite provides faster HMR, V8 bytecode compilation for source protection, and better asset handling.
- electron-builder (used with electron-vite) has mature auto-update and code signing support.

Sources:
- [electron-vite official site](https://electron-vite.org/)
- [Electron Forge Vite FAQ](https://electron-vite.github.io/faq/electron-forge.html)
- [Why Electron Forge?](https://www.electronforge.io/core-concepts/why-electron-forge)

### Frontend Stack

| Component | Choice | Version | Rationale |
|-----------|--------|---------|-----------|
| **UI Framework** | React | 19.x | Dominant ecosystem, excellent TypeScript support. |
| **Language** | TypeScript | 5.x | Type safety across main/preload/renderer. |
| **Styling** | Tailwind CSS | 4.x | Utility-first, tiny production bundles with tree-shaking. |
| **Component Library** | shadcn/ui | latest | Accessible, copy-paste components built on Radix UI. Works perfectly with Tailwind. |
| **State Management** | Zustand | 5.x | Minimal boilerplate, excellent TypeScript support, no Provider wrapping needed. Handles zombie child problem and React concurrency correctly. |
| **Icons** | Lucide React | latest | Tree-shakeable icon library used by shadcn/ui. |

Sources:
- [2025 Setup: Electron-Vite + Tailwind + shadcn](https://blog.mohitnagaraj.in/blog/202505/Electron_Shadcn_Guide)
- [Top 5 React State Management 2026](https://www.syncfusion.com/blogs/post/react-state-management-libraries)
- [State Management Trends 2025](https://makersden.io/blog/react-state-management-in-2025)

### Backend/Data Stack

| Component | Choice | Version | Rationale |
|-----------|--------|---------|-----------|
| **AI SDK** | @anthropic-ai/sdk | 0.74.x | Official Anthropic TypeScript SDK with streaming, image analysis, prompt caching. |
| **Database** | better-sqlite3 | 12.x | Synchronous, fast, runs in main process. No ORM overhead needed for a trade journal. |
| **Secure Storage** | Electron safeStorage API | built-in | OS-native encryption (Keychain on macOS, DPAPI on Windows). |
| **Auto-Update** | electron-updater | 6.x | Integrates with electron-builder, supports GitHub Releases. |

Sources:
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3)
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [electron-updater auto update docs](https://www.electron.build/auto-update.html)

---

## 2. Project Structure

```
strat-monitor/
├── .github/
│   └── workflows/
│       ├── build.yml              # CI: lint, test, build
│       └── release.yml            # CD: build, sign, notarize, publish
├── build/                         # Build resources (icons, entitlements)
│   ├── icon.icns                  # macOS icon
│   ├── icon.ico                   # Windows icon
│   ├── icon.png                   # Linux icon
│   └── entitlements.mac.plist     # macOS entitlements for notarization
├── resources/                     # Static assets copied to app (not bundled)
│   └── migrations/                # SQL migration files
│       ├── 001_init.sql
│       └── 002_add_screenshots.sql
├── src/
│   ├── main/                      # Electron main process (Node.js)
│   │   ├── index.ts               # App entry: creates BaseWindow, manages lifecycle
│   │   ├── window.ts              # Window creation and WebContentsView management
│   │   ├── ipc/                   # IPC handler registrations
│   │   │   ├── index.ts           # Register all handlers
│   │   │   ├── chat.ts            # Claude API streaming handlers
│   │   │   ├── screenshot.ts      # Screenshot capture handlers
│   │   │   ├── database.ts        # DB query handlers
│   │   │   ├── settings.ts        # Settings/config handlers
│   │   │   └── updater.ts         # Auto-update handlers
│   │   ├── services/              # Business logic (no Electron imports)
│   │   │   ├── claude.ts          # Claude API client wrapper
│   │   │   ├── database.ts        # better-sqlite3 initialisation + queries
│   │   │   ├── migrations.ts      # DB migration runner
│   │   │   ├── screenshot.ts      # Screenshot capture + processing
│   │   │   └── secure-store.ts    # safeStorage wrapper for API keys
│   │   └── lib/                   # Shared utilities
│   │       ├── constants.ts       # App-wide constants
│   │       └── logger.ts          # Logging utility
│   ├── preload/                   # Preload scripts (bridge layer)
│   │   ├── index.ts               # Main preload: exposes typed API via contextBridge
│   │   └── tradingview.ts         # TradingView pane preload (minimal, restricted)
│   ├── renderer/                  # React application (browser context)
│   │   ├── index.html             # Entry HTML
│   │   └── src/
│   │       ├── main.tsx           # React entry point
│   │       ├── App.tsx            # Root component
│   │       ├── components/        # React components
│   │       │   ├── chat/
│   │       │   │   ├── ChatPanel.tsx
│   │       │   │   ├── MessageList.tsx
│   │       │   │   ├── MessageBubble.tsx
│   │       │   │   ├── InputBar.tsx
│   │       │   │   └── StreamingMessage.tsx
│   │       │   ├── layout/
│   │       │   │   ├── SplitPane.tsx
│   │       │   │   ├── TitleBar.tsx
│   │       │   │   └── StatusBar.tsx
│   │       │   └── ui/            # shadcn/ui components (auto-generated)
│   │       │       ├── button.tsx
│   │       │       ├── input.tsx
│   │       │       ├── scroll-area.tsx
│   │       │       └── ...
│   │       ├── stores/            # Zustand stores
│   │       │   ├── chat-store.ts
│   │       │   ├── settings-store.ts
│   │       │   └── trade-store.ts
│   │       ├── hooks/             # Custom React hooks
│   │       │   ├── use-chat.ts
│   │       │   ├── use-screenshot.ts
│   │       │   └── use-settings.ts
│   │       ├── lib/               # Renderer utilities
│   │       │   ├── utils.ts       # cn() helper for shadcn/ui
│   │       │   └── format.ts      # Date/number formatting
│   │       └── assets/
│   │           └── main.css       # Tailwind entry (@import "tailwindcss")
│   └── shared/                    # Shared types (used by main + preload + renderer)
│       ├── ipc-types.ts           # IPC channel names and payload types
│       ├── models.ts              # Trade, Message, Settings interfaces
│       └── constants.ts           # Shared constants
├── electron.vite.config.ts        # electron-vite configuration
├── electron-builder.yml           # electron-builder packaging config
├── tsconfig.json                  # Root TypeScript config
├── tsconfig.node.json             # Main/preload TypeScript config
├── tsconfig.web.json              # Renderer TypeScript config
├── tailwind.config.ts             # Tailwind configuration (if needed beyond v4 defaults)
├── components.json                # shadcn/ui configuration
├── package.json
├── .env.example                   # Environment variable template
├── .gitignore
└── README.md
```

### Key Design Decisions

1. **`src/shared/`** contains TypeScript interfaces shared across all three processes. This is the single source of truth for IPC channel names, payload shapes, and domain models.

2. **`src/main/ipc/`** separates IPC handler registration from business logic. Each file in `ipc/` calls corresponding functions in `services/`, keeping the IPC layer thin.

3. **`src/main/services/`** contains pure business logic with no Electron-specific imports where possible. This makes services testable with Vitest without mocking Electron.

4. **`resources/migrations/`** lives outside `src/` so it is copied as-is during packaging (not bundled). This avoids the common pitfall of migration files being unreachable in ASAR archives.

5. **Two preload scripts**: The main preload (`index.ts`) exposes the full typed API for the chat renderer. The TradingView preload (`tradingview.ts`) is minimal/empty since TradingView.com should not have access to any Electron APIs.

Sources:
- [electron-vite project structure](https://electron-vite.org/guide/)
- [LogRocket: Build an Electron app with electron-vite](https://blog.logrocket.com/build-electron-app-electron-vite/)
- [electron-vite distribution guide](https://electron-vite.org/guide/distribution)

---

## 3. Architecture Overview

### Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS (Node.js)                  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Claude API   │  │ better-sqlite3│  │ safeStorage      │  │
│  │ Service      │  │ Database     │  │ (API Key Store)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘  │
│         │                 │                  │              │
│  ┌──────┴─────────────────┴──────────────────┴───────────┐  │
│  │                  IPC Handlers                          │  │
│  │  chat:send, chat:stream, screenshot:capture,           │  │
│  │  db:getTrades, db:saveTrade, settings:getApiKey, ...   │  │
│  └──────────────────────┬────────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────┴────────────────────────────────┐  │
│  │                  BaseWindow                            │  │
│  │  ┌─────────────────────┐ ┌──────────────────────────┐ │  │
│  │  │  WebContentsView    │ │  WebContentsView         │ │  │
│  │  │  (TradingView)      │ │  (Chat Renderer)         │ │  │
│  │  │                     │ │                           │ │  │
│  │  │  URL: tradingview   │ │  URL: local renderer     │ │  │
│  │  │  .com/chart/...     │ │  (React + Tailwind)      │ │  │
│  │  │                     │ │                           │ │  │
│  │  │  Preload:           │ │  Preload:                │ │  │
│  │  │  tradingview.ts     │ │  index.ts                │ │  │
│  │  │  (minimal/empty)    │ │  (full typed API)        │ │  │
│  │  │                     │ │                           │ │  │
│  │  │  Session:           │ │  Session:                │ │  │
│  │  │  persist:tv         │ │  default                 │ │  │
│  │  │  (cookies saved)    │ │                           │ │  │
│  │  └─────────────────────┘ └──────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  electron-updater (checks GitHub Releases)             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow: Chat Message with Screenshot

```
User clicks "Analyse Chart"
        │
        ▼
[Chat Renderer] ──IPC invoke──> [Main Process]
        │                              │
        │                    1. Capture TradingView
        │                       WebContentsView screenshot
        │                       (webContents.capturePage())
        │                              │
        │                    2. Convert NativeImage to
        │                       base64 PNG (image.toPNG())
        │                              │
        │                    3. Send to Claude API with
        │                       system prompt + base64 image
        │                       (streaming response)
        │                              │
        │                    4. Stream tokens back via
        │                       IPC webContents.send()
        │                              │
        ◄──────IPC on────────          │
        │                              │
[React renders streaming     5. Save conversation to
 message tokens in real-time]   better-sqlite3
```

### IPC Communication Pattern

All communication between renderer and main process flows through typed IPC channels:

- **Renderer to Main (invoke/handle):** Request-response pattern for queries and commands.
- **Main to Renderer (send/on):** Push pattern for streaming data and events.
- **No direct communication between WebContentsView instances.** All inter-view communication routes through the main process.

Sources:
- [WebContentsView replacing BrowserView](https://developer.mamezou-tech.com/en/blogs/2024/03/06/electron-webcontentsview/)
- [Electron app structure in WebContentsView era](https://developer.mamezou-tech.com/en/blogs/2024/08/28/electron-webcontentsview-app-structure/)
- [Migrating to WebContentsView](https://www.electronjs.org/blog/migrate-to-webcontentsview)

---

## 4. Security Configuration

### webPreferences for Chat Renderer

```typescript
// src/main/window.ts
const chatView = new WebContentsView({
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js'),
    nodeIntegration: false,        // NEVER enable for renderer
    contextIsolation: true,        // Isolate preload from renderer
    sandbox: true,                 // Chromium sandbox enabled
    webSecurity: true,             // Enforce same-origin policy
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    // No enableRemoteModule (removed in Electron 14+)
  }
});
```

### webPreferences for TradingView View

```typescript
// src/main/window.ts
const tvView = new WebContentsView({
  webPreferences: {
    preload: path.join(__dirname, '../preload/tradingview.js'),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    // Use persistent session for TradingView login cookies
    partition: 'persist:tradingview',
  }
});
```

### Content Security Policy

```typescript
// src/main/index.ts
import { session } from 'electron';

// CSP for the chat renderer
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +   // Tailwind needs inline styles
        "img-src 'self' data: blob:; " +           // For screenshot previews
        "connect-src 'self'; " +
        "font-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self';"
      ]
    }
  });
});
```

### X-Frame-Options Stripping for TradingView

TradingView sets `X-Frame-Options` headers that prevent loading in embedded views. Strip them for the TradingView session only:

```typescript
// src/main/window.ts
const tvSession = session.fromPartition('persist:tradingview');

tvSession.webRequest.onHeadersReceived((details, callback) => {
  const responseHeaders = { ...details.responseHeaders };

  // Remove X-Frame-Options (case-insensitive)
  Object.keys(responseHeaders)
    .filter(key => /x-frame-options/i.test(key))
    .forEach(key => delete responseHeaders[key]);

  // Also remove restrictive CSP frame-ancestors if present
  Object.keys(responseHeaders)
    .filter(key => /content-security-policy/i.test(key))
    .forEach(key => {
      if (responseHeaders[key]) {
        responseHeaders[key] = responseHeaders[key].map(
          (policy: string) => policy.replace(/frame-ancestors[^;]*(;|$)/gi, '')
        );
      }
    });

  callback({ responseHeaders });
});
```

### IPC Sender Validation

```typescript
// src/main/ipc/index.ts
import { ipcMain, WebContents } from 'electron';

function validateSender(webContents: WebContents): boolean {
  // Only allow IPC from our renderer, not from the TradingView view
  const url = new URL(webContents.getURL());
  // In dev mode, renderer runs on localhost
  if (url.hostname === 'localhost') return true;
  // In production, renderer uses custom protocol or file://
  if (url.protocol === 'file:' || url.protocol === 'app:') return true;
  return false;
}

// Wrap every handler with validation
ipcMain.handle('chat:send', (event, ...args) => {
  if (!validateSender(event.sender)) {
    throw new Error('Unauthorized IPC sender');
  }
  return chatService.sendMessage(...args);
});
```

### Navigation and Window Creation Controls

```typescript
// src/main/index.ts
app.on('web-contents-created', (_event, contents) => {
  // Prevent navigation away from expected URLs
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const allowedHosts = ['localhost', 'www.tradingview.com', 'tradingview.com'];
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      event.preventDefault();
    }
  });

  // Prevent opening new windows (open external links in default browser)
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});
```

### Secure API Key Storage

```typescript
// src/main/services/secure-store.ts
import { safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const KEYS_FILE = path.join(app.getPath('userData'), 'encrypted-keys.json');

interface EncryptedKeys {
  [key: string]: string; // base64-encoded encrypted buffer
}

function readKeys(): EncryptedKeys {
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeKeys(keys: EncryptedKeys): void {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

export function storeApiKey(name: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this platform');
  }
  const encrypted = safeStorage.encryptString(value);
  const keys = readKeys();
  keys[name] = encrypted.toString('base64');
  writeKeys(keys);
}

export function getApiKey(name: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this platform');
  }
  const keys = readKeys();
  if (!keys[name]) return null;
  const encrypted = Buffer.from(keys[name], 'base64');
  return safeStorage.decryptString(encrypted);
}

export function deleteApiKey(name: string): void {
  const keys = readKeys();
  delete keys[name];
  writeKeys(keys);
}
```

### Security Checklist

- [x] `nodeIntegration: false` on all renderers
- [x] `contextIsolation: true` on all renderers
- [x] `sandbox: true` on all renderers
- [x] `webSecurity: true` on all renderers
- [x] CSP headers set on chat renderer session
- [x] X-Frame-Options stripped ONLY on TradingView session (not globally)
- [x] IPC sender validation on every handler
- [x] Navigation restricted to allowlisted domains
- [x] New window creation denied (external links open in browser)
- [x] API keys stored via `safeStorage` (OS-native encryption)
- [x] Preload scripts expose minimal, specific APIs (no raw `ipcRenderer`)
- [x] TradingView preload is empty/minimal (no API exposure to third-party site)
- [x] Use `partition: 'persist:tradingview'` to isolate TradingView cookies

Sources:
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Bishop Fox: Secure Electron Framework](https://bishopfox.com/blog/reasonably-secure-electron)
- [Doyensec Electron Security Checklist](https://doyensec.com/resources/us-17-Carettoni-Electronegativity-A-Study-Of-Electron-Security-wp.pdf)
- [Bypassing CORS with Electron onHeadersReceived](https://pratikpc.medium.com/bypassing-cors-with-electron-ab7eaf331605)

---

## 5. Code Examples

### 5.1 WebContentsView Split-Pane Setup

```typescript
// src/main/window.ts
import { BaseWindow, WebContentsView, session, app } from 'electron';
import path from 'node:path';

let mainWindow: BaseWindow;
let tradingViewView: WebContentsView;
let chatView: WebContentsView;

// Default split ratio (TradingView gets 65%, Chat gets 35%)
let splitRatio = 0.65;

export function createMainWindow(): BaseWindow {
  mainWindow = new BaseWindow({
    width: 1920,
    height: 1080,
    minWidth: 1200,
    minHeight: 700,
    title: 'Strat Monitor',
    // titleBarStyle: 'hidden',  // Enable for custom title bar
    // titleBarOverlay: true,
  });

  // --- TradingView View ---
  const tvSession = session.fromPartition('persist:tradingview');
  setupTradingViewSession(tvSession);

  tradingViewView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/tradingview.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      partition: 'persist:tradingview',
    }
  });
  mainWindow.contentView.addChildView(tradingViewView);
  tradingViewView.webContents.loadURL('https://www.tradingview.com/chart/');

  // --- Chat Renderer View ---
  chatView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    }
  });
  mainWindow.contentView.addChildView(chatView);

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    chatView.webContents.loadURL('http://localhost:5173');
  } else {
    chatView.webContents.loadFile(
      path.join(__dirname, '../renderer/index.html')
    );
  }

  // Apply initial layout
  updateLayout();

  // Re-layout on resize
  mainWindow.on('resize', () => {
    updateLayout();
  });

  return mainWindow;
}

function updateLayout(): void {
  const bounds = mainWindow.getBounds();
  const { width, height } = bounds;

  // Account for title bar height if using native title bar
  const titleBarHeight = 0; // Set to ~30 if using custom title bar

  const tvWidth = Math.round(width * splitRatio);
  const chatWidth = width - tvWidth;

  tradingViewView.setBounds({
    x: 0,
    y: titleBarHeight,
    width: tvWidth,
    height: height - titleBarHeight,
  });

  chatView.setBounds({
    x: tvWidth,
    y: titleBarHeight,
    width: chatWidth,
    height: height - titleBarHeight,
  });
}

export function setSplitRatio(ratio: number): void {
  splitRatio = Math.max(0.3, Math.min(0.8, ratio));
  updateLayout();
}

function setupTradingViewSession(tvSession: Electron.Session): void {
  // Strip X-Frame-Options so TradingView loads in our view
  tvSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    Object.keys(responseHeaders)
      .filter(key => /x-frame-options/i.test(key))
      .forEach(key => delete responseHeaders[key]);
    callback({ responseHeaders });
  });
}

// Expose for screenshot capture
export function getTradingViewView(): WebContentsView {
  return tradingViewView;
}

export function getChatView(): WebContentsView {
  return chatView;
}

export function getMainWindow(): BaseWindow {
  return mainWindow;
}
```

### 5.2 Screenshot Capture and API Transfer

```typescript
// src/main/services/screenshot.ts
import { NativeImage } from 'electron';
import { getTradingViewView } from '../window';

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  timestamp: number;
}

export async function captureTradingViewScreenshot(): Promise<ScreenshotResult> {
  const tvView = getTradingViewView();
  const webContents = tvView.webContents;

  // capturePage() captures the visible area of the WebContentsView
  const image: NativeImage = await webContents.capturePage();

  // Get image dimensions (accounts for HiDPI/Retina scaling)
  const size = image.getSize();

  // Convert to PNG buffer, then base64
  // For Claude API, PNG preserves chart detail better than JPEG
  const pngBuffer = image.toPNG();
  const base64 = pngBuffer.toString('base64');

  return {
    base64,
    width: size.width,
    height: size.height,
    timestamp: Date.now(),
  };
}

export async function captureAndOptimise(): Promise<ScreenshotResult> {
  const tvView = getTradingViewView();
  const webContents = tvView.webContents;

  const image: NativeImage = await webContents.capturePage();
  const size = image.getSize();

  // For very large screens (4K+), resize to reduce API costs
  // Claude handles images up to 1568px on the longest side efficiently
  let finalImage = image;
  const maxDimension = 1568;

  if (size.width > maxDimension || size.height > maxDimension) {
    const scale = maxDimension / Math.max(size.width, size.height);
    finalImage = image.resize({
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
      quality: 'best',
    });
  }

  const pngBuffer = finalImage.toPNG();
  const base64 = pngBuffer.toString('base64');

  return {
    base64,
    width: finalImage.getSize().width,
    height: finalImage.getSize().height,
    timestamp: Date.now(),
  };
}

// Save screenshot to filesystem (for trade journal)
export async function saveScreenshot(
  base64: string,
  tradeId: string
): Promise<string> {
  const { app } = await import('electron');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const screenshotsDir = path.join(app.getPath('userData'), 'screenshots');
  await fs.mkdir(screenshotsDir, { recursive: true });

  const filename = `trade-${tradeId}-${Date.now()}.png`;
  const filepath = path.join(screenshotsDir, filename);

  await fs.writeFile(filepath, Buffer.from(base64, 'base64'));
  return filepath;
}
```

### 5.3 Typed IPC Communication

```typescript
// src/shared/ipc-types.ts
// Single source of truth for all IPC channels and their types

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  timestamp: number;
}

export interface Trade {
  id: string;
  ticker: string;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  result?: 'win' | 'loss' | 'breakeven';
  pnl?: number;
  notes: string;
  screenshotPath?: string;
  createdAt: number;
  closedAt?: number;
}

export interface StreamChunk {
  type: 'text_delta' | 'message_start' | 'message_stop' | 'error';
  text?: string;
  messageId?: string;
  error?: string;
}

// ---- IPC Channel Definitions ----

// Invoke/Handle channels (renderer -> main, returns a value)
export interface IpcInvokeChannels {
  'chat:send': {
    args: [message: string, includeScreenshot: boolean];
    return: { messageId: string };
  };
  'chat:getHistory': {
    args: [conversationId: string];
    return: ChatMessage[];
  };
  'screenshot:capture': {
    args: [];
    return: { base64: string; width: number; height: number };
  };
  'db:getTrades': {
    args: [limit?: number];
    return: Trade[];
  };
  'db:saveTrade': {
    args: [trade: Omit<Trade, 'id' | 'createdAt'>];
    return: Trade;
  };
  'db:updateTrade': {
    args: [id: string, updates: Partial<Trade>];
    return: Trade;
  };
  'settings:getApiKey': {
    args: [];
    return: boolean; // Returns whether key exists, NOT the key itself
  };
  'settings:setApiKey': {
    args: [key: string];
    return: void;
  };
  'settings:getSplitRatio': {
    args: [];
    return: number;
  };
  'settings:setSplitRatio': {
    args: [ratio: number];
    return: void;
  };
  'updater:checkForUpdates': {
    args: [];
    return: { updateAvailable: boolean; version?: string };
  };
  'updater:downloadUpdate': {
    args: [];
    return: void;
  };
  'updater:installUpdate': {
    args: [];
    return: void;
  };
}

// Send/On channels (main -> renderer, push events)
export interface IpcSendChannels {
  'chat:stream': StreamChunk;
  'updater:download-progress': { percent: number };
  'updater:update-downloaded': { version: string };
}

// Type-safe channel name extraction
export type InvokeChannel = keyof IpcInvokeChannels;
export type SendChannel = keyof IpcSendChannels;
```

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type {
  IpcInvokeChannels,
  IpcSendChannels,
  InvokeChannel,
  SendChannel,
  StreamChunk,
  ChatMessage,
  Trade,
} from '../shared/ipc-types';

// Type-safe invoke wrapper
function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: IpcInvokeChannels[C]['args']
): Promise<IpcInvokeChannels[C]['return']> {
  return ipcRenderer.invoke(channel, ...args);
}

// Type-safe event listener
function on<C extends SendChannel>(
  channel: C,
  callback: (data: IpcSendChannels[C]) => void
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, data: IpcSendChannels[C]) => {
    callback(data);
  };
  ipcRenderer.on(channel, handler);
  // Return cleanup function
  return () => ipcRenderer.removeListener(channel, handler);
}

// Expose typed API to renderer
const electronAPI = {
  chat: {
    send: (message: string, includeScreenshot: boolean) =>
      invoke('chat:send', message, includeScreenshot),
    getHistory: (conversationId: string) =>
      invoke('chat:getHistory', conversationId),
    onStream: (callback: (chunk: StreamChunk) => void) =>
      on('chat:stream', callback),
  },
  screenshot: {
    capture: () => invoke('screenshot:capture'),
  },
  database: {
    getTrades: (limit?: number) => invoke('db:getTrades', limit),
    saveTrade: (trade: Omit<Trade, 'id' | 'createdAt'>) =>
      invoke('db:saveTrade', trade),
    updateTrade: (id: string, updates: Partial<Trade>) =>
      invoke('db:updateTrade', id, updates),
  },
  settings: {
    hasApiKey: () => invoke('settings:getApiKey'),
    setApiKey: (key: string) => invoke('settings:setApiKey', key),
    getSplitRatio: () => invoke('settings:getSplitRatio'),
    setSplitRatio: (ratio: number) => invoke('settings:setSplitRatio', ratio),
  },
  updater: {
    checkForUpdates: () => invoke('updater:checkForUpdates'),
    downloadUpdate: () => invoke('updater:downloadUpdate'),
    installUpdate: () => invoke('updater:installUpdate'),
    onDownloadProgress: (cb: (progress: { percent: number }) => void) =>
      on('updater:download-progress', cb),
    onUpdateDownloaded: (cb: (info: { version: string }) => void) =>
      on('updater:update-downloaded', cb),
  },
} as const;

export type ElectronAPI = typeof electronAPI;

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

```typescript
// src/renderer/src/global.d.ts
// Make TypeScript aware of the exposed API in the renderer
import type { ElectronAPI } from '../../preload/index';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

```typescript
// src/main/ipc/chat.ts (handler registration side)
import { ipcMain, BrowserWindow } from 'electron';
import { sendMessageWithScreenshot, sendMessage } from '../services/claude';
import { captureTradingViewScreenshot } from '../services/screenshot';
import { getChatView } from '../window';
import type { StreamChunk } from '../../shared/ipc-types';

export function registerChatHandlers(): void {
  ipcMain.handle('chat:send', async (event, message: string, includeScreenshot: boolean) => {
    // Validate sender
    const chatWebContents = getChatView().webContents;
    if (event.sender.id !== chatWebContents.id) {
      throw new Error('Unauthorized');
    }

    const messageId = crypto.randomUUID();

    // Start streaming in background
    (async () => {
      try {
        let screenshot: { base64: string } | undefined;
        if (includeScreenshot) {
          screenshot = await captureTradingViewScreenshot();
        }

        const stream = includeScreenshot && screenshot
          ? await sendMessageWithScreenshot(message, screenshot.base64)
          : await sendMessage(message);

        // Stream tokens back to renderer
        for await (const chunk of stream) {
          chatWebContents.send('chat:stream', {
            type: 'text_delta',
            text: chunk,
            messageId,
          } satisfies StreamChunk);
        }

        chatWebContents.send('chat:stream', {
          type: 'message_stop',
          messageId,
        } satisfies StreamChunk);
      } catch (error) {
        chatWebContents.send('chat:stream', {
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId,
        } satisfies StreamChunk);
      }
    })();

    return { messageId };
  });
}
```

Sources:
- [@electron-toolkit/typed-ipc](https://www.npmjs.com/package/@electron-toolkit/typed-ipc)
- [Adding TypeSafety to Electron IPC](https://kishannirghin.medium.com/adding-typesafety-to-electron-ipc-with-typescript-d12ba589ea6a)
- [Electron IPC Tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc)

### 5.4 Database Operations via IPC

```typescript
// src/main/services/database.ts
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import type { Trade, ChatMessage } from '../../shared/ipc-types';

let db: Database.Database;

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'strat-monitor.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations();
}

function runMigrations(): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Read migration files from resources directory
  const migrationsDir = path.join(
    app.isPackaged
      ? path.join(process.resourcesPath, 'migrations')
      : path.join(__dirname, '../../resources/migrations')
  );

  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare('SELECT name FROM migrations').all()
      .map((row: any) => row.name)
  );

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    const migrate = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    });

    migrate();
    console.log(`Applied migration: ${file}`);
  }
}

// ---- Trade Operations ----

const insertTrade = () => db.prepare(`
  INSERT INTO trades (id, ticker, direction, entry, stop, target, notes, screenshot_path, created_at)
  VALUES (@id, @ticker, @direction, @entry, @stop, @target, @notes, @screenshotPath, @createdAt)
`);

const updateTradeStmt = () => db.prepare(`
  UPDATE trades SET
    result = COALESCE(@result, result),
    pnl = COALESCE(@pnl, pnl),
    notes = COALESCE(@notes, notes),
    screenshot_path = COALESCE(@screenshotPath, screenshot_path),
    closed_at = COALESCE(@closedAt, closed_at)
  WHERE id = @id
`);

export function saveTrade(trade: Omit<Trade, 'id' | 'createdAt'>): Trade {
  const id = crypto.randomUUID();
  const createdAt = Date.now();

  insertTrade().run({
    id,
    ...trade,
    createdAt,
  });

  return { id, createdAt, ...trade };
}

export function updateTrade(id: string, updates: Partial<Trade>): Trade {
  updateTradeStmt().run({ id, ...updates });
  return db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as Trade;
}

export function getTrades(limit = 50): Trade[] {
  return db.prepare(
    'SELECT * FROM trades ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as Trade[];
}

export function getTradeById(id: string): Trade | undefined {
  return db.prepare('SELECT * FROM trades WHERE id = ?').get(id) as Trade | undefined;
}

// ---- Conversation Operations ----

export function saveMessage(conversationId: string, message: ChatMessage): void {
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, image_base64, timestamp)
    VALUES (@id, @conversationId, @role, @content, @imageBase64, @timestamp)
  `).run({
    ...message,
    conversationId,
    imageBase64: message.imageBase64 || null,
  });
}

export function getConversationMessages(conversationId: string): ChatMessage[] {
  return db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC'
  ).all(conversationId) as ChatMessage[];
}

// ---- Cleanup ----

export function closeDatabase(): void {
  if (db) db.close();
}
```

```sql
-- resources/migrations/001_init.sql
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry REAL NOT NULL,
  stop REAL NOT NULL,
  target REAL NOT NULL,
  result TEXT CHECK (result IN ('win', 'loss', 'breakeven')),
  pnl REAL,
  notes TEXT DEFAULT '',
  screenshot_path TEXT,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  image_base64 TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
```

```sql
-- resources/migrations/002_add_screenshots.sql
CREATE TABLE IF NOT EXISTS screenshots (
  id TEXT PRIMARY KEY,
  trade_id TEXT REFERENCES trades(id),
  message_id TEXT REFERENCES messages(id),
  file_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  captured_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_screenshots_trade ON screenshots(trade_id);
```

Sources:
- [better-sqlite3 cheatsheet](https://gist.github.com/bonniss/2fb3853640510b697ca38255ec6bd282)
- [Challenges Building an Electron App (SQLite)](https://www.danielcorin.com/posts/2024/challenges-building-an-electron-app/)
- [Drizzle ORM + Electron discussions](https://github.com/drizzle-team/drizzle-orm/discussions/1891)

### 5.5 Claude API Streaming

```typescript
// src/main/services/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from './secure-store';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = getApiKey('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('Anthropic API key not configured');
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Reset client when API key changes
export function resetClient(): void {
  client = null;
}

// System prompt for The Strat trading analysis
const SYSTEM_PROMPT = `You are a trading coach specialising in The Strat methodology.
You help analyse TradingView charts for Strat patterns including:
- Candle numbering (1s, 2s, 3s with direction)
- FTFC (Full Timeframe Continuity) alignment
- Key setups: 2-1-2 continuation, PMG exhaustion, broadening formations
- Entry triggers, stop placement, and target levels

When analysing chart screenshots:
1. Identify the timeframe and ticker
2. Number the recent candles (inside bars, outside bars, directional)
3. Check for FTFC alignment across visible timeframes
4. Identify any actionable setups
5. Specify entry, stop, and target levels
6. Assess risk/reward ratio

Be direct. Use British English. Challenge marginal setups.`;

// Conversation history for context
let conversationHistory: Anthropic.MessageParam[] = [];

export async function* sendMessage(
  userMessage: string
): AsyncGenerator<string> {
  const client = getClient();

  conversationHistory.push({
    role: 'user',
    content: userMessage,
  });

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: conversationHistory,
  });

  let fullResponse = '';

  stream.on('text', (text) => {
    fullResponse += text;
  });

  // Yield text chunks as they arrive
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }

  // Save assistant response to history
  conversationHistory.push({
    role: 'assistant',
    content: fullResponse,
  });
}

export async function* sendMessageWithScreenshot(
  userMessage: string,
  screenshotBase64: string
): AsyncGenerator<string> {
  const client = getClient();

  conversationHistory.push({
    role: 'user',
    content: [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: screenshotBase64,
        },
      },
      {
        type: 'text',
        text: userMessage,
      },
    ],
  });

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: conversationHistory,
  });

  let fullResponse = '';

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      fullResponse += event.delta.text;
      yield event.delta.text;
    }
  }

  conversationHistory.push({
    role: 'assistant',
    content: fullResponse,
  });
}

export function clearConversation(): void {
  conversationHistory = [];
}

export function getConversationLength(): number {
  return conversationHistory.length;
}
```

**Prompt Caching Notes:**
- The system prompt is marked with `cache_control: { type: 'ephemeral' }` so it is cached for 5 minutes between calls.
- Cache reads cost only 10% of base input token price ($0.30/MTok for Sonnet 4.5).
- Cache writes cost 25% more than base ($3.75/MTok for Sonnet 4.5).
- For long conversations, place `cache_control` on the last message block in the conversation prefix that is stable.
- Minimum cacheable size: 1,024 tokens for Sonnet 4.5.
- Up to 4 cache breakpoints per request.

Sources:
- [Anthropic Prompt Caching Documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Claude Vision for Document Analysis](https://getstream.io/blog/anthropic-claude-visual-reasoning/)

### 5.6 Auto-Update Setup

```typescript
// src/main/services/updater.ts
import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app } from 'electron';
import { getChatView } from '../window';
import log from 'electron-log';

// Configure logging
autoUpdater.logger = log;

// Disable auto-download (let user choose)
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

export function initAutoUpdater(): void {
  // Check for updates on launch (after a short delay)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Update check failed:', err);
    });
  }, 10_000); // 10 second delay

  // Check every 30 minutes
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Periodic update check failed:', err);
    });
  }, 30 * 60 * 1000);

  // Event handlers
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('Update available:', info.version);
    const chatWebContents = getChatView()?.webContents;
    if (chatWebContents) {
      chatWebContents.send('updater:update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const chatWebContents = getChatView()?.webContents;
    if (chatWebContents) {
      chatWebContents.send('updater:download-progress', {
        percent: progress.percent,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('Update downloaded:', info.version);
    const chatWebContents = getChatView()?.webContents;
    if (chatWebContents) {
      chatWebContents.send('updater:update-downloaded', {
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', (error) => {
    log.error('Auto-updater error:', error);
  });
}

export async function checkForUpdates(): Promise<{ updateAvailable: boolean; version?: string }> {
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo) {
      return {
        updateAvailable: result.updateInfo.version !== app.getVersion(),
        version: result.updateInfo.version,
      };
    }
    return { updateAvailable: false };
  } catch {
    return { updateAvailable: false };
  }
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate();
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true);
}
```

```yaml
# electron-builder.yml (auto-update configuration)
publish:
  provider: github
  owner: your-github-username
  repo: strat-monitor
  releaseType: release
```

Sources:
- [electron-updater Auto Update](https://www.electron.build/auto-update.html)
- [Implementing Auto-Updates in Electron](https://blog.nishikanta.in/implementing-auto-updates-in-electron-with-electron-updater)
- [Electron Updating Applications](https://www.electronjs.org/docs/latest/tutorial/updates)
- [electron-updater example repo](https://github.com/iffy/electron-updater-example)

---

## 6. Testing Strategy

### Testing Stack

| Layer | Tool | What to Test |
|-------|------|-------------|
| **Unit Tests** | Vitest | Services (claude.ts, database.ts, screenshot.ts), utility functions, Zustand stores |
| **Component Tests** | Vitest + React Testing Library | React components (ChatPanel, MessageBubble, InputBar) |
| **Integration Tests** | Vitest | IPC handler-service integration, database operations |
| **E2E Tests** | Playwright (Electron support) | Full app flows: launch, screenshot capture, chat interaction |

### Unit Testing (Vitest)

Vitest integrates natively with electron-vite since both are Vite-based. Run service-layer tests without spinning up Electron.

```typescript
// src/main/services/__tests__/database.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// Test with in-memory database (no file I/O)
describe('Database Service', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE trades (
        id TEXT PRIMARY KEY,
        ticker TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry REAL NOT NULL,
        stop REAL NOT NULL,
        target REAL NOT NULL,
        notes TEXT DEFAULT '',
        created_at INTEGER NOT NULL
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('should insert and retrieve a trade', () => {
    const stmt = db.prepare(
      'INSERT INTO trades (id, ticker, direction, entry, stop, target, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run('test-1', 'AAPL', 'long', 185.50, 183.00, 190.00, Date.now());

    const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get('test-1');
    expect(trade).toBeDefined();
    expect((trade as any).ticker).toBe('AAPL');
  });
});
```

### Mocking Claude API

```typescript
// src/main/services/__tests__/claude.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: vi.fn().mockReturnValue({
          on: vi.fn().mockReturnThis(),
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'Hello ' },
            };
            yield {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'world!' },
            };
          },
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Hello world!' }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
        }),
      },
    })),
  };
});

describe('Claude Service', () => {
  it('should stream response chunks', async () => {
    // Test streaming logic here
  });
});
```

### E2E Testing with Playwright

```typescript
// e2e/app.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

let electronApp: ElectronApplication;
let chatWindow: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  // Wait for the chat renderer window
  chatWindow = await electronApp.firstWindow();
  await chatWindow.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp.close();
});

test('app launches with correct title', async () => {
  const title = await chatWindow.title();
  expect(title).toContain('Strat Monitor');
});

test('main process is not packaged in dev', async () => {
  const isPackaged = await electronApp.evaluate(async ({ app }) => {
    return app.isPackaged;
  });
  expect(isPackaged).toBe(false);
});

test('can capture a screenshot', async () => {
  // Take a screenshot of the entire app for visual regression
  await chatWindow.screenshot({ path: 'e2e/screenshots/app-launch.png' });
});

test('chat input is visible and functional', async () => {
  const input = chatWindow.locator('[data-testid="chat-input"]');
  await expect(input).toBeVisible();
  await input.fill('Hello');
  await expect(input).toHaveValue('Hello');
});

test('evaluates main process database', async () => {
  const dbPath = await electronApp.evaluate(async ({ app }) => {
    const path = await import('node:path');
    return path.join(app.getPath('userData'), 'strat-monitor.db');
  });
  expect(dbPath).toContain('strat-monitor.db');
});
```

### Testing Configuration

```typescript
// vitest.config.ts (for unit/integration tests)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Main process tests run in Node
    include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/main/services/**', 'src/shared/**'],
    },
  },
});
```

```typescript
// vitest.config.renderer.ts (for React component tests)
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.{ts,tsx}'],
    setupFiles: ['src/renderer/src/test-setup.ts'],
  },
});
```

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
});
```

Sources:
- [Electron Automated Testing](https://www.electronjs.org/docs/latest/tutorial/automated-testing)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
- [electron-playwright-example](https://github.com/spaceagetv/electron-playwright-example)
- [Testing Electron with Playwright + GitHub Actions](https://til.simonwillison.net/electron/testing-electron-playwright)

---

## 7. Build Pipeline

### electron-builder Configuration

```yaml
# electron-builder.yml
appId: com.stratmonitor.app
productName: Strat Monitor
copyright: Copyright 2026

asar: true
asarUnpack:
  - resources/**          # Migrations, static assets
  - node_modules/better-sqlite3/**  # Native module

directories:
  buildResources: build
  output: dist

files:
  - out/**
  - "!out/**/*.map"       # Exclude source maps from production
  - resources/**
  - "!src/**"
  - "!e2e/**"
  - "!.github/**"

# --- macOS ---
mac:
  category: public.app-category.finance
  target:
    - target: dmg
      arch: [universal]   # Both Intel and Apple Silicon
  icon: build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize:
    teamId: YOUR_TEAM_ID  # Apple Developer Team ID

dmg:
  artifactName: "${productName}-${version}-mac.${ext}"
  sign: false             # DMG signing is optional; app inside is signed

# --- Windows ---
win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
  publisherName: Your Name

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
  artifactName: "${productName}-${version}-win-setup.${ext}"

# --- Linux ---
linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: build/icon.png
  category: Finance
  artifactName: "${productName}-${version}-linux.${ext}"

# --- Auto Update ---
publish:
  provider: github
  owner: your-username
  repo: strat-monitor
  releaseType: release

# --- Native module rebuild ---
electronDownload:
  mirror: https://npmmirror.com/mirrors/electron/

npmRebuild: true
```

### macOS Entitlements

```xml
<!-- build/entitlements.mac.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/build.yml
name: Build & Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit

  e2e-test:
    needs: lint-and-test
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: e2e-results-${{ matrix.os }}
          path: e2e/screenshots/
```

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: write  # Needed for creating releases

jobs:
  release:
    strategy:
      matrix:
        include:
          - os: macos-latest
            platform: mac
          - os: windows-latest
            platform: win
          - os: ubuntu-latest
            platform: linux
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      # Build the electron-vite app
      - run: npm run build

      # macOS: Import code signing certificate
      - name: Import macOS signing certificate
        if: matrix.platform == 'mac'
        env:
          MACOS_CERTIFICATE: ${{ secrets.MACOS_CERTIFICATE }}
          MACOS_CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
          MACOS_KEYCHAIN_PASSWORD: ${{ secrets.MACOS_KEYCHAIN_PASSWORD }}
        run: |
          echo "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12
          security create-keychain -p "$MACOS_KEYCHAIN_PASSWORD" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "$MACOS_KEYCHAIN_PASSWORD" build.keychain
          security import certificate.p12 -k build.keychain -P "$MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$MACOS_KEYCHAIN_PASSWORD" build.keychain

      # Build and publish
      - name: Build and publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # macOS notarization
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # Windows signing (if using Azure Trusted Signing)
          # CSC_LINK: ${{ secrets.WIN_CERTIFICATE }}
          # CSC_KEY_PASSWORD: ${{ secrets.WIN_CERTIFICATE_PASSWORD }}
        run: npx electron-builder --${{ matrix.platform }} --publish always
```

Sources:
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [macOS Signing + Notarising via GitHub Actions](https://gist.github.com/maggie44/a689fc01737f6a5fd72868f0f07e3d3e)
- [Signing Electron Apps with GitHub Actions (Simon Willison)](https://til.simonwillison.net/electron/sign-notarize-electron-macos)
- [Electron Builder Action](https://github.com/marketplace/actions/electron-builder-action)
- [Signing Electron Apps (Ship Shape)](https://shipshape.io/blog/signing-electron-apps-with-github-actions/)
- [electron-vite distribution](https://electron-vite.org/guide/distribution)

---

## 8. Dependencies List

### Production Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.74.0",
    "better-sqlite3": "^12.6.2",
    "electron-updater": "^6.7.3",
    "electron-log": "^5.3.0",
    "zustand": "^5.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "lucide-react": "^0.475.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0",
    "class-variance-authority": "^0.7.0"
  }
}
```

### Development Dependencies

```json
{
  "devDependencies": {
    "electron": "^40.4.0",
    "electron-vite": "^5.0.0",
    "electron-builder": "^26.0.0",
    "@electron-toolkit/typed-ipc": "^1.0.0",
    "typescript": "^5.7.0",
    "@vitejs/plugin-react": "^4.4.0",
    "vite": "^6.1.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "jsdom": "^25.0.0",
    "@playwright/test": "^1.52.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "@eslint/js": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "eslint-plugin-react-hooks": "^5.0.0",
    "prettier": "^3.5.0"
  }
}
```

### Key Version Notes

- **Electron 40.x** (Feb 2026): Latest stable, Chromium M144, WebContentsView fully stable.
- **electron-vite 5.x**: Requires Node.js 20.19+ or 22.12+, Vite 5.0+.
- **Tailwind CSS 4.x**: New engine with `@tailwindcss/vite` plugin (no separate PostCSS config needed).
- **React 19.x**: Includes React Compiler (opt-in), improved streaming support.
- **Zustand 5.x**: Drops deprecated APIs, smaller bundle, same API surface.
- **@anthropic-ai/sdk 0.74.x**: Streaming, vision/image support, prompt caching (GA, no beta prefix needed).

---

## 9. Development Workflow

### package.json Scripts

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "start": "electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write 'src/**/*.{ts,tsx}'",
    "test:unit": "vitest run --config vitest.config.ts",
    "test:unit:watch": "vitest --config vitest.config.ts",
    "test:renderer": "vitest run --config vitest.config.renderer.ts",
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test": "npm run test:unit && npm run test:renderer && npm run test:e2e",
    "build:mac": "npm run build && electron-builder --mac --config",
    "build:win": "npm run build && electron-builder --win --config",
    "build:linux": "npm run build && electron-builder --linux --config",
    "postinstall": "electron-builder install-app-deps",
    "rebuild": "electron-rebuild -f -w better-sqlite3"
  }
}
```

### Daily Development Commands

```bash
# Start development (HMR for renderer, hot reload for main/preload)
npm run dev

# Run unit tests in watch mode during development
npm run test:unit:watch

# Type check before committing
npm run typecheck

# Lint and format
npm run lint:fix && npm run format

# Full test suite before PR
npm test

# Build for your platform
npm run build:mac   # macOS
npm run build:win   # Windows
npm run build:linux # Linux

# Preview production build locally
npm run preview
```

### Initial Project Setup (From Scratch)

```bash
# 1. Scaffold the project
npm create @quick-start/electron@latest strat-monitor -- --template react-ts
cd strat-monitor
npm install

# 2. Install Tailwind CSS v4
npm install -D tailwindcss @tailwindcss/vite

# 3. Install shadcn/ui dependencies
npx shadcn@latest init
# When prompted: select Vite framework, use default settings

# 4. Install production dependencies
npm install @anthropic-ai/sdk better-sqlite3 electron-updater electron-log zustand react-markdown remark-gfm lucide-react

# 5. Install dev dependencies
npm install -D @types/better-sqlite3 @playwright/test vitest @testing-library/react @testing-library/jest-dom jsdom

# 6. Install native module support
npm run postinstall

# 7. Rebuild better-sqlite3 for Electron
npm run rebuild

# 8. Add shadcn/ui components
npx shadcn@latest add button input scroll-area separator avatar badge

# 9. Verify everything works
npm run dev
```

### electron.vite.config.ts

```typescript
// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['better-sqlite3'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
```

### Environment Variables

```bash
# .env.example (DO NOT commit .env with real keys)
# API key is stored via safeStorage, not env vars in production.
# These are only for local development convenience.
ANTHROPIC_API_KEY=sk-ant-...   # Only used in dev; production uses safeStorage
```

```typescript
// src/main/index.ts - environment handling
import { is } from '@electron-toolkit/utils';

// In development, optionally read from environment
if (is.dev && process.env.ANTHROPIC_API_KEY) {
  // Store it via safeStorage for consistent access
  storeApiKey('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY);
}
```

---

## 10. Gotchas and Pitfalls

### WebContentsView

1. **No direct inter-view communication.** WebContentsView instances cannot talk to each other. All communication must route through the main process via IPC. This is actually a security benefit since the TradingView view should not have access to your chat data.

2. **setBounds is absolute positioning.** You must manually calculate and set bounds for each view on every resize. There is no built-in flexbox or layout system. Consider debouncing the resize handler.

3. **BaseWindow, not BrowserWindow.** When using WebContentsView, use `BaseWindow` as the parent. `BrowserWindow` still works but is the legacy approach that combines window + a single webContents.

4. **Session isolation matters.** Use `partition: 'persist:tradingview'` for TradingView to keep its cookies separate from your app. The `persist:` prefix ensures cookies survive app restarts.

### TradingView Loading

5. **X-Frame-Options blocking.** TradingView sends `X-Frame-Options: SAMEORIGIN` which prevents loading in WebContentsView. You MUST strip this header using `webRequest.onHeadersReceived` on the TradingView session. The stripping must be case-insensitive.

6. **TradingView may detect embedding.** Some features of TradingView might detect non-standard browser environments. Test thoroughly. Consider using the TradingView widget library as an alternative if direct site loading proves problematic.

7. **User-Agent matters.** TradingView may serve different content based on User-Agent. The default Electron User-Agent includes "Electron" which some sites block. You can override it per session.

### better-sqlite3 (Native Module)

8. **Must be rebuilt for Electron.** Run `npx electron-rebuild -f -w better-sqlite3` after install. The `postinstall` script handles this automatically.

9. **Must be externalized in Vite config.** Add `external: ['better-sqlite3']` in rollupOptions for the main process config. Vite will try to bundle it otherwise, causing runtime errors.

10. **Must be unpacked from ASAR.** In `electron-builder.yml`, add `asarUnpack: node_modules/better-sqlite3/**` so the native `.node` binary is accessible at runtime.

11. **Migrations in packaged app.** Migration `.sql` files must be in `resources/` (not `src/`), and you must use `process.resourcesPath` in production to find them. Path resolution differs between development and packaged app.

### Claude API

12. **Streaming requires careful IPC design.** The Claude API streams tokens, but IPC messages are async. Use `webContents.send()` from the main process to push stream chunks to the renderer, not `ipcMain.handle()` return values.

13. **Image size affects costs.** Claude processes images at specific resolutions. Images larger than 1568px on any side are resized. Pre-resize screenshots to avoid paying for tokens that are discarded anyway.

14. **Prompt caching minimum size.** Caching requires at least 1,024 tokens for Sonnet 4.5. If your system prompt is shorter than this, it will not be cached even with `cache_control` set.

15. **Conversation history grows unbounded.** Implement conversation trimming or summarisation for long sessions. Claude's context window is large but has limits, and costs grow linearly with input tokens.

### Security

16. **Never expose raw ipcRenderer.** Always wrap IPC calls in specific functions in the preload script. Exposing `ipcRenderer.invoke` directly lets the renderer send arbitrary IPC messages.

17. **Validate every IPC sender.** Check `event.sender.id` matches your expected webContents. The TradingView view's webContents could theoretically send IPC messages if it somehow gets access.

18. **safeStorage availability.** On Linux without a keychain (e.g., headless environments), `safeStorage` falls back to hardcoded encryption. Check `safeStorage.isEncryptionAvailable()` and `getSelectedStorageBackend()` on Linux.

19. **API keys in memory.** Even with safeStorage, the decrypted API key exists in Node.js memory while the app runs. There is no perfect solution for this in desktop apps. Minimise the time keys are held in variables.

### Build and Distribution

20. **macOS notarization requires Apple Developer account.** You need a paid Apple Developer account ($99/year) and must set up app-specific passwords. Without notarization, users get Gatekeeper warnings.

21. **Windows code signing is expensive.** EV certificates cost several hundred dollars per year. Azure Trusted Signing (available to US/Canada businesses with 3+ years history) is a newer alternative.

22. **Universal macOS builds are large.** Building `arch: [universal]` produces a fat binary for both Intel and Apple Silicon. If size matters, build separate `x64` and `arm64` binaries.

23. **GitHub Actions macOS runners.** Use `macos-latest` (which is ARM64) for building. If you need Intel builds, specify `macos-13` explicitly.

### Development

24. **electron-vite output directory.** Default is `out/`, which may conflict with Electron Forge (also uses `out/`). electron-builder uses `dist/` for packaged output. Keep these separate.

25. **HMR for renderer, hot reload for main.** Renderer changes are instant (Vite HMR). Main process changes require a full app restart (hot reload). Preload changes also restart. Structure code to minimise main process changes during UI development.

26. **TypeScript paths must match.** The `@/` alias must be configured in three places: `electron.vite.config.ts` (resolve.alias), `tsconfig.web.json` (paths), and `components.json` (shadcn/ui). Mismatches cause confusing module resolution errors.

Sources:
- [WebContentsView API](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron webContents documentation](https://www.electronjs.org/docs/latest/api/web-contents)
- [X-Frame-Options stripping patterns](https://gist.github.com/jangnezda/50855df0afb3853640510b697ca38255ec6bd282)
- [electron-vite C/C++ Addons (native modules)](https://electron-vite.github.io/guide/cpp-addons.html)
- [electron-vite dev guide](https://electron-vite.org/guide/dev)
- [Electron Releases](https://releases.electronjs.org/)
- [electron-builder NSIS configuration](https://www.electron.build/nsis.html)

---

## Appendix A: Complete electron.vite.config.ts Reference

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  // Main process configuration
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        external: ['better-sqlite3'], // Native modules must be external
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },

  // Preload script configuration
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },

  // Renderer (React) configuration
  renderer: {
    root: resolve('src/renderer'),
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
```

## Appendix B: Main Process Entry Point

```typescript
// src/main/index.ts
import { app, BaseWindow } from 'electron';
import { createMainWindow } from './window';
import { registerAllIpcHandlers } from './ipc';
import { initDatabase, closeDatabase } from './services/database';
import { initAutoUpdater } from './services/updater';

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) app.quit();

app.whenReady().then(() => {
  // Initialise database before creating windows
  initDatabase();

  // Register all IPC handlers
  registerAllIpcHandlers();

  // Create the main window with split-pane layout
  createMainWindow();

  // Initialise auto-updater (only in production)
  if (app.isPackaged) {
    initAutoUpdater();
  }

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BaseWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    const { shell } = require('electron');
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
});
```

---

*This research document was compiled on 2026-02-13. Technology versions and best practices may evolve. Always check official documentation for the latest guidance.*
