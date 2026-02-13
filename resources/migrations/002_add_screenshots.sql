-- Add screenshots table for storing screenshot metadata
-- Screenshots can be linked to trades or messages

CREATE TABLE IF NOT EXISTS screenshots (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  file_size INTEGER NOT NULL,
  trade_id TEXT REFERENCES trades(id) ON DELETE SET NULL,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

-- Create indexes for screenshot queries
CREATE INDEX IF NOT EXISTS idx_screenshots_trade_id ON screenshots(trade_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_message_id ON screenshots(message_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_created_at ON screenshots(created_at DESC);
