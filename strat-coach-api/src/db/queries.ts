/**
 * Type-safe database queries
 * All database operations should go through these functions
 */

import { query, transaction } from './index.js';
import { PoolClient } from 'pg';

/**
 * User types
 */
export interface User {
  id: string;
  clerk_user_id: string;
  email: string;
  display_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  subscription_status: 'active' | 'past_due' | 'canceled' | 'trialing';
  subscription_period_end: Date | null;
  tokens_used_current_period: number;
  token_limit: number;
  period_start_date: Date;
  last_usage_reported_at: Date | null;
  methodology_version: string;
  app_version: string | null;
  last_active_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserParams {
  clerk_user_id: string;
  email: string;
  display_name?: string;
}

export interface TokenUsageRecord {
  id: number;
  user_id: string;
  conversation_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  model: string;
  request_type: 'chat' | 'multi_timeframe' | 'vision';
  success: boolean;
  latency_ms: number | null;
  error_code: string | null;
  estimated_cost_usd: number | null;
  billing_period: Date;
  created_at: Date;
}

export interface RecordUsageParams {
  userId: string;
  conversationId?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
  requestType?: 'chat' | 'multi_timeframe' | 'vision';
  success?: boolean;
  latencyMs?: number;
  errorCode?: string;
}

/**
 * Users
 */

export async function createUser(params: CreateUserParams): Promise<User> {
  const result = await query<User>(
    `INSERT INTO users (clerk_user_id, email, display_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [params.clerk_user_id, params.email, params.display_name]
  );

  return result.rows[0];
}

export async function getUserByClerkId(clerkUserId: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE clerk_user_id = $1',
    [clerkUserId]
  );

  return result.rows[0] || null;
}

export async function getUserById(userId: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );

  return result.rows[0] || null;
}

export async function updateUserSubscription(params: {
  userId: string;
  tier: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionItemId?: string;
  periodEnd?: Date;
}): Promise<User> {
  const result = await query<User>(
    `UPDATE users
     SET subscription_tier = $2,
         subscription_status = $3,
         stripe_customer_id = COALESCE($4, stripe_customer_id),
         stripe_subscription_id = COALESCE($5, stripe_subscription_id),
         stripe_subscription_item_id = COALESCE($6, stripe_subscription_item_id),
         subscription_period_end = COALESCE($7, subscription_period_end)
     WHERE id = $1
     RETURNING *`,
    [
      params.userId,
      params.tier,
      params.status,
      params.stripeCustomerId,
      params.stripeSubscriptionId,
      params.stripeSubscriptionItemId,
      params.periodEnd,
    ]
  );

  return result.rows[0];
}

/**
 * Token Usage
 */

export async function recordUsage(params: RecordUsageParams): Promise<TokenUsageRecord> {
  // Calculate estimated cost
  const inputCost = (params.inputTokens / 1_000_000) * 3.0;
  const outputCost = (params.outputTokens / 1_000_000) * 15.0;
  const cacheCreationCost = (params.cacheCreationTokens / 1_000_000) * 3.75;
  const cacheReadCost = (params.cacheReadTokens / 1_000_000) * 0.3;
  const estimatedCost = inputCost + outputCost + cacheCreationCost + cacheReadCost;

  return transaction(async (client: PoolClient) => {
    // Insert usage record
    const usageResult = await client.query<TokenUsageRecord>(
      `INSERT INTO token_usage (
        user_id, conversation_id, input_tokens, output_tokens,
        cache_read_tokens, cache_creation_tokens, model, request_type,
        success, latency_ms, error_code, estimated_cost_usd
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        params.userId,
        params.conversationId,
        params.inputTokens,
        params.outputTokens,
        params.cacheReadTokens,
        params.cacheCreationTokens,
        params.model,
        params.requestType || 'chat',
        params.success !== false,
        params.latencyMs,
        params.errorCode,
        estimatedCost,
      ]
    );

    // Update user's current period usage
    const totalTokens = params.inputTokens + params.outputTokens;
    await client.query(
      `UPDATE users
       SET tokens_used_current_period = tokens_used_current_period + $1,
           last_active_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [totalTokens, params.userId]
    );

    return usageResult.rows[0];
  });
}

export async function getUserQuota(userId: string): Promise<{
  tokensUsed: number;
  tokenLimit: number;
  tokensRemaining: number;
  percentUsed: number;
  tier: 'free' | 'pro' | 'enterprise';
}> {
  const result = await query<{
    tokens_used_current_period: number;
    token_limit: number;
    subscription_tier: 'free' | 'pro' | 'enterprise';
  }>(
    `SELECT tokens_used_current_period, token_limit, subscription_tier
     FROM users
     WHERE id = $1`,
    [userId]
  );

  const user = result.rows[0];
  if (!user) {
    throw new Error('User not found');
  }

  const tokensRemaining = Math.max(0, user.token_limit - user.tokens_used_current_period);
  const percentUsed = (user.tokens_used_current_period / user.token_limit) * 100;

  return {
    tokensUsed: user.tokens_used_current_period,
    tokenLimit: user.token_limit,
    tokensRemaining,
    percentUsed,
    tier: user.subscription_tier,
  };
}

export async function getUserUsageHistory(
  userId: string,
  limit: number = 30
): Promise<TokenUsageRecord[]> {
  const result = await query<TokenUsageRecord>(
    `SELECT * FROM token_usage
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows;
}

/**
 * Conversations
 */

export async function createConversation(params: {
  userId: string;
  title: string;
  tradeId?: string;
}): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO conversations (user_id, title, trade_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [params.userId, params.title, params.tradeId]
  );

  return result.rows[0];
}

export async function getConversation(conversationId: string): Promise<any> {
  const result = await query(
    'SELECT * FROM conversations WHERE id = $1',
    [conversationId]
  );

  return result.rows[0] || null;
}

export async function listConversations(
  userId: string,
  limit: number = 50
): Promise<any[]> {
  const result = await query(
    `SELECT * FROM conversations
     WHERE user_id = $1
     ORDER BY last_message_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows;
}

/**
 * Messages
 */

export async function createMessage(params: {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  cached?: boolean;
}): Promise<{ id: string }> {
  return transaction(async (client: PoolClient) => {
    // Insert message
    const messageResult = await client.query<{ id: string }>(
      `INSERT INTO messages (conversation_id, role, content, tokens, cached)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        params.conversationId,
        params.role,
        params.content,
        params.tokens,
        params.cached,
      ]
    );

    // Update conversation metadata
    await client.query(
      `UPDATE conversations
       SET message_count = message_count + 1,
           last_message_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [params.conversationId]
    );

    return messageResult.rows[0];
  });
}

export async function getMessages(conversationId: string): Promise<any[]> {
  const result = await query(
    `SELECT * FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );

  return result.rows;
}
