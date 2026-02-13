/**
 * IPC handler registration system
 * Central registration of all IPC channels with sender validation
 */

import { ipcMain, WebContents, app } from 'electron';
import type {
  ChatSendMessageRequest,
  CreateTradeRequest,
  UpdateTradeRequest,
  ListTradesRequest,
  CreateConversationRequest,
  GetMessagesRequest,
  CaptureScreenshotRequest,
  UpdateSettingsRequest,
  SetSplitRatioRequest,
} from '@shared/ipc-types';
import { IPC_CHANNELS } from '@shared/ipc-types';
import { setSplitRatio, getSplitRatio, getMainWindow } from '../window';

/**
 * Validate that IPC messages come from our renderer, not TradingView
 */
function validateSender(webContents: WebContents): boolean {
  try {
    const url = new URL(webContents.getURL());

    // In development, renderer runs on localhost
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true;
    }

    // In production, renderer uses file:// protocol
    if (url.protocol === 'file:') {
      return true;
    }

    // Block all other origins (including TradingView)
    return false;
  } catch (error) {
    console.error('[IPC] Invalid sender URL:', error);
    return false;
  }
}

/**
 * Wrapper for IPC handlers with sender validation
 */
function handleWithValidation<T, R>(
  channel: string,
  handler: (arg: T) => Promise<R> | R
): void {
  ipcMain.handle(channel, async (event, arg: T) => {
    // Validate sender
    if (!validateSender(event.sender)) {
      const senderUrl = event.sender.getURL();
      console.error(`[IPC] Unauthorized sender for ${channel}: ${senderUrl}`);
      throw new Error('Unauthorized IPC sender');
    }

    try {
      return await handler(arg);
    } catch (error) {
      console.error(`[IPC] Handler error for ${channel}:`, error);
      throw error;
    }
  });
}

/**
 * Register all IPC handlers
 * Stub implementations will be replaced in later epics
 */
export function registerIpcHandlers(): void {

  // ============================================================
  // Chat & Claude API (Epic 4)
  // ============================================================
  handleWithValidation<ChatSendMessageRequest, void>(
    IPC_CHANNELS.CHAT_SEND_MESSAGE,
    async (_request) => {
      // TODO: Epic 4 - Implement Claude API integration
      throw new Error('Chat API not yet implemented (Epic 4)');
    }
  );

  // ============================================================
  // Database - Trades (Epic 3)
  // ============================================================
  handleWithValidation<CreateTradeRequest, unknown>(
    IPC_CHANNELS.DB_CREATE_TRADE,
    async (_request) => {
      // TODO: Epic 3 - Implement database
      throw new Error('Database not yet implemented (Epic 3)');
    }
  );

  handleWithValidation<UpdateTradeRequest, unknown>(
    IPC_CHANNELS.DB_UPDATE_TRADE,
    async (_request) => {
      throw new Error('Database not yet implemented (Epic 3)');
    }
  );

  handleWithValidation<string, unknown>(IPC_CHANNELS.DB_GET_TRADE, async (_id) => {
    throw new Error('Database not yet implemented (Epic 3)');
  });

  handleWithValidation<ListTradesRequest | undefined, unknown>(
    IPC_CHANNELS.DB_LIST_TRADES,
    async (_request) => {
      return { trades: [], total: 0 };
    }
  );

  handleWithValidation<string, void>(IPC_CHANNELS.DB_DELETE_TRADE, async (_id) => {
    throw new Error('Database not yet implemented (Epic 3)');
  });

  // ============================================================
  // Database - Conversations (Epic 3)
  // ============================================================
  handleWithValidation<CreateConversationRequest, unknown>(
    IPC_CHANNELS.DB_CREATE_CONVERSATION,
    async (_request) => {
      throw new Error('Database not yet implemented (Epic 3)');
    }
  );

  handleWithValidation<string, unknown>(IPC_CHANNELS.DB_GET_CONVERSATION, async (_id) => {
    throw new Error('Database not yet implemented (Epic 3)');
  });

  handleWithValidation<void, unknown[]>(
    IPC_CHANNELS.DB_LIST_CONVERSATIONS,
    async () => {
      return [];
    }
  );

  handleWithValidation<string, void>(
    IPC_CHANNELS.DB_DELETE_CONVERSATION,
    async (_id) => {
      throw new Error('Database not yet implemented (Epic 3)');
    }
  );

  // ============================================================
  // Database - Messages (Epic 3)
  // ============================================================
  handleWithValidation<unknown, unknown>(IPC_CHANNELS.DB_CREATE_MESSAGE, async (_message) => {
    throw new Error('Database not yet implemented (Epic 3)');
  });

  handleWithValidation<GetMessagesRequest, unknown>(
    IPC_CHANNELS.DB_GET_MESSAGES,
    async (_request) => {
      return { messages: [], total: 0 };
    }
  );

  // ============================================================
  // Screenshot (Epic 5)
  // ============================================================
  handleWithValidation<CaptureScreenshotRequest | undefined, unknown>(
    IPC_CHANNELS.SCREENSHOT_CAPTURE,
    async (_request) => {
      // TODO: Epic 5 - Implement screenshot capture
      throw new Error('Screenshot capture not yet implemented (Epic 5)');
    }
  );

  // ============================================================
  // Settings (Epic 4)
  // ============================================================
  handleWithValidation<void, unknown>(IPC_CHANNELS.SETTINGS_GET, async () => {
    // TODO: Epic 4 - Load from persistent storage
    return {
      apiKey: null,
      splitRatio: getSplitRatio(),
      theme: 'dark',
      autoSaveConversations: true,
      defaultTimeframe: '1D',
    };
  });

  handleWithValidation<UpdateSettingsRequest, unknown>(
    IPC_CHANNELS.SETTINGS_UPDATE,
    async (request) => {
      // TODO: Epic 4 - Save to persistent storage

      // Handle split ratio changes immediately
      if (request.splitRatio !== undefined) {
        setSplitRatio(request.splitRatio);
      }

      return {
        apiKey: null,
        splitRatio: getSplitRatio(),
        theme: request.theme || 'dark',
        autoSaveConversations: request.autoSaveConversations ?? true,
        defaultTimeframe: request.defaultTimeframe || '1D',
      };
    }
  );

  handleWithValidation<string, void>(IPC_CHANNELS.SETTINGS_SET_API_KEY, async (_apiKey) => {
    // TODO: Epic 4 - Implement secure storage with safeStorage
    throw new Error('Secure storage not yet implemented (Epic 4)');
  });

  handleWithValidation<void, unknown>(
    IPC_CHANNELS.SETTINGS_GET_API_KEY_STATUS,
    async () => {
      // TODO: Epic 4 - Check if API key exists and is valid
      return { hasKey: false };
    }
  );

  // ============================================================
  // Window
  // ============================================================
  handleWithValidation<SetSplitRatioRequest, void>(
    IPC_CHANNELS.WINDOW_SET_SPLIT_RATIO,
    async (request) => {
      setSplitRatio(request.ratio);
    }
  );

  handleWithValidation<void, unknown>(IPC_CHANNELS.WINDOW_GET_BOUNDS, async () => {
    const window = getMainWindow();
    if (!window) {
      throw new Error('Main window not initialized');
    }
    const bounds = window.getBounds();
    return bounds;
  });

  // ============================================================
  // System
  // ============================================================
  handleWithValidation<void, string>(IPC_CHANNELS.APP_GET_VERSION, async () => {
    return app.getVersion();
  });

  // Note: APP_QUIT uses ipcMain.on (not handle) since it doesn't return a value
  ipcMain.on(IPC_CHANNELS.APP_QUIT, (event) => {
    if (!validateSender(event.sender)) {
      console.error('[IPC] Unauthorized quit attempt');
      return;
    }
    app.quit();
  });
}

/**
 * Unregister all IPC handlers (for cleanup or testing)
 */
export function unregisterIpcHandlers(): void {
  // Remove all listeners for our channels
  Object.values(IPC_CHANNELS).forEach(channel => {
    ipcMain.removeHandler(channel);
  });
}
