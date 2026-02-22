-- Screener watchlist
-- Stores user-managed ticker symbols for the stock screener.
-- Pre-populated with defaults on first use via the application layer.

CREATE TABLE IF NOT EXISTS watchlist (
  symbol     TEXT PRIMARY KEY,       -- e.g. 'AAPL' — always stored uppercase
  tier       INTEGER NOT NULL DEFAULT 2, -- 1 = tier1 (daily), 2 = tier2 (high beta)
  added_at   INTEGER NOT NULL        -- unix ms timestamp
);
