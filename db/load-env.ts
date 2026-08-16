/**
 * Loads `.env.local` (then `.env`) for the CLI entry points.
 *
 * §21 tells developers to `cp .env.example .env.local` and carry on. Without
 * this the copy is inert and every documented setup path fails on `DATABASE_URL
 * is not set` — so the instruction and the code have to agree.
 *
 * dotenv never overwrites a variable that is already set, which is what makes
 * this safe in CI: the workflow exports DATABASE_URL directly and there is no
 * `.env.local` on disk to contradict it.
 */
import { existsSync } from 'node:fs';
import { config } from 'dotenv';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) config({ path: file, quiet: true });
}
