/**
 * Main process entry point for STRAT Monitor
 * Handles app lifecycle, security, and window initialization
 */

import { app, shell, BrowserWindow } from 'electron';
import { createMainWindow } from './window';
import { registerIpcHandlers } from './ipc';

// Note: electron-squirrel-startup can be added later for Windows auto-update support
// if (require('electron-squirrel-startup')) app.quit();

// Set app name for userData path
app.setName('STRAT Monitor');

/**
 * Security: Prevent navigation to untrusted URLs
 */
function setupNavigationGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Prevent navigation to external URLs
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);

      // Allowed hosts for navigation
      const allowedHosts = [
        'localhost',
        '127.0.0.1',
        'www.tradingview.com',
        'tradingview.com',
      ];

      // Allow navigation if host is in allowlist
      if (!allowedHosts.includes(parsedUrl.hostname)) {
        console.warn(`[Security] Blocked navigation to: ${navigationUrl}`);
        event.preventDefault();
      }
    });

    // Prevent opening new windows (open external links in default browser)
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
  // Cleanup will be added in future epics (close DB connections, etc.)
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
