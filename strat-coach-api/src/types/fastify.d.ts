/**
 * Fastify type augmentation
 * Extends Fastify types with custom properties
 */

import 'fastify';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { EnvConfig } from '../config/env.js';
import * as queries from '../db/queries.js';
import { RateLimitResult } from '../plugins/rate-limiter.js';
import type { SubscriptionTier } from '../config/constants.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: EnvConfig;
    db: {
      pool: Pool;
      healthCheck: () => Promise<{
        status: 'connected' | 'error';
        latency_ms?: number;
        error?: string;
      }>;
    } & typeof queries;
    redis: Redis | null;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    rateLimiter: {
      check: (userId: string, tier: SubscriptionTier) => Promise<RateLimitResult>;
      middleware: (request: FastifyRequest) => Promise<void>;
      recordEvent: (
        userId: string,
        eventType: 'request' | 'quota_exceeded' | 'rate_limited',
        ipAddress?: string
      ) => Promise<void>;
    };
  }

  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      subscription_tier: 'free' | 'pro' | 'enterprise';
      stripe_customer_id?: string;
    };
  }
}
