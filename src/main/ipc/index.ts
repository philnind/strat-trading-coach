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
  MultiTimeframeAnalyzeRequest,
  MultiTimeframeAnalyzeResponse,
  ScreenerScanRequest,
  ScreenerScanResponse,
} from '@shared/ipc-types';
import { IPC_CHANNELS } from '@shared/ipc-types';
import { setSplitRatio, getSplitRatio, getMainWindow, getChatView, getTradingViewView } from '../window';
import { DatabaseService } from '../services/database';
import { ClaudeService } from '../services/claude';
import { SecureStoreService } from '../services/secure-store';
import { ScreenshotService } from '../services/screenshot';
import { MultiTimeframeScreenshotPrototype } from '../services/multi-timeframe-screenshot-prototype';
import { MultiTimeframeScreenshotService } from '../services/multi-timeframe-screenshot';
import { TradingViewOAuthService } from '../services/tradingview-oauth';
import { BackendService } from '../services/backend-service';
import { scanWatchlist, DEFAULT_SYMBOLS } from '../services/screener';
import type { Trade, Conversation, Message } from '@shared/models';

// Singleton service instances
let db: DatabaseService | null = null;
let claude: ClaudeService | null = null;
let secureStore: SecureStoreService | null = null;
let screenshot: ScreenshotService | null = null;
let multiTimeframe: MultiTimeframeScreenshotService | null = null;
let tvOAuth: TradingViewOAuthService | null = null;
let backend: BackendService | null = null;

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
 * Get or create the multi-timeframe screenshot service instance
 */
function getMultiTimeframeService(): MultiTimeframeScreenshotService {
  const window = getMainWindow();
  if (!window) {
    throw new Error('Main window not initialized');
  }

  if (!multiTimeframe) {
    multiTimeframe = new MultiTimeframeScreenshotService(window);
  }
  return multiTimeframe;
}

/**
 * Get or create the TradingView OAuth service instance
 */
function getTradingViewOAuthService(): TradingViewOAuthService {
  if (!tvOAuth) {
    tvOAuth = new TradingViewOAuthService();
  }
  return tvOAuth;
}

/**
 * Get or create the Backend service instance
 */
function getBackendService(): BackendService {
  if (!backend) {
    backend = new BackendService();
  }
  return backend;
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

    // In production, renderer uses file:// or app:// protocol
    if (url.protocol === 'file:' || url.protocol === 'app:') {
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
  // Chat — via Railway backend (Epic 4 / Auth migration)
  // ============================================================

  /**
   * Timeframes to capture per trading style (The Strat FTFC hierarchy).
   * These are TradingView interval codes: numbers = minutes, D/W/M = day/week/month.
   */
  const TRADING_STYLE_TIMEFRAMES: Record<string, string[]> = {
    'day-trade':      ['5', '15', '60'],    // 5min, 15min, 1H
    'swing-trade':    ['60', '1D', '1W'],   // 1H, Daily, Weekly
    'position-trade': ['1D', '1W', '1M'],   // Daily, Weekly, Monthly
  };

  const TRADING_STYLE_LABELS: Record<string, string> = {
    'day-trade':      'Day Trading',
    'swing-trade':    'Swing Trading',
    'position-trade': 'Position Trading',
  };

  /**
   * Returns true when the message likely needs chart context (MTF screenshots).
   * Skips capture for pure methodology/educational questions so the user doesn't
   * wait ~15s for timeframe captures on questions like "how does a 3 effect FTFC?".
   *
   * Heuristic: if the message looks like a general question (starts with a question
   * word or contains no chart-specific signals) it's treated as methodology-only.
   * When in doubt we lean toward capturing — being too conservative is worse than
   * wasting a few seconds on an unnecessary capture.
   */
  function messageNeedsChartContext(message: string): boolean {
    const lower = message.toLowerCase().trim();

    // Check methodology patterns FIRST — these take priority over everything else.
    // "how does a 3 effect FTFC?" must not be tripped by FTFC looking like a ticker.
    const methodologyOnly = [
      /^(how does|how do|what is|what are|what's|why does|why do|why is|when does|when do)\b/,
      /^(explain|define|describe|tell me|what does)\b/,
      /^(can you explain|help me understand|i don't understand|i'm confused)\b/,
    ];
    if (methodologyOnly.some((re) => re.test(lower))) return false;

    // Explicit chart-context signals → capture.
    // Dollar-prefixed tickers ($AAPL) are unambiguous; bare uppercase words are
    // checked second so Strat jargon (FTFC, MTF, etc.) can't slip through above.
    if (/\$[A-Za-z]{1,5}\b/.test(message)) return true;
    // Bare uppercase ticker: must be 2-5 caps that are NOT known Strat/trading acronyms.
    // Keep this list in sync with memory/strat-acronyms.md
    const stratAcronyms = new Set([
      // The Strat — timeframe continuity & structure
      'FTFC',                       // Full Time Frame Continuity
      'MTF',                        // Multi Time Frame
      // Prior period levels (Day/Week/Month/Year)
      'PDH', 'PDL',                 // Previous Day High/Low
      'PWH', 'PWL',                 // Previous Week High/Low
      'PMH', 'PML',                 // Previous Month High/Low
      'PYH', 'PYL',                 // Previous Year High/Low
      // Intraday levels
      'HOD', 'LOD',                 // High/Low of Day
      'POC',                        // Point of Control (volume profile)
      // Common TA indicators (not tickers)
      'ATR',                        // Average True Range
      'EMA', 'SMA', 'WMA',          // Moving averages
      'RSI', 'MACD', 'VWAP',        // Momentum / volume indicators
      'BB',                         // Bollinger Bands
      // Risk management shorthand
      'RR', 'SL', 'TP', 'BE',       // Risk/Reward, Stop Loss, Take Profit, Break Even
      'OR',                         // Opening Range
    ]);
    const upperWords = message.match(/\b[A-Z]{2,5}\b/g) ?? [];
    if (upperWords.some((w) => !stratAcronyms.has(w))) return true;

    const chartKeywords = [
      /\b(my chart|this chart|current|right now|setup|this setup|my setup)\b/,
      /\b(analyze|analysis|what do you see|what('s| is) happening|look at)\b/,
      /\b(entry|target|stop loss|take profit|trade this|trade it)\b/,
    ];
    if (chartKeywords.some((re) => re.test(lower))) return true;

    // Default: capture (most chat in this app is chart-related)
    return true;
  }

  handleWithValidation<ChatSendMessageRequest, void>(
    IPC_CHANNELS.CHAT_SEND_MESSAGE,
    async (request) => {
      const database = getDatabase();
      const backendService = getBackendService();
      const chatView = getChatView();

      if (!chatView) {
        throw new Error('Chat view not available');
      }

      // Require a valid auth token from the renderer
      if (!request.authToken) {
        const error: ChatMessageError = {
          conversationId: request.conversationId,
          error: 'Not authenticated. Please sign in to use the chat.',
          code: 'NOT_AUTHENTICATED',
        };
        chatView.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_ERROR, error);
        return;
      }

      try {
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
          .filter((msg) => msg.id !== userMessage.id)
          .map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));

        // Support both single screenshot (deprecated) and multiple screenshots
        let screenshotPaths =
          request.screenshotPaths ||
          (request.screenshotPath ? [request.screenshotPath] : undefined);

        // Auto-capture multi-timeframe screenshots when user hasn't attached manual ones,
        // but only when the message actually needs chart context (not for pure
        // methodology/educational questions like "how does a 3 effect FTFC?").
        if ((!screenshotPaths || screenshotPaths.length === 0) && messageNeedsChartContext(request.message)) {
          try {
            const tradingStyle = request.tradingStyle || 'swing-trade';
            const timeframes = TRADING_STYLE_TIMEFRAMES[tradingStyle] ?? TRADING_STYLE_TIMEFRAMES['swing-trade'];

            // Pass the user's current TradingView chart URL so the capture view loads
            // the same chart (symbol) the user is looking at
            const currentChartUrl = getTradingViewView()?.webContents.getURL();

            console.warn(`[IPC] Auto-capturing MTF screenshots for ${tradingStyle}: ${timeframes.join(', ')}`);

            const mtfService = getMultiTimeframeService();
            const mtfResult = await mtfService.captureMultipleTimeframes({
              timeframes,
              saveToDisk: true,
              chartUrl: currentChartUrl,
            });

            screenshotPaths = mtfResult.screenshots
              .filter((s) => s.success)
              .map((s) => s.filePath);

            console.warn(`[IPC] Auto-captured ${screenshotPaths.length}/${timeframes.length} timeframe screenshots`);
          } catch (error) {
            console.error('[IPC] Auto-capture failed, continuing without screenshots:', error);
            screenshotPaths = [];
          }
        } else if (!screenshotPaths || screenshotPaths.length === 0) {
          console.warn('[IPC] Skipping auto-capture — message appears to be a methodology question');
        }

        // Refresh the auth token right before calling the backend.
        // The original token was obtained in the renderer before MTF capture started.
        // Capture can take 10-30s; a 60s Clerk token may be stale by now.
        let authToken = request.authToken;
        try {
          const freshToken = await chatView.webContents.executeJavaScript(
            'window.__clerk?.session?.getToken()'
          ) as string | null;
          if (freshToken) {
            authToken = freshToken;
          }
        } catch (err) {
          console.warn('[IPC] Could not refresh auth token, using original:', err);
        }

        // Build the message Claude receives: prepend trading style context so it
        // knows the user's time horizon and which timeframes are in the screenshots.
        const tradingStyle = request.tradingStyle || 'swing-trade';
        const styleLabel = TRADING_STYLE_LABELS[tradingStyle] ?? 'Swing Trading';
        const timeframeList = (TRADING_STYLE_TIMEFRAMES[tradingStyle] ?? []).join(', ');
        const capturedCount = screenshotPaths?.length ?? 0;
        const screenshotNote = capturedCount > 0
          ? `${capturedCount} chart screenshot${capturedCount !== 1 ? 's' : ''} attached (${timeframeList})`
          : 'no chart screenshots available';
        const contextPrefix = `[Trading Style: ${styleLabel} | ${screenshotNote}]\n\n`;

        // Stream via backend
        let assistantMessageId: string | undefined;
        let fullContent = '';

        await backendService.streamChat(
          {
            authToken,
            message: contextPrefix + request.message,  // Claude sees context; DB stores original
            conversationHistory,
            screenshotPaths: screenshotPaths ?? [],
            conversationId,
          },
          {
            onDelta: (chunk, index) => {
              const chunkData: ChatMessageChunk = {
                conversationId: conversationId!,
                messageId: assistantMessageId || 'pending',
                chunk,
                index,
              };
              chatView.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_CHUNK, chunkData);
            },
            onComplete: (content, inputTokens, outputTokens) => {
              fullContent = content;

              const assistantMessage = database.createMessage({
                conversationId: conversationId!,
                role: 'assistant',
                content: fullContent,
                screenshotPath: undefined,
                tokens: inputTokens + outputTokens,
                cached: false,
              });

              assistantMessageId = assistantMessage.id;

              const completeData: ChatMessageComplete = {
                conversationId: conversationId!,
                messageId: assistantMessage.id,
                fullContent,
                tokens: inputTokens + outputTokens,
                cached: false,
              };
              chatView.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_COMPLETE, completeData);
            },
            onError: (error) => {
              const errorData: ChatMessageError = {
                conversationId,
                error: error.message,
                code: 'API_ERROR',
              };
              chatView.webContents.send(IPC_CHANNELS.CHAT_MESSAGE_ERROR, errorData);
            },
          }
        );
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
          id: result.id, // Add ID for data URL lookup
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

  handleWithValidation<string, string>(
    IPC_CHANNELS.SCREENSHOT_GET_DATA_URL,
    async (id) => {
      const service = getScreenshotService();
      return await service.getScreenshotDataUrl(id);
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

  // ============================================================
  // Multi-Timeframe Prototype (Phase 1: Cookie Auth Test)
  // ============================================================
  handleWithValidation<void, unknown>(
    IPC_CHANNELS.PROTOTYPE_TEST_COOKIE_AUTH,
    async () => {
      const window = getMainWindow();
      if (!window) {
        throw new Error('Main window not initialized');
      }

      const prototype = new MultiTimeframeScreenshotPrototype(window);
      return await prototype.testCookieAuth();
    }
  );

  // ============================================================
  // Multi-Timeframe (Production)
  // ============================================================
  handleWithValidation<MultiTimeframeAnalyzeRequest, MultiTimeframeAnalyzeResponse>(
    IPC_CHANNELS.MULTI_TIMEFRAME_ANALYZE,
    async (request) => {
      console.warn('[IPC] Multi-timeframe analysis requested');

      try {
        // Get services
        const mtfService = getMultiTimeframeService();
        const claudeService = getClaudeService();
        const secureStore = getSecureStore();

        // Initialize Claude if not already initialized
        if (!claudeService.isInitialized()) {
          const apiKey = secureStore.getApiKey();
          if (!apiKey) {
            throw new Error('No API key found. Please set your API key in settings.');
          }
          claudeService.initialize(apiKey);
          console.warn('[IPC] Claude initialized from stored API key');
        }

        // Capture screenshots from multiple timeframes
        const result = await mtfService.captureMultipleTimeframes({
          timeframes: request?.timeframes,
          saveToDisk: true,
        });

        console.warn(`[IPC] Captured ${result.successCount}/${result.screenshots.length} timeframes`);

        // If no successful screenshots, return early
        if (result.successCount === 0) {
          return {
            success: false,
            screenshots: result.screenshots,
            totalTime: result.totalTime,
            successCount: 0,
            failureCount: result.failureCount,
            error: 'Failed to capture any timeframe screenshots',
          };
        }

        // Build screenshot data for Claude (only successful ones)
        const successfulScreenshots = result.screenshots
          .filter((s) => s.success)
          .map((s) => ({
            timeframe: s.timeframe,
            filePath: s.filePath,
          }));

        // Analyze with Claude
        console.warn('[IPC] Sending to Claude for analysis...');
        const analysis = await claudeService.analyzeMultiTimeframe(
          successfulScreenshots,
          request?.userMessage
        );

        console.warn('[IPC] Multi-timeframe analysis complete');

        return {
          success: true,
          analysis: analysis.content,
          screenshots: result.screenshots,
          totalTime: result.totalTime,
          successCount: result.successCount,
          failureCount: result.failureCount,
          usage: {
            inputTokens: analysis.usage.inputTokens,
            outputTokens: analysis.usage.outputTokens,
            cacheReadTokens: analysis.usage.cacheReadTokens,
            cacheCreationTokens: analysis.usage.cacheCreationTokens,
          },
        };
      } catch (error) {
        console.error('[IPC] Multi-timeframe analysis failed:', error);
        return {
          success: false,
          screenshots: [],
          totalTime: 0,
          successCount: 0,
          failureCount: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // ============================================================
  // TradingView OAuth
  // ============================================================
  handleWithValidation<void, void>(
    IPC_CHANNELS.TRADINGVIEW_OPEN_LOGIN,
    async () => {
      const oauthService = getTradingViewOAuthService();
      await oauthService.openLoginWindow();
    }
  );

  handleWithValidation<void, boolean>(
    IPC_CHANNELS.TRADINGVIEW_CHECK_LOGIN,
    async () => {
      const oauthService = getTradingViewOAuthService();
      return await oauthService.isUserLoggedIn();
    }
  );

  // ============================================================
  // Auth
  // ============================================================
  // Sign-out is handled in the renderer (clerk.signOut()). This handler
  // is a no-op in main — it exists so the renderer can await it cleanly.
  handleWithValidation<void, void>(IPC_CHANNELS.AUTH_SIGN_OUT, async () => {
    console.warn('[IPC] Auth sign-out received from renderer');
  });

  // ============================================================
  // Screener
  // ============================================================
  handleWithValidation<ScreenerScanRequest | undefined, ScreenerScanResponse>(
    IPC_CHANNELS.SCREENER_SCAN,
    async (request) => {
      // If no symbols supplied, load from the user's saved watchlist
      const symbols = request?.symbols ?? getDatabase().getWatchlist();
      console.warn('[IPC] Screener scan:', symbols.length, 'symbols /', request?.tradingStyle ?? 'swing-trade');
      return await scanWatchlist(symbols, request?.tradingStyle);
    }
  );

  // ============================================================
  // Watchlist
  // ============================================================

  /** Default seed rows — mirrors DEFAULT_SYMBOLS from screener.ts */
  const WATCHLIST_DEFAULTS = DEFAULT_SYMBOLS.map((sym, i) => ({
    symbol: sym,
    tier: i < 9 ? 1 : 2, // first 9 are tier1 (AAPL…QQQ)
  }));

  handleWithValidation<void, string[]>(IPC_CHANNELS.WATCHLIST_GET, async () => {
    const db = getDatabase();
    db.seedWatchlistIfEmpty(WATCHLIST_DEFAULTS);
    return db.getWatchlist();
  });

  handleWithValidation<string, string[]>(IPC_CHANNELS.WATCHLIST_ADD, async (symbol) => {
    const db = getDatabase();
    db.addToWatchlist(symbol);
    return db.getWatchlist();
  });

  handleWithValidation<string, string[]>(IPC_CHANNELS.WATCHLIST_REMOVE, async (symbol) => {
    const db = getDatabase();
    db.removeFromWatchlist(symbol);
    return db.getWatchlist();
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
