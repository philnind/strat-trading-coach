/**
 * Type-safe IPC channel definitions for STRAT Monitor
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
} as const;

/**
 * IPC Message Types
 */

// Chat Messages
export interface ChatSendMessageRequest {
  message: string;
  conversationId?: string;
  includeScreenshot?: boolean;
  screenshotPath?: string;
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
}

export interface CaptureScreenshotResponse {
  base64: string;
  path: string;
  metadata?: ScreenshotMetadata;
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
}

/**
 * Global Window type augmentation
 */
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
