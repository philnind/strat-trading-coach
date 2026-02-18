/**
 * Rate limiter plugin for Fastify
 * Implements distributed rate limiting using Redis
 */

import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { RATE_LIMITS } from '../config/constants.js';
import type { SubscriptionTier } from '../config/constants.js';

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number; // Seconds until rate limit resets
}

/**
 * Rate limiter plugin
 * Decorates server with rateLimiter methods
 */
const rateLimiterPlugin: FastifyPluginAsync = async (server: FastifyInstance) => {
  /**
   * Check rate limit for a user
   */
  async function checkRateLimit(
    userId: string,
    tier: SubscriptionTier
  ): Promise<RateLimitResult> {
    // If Redis not available, allow all requests (graceful degradation)
    if (!server.redis) {
      server.log.warn('Rate limiting disabled - Redis not available');
      return {
        allowed: true,
        remaining: 999,
      };
    }

    const limits = RATE_LIMITS[tier];
    const now = Date.now();
    const minuteKey = `rl:${userId}:min:${Math.floor(now / 60000)}`;
    const hourKey = `rl:${userId}:hr:${Math.floor(now / 3600000)}`;

    try {
      // Use Redis pipeline for atomic multi-key operation
      const pipeline = server.redis.pipeline();
      pipeline.incr(minuteKey);
      pipeline.expire(minuteKey, 60);
      pipeline.incr(hourKey);
      pipeline.expire(hourKey, 3600);

      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Redis pipeline returned null');
      }

      const minuteCount = (results[0]?.[1] as number) || 0;
      const hourCount = (results[2]?.[1] as number) || 0;

      // Check per-minute limit
      if (minuteCount > limits.perMinute) {
        return {
          allowed: false,
          remaining: 0,
          retryAfter: 60 - (Math.floor(now / 1000) % 60),
        };
      }

      // Check per-hour limit
      if (hourCount > limits.perHour) {
        return {
          allowed: false,
          remaining: 0,
          retryAfter: 3600 - (Math.floor(now / 1000) % 3600),
        };
      }

      // Calculate remaining requests
      const remaining = Math.min(
        limits.perMinute - minuteCount,
        limits.perHour - hourCount
      );

      return {
        allowed: true,
        remaining,
      };
    } catch (error) {
      server.log.error({ err: error }, 'Rate limit check failed');
      // On error, allow request (fail open)
      return {
        allowed: true,
        remaining: 999,
      };
    }
  }

  /**
   * Record a rate limit event (for abuse detection)
   */
  async function recordRateLimitEvent(
    userId: string,
    eventType: 'request' | 'quota_exceeded' | 'rate_limited',
    ipAddress?: string
  ): Promise<void> {
    try {
      await server.db.pool.query(
        `INSERT INTO rate_limit_events (user_id, event_type, ip_address)
         VALUES ($1, $2, $3)`,
        [userId, eventType, ipAddress]
      );
    } catch (error) {
      // Non-critical - log but don't fail request
      server.log.error({ err: error }, 'Failed to record rate limit event');
    }
  }

  /**
   * Rate limit middleware
   * Can be used as a preValidation hook on protected routes
   */
  async function rateLimitMiddleware(request: FastifyRequest): Promise<void> {
    if (!request.user) {
      // Not authenticated - skip rate limiting
      return;
    }

    const result = await checkRateLimit(
      request.user.id,
      request.user.subscription_tier
    );

    // Add rate limit headers
    request.server.addHook('onSend', async (req, reply) => {
      if (req.id === request.id) {
        reply.header('X-RateLimit-Remaining', String(result.remaining));
        if (result.retryAfter) {
          reply.header('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + result.retryAfter));
        }
      }
    });

    if (!result.allowed) {
      // Record rate limit event
      await recordRateLimitEvent(
        request.user.id,
        'rate_limited',
        request.ip
      );

      throw {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Retry after ${result.retryAfter}s`,
        code: 'RATE_LIMITED',
        retryAfter: result.retryAfter,
      };
    }

    // Record request event (non-blocking)
    recordRateLimitEvent(request.user.id, 'request', request.ip).catch(() => {
      // Ignore errors
    });
  }

  // Decorate server with rate limiter
  server.decorate('rateLimiter', {
    check: checkRateLimit,
    middleware: rateLimitMiddleware,
    recordEvent: recordRateLimitEvent,
  });

  server.log.info('⏱️  Rate limiter plugin initialized');
};

export default fp(rateLimiterPlugin, {
  name: 'rate-limiter',
  dependencies: ['redis', 'database'],
});
