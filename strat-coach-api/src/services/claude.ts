/**
 * Claude service - Anthropic SDK wrapper
 * Handles streaming responses and usage tracking
 */

import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_CONFIG } from '../config/constants.js';

/**
 * Message content (can include images)
 */
export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg' | 'image/webp';
    data: string;
  };
}

/**
 * Chat message
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | MessageContent[];
}

/**
 * Stream chat request
 */
export interface StreamChatRequest {
  message: string;
  conversationHistory?: ChatMessage[];
  images?: Array<{
    data: string; // base64
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
    label?: string;
  }>;
  maxTokens?: number;
  systemPrompt?: string;
  model?: string;
}

/**
 * Usage data from Claude API
 */
export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/**
 * Stream callbacks
 */
export interface StreamCallbacks {
  onStart?: (messageId: string) => void;
  onDelta: (text: string) => void;
  onComplete: (usage: UsageData) => void;
  onError: (error: Error) => void;
}

/**
 * Claude service class
 */
export class ClaudeService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Stream a chat completion
   */
  async streamChat(
    request: StreamChatRequest,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const { message, conversationHistory, images, maxTokens, systemPrompt, model } = request;

    // Build content parts (images + text)
    const contentParts: Anthropic.ContentBlockParam[] = [];

    // Add images first (if present)
    if (images?.length) {
      for (const img of images) {
        contentParts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mediaType,
            data: img.data,
          },
        });
      }
    }

    // Add text message
    contentParts.push({
      type: 'text',
      text: message,
    });

    // Build messages array
    const messages: Anthropic.MessageParam[] = [];

    // Add conversation history
    if (conversationHistory) {
      for (const msg of conversationHistory) {
        const content: string | Anthropic.ContentBlockParam[] =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content.map(c => {
                if (c.type === 'text') {
                  return { type: 'text' as const, text: c.text || '' };
                } else {
                  return {
                    type: 'image' as const,
                    source: c.source!,
                  };
                }
              });

        messages.push({
          role: msg.role,
          content,
        });
      }
    }

    // Add current message
    messages.push({
      role: 'user',
      content: contentParts,
    });

    // Build system prompt (with caching)
    const systemBlocks: Array<Anthropic.Messages.TextBlockParam & { cache_control?: { type: 'ephemeral' } }> = [];

    if (systemPrompt) {
      systemBlocks.push({
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' }, // Enable prompt caching (90% cost savings!)
      });
    }

    try {
      // Create streaming request
      const stream = await this.client.messages.create({
        model: model ?? CLAUDE_CONFIG.models.text,
        max_tokens: maxTokens || CLAUDE_CONFIG.maxTokens,
        temperature: CLAUDE_CONFIG.temperature,
        system: systemBlocks.length > 0 ? systemBlocks : undefined,
        messages,
        stream: true,
      });

      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let cacheCreationTokens = 0;
      let messageId: string | undefined;

      // Process stream events
      for await (const event of stream) {
        switch (event.type) {
          case 'message_start':
            messageId = event.message.id;
            inputTokens = event.message.usage.input_tokens;
            cacheReadTokens = event.message.usage.cache_read_input_tokens || 0;
            cacheCreationTokens = event.message.usage.cache_creation_input_tokens || 0;

            if (callbacks.onStart && messageId) {
              callbacks.onStart(messageId);
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              callbacks.onDelta(event.delta.text);
            }
            break;

          case 'message_delta':
            if (event.delta.stop_reason === 'end_turn') {
              outputTokens = event.usage.output_tokens;
            }
            break;

          case 'message_stop':
            // Stream complete
            callbacks.onComplete({
              inputTokens,
              outputTokens,
              cacheReadTokens,
              cacheCreationTokens,
            });
            break;
        }
      }
    } catch (error) {
      callbacks.onError(
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  /**
   * Health check - verify API key is valid
   */
  async healthCheck(): Promise<{
    status: 'ok' | 'error';
    error?: string;
  }> {
    try {
      // Try a minimal API call to verify credentials
      await this.client.messages.create({
        model: CLAUDE_CONFIG.models.text,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      });

      return { status: 'ok' };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
