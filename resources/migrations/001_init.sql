-- Initial schema for Strat Monitor
-- Creates trades, conversations, and messages tables

-- Trades table: store trade journal entries
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry REAL NOT NULL,
  exit REAL,
  stop_loss REAL,
  take_profit REAL,
  quantity REAL NOT NULL,
  notes TEXT,
  screenshot_path TEXT,
  strat_setup TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  entry_timestamp INTEGER NOT NULL,
  exit_timestamp INTEGER,
  pnl REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Conversations table: group related chat messages
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  trade_id TEXT REFERENCES trades(id) ON DELETE SET NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Messages table: store chat messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  screenshot_path TEXT,
  tokens INTEGER,
  cached INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_ticker ON trades(ticker);
CREATE INDEX IF NOT EXISTS idx_conversations_trade_id ON conversations(trade_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
