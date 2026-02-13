/**
 * Unit tests for ClaudeService
 * Tests streaming messages, vision API, error handling, and prompt caching
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ClaudeService } from '../claude';
import * as fs from 'fs';

// Mock Anthropic SDK
let mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

// Mock fs module
vi.mock('fs');

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate = vi.fn();
    service = new ClaudeService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should initialize client with valid API key', () => {
      const apiKey = 'sk-ant-api-key-123456789012345678901234567890';

      service.initialize(apiKey);

      expect(service.isInitialized()).toBe(true);
    });

    it('should throw error if API key format is invalid', () => {
      expect(() => service.initialize('invalid-key')).toThrow('Invalid API key format');
      expect(() => service.initialize('')).toThrow('Invalid API key format');
      expect(() => service.initialize('sk-')).toThrow('Invalid API key format');
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(service.isInitialized()).toBe(false);
    });

    it('should return true after initialization', () => {
      service.initialize('sk-ant-api-key-123456789012345678901234567890');
      expect(service.isInitialized()).toBe(true);
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      service.initialize('sk-ant-api-key-123456789012345678901234567890');
    });

    it('should throw error if not initialized', async () => {
      const uninitializedService = new ClaudeService();

      await expect(
        uninitializedService.sendMessage({
          message: 'test',
        })
      ).rejects.toThrow('Claude client not initialized');
    });

    it('should send text message and handle streaming response', async () => {
      const mockStream = createMockStream([
        { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
        { type: 'message_delta', usage: { output_tokens: 10 } },
      ]);

      mockCreate.mockResolvedValue(mockStream);

      const chunks: string[] = [];
      const result = await service.sendMessage({
        message: 'Test message',
        onChunk: (chunk) => chunks.push(chunk),
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          stream: true,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Test message' }],
            },
          ],
        })
      );

      expect(chunks).toEqual(['Hello', ' world']);
      expect(result.content).toBe('Hello world');
      expect(result.usage.inputTokens).toBe(100);
      expect(result.usage.outputTokens).toBe(10);
    });

    it('should include screenshot in vision request', async () => {
      const mockImageData = Buffer.from('fake-image-data').toString('base64');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data'));

      const mockStream = createMockStream([
        { type: 'message_start', message: { usage: { input_tokens: 500, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'I see the chart' } },
        { type: 'message_delta', usage: { output_tokens: 20 } },
      ]);

      mockCreate.mockResolvedValue(mockStream);

      await service.sendMessage({
        message: 'Analyze this chart',
        screenshotPath: '/path/to/screenshot.png',
      });

      expect(fs.existsSync).toHaveBeenCalledWith('/path/to/screenshot.png');
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/screenshot.png');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: mockImageData,
                  },
                },
                { type: 'text', text: 'Analyze this chart' },
              ],
            },
          ],
        })
      );
    });

    it('should throw error if screenshot file not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(
        service.sendMessage({
          message: 'test',
          screenshotPath: '/nonexistent/file.png',
        })
      ).rejects.toThrow('Screenshot not found');
    });

    it('should include conversation history', async () => {
      const mockStream = createMockStream([
        { type: 'message_start', message: { usage: { input_tokens: 200, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } },
        { type: 'message_delta', usage: { output_tokens: 5 } },
      ]);

      mockCreate.mockResolvedValue(mockStream);

      await service.sendMessage({
        message: 'Follow-up question',
        conversationHistory: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'First message' },
            { role: 'assistant', content: 'First response' },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Follow-up question' }],
            },
          ],
        })
      );
    });

    it('should include prompt caching configuration', async () => {
      const mockStream = createMockStream([
        {
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 100,
              output_tokens: 0,
              cache_creation_input_tokens: 500,
            },
          },
        },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Test' } },
        { type: 'message_delta', usage: { output_tokens: 5 } },
      ]);

      mockCreate.mockResolvedValue(mockStream);

      const result = await service.sendMessage({
        message: 'Test with caching',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: [
            {
              type: 'text',
              text: expect.stringContaining('expert trading coach'),
              cache_control: { type: 'ephemeral' },
            },
          ],
        })
      );

      expect(result.usage.cacheCreationTokens).toBe(500);
    });

    it('should report cache hits', async () => {
      const mockStream = createMockStream([
        {
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 50,
              output_tokens: 0,
              cache_read_input_tokens: 500,
            },
          },
        },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Cached response' } },
        { type: 'message_delta', usage: { output_tokens: 10 } },
      ]);

      mockCreate.mockResolvedValue(mockStream);

      const result = await service.sendMessage({
        message: 'Follow-up with cache',
      });

      expect(result.usage.cacheReadTokens).toBe(500);
    });

    it('should call onComplete callback with full content', async () => {
      const mockStream = createMockStream([
        { type: 'message_start', message: { usage: { input_tokens: 100, output_tokens: 0 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Part 1 ' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Part 2' } },
        { type: 'message_delta', usage: { output_tokens: 15 } },
      ]);

      mockCreate.mockResolvedValue(mockStream);

      const onComplete = vi.fn();

      await service.sendMessage({
        message: 'Test',
        onComplete,
      });

      expect(onComplete).toHaveBeenCalledWith('Part 1 Part 2', {
        input_tokens: 100,
        output_tokens: 15,
        cache_read_input_tokens: undefined,
        cache_creation_input_tokens: undefined,
      });
    });

    it('should call onError callback on API error', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit exceeded'));

      const onError = vi.fn();

      await expect(
        service.sendMessage({
          message: 'Test',
          onError,
        })
      ).rejects.toThrow('Claude API error: API rate limit exceeded');

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toContain('API rate limit exceeded');
    });
  });

  describe('validateApiKey', () => {
    it('should validate correct API key format', () => {
      expect(ClaudeService.validateApiKey('sk-ant-api-key-123456789012345678901234567890')).toBe(
        true
      );
    });

    it('should reject invalid API key formats', () => {
      expect(ClaudeService.validateApiKey('sk-wrong-prefix-123456789012345678901234567890')).toBe(
        false
      );
      expect(ClaudeService.validateApiKey('sk-ant-short')).toBe(false);
      expect(ClaudeService.validateApiKey('')).toBe(false);
      expect(ClaudeService.validateApiKey('invalid')).toBe(false);
    });
  });

  describe('getSystemPrompt', () => {
    it('should return system prompt', () => {
      const prompt = service.getSystemPrompt();

      expect(prompt).toContain('expert trading coach');
      expect(prompt).toContain('Strat methodology');
      expect(prompt).toContain('Scenario 1');
      expect(prompt).toContain('Scenario 2');
      expect(prompt).toContain('Scenario 3');
      expect(prompt).toContain('Timeframe Continuity');
    });
  });
});

/**
 * Helper to create async iterable mock stream
 */
function createMockStream(
  events: Array<Record<string, unknown>>
): AsyncIterable<Record<string, unknown>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}
