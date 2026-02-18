/**
 * Clerk JWT authentication plugin for Fastify
 * Verifies JWT tokens from Clerk and attaches user context to requests
 */

import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Clerk JWT payload structure
 */
interface ClerkJWTPayload {
  sub: string; // Clerk user ID
  email: string;
  email_verified: boolean;
  iat: number;
  exp: number;
  azp?: string; // Authorized party
  metadata?: {
    subscription_tier?: 'free' | 'pro' | 'enterprise';
    stripe_customer_id?: string;
  };
}

/**
 * Auth plugin configuration
 */
interface AuthPluginOptions {
  clerkPublishableKey: string;
}

/**
 * Get Clerk JWKS URL from publishable key
 */
function getJwksUrl(publishableKey: string): string {
  // Extract instance ID from publishable key (format: pk_test_xxxxx or pk_live_xxxxx)
  const parts = publishableKey.split('_');
  if (parts.length < 3) {
    throw new Error('Invalid Clerk publishable key format');
  }

  const env = parts[1]; // 'test' or 'live'
  const instanceId = parts[2];

  return `https://${env}-${instanceId}.clerk.accounts.dev/.well-known/jwks.json`;
}

/**
 * Clerk authentication plugin
 */
const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  server: FastifyInstance,
  options: AuthPluginOptions
) => {
  const { clerkPublishableKey } = options;

  // Create JWKS client for JWT verification
  const jwksUrl = getJwksUrl(clerkPublishableKey);
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));

  server.log.info(`🔐 Auth plugin initialized with JWKS: ${jwksUrl}`);

  /**
   * Verify JWT token
   */
  async function verifyToken(token: string): Promise<ClerkJWTPayload> {
    try {
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: jwksUrl.replace('/.well-known/jwks.json', ''),
      });

      return payload as unknown as ClerkJWTPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Authenticate decorator
   * Verifies JWT and attaches user to request
   */
  server.decorate('authenticate', async function (
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    try {
      // Extract token from Authorization header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid Authorization header',
          },
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify token
      const payload = await verifyToken(token);

      // Check if token is expired
      if (payload.exp * 1000 < Date.now()) {
        return reply.code(401).send({
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'JWT has expired; refresh required',
          },
        });
      }

      // Get or create user in database
      let user = await server.db.getUserByClerkId(payload.sub);

      if (!user) {
        // Create new user on first login
        user = await server.db.createUser({
          clerk_user_id: payload.sub,
          email: payload.email,
        });
        server.log.info(`Created new user: ${user.id} (${user.email})`);
      }

      // Attach user to request
      request.user = {
        id: user.id,
        email: user.email,
        subscription_tier: user.subscription_tier,
        stripe_customer_id: user.stripe_customer_id || undefined,
      };

      // Update last active timestamp
      // (Non-blocking - fire and forget)
      server.db.pool.query(
        'UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      ).catch((err: Error) => {
        server.log.error({ err }, 'Failed to update last_active_at');
      });
    } catch (error) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: error instanceof Error ? error.message : 'Authentication failed',
        },
      });
    }
  });

  /**
   * Optional authentication decorator
   * Like authenticate, but doesn't fail if no token provided
   */
  server.decorate('optionalAuth', async function (
    request: FastifyRequest,
    _reply: FastifyReply
  ) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - continue without user context
      return;
    }

    try {
      const token = authHeader.substring(7);
      const payload = await verifyToken(token);

      if (payload.exp * 1000 >= Date.now()) {
        const user = await server.db.getUserByClerkId(payload.sub);
        if (user) {
          request.user = {
            id: user.id,
            email: user.email,
            subscription_tier: user.subscription_tier,
            stripe_customer_id: user.stripe_customer_id || undefined,
          };
        }
      }
    } catch (error) {
      // Invalid token - log but don't fail request
      server.log.warn({ err: error }, 'Optional auth failed');
    }
  });
};

export default fp(authPlugin, {
  name: 'auth',
  dependencies: ['database'], // Requires database plugin
});
