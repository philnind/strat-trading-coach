-- ============================================================
-- Migration 001: Initial Schema
-- ============================================================
-- Creates core tables for users, token usage, conversations, and messages
-- Based on PRD-BACKEND-SERVER.md Section 7: Database Design

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,

  -- Subscription
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  stripe_subscription_item_id TEXT,  -- For metered usage reporting
  subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing')),
  subscription_period_end TIMESTAMPTZ,

  -- Usage tracking (current period)
  tokens_used_current_period BIGINT NOT NULL DEFAULT 0,
  token_limit BIGINT NOT NULL DEFAULT 100000,  -- Based on tier
  period_start_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_usage_reported_at TIMESTAMPTZ,

  -- Metadata
  methodology_version TEXT DEFAULT '1.0.0',
  app_version TEXT,
  last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX idx_users_tier ON users(subscription_tier);

-- ============================================================
-- TOKEN USAGE TABLE (Per-Request Granularity)
-- ============================================================
CREATE TABLE IF NOT EXISTS token_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT,

  -- Token breakdown
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS
    (input_tokens + output_tokens) STORED,

  -- Metadata
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  request_type TEXT NOT NULL DEFAULT 'chat'
    CHECK (request_type IN ('chat', 'multi_timeframe', 'vision')),
  success BOOLEAN NOT NULL DEFAULT true,
  latency_ms INTEGER,  -- End-to-end response time
  error_code TEXT,

  -- Cost tracking (computed from token counts)
  estimated_cost_usd DECIMAL(10, 6),

  -- Time
  billing_period DATE NOT NULL DEFAULT (CURRENT_DATE - (EXTRACT(DAY FROM CURRENT_DATE)::int - 1) * INTERVAL '1 day')::date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usage_user_period ON token_usage(user_id, billing_period);
CREATE INDEX idx_usage_user_created ON token_usage(user_id, created_at DESC);
CREATE INDEX idx_usage_billing ON token_usage(billing_period, user_id);

-- ============================================================
-- CONVERSATIONS TABLE (Server-Side Sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trade_id TEXT,  -- Optional link to a trade
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user ON conversations(user_id, last_message_at DESC);

-- ============================================================
-- MESSAGES TABLE (Server-Side Sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tokens INTEGER,
  cached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- ============================================================
-- RATE LIMIT EVENTS TABLE (Optional: for abuse detection)
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('request', 'quota_exceeded', 'rate_limited')),
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rate_events_user ON rate_limit_events(user_id, created_at DESC);

-- ============================================================
-- BILLING SUMMARY VIEW (Materialized, refreshed daily)
-- ============================================================
CREATE MATERIALIZED VIEW billing_summary AS
SELECT
  user_id,
  billing_period,
  COUNT(*) AS request_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(cache_read_tokens) AS total_cache_read_tokens,
  SUM(cache_creation_tokens) AS total_cache_creation_tokens,
  SUM(total_tokens) AS total_tokens,
  SUM(estimated_cost_usd) AS total_cost_usd,
  AVG(latency_ms) AS avg_latency_ms,
  ROUND(
    SUM(cache_read_tokens)::numeric /
    NULLIF(SUM(input_tokens + cache_read_tokens), 0) * 100,
    1
  ) AS cache_hit_rate_pct
FROM token_usage
WHERE success = true
GROUP BY user_id, billing_period;

CREATE UNIQUE INDEX idx_billing_summary_pk
  ON billing_summary(user_id, billing_period);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Reset user's monthly usage
CREATE OR REPLACE FUNCTION reset_user_period(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE users
  SET tokens_used_current_period = 0,
      period_start_date = CURRENT_TIMESTAMP,
      token_limit = CASE subscription_tier
        WHEN 'free' THEN 100000
        WHEN 'pro' THEN 2000000
        WHEN 'enterprise' THEN 10000000
        ELSE 100000
      END
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Version: 001
-- Description: Initial schema with users, usage tracking, conversations
-- ============================================================
