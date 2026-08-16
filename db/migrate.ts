#!/usr/bin/env tsx
/**
 * Migration runner — PRD §27.1 step 6 ("database migration validation") and
 * §34's `pnpm db:migrate`.
 *
 * Deliberately small and dependency-light: files in `migrations/` then
 * `policies/`, applied in filename order, each inside its own transaction,
 * recorded in `schema_migrations` with a checksum. If a previously-applied file
 * changes on disk the run aborts — silently diverging schemas between a
 * developer's machine and production is the failure this table exists to catch.
 *
 *   pnpm db:migrate            apply pending migrations
 *   pnpm db:migrate --reset    drop and recreate the public schema first
 *   pnpm db:migrate --dry-run  list what would run
 */
// Must come first: every import below may read process.env.
import './load-env.js';
import { reportFailure } from './fail.js';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MIGRATION_DIRS = ['migrations', 'policies'] as const;

interface MigrationFile {
  name: string;
  path: string;
  sql: string;
  checksum: string;
}

async function collectMigrations(): Promise<MigrationFile[]> {
  const files: MigrationFile[] = [];
  for (const dir of MIGRATION_DIRS) {
    const absolute = join(HERE, dir);
    const entries = (await readdir(absolute)).filter((f) => f.endsWith('.sql')).sort();
    for (const entry of entries) {
      const path = join(absolute, entry);
      const sql = await readFile(path, 'utf8');
      files.push({
        name: `${dir}/${entry}`,
        path,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      });
    }
  }
  return files;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and start services with `pnpm dev:services`.',
    );
    process.exit(1);
  }

  const reset = process.argv.includes('--reset');
  const dryRun = process.argv.includes('--dry-run');

  const sql = postgres(databaseUrl, { onnotice: () => {}, max: 1 });

  try {
    if (reset) {
      console.log('Resetting public schema…');
      await sql.unsafe('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    }

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      );
    `);

    const applied = await sql<{ name: string; checksum: string }[]>`
      SELECT name, checksum FROM schema_migrations
    `;
    const appliedByName = new Map(applied.map((row) => [row.name, row.checksum]));

    const migrations = await collectMigrations();
    const pending: MigrationFile[] = [];

    for (const migration of migrations) {
      const previous = appliedByName.get(migration.name);
      if (previous === undefined) {
        pending.push(migration);
        continue;
      }
      if (previous !== migration.checksum) {
        throw new Error(
          `Migration ${migration.name} has changed since it was applied.\n` +
            'Applied migrations are immutable — add a new migration instead of editing this one.',
        );
      }
    }

    if (pending.length === 0) {
      console.log(`Schema is up to date (${migrations.length} migration(s) applied).`);
      return;
    }

    if (dryRun) {
      console.log('Pending migrations:');
      for (const migration of pending) console.log(`  ${migration.name}`);
      return;
    }

    for (const migration of pending) {
      process.stdout.write(`Applying ${migration.name}… `);
      // Each file manages its own BEGIN/COMMIT so a policy file can create
      // roles, which cannot run inside an outer transaction block on some
      // managed providers.
      await sql.unsafe(migration.sql);
      await sql`
        INSERT INTO schema_migrations (name, checksum)
        VALUES (${migration.name}, ${migration.checksum})
      `;
      console.log('done');
    }

    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => reportFailure('Migration failed', error));
