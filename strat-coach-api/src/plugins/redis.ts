/**
 * Redis client plugin for Fastify
 * Provides Redis connection for caching and rate limiting
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import Redis from 'ioredis';

/**
 * Redis plugin
 * Decorates server with Redis client
 */
const redisPlugin: FastifyPluginAsync = async (server: FastifyInstance) => {
  const redisUrl = server.config.REDIS_URL || process.env.REDIS_URL;

  if (!redisUrl) {
    server.log.warn('⚠️  REDIS_URL not configured - rate limiting disabled');
    // Decorate with null client for graceful degradation
    server.decorate('redis', null);
    return;
  }

  // Create Redis client
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError(err: Error) {
      const targetErrors = ['READONLY', 'ECONNREFUSED'];
      return targetErrors.some((targetError) =>
        err.message.includes(targetError)
      );
    },
  });

  // Handle connection errors
  redis.on('error', (err) => {
    server.log.error('Redis connection error:', err);
  });

  redis.on('connect', () => {
    server.log.info('📡 Redis connected');
  });

  redis.on('ready', () => {
    server.log.info('📡 Redis ready');
  });

  // Test connection
  try {
    await redis.ping();
    const latency = await redis.ping('LATENCY');
    server.log.info(`📡 Redis ping successful (latency: ${latency})`);
  } catch (error) {
    server.log.error('❌ Redis ping failed:', error);
    throw error;
  }

  // Decorate server
  server.decorate('redis', redis);

  // Close Redis on server close
  server.addHook('onClose', async () => {
    server.log.info('Closing Redis connection...');
    await redis.quit();
  });
};

export default fp(redisPlugin, {
  name: 'redis',
});
