/**
 * Window manager for STRAT Monitor
 * Creates BaseWindow with split-pane layout using WebContentsView
 */

import { BaseWindow, WebContentsView, session, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ES module equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BaseWindow | null = null;
let tradingViewView: WebContentsView | null = null;
let chatView: WebContentsView | null = null;

// Split ratio: percentage of width allocated to TradingView (default 60%)
let splitRatio = 0.6;

/**
 * Set up TradingView session to strip X-Frame-Options
 * This allows embedding TradingView in a WebContentsView
 */
function setupTradingViewSession(): void {
  const tvSession = session.fromPartition('persist:tradingview');

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
 * Update the layout of both views based on current window size and split ratio
 */
function updateLayout(): void {
  if (!mainWindow || !tradingViewView || !chatView) {
    return;
  }

  const bounds = mainWindow.getBounds();
  const { width, height } = bounds;

  // Account for title bar height (0 for frameless, ~30 for native title bar)
  const titleBarHeight = 0;

  // Calculate widths based on split ratio
  const tvWidth = Math.round(width * splitRatio);
  const chatWidth = width - tvWidth;

  // Position TradingView on the left
  tradingViewView.setBounds({
    x: 0,
    y: titleBarHeight,
    width: tvWidth,
    height: height - titleBarHeight,
  });

  // Position Chat on the right
  chatView.setBounds({
    x: tvWidth,
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
    title: 'STRAT Monitor',
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

  // Add views to window
  mainWindow.contentView.addChildView(tradingViewView);
  mainWindow.contentView.addChildView(chatView);

  // Load TradingView (users will log in manually)
  tradingViewView.webContents.loadURL('https://www.tradingview.com/chart/');

  // Load Chat renderer
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    // Development: load from Vite dev server
    const viteDevUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
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
  });

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
