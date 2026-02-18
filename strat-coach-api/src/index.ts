import Fastify from 'fastify';
import cors from '@fastify/cors';
import env from '@fastify/env';
import { envSchema } from './config/env.js';
import databasePlugin from './plugins/database.js';
import redisPlugin from './plugins/redis.js';
import authPlugin from './plugins/auth.js';
import rateLimiterPlugin from './plugins/rate-limiter.js';
import chatRoutes from './routes/chat.js';
import usageRoutes from './routes/usage.js';

/**
 * Main server entry point for The Strat Coach API
 *
 * This server acts as a secure proxy between the Electron app and the Anthropic Claude API.
 * Key responsibilities:
 * - Authentication via Clerk JWT
 * - Streaming Claude responses via SSE
 * - Usage tracking per user
 * - Rate limiting
 * - Subscription billing integration with Stripe
 */

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  },
});

/**
 * Server startup
 */
async function start() {
  try {
    // Environment validation
    await server.register(env, {
      schema: envSchema,
      dotenv: true,
    });

    // CORS configuration - only allow Electron app
    await server.register(cors, {
      origin: (origin, callback) => {
        // Allow Electron app (file:// protocol or localhost in dev)
        if (
          !origin ||
          origin === 'null' ||
          origin.startsWith('file://') ||
          (origin.includes('localhost') && process.env.NODE_ENV === 'development')
        ) {
          callback(null, true);
          return;
        }
        // Block all other origins
        callback(new Error('Not allowed by CORS'), false);
      },
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
      credentials: true,
    });

    // Register plugins
    await server.register(databasePlugin);
    await server.register(redisPlugin);
    await server.register(authPlugin, {
      clerkPublishableKey: server.config.CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY || '',
    });
    await server.register(rateLimiterPlugin);

    // Register routes
    await server.register(chatRoutes, { prefix: '/api/v1' });
    await server.register(usageRoutes, { prefix: '/api/v1' });

    // Health check endpoint
    server.get('/api/v1/health', async () => {
      return {
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    });

    // Status endpoint with dependency checks
    server.get('/api/v1/status', async () => {
      // Check database
      const dbHealth = await server.db.healthCheck();

      // Check Redis
      let redisStatus: any = { status: 'not_configured' };
      if (server.redis) {
        try {
          await server.redis.ping();
          redisStatus = { status: 'connected' };
        } catch (error) {
          redisStatus = {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }

      return {
        status: 'ok',
        version: '1.0.0',
        environment: process.env.NODE_ENV,
        dependencies: {
          database: dbHealth,
          redis: redisStatus,
          anthropic: { status: 'pending' }, // Will check in Task 1.5
          stripe: { status: 'pending' },
        },
      };
    });

    // Start server
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });

    server.log.info(`🚀 Server listening on http://${host}:${port}`);
    server.log.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    server.log.info(`🏥 Health check: http://${host}:${port}/api/v1/health`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
  server.log.info('Received SIGINT, shutting down gracefully...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.log.info('Received SIGTERM, shutting down gracefully...');
  await server.close();
  process.exit(0);
});

// Start the server
start();
