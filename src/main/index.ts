/**
 * Main process entry point for The Strat Coach
 * Handles app lifecycle, security, and window initialization
 */

import { app, shell, BrowserWindow, protocol, net } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMainWindow } from './window';
import { registerIpcHandlers, cleanupIpcResources } from './ipc';

const __dirname = join(fileURLToPath(import.meta.url), '..');

// Register app:// as a privileged scheme BEFORE app.whenReady()
// This allows the renderer to load via app://localhost in production,
// giving Clerk a valid HTTPS-like origin instead of file://
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

// Note: electron-squirrel-startup can be added later for Windows auto-update support
// if (require('electron-squirrel-startup')) app.quit();

// Set app name for userData path
app.setName('The Strat Coach');

// Log userData path to verify persistence location
console.log('[Main] userData path:', app.getPath('userData'));
console.log('[Main] App version:', app.getVersion());
console.log('[Main] App name:', app.getName());

/**
 * Hosts allowed for navigation across the app.
 * OAuth providers must be listed here so popup windows can complete login flows.
 */
const ALLOWED_NAVIGATION_HOSTS = [
  'localhost',
  '127.0.0.1',
  // Clerk auth domain
  'clerk.com',
  'accounts.clerk.com',
  'clerk.accounts.dev',
  // TradingView
  'www.tradingview.com',
  'tradingview.com',
  // Google OAuth (accounts.google.com redirects through several subdomains)
  'accounts.google.com',
  'accounts.youtube.com',
  'myaccount.google.com',
  'www.google.com',
  'oauth-redirect.googleusercontent.com',
  'content.googleapis.com',
  'www.googleapis.com',
  'ssl.gstatic.com',
  // Apple OAuth
  'appleid.apple.com',
  // Facebook OAuth
  'www.facebook.com',
  'facebook.com',
  'm.facebook.com',
  // Yahoo OAuth (TradingView supports Yahoo sign-in)
  'login.yahoo.com',
  'api.login.yahoo.com',
];

/**
 * Security: Prevent navigation to untrusted URLs and control window creation.
 *
 * IMPORTANT: The `will-navigate` handler fires for ALL webContents in the app,
 * including child/popup BrowserWindows created via setWindowOpenHandler.
 * OAuth provider hosts MUST be in ALLOWED_NAVIGATION_HOSTS or their redirects
 * will be blocked.
 *
 * NOTE on setWindowOpenHandler: The global handler set here acts as a default.
 * Individual webContents (e.g. the TradingView view in window.ts) can overwrite
 * it by calling setWindowOpenHandler() again after construction. The last call wins.
 */
function setupNavigationGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Prevent navigation to external URLs
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);

        // Allow navigation if host is in allowlist or is a Clerk subdomain
      const isAllowed =
        ALLOWED_NAVIGATION_HOSTS.includes(parsedUrl.hostname) ||
        parsedUrl.hostname.endsWith('.clerk.accounts.dev') ||
        parsedUrl.hostname.endsWith('.clerk.com') ||
        parsedUrl.hostname.endsWith('.accounts.dev');

      if (!isAllowed) {
        console.warn(`[Security] Blocked navigation to: ${navigationUrl}`);
        event.preventDefault();
      }
    });

    // Default: deny new windows and open external links in system browser.
    // The TradingView view overwrites this in window.ts to allow OAuth popups.
    contents.setWindowOpenHandler(({ url }) => {
      // Open https links in external browser
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url).catch(err => {
          console.error('[Security] Failed to open external URL:', err);
        });
      }

      // Deny creating new windows
      return { action: 'deny' };
    });
  });
}

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  // Set up security handlers before any windows are created
  setupNavigationGuards();

  // In production, serve renderer files via app:// so Clerk sees a valid origin
  if (process.env.NODE_ENV !== 'development' && !process.env.VITE_DEV_SERVER_URL) {
    protocol.handle('app', (request) => {
      const url = new URL(request.url);
      let filePath = url.pathname;
      // Default to index.html for SPA routes
      if (filePath === '/' || filePath === '') {
        filePath = '/index.html';
      }
      const fullPath = join(__dirname, '../renderer' + filePath);
      return net.fetch('file://' + fullPath);
    });
  }

  // Register all IPC handlers
  registerIpcHandlers();

  // Create the main window
  await createMainWindow();
}

/**
 * App lifecycle events
 */

// Called when Electron has finished initialization
app.whenReady().then(() => {
  initialize().catch(err => {
    console.error('[Main] Failed to initialize app:', err);
    app.quit();
  });

  // On macOS, re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (!app.isReady()) return;

    // Check if any windows are open
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length === 0) {
      createMainWindow().catch(err => {
        console.error('[Main] Failed to create window on activate:', err);
      });
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app termination
app.on('before-quit', () => {
  // Close database connections and cleanup resources
  cleanupIpcResources();
});

// Prevent multiple instances (optional - can be enabled later)
// const gotTheLock = app.requestSingleInstanceLock();
// if (!gotTheLock) {
//   app.quit();
// } else {
//   app.on('second-instance', () => {
//     // Focus the main window if user tries to open another instance
//     const mainWindow = getMainWindow();
//     if (mainWindow) {
//       if (mainWindow.isMinimized()) mainWindow.restore();
//       mainWindow.focus();
//     }
//   });
// }
