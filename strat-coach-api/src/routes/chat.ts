/**
 * Chat routes - Claude API proxy with SSE streaming
 * Handles /api/v1/chat/stream endpoint
 */

import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { ClaudeService } from '../services/claude.js';
import { REQUEST_CONSTRAINTS, IMAGE_CONSTRAINTS, CLAUDE_CONFIG } from '../config/constants.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Chat stream request body
 */
interface ChatStreamBody {
  message: string;
  conversationId?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  images?: Array<{
    data: string;
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
    label?: string;
  }>;
  options?: {
    maxTokens?: number;
  };
}

/**
 * Load coaching methodology system prompt
 * Cached in memory after first load
 */
let systemPrompt: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (systemPrompt) {
    return systemPrompt;
  }

  const coachingDir = join(__dirname, '../../coaching');
  const coachingPromptPath = join(coachingDir, 'TRADING-COACH-SYSTEM-PROMPT.md');
  const guardrailsPath = join(coachingDir, 'THE-STRAT-GUARDRAILS.md');

  if (existsSync(coachingPromptPath) && existsSync(guardrailsPath)) {
    const coachingPrompt = readFileSync(coachingPromptPath, 'utf-8');
    const guardrails = readFileSync(guardrailsPath, 'utf-8');
    systemPrompt = `${coachingPrompt}\n\n---\n\n${guardrails}`;
  } else {
    console.error(`[chat] Coaching files not found in ${coachingDir} — using fallback prompt`);
    systemPrompt = 'You are an AI trading assistant specialized in The Strat methodology.';
  }

  return systemPrompt;
}

/**
 * Chat routes plugin
 */
export const chatRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Initialize Claude service
  const anthropicApiKey = server.config.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!anthropicApiKey) {
    server.log.warn('⚠️  ANTHROPIC_API_KEY not configured - chat endpoints disabled');
    return;
  }

  const claudeService = new ClaudeService(anthropicApiKey);
  server.log.info('🤖 Claude service initialized');

  /**
   * POST /chat/stream  (full path: /api/v1/chat/stream via plugin prefix)
   * Stream a chat completion via SSE
   */
  server.post<{ Body: ChatStreamBody }>(
    '/chat/stream',
    {
      preValidation: [server.authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            message: {
              type: 'string',
              minLength: 1,
              maxLength: REQUEST_CONSTRAINTS.maxMessageLength,
            },
            conversationId: { type: 'string', format: 'uuid' },
            conversationHistory: {
              type: 'array',
              maxItems: REQUEST_CONSTRAINTS.maxConversationHistory,
              items: {
                type: 'object',
                required: ['role', 'content'],
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string', maxLength: REQUEST_CONSTRAINTS.maxMessageLength },
                },
              },
            },
            images: {
              type: 'array',
              maxItems: IMAGE_CONSTRAINTS.maxImages,
              items: {
                type: 'object',
                required: ['data', 'mediaType'],
                properties: {
                  data: {
                    type: 'string',
                    maxLength: 7_000_000, // ~5MB base64
                  },
                  mediaType: {
                    type: 'string',
                    enum: Array.from(IMAGE_CONSTRAINTS.supportedFormats),
                  },
                  label: { type: 'string' },
                },
              },
            },
            options: {
              type: 'object',
              properties: {
                maxTokens: { type: 'number', minimum: 1, maximum: 8192 },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: ChatStreamBody }>, reply: FastifyReply) => {
      const { message, conversationHistory, images, options, conversationId } = request.body;
      const selectedModel = images?.length ? CLAUDE_CONFIG.models.vision : CLAUDE_CONFIG.models.text;
      const userId = request.user!.id;
      const userTier = request.user!.subscription_tier;

      // 1. Check rate limit
      const rateCheck = await server.rateLimiter.check(userId, userTier);
      if (!rateCheck.allowed) {
        return reply.code(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: `Rate limit exceeded. Retry after ${rateCheck.retryAfter}s`,
            details: { retryAfter: rateCheck.retryAfter },
            requestId: request.id,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // 2. Check quota
      const quota = await server.db.getUserQuota(userId);
      if (quota.tokensRemaining <= 0 && userTier === 'free') {
        // Record quota exceeded event
        await server.rateLimiter.recordEvent(userId, 'quota_exceeded', request.ip);

        return reply.code(429).send({
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Monthly token limit reached.',
            details: {
              tokensUsed: quota.tokensUsed,
              tokenLimit: quota.tokenLimit,
              tier: userTier,
              upgradeUrl: 'https://stratcoach.app/upgrade',
            },
            requestId: request.id,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // 3. Configure SSE response
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': request.id,
        'X-RateLimit-Remaining': String(rateCheck.remaining),
      });

      // 4. Load system prompt
      const systemPrompt = await loadSystemPrompt();

      // 5. Send stream_start event
      reply.raw.write(
        `event: stream_start\ndata: ${JSON.stringify({
          conversationId: conversationId || null,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );

      // 6. Track request start time for latency
      const startTime = Date.now();
      let fullResponse = '';

      // 7. Stream from Claude
      await claudeService.streamChat(
        {
          message,
          conversationHistory,
          images,
          maxTokens: options?.maxTokens,
          systemPrompt,
          model: selectedModel,
        },
        {
          onStart: (messageId) => {
            reply.raw.write(
              `event: message_start\ndata: ${JSON.stringify({ messageId })}\n\n`
            );
          },
          onDelta: (text) => {
            fullResponse += text;
            reply.raw.write(
              `event: content_delta\ndata: ${JSON.stringify({ delta: text })}\n\n`
            );
          },
          onComplete: async (usage) => {
            const latencyMs = Date.now() - startTime;

            // Record usage in database
            try {
              await server.db.recordUsage({
                userId,
                conversationId,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cacheReadTokens: usage.cacheReadTokens,
                cacheCreationTokens: usage.cacheCreationTokens,
                model: selectedModel,
                requestType: images?.length ? 'vision' : 'chat',
                success: true,
                latencyMs,
              });

              // Get updated quota
              const updatedQuota = await server.db.getUserQuota(userId);

              // Send completion event
              reply.raw.write(
                `event: stream_complete\ndata: ${JSON.stringify({
                  usage: {
                    input_tokens: usage.inputTokens,
                    output_tokens: usage.outputTokens,
                    cache_read_tokens: usage.cacheReadTokens,
                    cache_creation_tokens: usage.cacheCreationTokens,
                  },
                  tokensRemaining: updatedQuota.tokensRemaining,
                  timestamp: new Date().toISOString(),
                })}\n\n`
              );
            } catch (error) {
              server.log.error({ err: error }, 'Failed to record usage');
              // Send completion even if usage recording failed
              reply.raw.write(
                `event: stream_complete\ndata: ${JSON.stringify({
                  usage: {
                    input_tokens: usage.inputTokens,
                    output_tokens: usage.outputTokens,
                    cache_read_tokens: usage.cacheReadTokens,
                    cache_creation_tokens: usage.cacheCreationTokens,
                  },
                  timestamp: new Date().toISOString(),
                })}\n\n`
              );
            }

            // Close stream
            reply.raw.end();
          },
          onError: (error) => {
            server.log.error({ err: error }, 'Claude stream error');

            // Determine error code
            let errorCode = 'CLAUDE_API_ERROR';
            if (error.message.includes('rate')) {
              errorCode = 'CLAUDE_RATE_LIMITED';
            } else if (error.message.includes('overloaded')) {
              errorCode = 'CLAUDE_OVERLOADED';
            }

            // Send error event
            reply.raw.write(
              `event: stream_error\ndata: ${JSON.stringify({
                error: error.message,
                code: errorCode,
                timestamp: new Date().toISOString(),
              })}\n\n`
            );

            // Record failed usage
            server.db.recordUsage({
              userId,
              conversationId,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheCreationTokens: 0,
              model: 'claude-sonnet-4-20250514',
              success: false,
              errorCode,
            }).catch((err) => {
              server.log.error('Failed to record error usage:', err);
            });

            // Close stream
            reply.raw.end();
          },
        }
      );
    }
  );
};

export default chatRoutes;
