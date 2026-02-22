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
 *
 * Publishable key format: pk_test_BASE64 or pk_live_BASE64
 * The BASE64 portion decodes to the instance domain with a trailing '$',
 * e.g. "happy-lion-5.clerk.accounts.dev$"
 */
function getJwksUrl(publishableKey: string): string {
  const parts = publishableKey.split('_');
  if (parts.length < 3) {
    throw new Error('Invalid Clerk publishable key format');
  }

  // Decode the base64 instance identifier to get the actual domain
  const instanceB64 = parts[2];
  if (!instanceB64) {
    throw new Error('Invalid Clerk publishable key format');
  }
  const decoded = Buffer.from(instanceB64, 'base64').toString('utf-8');
  // Clerk appends '$' as a sentinel — strip it
  const domain = decoded.replace(/\$$/, '');

  return `https://${domain}/.well-known/jwks.json`;
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
      server.log.error({ err: error }, '[Auth] JWT verification failed');
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Fetch user email from Clerk API using secret key.
   * Needed because the default session token does not include the email claim.
   */
  async function fetchClerkUserEmail(clerkUserId: string): Promise<string> {
    const secretKey = server.config.CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      return `${clerkUserId}@clerk.invalid`;
    }
    try {
      const resp = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (!resp.ok) {
        server.log.warn(`[Auth] Clerk API returned ${resp.status} for user ${clerkUserId}`);
        return `${clerkUserId}@clerk.invalid`;
      }
      const data = await resp.json() as {
        email_addresses?: Array<{ email_address: string; verification?: { status: string } }>;
      };
      const primary = data.email_addresses?.find(e => e.verification?.status === 'verified')
        ?? data.email_addresses?.[0];
      return primary?.email_address ?? `${clerkUserId}@clerk.invalid`;
    } catch (err) {
      server.log.warn({ err }, '[Auth] Failed to fetch email from Clerk API');
      return `${clerkUserId}@clerk.invalid`;
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
        // The default Clerk session token doesn't include an email claim.
        // Fall back to the Clerk Users API to retrieve it.
        const email = payload.email ?? await fetchClerkUserEmail(payload.sub);
        user = await server.db.createUser({
          clerk_user_id: payload.sub,
          email,
        });
        server.log.info(`[Auth] Created new user: ${user.id} (${user.email})`);
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
