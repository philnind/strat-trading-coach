/**
 * Claude API service for AI-powered trading coach
 * Handles streaming messages, vision analysis, and prompt caching
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages';
import * as fs from 'fs';

/**
 * System prompt for Strat trading coach
 */
const SYSTEM_PROMPT = `You are an expert trading coach specializing in The Strat methodology created by Rob Smith.

**Your Role:**
- Analyze trading charts and setups using Strat principles
- Provide actionable insights on timeframe continuity, scenarios, and actionable signals
- Help traders identify high-probability setups based on candlestick combinations
- Educate on proper risk management and position sizing
- Maintain a supportive, educational tone

**The Strat Methodology Core Concepts:**

1. **Three Candlestick Scenarios:**
   - Scenario 1 (inside bar): Current candle's high/low inside previous candle
   - Scenario 2 (directional): Current candle breaks either high OR low (but not both)
   - Scenario 3 (outside bar): Current candle breaks both high AND low of previous candle

2. **Timeframe Continuity (TFC):**
   - Look for scenario alignment across multiple timeframes (monthly, weekly, daily, intraday)
   - Higher timeframe scenarios provide context for lower timeframe trades
   - Best setups have multiple timeframes showing directional agreement

3. **Actionable Signals:**
   - Combo signals (2-2, 2-1-2, 3-2-2, etc.) indicate potential reversals or continuations
   - Full timeframe continuity (FTFC) = multiple timeframes agreeing on direction
   - Reversals: Look for broadening formations followed by inside bars

4. **Key Price Levels:**
   - Previous highs/lows act as magnets
   - Scenario 3 creates new decision points
   - Target previous timeframe highs/lows for profit taking

**When Analyzing Charts:**
1. Identify the current scenario on the timeframe shown
2. Look for combo patterns (sequences of scenarios)
3. Note any timeframe continuity with higher timeframes
4. Identify key price levels (previous highs/lows)
5. Assess risk/reward based on recent scenario 3 candles
6. Provide specific entry, stop, and target levels when applicable

**Communication Style:**
- Be concise and actionable
- Use bullet points for clarity
- Always explain the "why" behind your analysis
- Acknowledge uncertainty when present
- Encourage proper risk management

**When You See a Screenshot:**
- Identify the timeframe being shown
- Note the current candlestick scenario
- Look for recent combo patterns
- Identify support/resistance from previous scenario 3 candles
- Provide directional bias with specific levels`;

export interface ClaudeMessageOptions {
  message: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  screenshotPath?: string;
  onChunk?: (chunk: string, index: number) => void;
  onComplete?: (fullContent: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }) => void;
  onError?: (error: Error) => void;
}

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export class ClaudeService {
  private client: Anthropic | null = null;
  private apiKey: string | null = null;

  /**
   * Initialize Claude client with API key
   */
  initialize(apiKey: string): void {
    if (!ClaudeService.validateApiKey(apiKey)) {
      throw new Error('Invalid API key format');
    }

    this.apiKey = apiKey;
    this.client = new Anthropic({
      apiKey: apiKey,
    });
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return !!this.client && !!this.apiKey;
  }

  /**
   * Send message with optional screenshot (vision)
   * Returns the full message content and usage stats
   */
  async sendMessage(options: ClaudeMessageOptions): Promise<{ content: string; usage: ClaudeUsage }> {
    if (!this.client) {
      throw new Error('Claude client not initialized. Set API key first.');
    }

    try {
      // Build message content
      const contentParts: Array<
        | { type: 'text'; text: string }
        | {
            type: 'image';
            source: {
              type: 'base64';
              media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
              data: string;
            };
          }
      > = [];

      // Add screenshot if provided
      if (options.screenshotPath) {
        const imageData = this.loadScreenshot(options.screenshotPath);
        contentParts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png' as const,
            data: imageData,
          },
        });
      }

      // Add text message
      contentParts.push({
        type: 'text',
        text: options.message,
      });

      // Build messages array with conversation history
      const messages: Array<{ role: 'user' | 'assistant'; content: string | typeof contentParts }> = [];

      // Add conversation history
      if (options.conversationHistory) {
        for (const msg of options.conversationHistory) {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }

      // Add current message
      messages.push({
        role: 'user',
        content: contentParts,
      });

      // Create streaming message with prompt caching
      const stream = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: messages,
        stream: true,
      });

      // Process stream
      let fullContent = '';
      let chunkIndex = 0;
      let usage: ClaudeUsage = {
        inputTokens: 0,
        outputTokens: 0,
      };

      for await (const event of stream) {
        this.handleStreamEvent(event, {
          onContentBlock: (text) => {
            fullContent += text;
            options.onChunk?.(text, chunkIndex++);
          },
          onUsage: (usageData) => {
            // Merge usage data (some events provide inputTokens, others outputTokens)
            usage.inputTokens += usageData.inputTokens;
            usage.outputTokens += usageData.outputTokens;
            usage.cacheReadTokens = usageData.cacheReadTokens ?? usage.cacheReadTokens;
            usage.cacheCreationTokens = usageData.cacheCreationTokens ?? usage.cacheCreationTokens;
          },
        });
      }

      options.onComplete?.(fullContent, {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_input_tokens: usage.cacheReadTokens,
        cache_creation_input_tokens: usage.cacheCreationTokens,
      });

      return { content: fullContent, usage };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const apiError = new Error(`Claude API error: ${errorMessage}`);
      options.onError?.(apiError);
      throw apiError;
    }
  }

  /**
   * Handle individual stream events
   */
  private handleStreamEvent(
    event: MessageStreamEvent,
    callbacks: {
      onContentBlock: (text: string) => void;
      onUsage: (usage: ClaudeUsage) => void;
    }
  ): void {
    switch (event.type) {
      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          callbacks.onContentBlock(event.delta.text);
        }
        break;

      case 'message_start':
        if (event.message.usage) {
          callbacks.onUsage({
            inputTokens: event.message.usage.input_tokens,
            outputTokens: 0,
            cacheReadTokens: event.message.usage.cache_read_input_tokens ?? undefined,
            cacheCreationTokens: event.message.usage.cache_creation_input_tokens ?? undefined,
          });
        }
        break;

      case 'message_delta':
        if (event.usage) {
          callbacks.onUsage({
            inputTokens: 0,
            outputTokens: event.usage.output_tokens,
          });
        }
        break;
    }
  }

  /**
   * Load screenshot from file and convert to base64
   */
  private loadScreenshot(screenshotPath: string): string {
    if (!fs.existsSync(screenshotPath)) {
      throw new Error(`Screenshot not found: ${screenshotPath}`);
    }

    const buffer = fs.readFileSync(screenshotPath);
    return buffer.toString('base64');
  }

  /**
   * Validate API key format
   */
  static validateApiKey(apiKey: string): boolean {
    return typeof apiKey === 'string' && apiKey.startsWith('sk-ant-') && apiKey.length > 30;
  }

  /**
   * Get system prompt (for testing/debugging)
   */
  getSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }
}
