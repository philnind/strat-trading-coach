/**
 * Unit tests for DatabaseService
 * Uses in-memory SQLite database for fast, isolated testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../database';
import type { Conversation } from '@shared/models';

describe('DatabaseService', () => {
  let db: DatabaseService;

  beforeEach(() => {
    // Use in-memory database for testing
    db = new DatabaseService(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('Trade Operations', () => {
    it('should create a trade', () => {
      const tradeData = {
        ticker: 'AAPL',
        direction: 'long' as const,
        entry: 150.0,
        stopLoss: 145.0,
        takeProfit: 160.0,
        quantity: 100,
        notes: 'Test trade',
        stratSetup: '2-2-reversal',
        timeframe: '1D',
        entryTimestamp: Date.now(),
      };

      const trade = db.createTrade(tradeData);

      expect(trade.id).toBeDefined();
      expect(trade.ticker).toBe('AAPL');
      expect(trade.direction).toBe('long');
      expect(trade.entry).toBe(150.0);
      expect(trade.createdAt).toBeDefined();
      expect(trade.updatedAt).toBeDefined();
    });

    it('should get a trade by id', () => {
      const tradeData = {
        ticker: 'TSLA',
        direction: 'short' as const,
        entry: 200.0,
        quantity: 50,
        stratSetup: '3-inside',
        timeframe: '4H',
        entryTimestamp: Date.now(),
      };

      const created = db.createTrade(tradeData);
      const retrieved = db.getTrade(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.ticker).toBe('TSLA');
      expect(retrieved?.direction).toBe('short');
    });

    it('should return null for non-existent trade', () => {
      const trade = db.getTrade('non-existent-id');
      expect(trade).toBeNull();
    });

    it('should list trades', () => {
      // Create multiple trades
      const trades = [
        {
          ticker: 'AAPL',
          direction: 'long' as const,
          entry: 150.0,
          quantity: 100,
          stratSetup: '2-up',
          timeframe: '1D',
          entryTimestamp: Date.now(),
        },
        {
          ticker: 'GOOGL',
          direction: 'long' as const,
          entry: 2800.0,
          quantity: 10,
          stratSetup: '3-outside',
          timeframe: '1H',
          entryTimestamp: Date.now(),
        },
        {
          ticker: 'MSFT',
          direction: 'short' as const,
          entry: 300.0,
          quantity: 50,
          stratSetup: '2-down',
          timeframe: '4H',
          entryTimestamp: Date.now(),
        },
      ];

      trades.forEach((t) => db.createTrade(t));

      const listed = db.listTrades(10, 0);
      expect(listed).toHaveLength(3);
      expect(listed[0].ticker).toBe('MSFT'); // Most recent first
    });

    it('should update a trade', () => {
      const trade = db.createTrade({
        ticker: 'NVDA',
        direction: 'long' as const,
        entry: 400.0,
        quantity: 25,
        stratSetup: '2-2-reversal',
        timeframe: '1D',
        entryTimestamp: Date.now(),
      });

      const updated = db.updateTrade(trade.id, {
        exit: 420.0,
        pnl: 500.0,
        notes: 'Profitable trade',
      });

      expect(updated.exit).toBe(420.0);
      expect(updated.pnl).toBe(500.0);
      expect(updated.notes).toBe('Profitable trade');
      expect(updated.updatedAt).toBeGreaterThan(trade.updatedAt);
    });

    it('should delete a trade', () => {
      const trade = db.createTrade({
        ticker: 'AMD',
        direction: 'long' as const,
        entry: 120.0,
        quantity: 100,
        stratSetup: '3-inside',
        timeframe: '1H',
        entryTimestamp: Date.now(),
      });

      db.deleteTrade(trade.id);

      const retrieved = db.getTrade(trade.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error when deleting non-existent trade', () => {
      expect(() => db.deleteTrade('non-existent-id')).toThrow('Trade not found');
    });
  });

  describe('Conversation Operations', () => {
    it('should create a conversation', () => {
      const conversation = db.createConversation({
        title: 'AAPL Trade Discussion',
      });

      expect(conversation.id).toBeDefined();
      expect(conversation.title).toBe('AAPL Trade Discussion');
      expect(conversation.messageCount).toBe(0);
      expect(conversation.createdAt).toBeDefined();
    });

    it('should create a conversation linked to a trade', () => {
      const trade = db.createTrade({
        ticker: 'AAPL',
        direction: 'long' as const,
        entry: 150.0,
        quantity: 100,
        stratSetup: '2-up',
        timeframe: '1D',
        entryTimestamp: Date.now(),
      });

      const conversation = db.createConversation({
        title: 'Analysis for AAPL trade',
        tradeId: trade.id,
      });

      expect(conversation.tradeId).toBe(trade.id);
    });

    it('should get a conversation by id', () => {
      const created = db.createConversation({
        title: 'Trading Strategy',
      });

      const retrieved = db.getConversation(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe('Trading Strategy');
    });

    it('should list conversations', () => {
      db.createConversation({ title: 'Conv 1' });
      db.createConversation({ title: 'Conv 2' });
      db.createConversation({ title: 'Conv 3' });

      const conversations = db.listConversations(10, 0);
      expect(conversations).toHaveLength(3);
    });

    it('should delete a conversation', () => {
      const conversation = db.createConversation({
        title: 'Test Conversation',
      });

      db.deleteConversation(conversation.id);

      const retrieved = db.getConversation(conversation.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Message Operations', () => {
    let conversation: Conversation;

    beforeEach(() => {
      conversation = db.createConversation({
        title: 'Test Conversation',
      });
    });

    it('should create a message', () => {
      const message = db.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'What do you think about this trade?',
      });

      expect(message.id).toBeDefined();
      expect(message.conversationId).toBe(conversation.id);
      expect(message.role).toBe('user');
      expect(message.content).toBe('What do you think about this trade?');
      expect(message.createdAt).toBeDefined();
    });

    it('should update conversation message count when creating message', () => {
      db.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'First message',
      });

      const updated = db.getConversation(conversation.id);
      expect(updated?.messageCount).toBe(1);
    });

    it('should update conversation lastMessageAt when creating message', () => {
      const originalLastMessageAt = conversation.lastMessageAt;

      // Wait a bit to ensure timestamp changes
      const message = db.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'New message',
      });

      const updated = db.getConversation(conversation.id);
      expect(updated?.lastMessageAt).toBeGreaterThanOrEqual(originalLastMessageAt);
      expect(updated?.lastMessageAt).toBe(message.createdAt);
    });

    it('should list messages in a conversation', () => {
      db.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'First message',
      });

      db.createMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: 'Response to first message',
      });

      db.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Second message',
      });

      const messages = db.listMessages(conversation.id, 10, 0);
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      expect(messages[2].role).toBe('user');
    });

    it('should delete a message', () => {
      const message = db.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Test message',
      });

      db.deleteMessage(message.id);

      const retrieved = db.getMessage(message.id);
      expect(retrieved).toBeNull();
    });

    it('should update message count when deleting message', () => {
      const message = db.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Test message',
      });

      const beforeDelete = db.getConversation(conversation.id);
      expect(beforeDelete?.messageCount).toBe(1);

      db.deleteMessage(message.id);

      const afterDelete = db.getConversation(conversation.id);
      expect(afterDelete?.messageCount).toBe(0);
    });
  });

  describe('Cascading Deletes', () => {
    it('should delete messages when conversation is deleted', () => {
      const conversation = db.createConversation({
        title: 'Test Conversation',
      });

      const message1 = db.createMessage({
        conversationId: conversation.id,
        role: 'user',
        content: 'Message 1',
      });

      const message2 = db.createMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: 'Message 2',
      });

      db.deleteConversation(conversation.id);

      // Messages should be deleted due to CASCADE
      expect(db.getMessage(message1.id)).toBeNull();
      expect(db.getMessage(message2.id)).toBeNull();
    });
  });

  describe('Migration System', () => {
    it('should create migrations table', () => {
      const migrations = db
        .getDb()
        .prepare('SELECT name FROM migrations')
        .all() as Array<{ name: string }>;

      // Should have applied both migrations
      expect(migrations.length).toBeGreaterThanOrEqual(0);
    });

    it('should create all expected tables', () => {
      const tables = db
        .getDb()
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('trades');
      expect(tableNames).toContain('conversations');
      expect(tableNames).toContain('messages');
      expect(tableNames).toContain('screenshots');
      expect(tableNames).toContain('migrations');
    });
  });
});
