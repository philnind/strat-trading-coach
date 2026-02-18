/**
 * Application constants
 * Rate limits, tier configurations, and other constants
 */

/**
 * Rate limit configurations per subscription tier
 */
export const RATE_LIMITS = {
  free: {
    perMinute: 10,
    perHour: 50,
  },
  pro: {
    perMinute: 30,
    perHour: 300,
  },
  enterprise: {
    perMinute: 60,
    perHour: 9999,
  },
} as const;

/**
 * Token limits per subscription tier (monthly)
 */
export const TOKEN_LIMITS = {
  free: 100_000, // ~30 messages
  pro: 2_000_000, // ~600 messages
  enterprise: 10_000_000, // ~3000 messages
} as const;

/**
 * Subscription tiers
 */
export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

/**
 * Claude model configuration
 */
export const CLAUDE_CONFIG = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 1.0,
} as const;

/**
 * Anthropic API pricing (per 1M tokens)
 * As of 2026-02
 */
export const ANTHROPIC_PRICING = {
  inputTokens: 3.0, // $3 per 1M tokens
  outputTokens: 15.0, // $15 per 1M tokens
  cacheCreationTokens: 3.75, // $3.75 per 1M tokens (25% premium)
  cacheReadTokens: 0.3, // $0.30 per 1M tokens (90% discount)
} as const;

/**
 * Stripe pricing configuration
 */
export const STRIPE_PRICING = {
  pro: {
    monthly: 2900, // $29.00 in cents
    overagePerThousandTokens: 2, // $0.02 per 1K tokens in cents
  },
  enterprise: {
    monthly: 9900, // $99.00 in cents
    overagePerThousandTokens: 1.5, // $0.015 per 1K tokens in cents
  },
} as const;

/**
 * Image constraints for Claude API
 */
export const IMAGE_CONSTRAINTS = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  maxImages: 5, // Max images per request
  supportedFormats: ['image/png', 'image/jpeg', 'image/webp'] as const,
} as const;

/**
 * Request constraints
 */
export const REQUEST_CONSTRAINTS = {
  maxMessageLength: 50_000, // ~12K tokens
  maxConversationHistory: 20, // messages
  maxImages: 5,
} as const;
