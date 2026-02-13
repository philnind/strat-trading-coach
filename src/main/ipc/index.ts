/**
 * IPC handler registration system
 * Central registration of all IPC channels with sender validation
 */

import { ipcMain, WebContents, app } from 'electron';
import type {
  ChatSendMessageRequest,
  ChatMessageChunk,
  ChatMessageComplete,
  ChatMessageError,
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
import { setSplitRatio, getSplitRatio, getMainWindow, getChatView } from '../window';
import { DatabaseService } from '../services/database';
import { ClaudeService } from '../services/claude';
import { SecureStoreService } from '../services/secure-store';
import { ScreenshotService } from '../services/screenshot';
import type { Trade, Conversation, Message } from '@shared/models';

// Singleton service instances
let db: DatabaseService | null = null;
let claude: ClaudeService | null = null;
let secureStore: SecureStoreService | null = null;
let screenshot: ScreenshotService | null = null;

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
 * Get or create the Claude service instance
 */
function getClaudeService(): ClaudeService {
  if (!claude) {
    claude = new ClaudeService();
  }
  return claude;
}

/**
 * Get or create the secure store service instance
 */
function getSecureStore(): SecureStoreService {
  if (!secureStore) {
    secureStore = new SecureStoreService();
  }
  return secureStore;
}

/**
 * Get or create the screenshot service instance
 */
function getScreenshotService(): ScreenshotService {
  if (!screenshot) {
    screenshot = new ScreenshotService(getDatabase());
  }
  return screenshot;
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
    async (request) => {
      const database = getDatabase();
      const claudeService = getClaudeService();
      const secureStore = getSecureStore();
      const chatView = getChatView();

      if (!chatView) {
        throw new Error('Chat view not available');
      }

      try {
        // Get API key from secure storage
        const apiKey = secureStore.getApiKey();
        if (!apiKey) {
          const error: ChatMessageError = {
            conversationId: request.conversationId,
            error: 'API key not set. Please configure your Anthropic API key in settings.',
            code: 'NO_API_KEY',
          };
          chatView.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_ERROR, error);
          return;
        }

        // Initialize Claude service
        if (!claudeService.isInitialized()) {
          claudeService.initialize(apiKey);
        }

        // Get or create conversation
        let conversationId = request.conversationId;
        if (!conversationId) {
          const newConversation = database.createConversation({
            title: request.message.substring(0, 50) + '...',
            tradeId: undefined,
          });
          conversationId = newConversation.id;
        }

        // Save user message to database
        const userMessage = database.createMessage({
          conversationId,
          role: 'user',
          content: request.message,
          screenshotPath: request.screenshotPath,
          tokens: undefined,
          cached: false,
        });

        // Load conversation history (last 10 messages for context)
        const history = database.listMessages(conversationId, 10, 0);
        const conversationHistory = history
          .filter((msg) => msg.id !== userMessage.id) // Exclude the message we just added
          .map((msg) => ({
            role: msg.role,
            content: msg.content,
          }));

        // Send streaming message to Claude
        let assistantMessageId: string | undefined;
        let fullContent = '';

        await claudeService.sendMessage({
          message: request.message,
          conversationHistory,
          screenshotPath: request.screenshotPath,
          onChunk: (chunk, index) => {
            // Send chunk to renderer
            const chunkData: ChatMessageChunk = {
              conversationId,
              messageId: assistantMessageId || 'pending',
              chunk,
              index,
            };
            chatView.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_CHUNK, chunkData);
          },
          onComplete: (content, usage) => {
            fullContent = content;

            // Save assistant message to database
            const assistantMessage = database.createMessage({
              conversationId,
              role: 'assistant',
              content: fullContent,
              screenshotPath: undefined,
              tokens: usage.input_tokens + usage.output_tokens,
              cached: (usage.cache_read_input_tokens ?? 0) > 0,
            });

            assistantMessageId = assistantMessage.id;

            // Send completion event
            const completeData: ChatMessageComplete = {
              conversationId,
              messageId: assistantMessage.id,
              fullContent,
              tokens: usage.input_tokens + usage.output_tokens,
              cached: (usage.cache_read_input_tokens ?? 0) > 0,
            };
            chatView.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_COMPLETE, completeData);
          },
          onError: (error) => {
            // Send error to renderer
            const errorData: ChatMessageError = {
              conversationId,
              error: error.message,
              code: 'API_ERROR',
            };
            chatView.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_ERROR, errorData);
          },
        });
      } catch (error) {
        console.error('[IPC] Chat send message error:', error);
        const errorData: ChatMessageError = {
          conversationId: request.conversationId,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'HANDLER_ERROR',
        };
        chatView.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_ERROR, errorData);
      }
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
    async (request) => {
      const service = getScreenshotService();

      try {
        const result = await service.captureScreenshot({
          tradeId: request?.tradeId,
          messageId: request?.messageId,
        });

        return {
          success: true,
          filePath: result.filePath,
          metadata: {
            path: result.filePath,
            width: result.width,
            height: result.height,
            size: result.fileSize,
            timestamp: Date.now(),
          },
        };
      } catch (error) {
        console.error('[IPC] Screenshot capture failed:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Screenshot capture failed',
        };
      }
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

  handleWithValidation<string, void>(IPC_CHANNELS.SETTINGS_SET_API_KEY, async (apiKey) => {
    const secureStore = getSecureStore();
    const claudeService = getClaudeService();

    // Validate API key format
    if (!ClaudeService.validateApiKey(apiKey)) {
      throw new Error('Invalid API key format. Must start with sk-ant- and be at least 30 characters.');
    }

    // Store encrypted API key
    secureStore.setApiKey(apiKey);

    // Initialize Claude service with new key
    claudeService.initialize(apiKey);

    console.warn('[IPC] API key set successfully');
  });

  handleWithValidation<void, unknown>(
    IPC_CHANNELS.SETTINGS_GET_API_KEY_STATUS,
    async () => {
      const secureStore = getSecureStore();
      return secureStore.getApiKeyStatus();
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
  claude = null;
  secureStore = null;
  screenshot = null;
}
