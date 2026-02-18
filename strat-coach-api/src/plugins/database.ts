/**
 * Database plugin for Fastify
 * Registers database connection pool and decorates server instance
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { getPool, closePool, healthCheck } from '../db/index.js';
import * as queries from '../db/queries.js';

/**
 * Database plugin
 * Decorates server with `db` object containing query functions
 */
const databasePlugin: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Get connection pool
  const pool = getPool();

  // Decorate server with database queries
  server.decorate('db', {
    pool,
    healthCheck,
    ...queries,
  });

  // Test connection on startup
  try {
    const health = await healthCheck();
    if (health.status === 'connected') {
      server.log.info(
        `📊 Database connected (${health.latency_ms}ms latency)`
      );
    } else {
      throw new Error(health.error || 'Database connection failed');
    }
  } catch (error) {
    server.log.error({ err: error }, '❌ Database connection failed');
    throw error;
  }

  // Close pool on server close
  server.addHook('onClose', async () => {
    server.log.info('Closing database connections...');
    await closePool();
  });
};

export default fp(databasePlugin, {
  name: 'database',
});
