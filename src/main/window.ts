/**
 * Window manager for The Strat Coach
 * Creates BaseWindow with split-pane layout using WebContentsView
 */

import { BaseWindow, WebContentsView, session, screen, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ES module equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BaseWindow | null = null;
let tradingViewView: WebContentsView | null = null;
let chatView: WebContentsView | null = null;
let dividerView: WebContentsView | null = null;

// Split ratio: percentage of width allocated to TradingView (default 60%)
let splitRatio = 0.6;

// Divider dimensions and constraints
const DIVIDER_WIDTH = 4; // Width of the draggable divider in pixels
const FIXED_CHAT_WIDTH = 400; // Fixed width for chat panel
const MIN_TV_WIDTH = 400; // Minimum width for TradingView panel
let isDragging = false;

/**
 * Set up TradingView session to:
 * 1. Strip X-Frame-Options (allows embedding)
 * 2. Remove "Electron" from user agent (allows Google OAuth)
 */
function setupTradingViewSession(): void {
  const tvSession = session.fromPartition('persist:tradingview');

  // Log session info for debugging persistence
  console.log('[TradingView] Session partition: persist:tradingview');
  console.log('[TradingView] Session storage path:', tvSession.getStoragePath());

  // Check if cookies exist (will log count asynchronously)
  tvSession.cookies.get({}).then(cookies => {
    console.log(`[TradingView] Found ${cookies.length} existing cookies in session`);
    if (cookies.length > 0) {
      console.log('[TradingView] Sample cookies:', cookies.slice(0, 3).map(c => c.name));
    }
  }).catch(err => {
    console.error('[TradingView] Failed to read cookies:', err);
  });

  // CRITICAL: Strip "Electron" and app name from user agent so Google OAuth works
  // Google blocks OAuth when it detects "Electron" in the user agent string
  const defaultUA = tvSession.getUserAgent();
  const cleanUA = defaultUA
    .replace(/\s*Electron\/[\d.]+/g, '')
    .replace(/\s*TheStratCoach\/[\d.]+/g, '')
    .replace(/\s*the-strat-coach\/[\d.]+/g, '')
    .trim();

  console.log('[TradingView] Setting clean user agent (removed Electron keyword)');
  console.log('[TradingView] Old UA:', defaultUA);
  console.log('[TradingView] New UA:', cleanUA);

  tvSession.setUserAgent(cleanUA);

  // Strip X-Frame-Options headers that prevent embedding
  tvSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };

    // Remove X-Frame-Options (case-insensitive)
    Object.keys(responseHeaders)
      .filter(key => /x-frame-options/i.test(key))
      .forEach(key => {
        delete responseHeaders[key];
      });

    // Remove restrictive CSP frame-ancestors directives
    Object.keys(responseHeaders)
      .filter(key => /content-security-policy/i.test(key))
      .forEach(key => {
        if (responseHeaders[key]) {
          responseHeaders[key] = responseHeaders[key].map((policy: string) =>
            policy.replace(/frame-ancestors[^;]*(;|$)/gi, '')
          );
        }
      });

    callback({ responseHeaders });
  });
}

/**
 * Update the layout of both views based on current window size
 * Chat panel is fixed at 400px, TradingView takes remaining space
 */
function updateLayout(): void {
  if (!mainWindow || !tradingViewView || !chatView || !dividerView) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const { width, height } = bounds;

  // Account for title bar height
  // macOS default titleBarStyle adds ~22px title bar
  // NOTE: This is the window.getBounds() height, which includes the title bar
  // but contentView needs to account for it
  const titleBarHeight = process.platform === 'darwin' ? 22 : 0;

  // Fixed chat width on the right
  const chatWidth = FIXED_CHAT_WIDTH;
  const chatX = width - chatWidth;
  const dividerX = chatX - DIVIDER_WIDTH;
  const tvWidth = dividerX;

  // Position TradingView on the left (takes remaining space)
  tradingViewView.setBounds({
    x: 0,
    y: titleBarHeight,
    width: tvWidth,
    height: height - titleBarHeight,
  });

  // Position divider before chat
  dividerView.setBounds({
    x: dividerX,
    y: titleBarHeight,
    width: DIVIDER_WIDTH,
    height: height - titleBarHeight,
  });

  // Position Chat on the right (fixed 400px)
  chatView.setBounds({
    x: chatX,
    y: titleBarHeight,
    width: chatWidth,
    height: height - titleBarHeight,
  });
}

/**
 * Create the main application window with split-pane layout
 */
export async function createMainWindow(): Promise<BaseWindow> {
  // Set up TradingView session before creating views
  setupTradingViewSession();

  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Create main window (BaseWindow = frameless container)
  mainWindow = new BaseWindow({
    width: Math.min(1400, Math.round(width * 0.9)),
    height: Math.min(900, Math.round(height * 0.9)),
    minWidth: 800,
    minHeight: 600,
    show: false, // Don't show until ready
    backgroundColor: '#1a1a1a', // Dark background for less flash
    title: 'The Strat Coach',
    // Use native title bar for now (can be customized later)
    titleBarStyle: 'default',
  });

  // Create TradingView WebContentsView (left pane)
  tradingViewView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/tradingview.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: 'persist:tradingview', // Persistent session for login cookies
    },
  });

  // Handle OAuth popups (Google login, etc.)
  tradingViewView.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[TradingView] Window open request:', url);

    // Check if this is an OAuth-related popup
    const isOAuthPopup =
      url.includes('accounts.google.com') ||
      url.includes('appleid.apple.com') ||
      url.includes('facebook.com/login') ||
      url.includes('oauth') ||
      url.includes('signin') ||
      url.includes('login') ||
      url.includes('tradingview.com');

    if (isOAuthPopup) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 700,
          title: 'Sign In',
          webPreferences: {
            partition: 'persist:tradingview', // CRITICAL: Share session for cookies
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // Disable sandbox for OAuth to work
            webSecurity: false, // Disable webSecurity to prevent navigation blocking
          },
        },
      };
    }

    // For external links (not sign-in), open in system browser
    if (url.startsWith('http') && !url.includes('tradingview.com')) {
      console.log('[TradingView] Opening external link in system browser:', url);
      return { action: 'deny' };
    }

    // Block everything else
    console.log('[TradingView] Blocking popup:', url);
    return { action: 'deny' };
  });

  // Handle OAuth popup lifecycle
  tradingViewView.webContents.on('did-create-window', (childWindow) => {
    console.log('[TradingView] OAuth popup window created');

    // CRITICAL: Set clean user agent on popup too (Google checks this!)
    const tvSession = session.fromPartition('persist:tradingview');
    const cleanUA = tvSession.getUserAgent(); // Already cleaned in setupTradingViewSession
    childWindow.webContents.setUserAgent(cleanUA);
    console.log('[TradingView] Popup user agent set to:', cleanUA);

    // Log when popup finishes loading
    childWindow.webContents.on('did-finish-load', () => {
      const url = childWindow.webContents.getURL();
      console.log('[TradingView] Popup loaded:', url);
    });

    // When popup closes, check if user is now authenticated
    childWindow.on('closed', () => {
      console.log('[TradingView] OAuth popup closed');

      // Give cookies time to settle, then check auth state
      setTimeout(() => {
        if (!tradingViewView) return;

        tradingViewView.webContents
          .executeJavaScript(`
            // Check if user menu exists (indicates logged in)
            !!document.querySelector('[data-name="base-user-menu"]') ||
            !!document.querySelector('.tv-header__user-menu-button') ||
            !!document.querySelector('[class*="userMenu"]')
          `)
          .then((isLoggedIn) => {
            if (isLoggedIn) {
              console.log('[TradingView] ✓ User authenticated successfully!');
            } else {
              console.log('[TradingView] User not authenticated yet');
            }
          })
          .catch(() => {
            // Ignore errors - page might not be ready
          });
      }, 1000);
    });
  });

  // Create Chat WebContentsView (right pane)
  chatView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      // Uses default session
    },
  });

  // Create Divider WebContentsView (resizable divider between panes)
  dividerView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../preload/divider.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Load divider HTML inline (static divider - not draggable)
  const dividerHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 100%;
            height: 100vh;
            cursor: default;
            background-color: #333;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            -webkit-user-select: none;
            -webkit-app-region: no-drag;
          }
        </style>
      </head>
      <body></body>
    </html>
  `;

  dividerView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(dividerHTML)}`);

  // Add views to window (divider on top for proper z-index)
  mainWindow.contentView.addChildView(tradingViewView);
  mainWindow.contentView.addChildView(chatView);
  mainWindow.contentView.addChildView(dividerView);

  // Load TradingView (users will log in manually)
  tradingViewView.webContents.loadURL('https://www.tradingview.com/chart/');

  // Load Chat renderer
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    // Development: load from Vite dev server
    const viteDevUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    console.warn('[Window] Loading chat renderer from:', viteDevUrl);

    // Capture renderer console output to terminal
    chatView.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const prefix = '[Renderer Console]';
      const location = sourceId ? `${sourceId}:${line}` : '';
      if (level === 1) { // warning
        console.warn(`${prefix} WARN ${location}:`, message);
      } else if (level === 2) { // error
        console.error(`${prefix} ERROR ${location}:`, message);
      } else {
        console.warn(`${prefix} ${location}:`, message);
      }
    });

    // Log any load failures
    chatView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('[Window] Chat renderer failed to load:', errorCode, errorDescription, validatedURL);
    });

    // Log when page finishes loading
    chatView.webContents.on('did-finish-load', () => {
      console.warn('[Window] Chat renderer loaded successfully');
    });

    await chatView.webContents.loadURL(viteDevUrl);

    // Open DevTools in development
    chatView.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load from built files
    await chatView.webContents.loadFile(
      path.join(__dirname, '../renderer/index.html')
    );
  }

  // Apply initial layout
  updateLayout();

  // Re-layout on window resize
  mainWindow.on('resize', () => {
    updateLayout();
  });

  // Show window after layout is applied
  // BaseWindow doesn't have 'ready-to-show' event (that's BrowserWindow only)
  mainWindow.show();

  // Clean up references when window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    tradingViewView = null;
    chatView = null;
    dividerView = null;
  });

  // Divider drag handlers disabled - chat is now fixed at 400px
  // If you want to re-enable resizing, uncomment the handlers below

  // const handleDividerDrag = (_event: Electron.IpcMainEvent, screenX: number) => {
  //   // Drag logic here
  // };

  // const handleDividerDragEnd = () => {
  //   console.log('[Divider] Drag ended');
  // };

  // ipcMain.on('divider:drag', handleDividerDrag);
  // ipcMain.on('divider:drag-end', handleDividerDragEnd);

  return mainWindow;
}

/**
 * Set the split ratio (0.0 - 1.0)
 * @param ratio - Percentage of width for TradingView (clamped to 0.3 - 0.8)
 */
export function setSplitRatio(ratio: number): void {
  // Clamp between 30% and 80% for usability
  splitRatio = Math.max(0.3, Math.min(0.8, ratio));
  updateLayout();
}

/**
 * Get current split ratio
 */
export function getSplitRatio(): number {
  return splitRatio;
}

/**
 * Export getters for other modules to access views
 */
export function getMainWindow(): BaseWindow | null {
  return mainWindow;
}

export function getTradingViewView(): WebContentsView | null {
  return tradingViewView;
}

export function getChatView(): WebContentsView | null {
  return chatView;
}
