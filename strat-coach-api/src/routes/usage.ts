/**
 * Usage routes - Token usage tracking and reporting
 * Handles /api/v1/usage/* endpoints
 */

import { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';

/**
 * Usage routes plugin
 */
export const usageRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  /**
   * GET /api/v1/usage/current
   * Get current billing period usage for authenticated user
   */
  server.get(
    '/api/v1/usage/current',
    {
      preValidation: [server.authenticate],
    },
    async (request: FastifyRequest) => {
      const userId = request.user!.id;
      const tier = request.user!.subscription_tier;

      // Get quota information
      const quota = await server.db.getUserQuota(userId);

      // Get user details for period dates
      const user = await server.db.getUserById(userId);

      if (!user) {
        throw new Error('User not found');
      }

      // Get usage breakdown from recent history
      const recentUsage = await server.db.getUserUsageHistory(userId, 100);

      // Calculate totals
      const periodUsage = recentUsage.filter(
        (record) => record.created_at >= user.period_start_date
      );

      const inputTokensUsed = periodUsage.reduce((sum, r) => sum + r.input_tokens, 0);
      const outputTokensUsed = periodUsage.reduce((sum, r) => sum + r.output_tokens, 0);
      const cachedTokens = periodUsage.reduce((sum, r) => sum + r.cache_read_tokens, 0);

      // Calculate cache performance
      const totalInputWithCache = inputTokensUsed + cachedTokens;
      const cacheHitRate = totalInputWithCache > 0
        ? cachedTokens / totalInputWithCache
        : 0;

      // Estimate cost savings from caching
      const estimatedSavings = (cachedTokens / 1_000_000) * (3.0 - 0.3); // $3 - $0.30

      // Calculate estimated cost
      const estimatedCostUsd = periodUsage.reduce(
        (sum, r) => sum + (r.estimated_cost_usd || 0),
        0
      );

      return {
        userId,
        tier,
        currentPeriod: {
          startDate: user.period_start_date.toISOString(),
          endDate: user.subscription_period_end?.toISOString() || null,
          inputTokensUsed,
          outputTokensUsed,
          totalTokensUsed: quota.tokensUsed,
          cachedTokens,
          tokenLimit: quota.tokenLimit,
          tokensRemaining: quota.tokensRemaining,
          percentUsed: quota.percentUsed,
          requestCount: periodUsage.length,
          estimatedCostUsd: parseFloat(estimatedCostUsd.toFixed(2)),
        },
        cachePerformance: {
          hitRate: parseFloat(cacheHitRate.toFixed(2)),
          estimatedSavings: parseFloat(estimatedSavings.toFixed(2)),
        },
      };
    }
  );

  /**
   * GET /api/v1/usage/history
   * Get historical usage records
   */
  server.get<{
    Querystring: { limit?: number };
  }>(
    '/api/v1/usage/history',
    {
      preValidation: [server.authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 30 },
          },
        },
      },
    },
    async (request) => {
      const userId = request.user!.id;
      const limit = (request.query as any).limit || 30;

      const history = await server.db.getUserUsageHistory(userId, limit);

      return {
        userId,
        history: history.map((record) => ({
          id: record.id,
          conversationId: record.conversation_id,
          inputTokens: record.input_tokens,
          outputTokens: record.output_tokens,
          totalTokens: record.total_tokens,
          cacheReadTokens: record.cache_read_tokens,
          cacheCreationTokens: record.cache_creation_tokens,
          model: record.model,
          requestType: record.request_type,
          success: record.success,
          latencyMs: record.latency_ms,
          errorCode: record.error_code,
          estimatedCostUsd: record.estimated_cost_usd
            ? parseFloat(record.estimated_cost_usd.toString())
            : null,
          timestamp: record.created_at.toISOString(),
        })),
      };
    }
  );
};

export default usageRoutes;
