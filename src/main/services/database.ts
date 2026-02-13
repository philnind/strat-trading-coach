/**
 * Database service for STRAT Monitor
 * Handles better-sqlite3 initialization, migrations, and CRUD operations
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import type { Trade, Conversation, Message } from '@shared/models';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database row types (snake_case from SQL)
interface TradeRow {
  id: string;
  ticker: string;
  direction: string;
  entry: number;
  exit: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  quantity: number;
  notes: string | null;
  screenshot_path: string | null;
  strat_setup: string;
  timeframe: string;
  entry_timestamp: number;
  exit_timestamp: number | null;
  pnl: number | null;
  created_at: number;
  updated_at: number;
}

interface ConversationRow {
  id: string;
  title: string;
  trade_id: string | null;
  message_count: number;
  last_message_at: number;
  created_at: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  screenshot_path: string | null;
  tokens: number | null;
  cached: number;
  created_at: number;
}

export class DatabaseService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Use provided path or default to userData
    this.dbPath = dbPath || path.join(app.getPath('userData'), 'strat-monitor.db');

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Initialize database with WAL mode for better concurrency
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Run migrations
    this.runMigrations();
  }

  private runMigrations(): void {
    // Create migrations tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      )
    `);

    // Get applied migrations
    const applied = this.db
      .prepare('SELECT name FROM migrations')
      .all() as Array<{ name: string }>;
    const appliedNames = new Set(applied.map((m) => m.name));

    // Find migration files
    const migrationsDir = path.join(
      process.env.NODE_ENV === 'development'
        ? path.join(__dirname, '../../../resources/migrations')
        : path.join(process.resourcesPath, 'migrations')
    );

    if (!fs.existsSync(migrationsDir)) {
      console.warn(`Migrations directory not found: ${migrationsDir}`);
      return;
    }

    // Get all .sql files and sort them
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    // Apply unapplied migrations
    for (const file of migrationFiles) {
      if (!appliedNames.has(file)) {
        console.warn(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

        // Run migration in a transaction
        const applyMigration = this.db.transaction(() => {
          this.db.exec(sql);
          this.db
            .prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)')
            .run(file, Date.now());
        });

        try {
          applyMigration();
          console.warn(`✓ Migration applied: ${file}`);
        } catch (error) {
          console.error(`✗ Migration failed: ${file}`, error);
          throw error;
        }
      }
    }
  }

  // ---- Trade Operations ----

  createTrade(trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>): Trade {
    const id = crypto.randomUUID();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO trades (
        id, ticker, direction, entry, exit, stop_loss, take_profit,
        quantity, notes, screenshot_path, strat_setup, timeframe,
        entry_timestamp, exit_timestamp, pnl, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      trade.ticker,
      trade.direction,
      trade.entry,
      trade.exit ?? null,
      trade.stopLoss ?? null,
      trade.takeProfit ?? null,
      trade.quantity,
      trade.notes ?? null,
      trade.screenshotPath ?? null,
      trade.stratSetup,
      trade.timeframe,
      trade.entryTimestamp,
      trade.exitTimestamp ?? null,
      trade.pnl ?? null,
      now,
      now
    );

    return { ...trade, id, createdAt: now, updatedAt: now } as Trade;
  }

  getTrade(id: string): Trade | null {
    const stmt = this.db.prepare('SELECT * FROM trades WHERE id = ?');
    const row = stmt.get(id) as TradeRow | undefined;

    if (!row) return null;

    return this.mapTradeRow(row);
  }

  listTrades(limit = 100, offset = 0): Trade[] {
    const stmt = this.db.prepare(
      'SELECT * FROM trades ORDER BY created_at DESC LIMIT ? OFFSET ?'
    );
    const rows = stmt.all(limit, offset) as TradeRow[];

    return rows.map((row) => this.mapTradeRow(row));
  }

  updateTrade(id: string, updates: Partial<Omit<Trade, 'id' | 'createdAt'>>): Trade {
    const now = Date.now();

    // Build dynamic UPDATE statement
    const fields = Object.keys(updates).filter((k) => k !== 'id' && k !== 'createdAt');
    const setClause = fields
      .map((f) => `${this.camelToSnake(f)} = ?`)
      .concat('updated_at = ?')
      .join(', ');

    const values = fields.map((f) => updates[f as keyof typeof updates]);
    values.push(now, id);

    const stmt = this.db.prepare(`UPDATE trades SET ${setClause} WHERE id = ?`);
    stmt.run(...values);

    const updated = this.getTrade(id);
    if (!updated) {
      throw new Error(`Trade not found: ${id}`);
    }

    return updated;
  }

  deleteTrade(id: string): void {
    const stmt = this.db.prepare('DELETE FROM trades WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new Error(`Trade not found: ${id}`);
    }
  }

  // ---- Conversation Operations ----

  createConversation(
    conversation: Omit<Conversation, 'id' | 'messageCount' | 'lastMessageAt' | 'createdAt'>
  ): Conversation {
    const id = crypto.randomUUID();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO conversations (
        id, title, trade_id, message_count, last_message_at, created_at
      ) VALUES (?, ?, ?, 0, ?, ?)
    `);

    stmt.run(id, conversation.title, conversation.tradeId ?? null, now, now);

    return {
      id,
      title: conversation.title,
      tradeId: conversation.tradeId,
      messageCount: 0,
      lastMessageAt: now,
      createdAt: now
    };
  }

  getConversation(id: string): Conversation | null {
    const stmt = this.db.prepare('SELECT * FROM conversations WHERE id = ?');
    const row = stmt.get(id) as ConversationRow | undefined;

    if (!row) return null;

    return this.mapConversationRow(row);
  }

  listConversations(limit = 50, offset = 0): Conversation[] {
    const stmt = this.db.prepare(
      'SELECT * FROM conversations ORDER BY last_message_at DESC LIMIT ? OFFSET ?'
    );
    const rows = stmt.all(limit, offset) as ConversationRow[];

    return rows.map((row) => this.mapConversationRow(row));
  }

  updateConversation(
    id: string,
    updates: Partial<Omit<Conversation, 'id' | 'messageCount' | 'lastMessageAt' | 'createdAt'>>
  ): Conversation {
    const fields = Object.keys(updates);
    const setClause = fields.map((f) => `${this.camelToSnake(f)} = ?`).join(', ');
    const values = fields.map((f) => updates[f as keyof typeof updates]);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE conversations SET ${setClause} WHERE id = ?`);
    stmt.run(...values);

    const updated = this.getConversation(id);
    if (!updated) {
      throw new Error(`Conversation not found: ${id}`);
    }

    return updated;
  }

  deleteConversation(id: string): void {
    const stmt = this.db.prepare('DELETE FROM conversations WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new Error(`Conversation not found: ${id}`);
    }
  }

  // ---- Message Operations ----

  createMessage(message: Omit<Message, 'id' | 'createdAt'>): Message {
    const id = crypto.randomUUID();
    const now = Date.now();

    // Insert message
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, conversation_id, role, content, screenshot_path, tokens, cached, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      message.conversationId,
      message.role,
      message.content,
      message.screenshotPath ?? null,
      message.tokens ?? null,
      message.cached ? 1 : 0,
      now
    );

    // Update conversation message count and last message timestamp
    const updateConv = this.db.prepare(`
      UPDATE conversations
      SET message_count = message_count + 1,
          last_message_at = ?
      WHERE id = ?
    `);
    updateConv.run(now, message.conversationId);

    return { ...message, id, createdAt: now };
  }

  getMessage(id: string): Message | null {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE id = ?');
    const row = stmt.get(id) as MessageRow | undefined;

    if (!row) return null;

    return this.mapMessageRow(row);
  }

  listMessages(conversationId: string, limit = 100, offset = 0): Message[] {
    const stmt = this.db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?'
    );
    const rows = stmt.all(conversationId, limit, offset) as MessageRow[];

    return rows.map((row) => this.mapMessageRow(row));
  }

  deleteMessage(id: string): void {
    // Get conversation ID before deleting
    const message = this.getMessage(id);
    if (!message) {
      throw new Error(`Message not found: ${id}`);
    }

    const stmt = this.db.prepare('DELETE FROM messages WHERE id = ?');
    stmt.run(id);

    // Update conversation message count
    const updateConv = this.db.prepare(`
      UPDATE conversations
      SET message_count = message_count - 1
      WHERE id = ?
    `);
    updateConv.run(message.conversationId);
  }

  // ---- Helper Methods ----

  private mapTradeRow(row: TradeRow): Trade {
    return {
      id: row.id,
      ticker: row.ticker,
      direction: row.direction,
      entry: row.entry,
      exit: row.exit,
      stopLoss: row.stop_loss,
      takeProfit: row.take_profit,
      quantity: row.quantity,
      notes: row.notes,
      screenshotPath: row.screenshot_path,
      stratSetup: row.strat_setup,
      timeframe: row.timeframe,
      entryTimestamp: row.entry_timestamp,
      exitTimestamp: row.exit_timestamp,
      pnl: row.pnl,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapConversationRow(row: ConversationRow): Conversation {
    return {
      id: row.id,
      title: row.title,
      tradeId: row.trade_id,
      messageCount: row.message_count,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at
    };
  }

  private mapMessageRow(row: MessageRow): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      screenshotPath: row.screenshot_path,
      tokens: row.tokens,
      cached: row.cached === 1,
      createdAt: row.created_at
    };
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  // ---- Lifecycle ----

  close(): void {
    this.db.close();
  }

  /**
   * Get raw database instance (use with caution)
   * Exposed for testing and advanced queries
   */
  getDb(): Database.Database {
    return this.db;
  }
}
