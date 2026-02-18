#!/usr/bin/env node

/**
 * Database migration script
 * Run with: node scripts/migrate.js
 * or: npm run db:migrate
 */

import { runMigrations, closePool } from '../dist/db/index.js';

async function main() {
  try {
    console.log('🔄 Starting database migrations...\n');
    await runMigrations();
    console.log('\n✅ Migrations completed successfully');
    await closePool();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await closePool();
    process.exit(1);
  }
}

main();
