/**
 * Loads the repository-root `.env.local` into the server process.
 *
 * Next only reads env files that sit beside the app (`apps/web/.env.local`),
 * but §21 and the quickstart both tell you to `cp .env.example .env.local` at
 * the root — one file for the whole monorepo, shared with `db:migrate` and
 * `db:seed`. Without this the page silently ignored a perfectly good
 * DATABASE_URL and rendered the in-memory fixture instead.
 *
 * dotenv never overwrites a variable that is already set, so an explicit
 * environment variable still wins over the file.
 */
import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { config } from 'dotenv';

/** The repo root is the directory holding pnpm-workspace.yaml. */
function findWorkspaceRoot(from: string): string | null {
  let current = from;
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const next = dirname(current);
    if (next === current || next === parse(current).root) return null;
    current = next;
  }
}

const root = findWorkspaceRoot(process.cwd());
if (root) {
  for (const file of ['.env.local', '.env']) {
    const path = join(root, file);
    if (existsSync(path)) config({ path, quiet: true });
  }
}
