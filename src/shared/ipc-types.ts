/**
 * Type-safe IPC channel definitions for The Strat Coach
 * Ensures compile-time safety for main <-> renderer communication
 */

import type { Trade, Message, Conversation, AppSettings, ScreenshotMetadata } from './models';

/**
 * IPC Channel Names
 */
export const IPC_CHANNELS = {
  // Chat & Claude API
  CHAT_SEND_MESSAGE: 'chat:send-message',
  CHAT_MESSAGE_CHUNK: 'chat:message-chunk',
  CHAT_MESSAGE_COMPLETE: 'chat:message-complete',
  CHAT_MESSAGE_ERROR: 'chat:message-error',

  // Database - Trades
  DB_CREATE_TRADE: 'db:create-trade',
  DB_UPDATE_TRADE: 'db:update-trade',
  DB_GET_TRADE: 'db:get-trade',
  DB_LIST_TRADES: 'db:list-trades',
  DB_DELETE_TRADE: 'db:delete-trade',

  // Database - Conversations
  DB_CREATE_CONVERSATION: 'db:create-conversation',
  DB_GET_CONVERSATION: 'db:get-conversation',
  DB_LIST_CONVERSATIONS: 'db:list-conversations',
  DB_DELETE_CONVERSATION: 'db:delete-conversation',

  // Database - Messages
  DB_CREATE_MESSAGE: 'db:create-message',
  DB_GET_MESSAGES: 'db:get-messages',

  // Screenshot
  SCREENSHOT_CAPTURE: 'screenshot:capture',
  SCREENSHOT_GET_DATA_URL: 'screenshot:get-data-url',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_SET_API_KEY: 'settings:set-api-key',
  SETTINGS_GET_API_KEY_STATUS: 'settings:get-api-key-status',

  // Window
  WINDOW_SET_SPLIT_RATIO: 'window:set-split-ratio',
  WINDOW_GET_BOUNDS: 'window:get-bounds',

  // System
  APP_GET_VERSION: 'app:get-version',
  APP_QUIT: 'app:quit',

  // Multi-Timeframe Prototype (Phase 1: Cookie Auth Test)
  PROTOTYPE_TEST_COOKIE_AUTH: 'prototype:test-cookie-auth',

  // Multi-Timeframe (Production)
  MULTI_TIMEFRAME_ANALYZE: 'multi-timeframe:analyze',

  // TradingView OAuth
  TRADINGVIEW_OPEN_LOGIN: 'tradingview:open-login',
  TRADINGVIEW_CHECK_LOGIN: 'tradingview:check-login',

  // Auth
  AUTH_SIGN_OUT: 'auth:sign-out',

  // Screener
  SCREENER_SCAN: 'screener:scan',

  // Watchlist
  WATCHLIST_GET: 'watchlist:get',
  WATCHLIST_ADD: 'watchlist:add',
  WATCHLIST_REMOVE: 'watchlist:remove',
} as const;

/**
 * IPC Message Types
 */

// Chat Messages
export interface ChatSendMessageRequest {
  message: string;
  authToken: string; // Clerk JWT — required for backend auth
  conversationId?: string;
  includeScreenshot?: boolean;
  screenshotPath?: string; // Deprecated - use screenshotPaths instead
  screenshotPaths?: string[]; // Support multiple screenshots
  tradingStyle?: string; // 'day-trade' | 'swing-trade' | 'position-trade'
}

export interface ChatMessageChunk {
  conversationId: string;
  messageId: string;
  chunk: string;
  index: number;
}

export interface ChatMessageComplete {
  conversationId: string;
  messageId: string;
  fullContent: string;
  tokens: number;
  cached: boolean;
}

export interface ChatMessageError {
  conversationId?: string;
  error: string;
  code?: string;
}

// Trade Operations
export interface CreateTradeRequest {
  ticker: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss?: number;
  takeProfit?: number;
  quantity: number;
  notes?: string;
  screenshotPath?: string;
  stratSetup: string;
  timeframe: string;
}

export interface UpdateTradeRequest {
  id: string;
  exit?: number;
  notes?: string;
  pnl?: number;
}

export interface ListTradesRequest {
  limit?: number;
  offset?: number;
  ticker?: string;
}

export interface ListTradesResponse {
  trades: Trade[];
  total: number;
}

// Conversation Operations
export interface CreateConversationRequest {
  title: string;
  tradeId?: string;
}

export interface GetMessagesRequest {
  conversationId: string;
  limit?: number;
  offset?: number;
}

export interface GetMessagesResponse {
  messages: Message[];
  total: number;
}

// Screenshot
export interface CaptureScreenshotRequest {
  includeMetadata?: boolean;
  tradeId?: string;
  messageId?: string;
}

export interface CaptureScreenshotResponse {
  success: boolean;
  filePath?: string;
  metadata?: ScreenshotMetadata;
  id?: string; // Screenshot ID for data URL lookup
  error?: string;
}

// Settings
export interface UpdateSettingsRequest {
  splitRatio?: number;
  theme?: 'light' | 'dark' | 'system';
  autoSaveConversations?: boolean;
  defaultTimeframe?: string;
}

export interface ApiKeyStatusResponse {
  hasKey: boolean;
  isValid?: boolean;
  source?: 'environment' | 'stored';
}

// Window
export interface SetSplitRatioRequest {
  ratio: number; // 0-1
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Multi-Timeframe Prototype
export interface PrototypeCookieAuthResponse {
  success: boolean;
  screenshotPath: string;
  message: string;
}

// Multi-Timeframe (Production)
export interface MultiTimeframeAnalyzeRequest {
  timeframes?: string[]; // Default: ['1D', '1W', '1H']
  userMessage?: string; // Optional custom message
}

export interface TimeframeScreenshotResult {
  timeframe: string;
  filePath: string;
  width: number;
  height: number;
  fileSize: number;
  success: boolean;
  error?: string;
}

export interface MultiTimeframeAnalyzeResponse {
  success: boolean;
  analysis?: string;
  screenshots: TimeframeScreenshotResult[];
  totalTime: number; // milliseconds
  successCount: number;
  failureCount: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
  error?: string;
}

// Screener
export type StratCandleType = '2-up' | '2-down' | '1' | '3';
export type StratDirection = 'bullish' | 'bearish' | null;
export type StratAlignment = 'full-ftfc' | 'partial' | 'none';
export type ScreenerTradingStyle = 'day-trade' | 'swing-trade' | 'position-trade';

export interface TimeframeCheck {
  candle1: StratCandleType | null;
  candle2: StratCandleType | null;
  direction: StratDirection;
}

export interface ScreenerTimeframeResult {
  label: string;
  check: TimeframeCheck;
}

export interface ScreenerSymbolResult {
  symbol: string;
  direction: StratDirection;
  timeframes: ScreenerTimeframeResult[]; // always 3 entries
  alignment: StratAlignment;
  error?: string;
}

export interface ScreenerScanRequest {
  symbols?: string[];
  tradingStyle?: ScreenerTradingStyle;
}

export interface ScreenerScanResponse {
  results: ScreenerSymbolResult[];
  scannedAt: string;
  duration: number;
  tradingStyle: ScreenerTradingStyle;
  timeframeLabels: string[]; // e.g. ['1H', '4H', '1D']
}

/**
 * Type-safe IPC API
 * This is what gets exposed via contextBridge in the preload script
 */
export interface ElectronAPI {
  // Chat
  sendMessage: (request: ChatSendMessageRequest) => Promise<void>;
  onMessageChunk: (callback: (chunk: ChatMessageChunk) => void) => () => void;
  onMessageComplete: (callback: (complete: ChatMessageComplete) => void) => () => void;
  onMessageError: (callback: (error: ChatMessageError) => void) => () => void;

  // Trades
  createTrade: (request: CreateTradeRequest) => Promise<Trade>;
  updateTrade: (request: UpdateTradeRequest) => Promise<Trade>;
  getTrade: (id: string) => Promise<Trade | null>;
  listTrades: (request?: ListTradesRequest) => Promise<ListTradesResponse>;
  deleteTrade: (id: string) => Promise<void>;

  // Conversations
  createConversation: (request: CreateConversationRequest) => Promise<Conversation>;
  getConversation: (id: string) => Promise<Conversation | null>;
  listConversations: () => Promise<Conversation[]>;
  deleteConversation: (id: string) => Promise<void>;

  // Messages
  createMessage: (message: Omit<Message, 'id' | 'createdAt'>) => Promise<Message>;
  getMessages: (request: GetMessagesRequest) => Promise<GetMessagesResponse>;

  // Screenshot
  captureScreenshot: (
    request?: CaptureScreenshotRequest
  ) => Promise<CaptureScreenshotResponse>;
  getScreenshotDataUrl: (id: string) => Promise<string>;

  // Settings
  getSettings: () => Promise<AppSettings>;
  updateSettings: (request: UpdateSettingsRequest) => Promise<AppSettings>;
  setApiKey: (apiKey: string) => Promise<void>;
  getApiKeyStatus: () => Promise<ApiKeyStatusResponse>;

  // Window
  setSplitRatio: (request: SetSplitRatioRequest) => Promise<void>;
  getWindowBounds: () => Promise<WindowBounds>;

  // System
  getAppVersion: () => Promise<string>;
  quit: () => void;

  // Multi-Timeframe Prototype
  testCookieAuth: () => Promise<PrototypeCookieAuthResponse>;

  // Multi-Timeframe (Production)
  analyzeMultiTimeframe: (
    request?: MultiTimeframeAnalyzeRequest
  ) => Promise<MultiTimeframeAnalyzeResponse>;

  // TradingView OAuth
  openTradingViewLogin: () => Promise<void>;
  checkTradingViewLogin: () => Promise<boolean>;

  // Auth
  signOut: () => Promise<void>;

  // Screener
  screenerScan: (request?: ScreenerScanRequest) => Promise<ScreenerScanResponse>;

  // Watchlist
  getWatchlist: () => Promise<string[]>;
  addToWatchlist: (symbol: string) => Promise<string[]>;
  removeFromWatchlist: (symbol: string) => Promise<string[]>;
}

/**
 * Global Window type augmentation
 */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
    // Clerk instance — set by use-auth.ts after Clerk loads
    // Typed as unknown to avoid importing @clerk/clerk-js into the shared module
    // (which compiles for both main and renderer). Cast in renderer code.
    __clerk: unknown;
  }
}
