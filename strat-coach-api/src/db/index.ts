/**
 * Database connection and query utilities
 * Uses pg (node-postgres) with connection pooling
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database connection pool
 * Singleton pattern - reuse across application
 */
let pool: Pool | null = null;

/**
 * Get or create database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20, // Max connections per instance
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 5000, // Fail fast if can't connect in 5s
      statement_timeout: 10000, // Kill queries running > 10s
    });

    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
      process.exit(1);
    });
  }

  return pool;
}

/**
 * Close the database pool
 * Call during graceful shutdown
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Execute a query with automatic type inference
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

/**
 * Get a client for transactions
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return pool.connect();
}

/**
 * Execute a function within a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run database migrations
 * Executes all .sql files in the migrations directory in order
 */
export async function runMigrations(): Promise<void> {
  const client = await getClient();
  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter((file) => file.endsWith('.sql'))
      .sort(); // Ensure migrations run in order

    // Execute each migration
    for (const file of sqlFiles) {
      // Check if migration already executed
      const result = await client.query(
        'SELECT filename FROM migrations WHERE filename = $1',
        [file]
      );

      if (result.rows.length > 0) {
        console.log(`⏭️  Skipping migration ${file} (already executed)`);
        continue;
      }

      console.log(`▶️  Running migration ${file}...`);

      // Read and execute migration
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ Migration ${file} completed`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration ${file} failed:`, error);
        throw error;
      }
    }

    console.log('🎉 All migrations completed successfully');
  } finally {
    client.release();
  }
}

/**
 * Check database health
 * Returns true if database is reachable and responsive
 */
export async function healthCheck(): Promise<{
  status: 'connected' | 'error';
  latency_ms?: number;
  error?: string;
}> {
  try {
    const start = Date.now();
    await query('SELECT 1');
    const latency_ms = Date.now() - start;

    return {
      status: 'connected',
      latency_ms,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
