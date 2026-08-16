/**
 * Failure reporting for the database CLI entry points.
 *
 * postgres.js raises connection errors with an empty `message` and the useful
 * detail on `code`, so the obvious `error.message` handler prints "Migration
 * failed:" and nothing else. The single most common first-run failure — Docker
 * not started — is exactly that case, so it gets a named hint.
 */

/** Connection-level codes worth translating into an instruction. */
const CONNECTION_HINTS: Record<string, string> = {
  ECONNREFUSED:
    'Nothing is listening on that port. Start Docker Desktop, then run `pnpm dev:services`.',
  ENOTFOUND: 'The database host could not be resolved. Check DATABASE_URL in .env.local.',
  ETIMEDOUT: 'The database did not answer in time. Check that the container is healthy.',
  CONNECT_TIMEOUT:
    'The database did not answer in time. Give Docker Desktop a moment after `pnpm dev:services`, then retry.',
  '28P01': 'Password authentication failed. Check the credentials in DATABASE_URL.',
  '3D000': 'That database does not exist. `pnpm dev:services` creates it.',
};

export function reportFailure(label: string, error: unknown): never {
  const code =
    typeof error === 'object' && error !== null ? String(Reflect.get(error, 'code') ?? '') : '';
  const message = error instanceof Error && error.message ? error.message : code || String(error);

  console.error(`\n${label}: ${message}`);
  const hint = CONNECTION_HINTS[code];
  if (hint) console.error(`  → ${hint}`);
  process.exit(1);
}
