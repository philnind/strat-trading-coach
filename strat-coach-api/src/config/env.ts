/**
 * Environment variable schema and validation
 * Uses @fastify/env for type-safe environment configuration
 */

export const envSchema = {
  type: 'object',
  required: [],
  properties: {
    // Server
    NODE_ENV: {
      type: 'string',
      default: 'development',
      enum: ['development', 'production', 'test'],
    },
    PORT: {
      type: 'number',
      default: 3001,
    },
    HOST: {
      type: 'string',
      default: '0.0.0.0',
    },
    LOG_LEVEL: {
      type: 'string',
      default: 'info',
      enum: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    },

    // Database (optional for now, required in Phase 1 Task 1.2)
    DATABASE_URL: {
      type: 'string',
      default: '',
    },

    // Redis (optional for now, required in Phase 1 Task 1.4)
    REDIS_URL: {
      type: 'string',
      default: '',
    },

    // Anthropic (optional for now, required in Phase 1 Task 1.5)
    ANTHROPIC_API_KEY: {
      type: 'string',
      default: '',
    },

    // Clerk (optional for now, required in Phase 1 Task 1.3)
    CLERK_SECRET_KEY: {
      type: 'string',
      default: '',
    },
    CLERK_PUBLISHABLE_KEY: {
      type: 'string',
      default: '',
    },

    // Stripe (optional for now, required in Phase 2)
    STRIPE_SECRET_KEY: {
      type: 'string',
      default: '',
    },
    STRIPE_WEBHOOK_SECRET: {
      type: 'string',
      default: '',
    },

    // CORS
    CORS_ORIGIN: {
      type: 'string',
      default: 'http://localhost:5173',
    },
  },
};

export type EnvConfig = {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  HOST: string;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  DATABASE_URL: string;
  REDIS_URL: string;
  ANTHROPIC_API_KEY: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  CORS_ORIGIN: string;
};
