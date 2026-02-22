/**
 * Chat renderer preload script
 * Exposes type-safe IPC API to renderer via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  ElectronAPI,
  ChatSendMessageRequest,
  ChatMessageChunk,
  ChatMessageComplete,
  ChatMessageError,
  CreateTradeRequest,
  UpdateTradeRequest,
  ListTradesRequest,
  CreateConversationRequest,
  GetMessagesRequest,
  CaptureScreenshotRequest,
  UpdateSettingsRequest,
  SetSplitRatioRequest,
  MultiTimeframeAnalyzeRequest,
  ScreenerScanRequest,
} from '@shared/ipc-types';
import { IPC_CHANNELS } from '@shared/ipc-types';

/**
 * Type-safe IPC API implementation
 */
const electronAPI: ElectronAPI = {
  // ============================================================
  // Chat API
  // ============================================================
  sendMessage: (request: ChatSendMessageRequest): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CHAT_SEND_MESSAGE, request);
  },

  onMessageChunk: (callback: (chunk: ChatMessageChunk) => void): (() => void) => {
    const listener = (_event: unknown, chunk: ChatMessageChunk): void => {
      callback(chunk);
    };
    ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_CHUNK, listener);

    // Return cleanup function
    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.CHAT_MESSAGE_CHUNK, listener);
    };
  },

  onMessageComplete: (callback: (complete: ChatMessageComplete) => void): (() => void) => {
    const listener = (_event: unknown, complete: ChatMessageComplete): void => {
      callback(complete);
    };
    ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_COMPLETE, listener);

    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.CHAT_MESSAGE_COMPLETE, listener);
    };
  },

  onMessageError: (callback: (error: ChatMessageError) => void): (() => void) => {
    const listener = (_event: unknown, error: ChatMessageError): void => {
      callback(error);
    };
    ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_ERROR, listener);

    return (): void => {
      ipcRenderer.removeListener(IPC_CHANNELS.CHAT_MESSAGE_ERROR, listener);
    };
  },

  // ============================================================
  // Trades API
  // ============================================================
  createTrade: (request: CreateTradeRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_CREATE_TRADE, request);
  },

  updateTrade: (request: UpdateTradeRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_UPDATE_TRADE, request);
  },

  getTrade: (id: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_GET_TRADE, id);
  },

  listTrades: (request?: ListTradesRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_TRADES, request);
  },

  deleteTrade: (id: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_DELETE_TRADE, id);
  },

  // ============================================================
  // Conversations API
  // ============================================================
  createConversation: (request: CreateConversationRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_CREATE_CONVERSATION, request);
  },

  getConversation: (id: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_GET_CONVERSATION, id);
  },

  listConversations: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_LIST_CONVERSATIONS);
  },

  deleteConversation: (id: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_DELETE_CONVERSATION, id);
  },

  // ============================================================
  // Messages API
  // ============================================================
  createMessage: (message) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_CREATE_MESSAGE, message);
  },

  getMessages: (request: GetMessagesRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.DB_GET_MESSAGES, request);
  },

  // ============================================================
  // Screenshot API
  // ============================================================
  captureScreenshot: (request?: CaptureScreenshotRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOT_CAPTURE, request);
  },

  getScreenshotDataUrl: (id: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOT_GET_DATA_URL, id);
  },

  // ============================================================
  // Settings API
  // ============================================================
  getSettings: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET);
  },

  updateSettings: (request: UpdateSettingsRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, request);
  },

  setApiKey: (apiKey: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_API_KEY, apiKey);
  },

  getApiKeyStatus: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_API_KEY_STATUS);
  },

  // ============================================================
  // Window API
  // ============================================================
  setSplitRatio: (request: SetSplitRatioRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_SPLIT_RATIO, request);
  },

  getWindowBounds: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_BOUNDS);
  },

  // ============================================================
  // System API
  // ============================================================
  getAppVersion: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION);
  },

  quit: () => {
    ipcRenderer.send(IPC_CHANNELS.APP_QUIT);
  },

  // ============================================================
  // Multi-Timeframe Prototype API
  // ============================================================
  testCookieAuth: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.PROTOTYPE_TEST_COOKIE_AUTH);
  },

  // ============================================================
  // Multi-Timeframe (Production) API
  // ============================================================
  analyzeMultiTimeframe: (request?: MultiTimeframeAnalyzeRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.MULTI_TIMEFRAME_ANALYZE, request);
  },

  // ============================================================
  // TradingView OAuth API
  // ============================================================
  openTradingViewLogin: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.TRADINGVIEW_OPEN_LOGIN);
  },

  checkTradingViewLogin: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.TRADINGVIEW_CHECK_LOGIN);
  },

  // ============================================================
  // Auth API
  // ============================================================
  signOut: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.AUTH_SIGN_OUT);
  },

  // ============================================================
  // Screener API
  // ============================================================
  screenerScan: (request?: ScreenerScanRequest) => {
    return ipcRenderer.invoke(IPC_CHANNELS.SCREENER_SCAN, request);
  },

  // ============================================================
  // Watchlist API
  // ============================================================
  getWatchlist: (): Promise<string[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WATCHLIST_GET);
  },

  addToWatchlist: (symbol: string): Promise<string[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WATCHLIST_ADD, symbol);
  },

  removeFromWatchlist: (symbol: string): Promise<string[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WATCHLIST_REMOVE, symbol);
  },
};

/**
 * Expose the API to the renderer process
 * This is the ONLY way renderer can access Electron APIs
 */
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
