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
  ListTradesResponse,
  CreateConversationRequest,
  GetMessagesRequest,
  GetMessagesResponse,
  CaptureScreenshotRequest,
  UpdateSettingsRequest,
  SetSplitRatioRequest,
} from '@shared/ipc-types';
import { IPC_CHANNELS } from '@shared/ipc-types';
import { setSplitRatio, getSplitRatio, getMainWindow } from '../window';
import { DatabaseService } from '../services/database';
import type { Trade, Conversation, Message } from '@shared/models';

// Singleton database instance
let db: DatabaseService | null = null;

/**
 * Get or create the database service instance
 */
function getDatabase(): DatabaseService {
  if (!db) {
    db = new DatabaseService();
  }
  return db;
}

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
  handleWithValidation<CreateTradeRequest, Trade>(
    IPC_CHANNELS.DB_CREATE_TRADE,
    async (request) => {
      const database = getDatabase();
      const trade = database.createTrade({
        ticker: request.ticker,
        direction: request.direction,
        entry: request.entry,
        exit: undefined,
        stopLoss: request.stopLoss,
        takeProfit: request.takeProfit,
        quantity: request.quantity,
        notes: request.notes,
        screenshotPath: request.screenshotPath,
        stratSetup: request.stratSetup,
        timeframe: request.timeframe,
        entryTimestamp: Date.now(),
        exitTimestamp: undefined,
        pnl: undefined,
      });
      return trade;
    }
  );

  handleWithValidation<UpdateTradeRequest, Trade>(
    IPC_CHANNELS.DB_UPDATE_TRADE,
    async (request) => {
      const database = getDatabase();
      const updated = database.updateTrade(request.id, {
        exit: request.exit,
        notes: request.notes,
        pnl: request.pnl,
        exitTimestamp: request.exit ? Date.now() : undefined,
      });
      return updated;
    }
  );

  handleWithValidation<string, Trade | null>(IPC_CHANNELS.DB_GET_TRADE, async (id) => {
    const database = getDatabase();
    return database.getTrade(id);
  });

  handleWithValidation<ListTradesRequest | undefined, ListTradesResponse>(
    IPC_CHANNELS.DB_LIST_TRADES,
    async (request) => {
      const database = getDatabase();
      const limit = request?.limit ?? 100;
      const offset = request?.offset ?? 0;

      const trades = database.listTrades(limit, offset);

      // TODO: Implement ticker filtering if needed
      // For now, return all trades
      return { trades, total: trades.length };
    }
  );

  handleWithValidation<string, void>(IPC_CHANNELS.DB_DELETE_TRADE, async (id) => {
    const database = getDatabase();
    database.deleteTrade(id);
  });

  // ============================================================
  // Database - Conversations (Epic 3)
  // ============================================================
  handleWithValidation<CreateConversationRequest, Conversation>(
    IPC_CHANNELS.DB_CREATE_CONVERSATION,
    async (request) => {
      const database = getDatabase();
      const conversation = database.createConversation({
        title: request.title,
        tradeId: request.tradeId,
      });
      return conversation;
    }
  );

  handleWithValidation<string, Conversation | null>(
    IPC_CHANNELS.DB_GET_CONVERSATION,
    async (id) => {
      const database = getDatabase();
      return database.getConversation(id);
    }
  );

  handleWithValidation<void, Conversation[]>(
    IPC_CHANNELS.DB_LIST_CONVERSATIONS,
    async () => {
      const database = getDatabase();
      return database.listConversations();
    }
  );

  handleWithValidation<string, void>(
    IPC_CHANNELS.DB_DELETE_CONVERSATION,
    async (id) => {
      const database = getDatabase();
      database.deleteConversation(id);
    }
  );

  // ============================================================
  // Database - Messages (Epic 3)
  // ============================================================
  handleWithValidation<Omit<Message, 'id' | 'createdAt'>, Message>(
    IPC_CHANNELS.DB_CREATE_MESSAGE,
    async (message) => {
      const database = getDatabase();
      return database.createMessage(message);
    }
  );

  handleWithValidation<GetMessagesRequest, GetMessagesResponse>(
    IPC_CHANNELS.DB_GET_MESSAGES,
    async (request) => {
      const database = getDatabase();
      const limit = request.limit ?? 100;
      const offset = request.offset ?? 0;

      const messages = database.listMessages(request.conversationId, limit, offset);

      return { messages, total: messages.length };
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

/**
 * Clean up resources (call on app quit)
 */
export function cleanupIpcResources(): void {
  if (db) {
    db.close();
    db = null;
  }
}
