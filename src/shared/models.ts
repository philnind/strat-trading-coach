/**
 * Shared data models for STRAT Monitor
 * Used across main, renderer, and preload processes
 */

export interface Trade {
  id: string;
  ticker: string;
  direction: 'long' | 'short';
  entry: number;
  exit?: number;
  stopLoss?: number;
  takeProfit?: number;
  quantity: number;
  notes?: string;
  screenshotPath?: string;
  stratSetup: string; // e.g., "2-2 reversal", "3-inside"
  timeframe: string; // e.g., "1D", "4H", "1H"
  entryTimestamp: number;
  exitTimestamp?: number;
  pnl?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  screenshotPath?: string;
  tokens?: number;
  cached?: boolean;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  tradeId?: string; // Link to a trade if this conversation is about a specific trade
  messageCount: number;
  lastMessageAt: number;
  createdAt: number;
}

export interface AppSettings {
  apiKey: string | null;
  splitRatio: number; // 0-1, percentage of screen for TradingView (default: 0.6)
  theme: 'light' | 'dark' | 'system';
  autoSaveConversations: boolean;
  defaultTimeframe: string;
}

export interface ScreenshotMetadata {
  path: string;
  width: number;
  height: number;
  timestamp: number;
  size: number; // bytes
}

export type StratSetup =
  | '1-inside'
  | '2-up'
  | '2-down'
  | '2-2-reversal'
  | '3-inside'
  | '3-outside'
  | 'custom';

export type Timeframe = '1M' | '5M' | '15M' | '30M' | '1H' | '4H' | '1D' | '1W' | '1M';
