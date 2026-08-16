import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Tenant isolation — PRD §26.2, §26.4, §32.3.
 *
 * "Cross-workspace UI, API, database, storage and retrieval access tests fail
 * safely" is the first item on the §32.3 security checklist, and it is the one
 * that matters most: everything else in the product is recoverable, a
 * cross-client data leak is not.
 *
 * These tests connect as `signalscan_app` — the role the application actually
 * uses — rather than as the schema owner, because the owner bypasses row-level
 * security and would make every assertion here pass for the wrong reason.
 *
 * Requires `pnpm dev:services && pnpm db:migrate && pnpm db:seed`.
 */

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://signalscan:signalscan@localhost:5432/signalscan';

let owner: postgres.Sql;
let app: postgres.Sql;

interface Actor {
  userId: string;
  workspaceId: string;
  assessmentId: string;
}

let insider: Actor;
let outsider: Actor;

/** Runs a query as a given user, with RLS in force. */
async function asUser<T>(
  userId: string,
  run: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return app.begin(async (tx) => {
    // SET LOCAL, never SET — a pooled connection carrying a stale user id would
    // hand the next request someone else's workspace.
    await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return run(tx);
  }) as Promise<T>;
}

beforeAll(async () => {
  owner = postgres(DATABASE_URL, { onnotice: () => {}, max: 2 });

  const url = new URL(DATABASE_URL);
  url.username = 'signalscan_app_login';
  url.password = 'app-test-password';

  // A login role that inherits the RLS-bound application role.
  await owner.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'signalscan_app_login') THEN
        CREATE ROLE signalscan_app_login LOGIN PASSWORD 'app-test-password' IN ROLE signalscan_app;
      END IF;
    END;
    $$;
  `);
  await owner.unsafe('GRANT USAGE ON SCHEMA public TO signalscan_app_login');

  app = postgres(url.toString(), { onnotice: () => {}, max: 2 });

  const rows = await owner<
    { user_id: string; workspace_id: string; assessment_id: string; email: string }[]
  >`
    SELECT wu.user_id, wu.workspace_id, a.id AS assessment_id, u.email
    FROM workspace_users wu
    JOIN users u ON u.id = wu.user_id
    JOIN assessments a ON a.workspace_id = wu.workspace_id
    WHERE u.email IN ('strategist@example.test', 'outsider@example.test')
  `;

  const insiderRow = rows.find((r) => r.email === 'strategist@example.test');
  const outsiderRow = rows.find((r) => r.email === 'outsider@example.test');
  if (!insiderRow || !outsiderRow) {
    throw new Error('Seed data missing — run `pnpm db:seed` before the integration suite.');
  }

  insider = {
    userId: insiderRow.user_id,
    workspaceId: insiderRow.workspace_id,
    assessmentId: insiderRow.assessment_id,
  };
  outsider = {
    userId: outsiderRow.user_id,
    workspaceId: outsiderRow.workspace_id,
    assessmentId: outsiderRow.assessment_id,
  };
});

afterAll(async () => {
  await app?.end({ timeout: 5 });
  await owner?.end({ timeout: 5 });
});

describe('workspace isolation at the database level (§32.3)', () => {
  it('sets up two genuinely separate workspaces', () => {
    expect(insider.workspaceId).not.toBe(outsider.workspaceId);
    expect(insider.assessmentId).not.toBe(outsider.assessmentId);
  });

  it('shows a member only their own workspace', () => {
    return asUser(insider.userId, async (tx) => {
      const workspaces = await tx<{ id: string }[]>`SELECT id FROM workspaces`;
      expect(workspaces.map((w) => w.id)).toEqual([insider.workspaceId]);
    });
  });

  it('returns nothing rather than an error when reading another workspace directly', async () => {
    // §25: unauthorised access must not confirm whether the record exists.
    await asUser(outsider.userId, async (tx) => {
      const rows = await tx`SELECT id FROM assessments WHERE id = ${insider.assessmentId}`;
      expect(rows).toHaveLength(0);
    });
  });

  it.each([
    'assessments',
    'question_responses',
    'campaigns',
    'competitors',
    'input_assets',
    'asset_chunks',
    'evidence_citations',
    'workflow_stages',
    'brand_rules',
    'competitor_observations',
    'opportunities',
    'opportunity_scores',
    'business_cases',
    'audit_events',
  ])('hides every row of %s belonging to another workspace', async (table) => {
    await asUser(outsider.userId, async (tx) => {
      const rows = await tx.unsafe(
        `SELECT count(*)::int AS leaked FROM ${table} WHERE workspace_id = $1`,
        [insider.workspaceId],
      );
      expect((rows as unknown as { leaked: number }[])[0]?.leaked).toBe(0);
    });
  });

  it('lets the rightful member see their own evidence', async () => {
    await asUser(insider.userId, async (tx) => {
      const [row] = await tx<{ campaigns: number }[]>`
        SELECT count(*)::int AS campaigns FROM campaigns WHERE assessment_id = ${insider.assessmentId}
      `;
      expect(row?.campaigns).toBe(25);
    });
  });

  it('refuses to write a row into another workspace', async () => {
    // WITH CHECK is the half people forget. Without it, a tenant can read only
    // their own rows but write into anyone's.
    await expect(
      asUser(outsider.userId, async (tx) => {
        await tx`
          INSERT INTO campaigns (workspace_id, assessment_id, title, brand_label)
          VALUES (${insider.workspaceId}, ${insider.assessmentId}, 'Injected', 'unknown')
        `;
      }),
    ).rejects.toThrow();
  });

  it('refuses to move an existing row into another workspace', async () => {
    await expect(
      asUser(outsider.userId, async (tx) => {
        await tx`
          UPDATE assessments SET workspace_id = ${insider.workspaceId}
          WHERE id = ${outsider.assessmentId}
        `;
      }),
    ).rejects.toThrow();
  });

  it('cannot delete another workspace’s data', async () => {
    await asUser(outsider.userId, async (tx) => {
      await tx`DELETE FROM campaigns WHERE workspace_id = ${insider.workspaceId}`;
    });
    const [row] = await owner<{ remaining: number }[]>`
      SELECT count(*)::int AS remaining FROM campaigns WHERE workspace_id = ${insider.workspaceId}
    `;
    expect(row?.remaining).toBe(25);
  });

  it('shows nothing at all to a connection with no identity set', async () => {
    // An unauthenticated connection must be inert, not permissive.
    const rows = await app`SELECT count(*)::int AS visible FROM assessments`;
    expect((rows as unknown as { visible: number }[])[0]?.visible).toBe(0);
  });

  it('shows nothing to a well-formed user id that is not a member of anything', async () => {
    await asUser('00000000-0000-0000-0000-000000000000', async (tx) => {
      const rows = await tx`SELECT id FROM assessments`;
      expect(rows).toHaveLength(0);
    });
  });
});

describe('retrieval boundary (§20.3)', () => {
  it('filters vector-search candidates by workspace before similarity runs', async () => {
    // §20.3: "Never rely on prompt instructions alone for tenant isolation."
    // Even a query that forgets its WHERE clause returns only the caller's rows.
    await asUser(outsider.userId, async (tx) => {
      const chunks = await tx`SELECT id FROM asset_chunks`;
      expect(chunks).toHaveLength(0);
    });

    await asUser(insider.userId, async (tx) => {
      const chunks = await tx`SELECT id FROM asset_chunks`;
      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});

describe('immutability guarantees', () => {
  it('refuses to update an audit event (§22.1)', async () => {
    const [event] = await owner<{ id: string }[]>`
      SELECT id FROM audit_events WHERE workspace_id = ${insider.workspaceId} LIMIT 1
    `;
    expect(event).toBeDefined();

    // An audit log an operator can edit is not an audit log — so the refusal
    // holds even for the schema owner.
    await expect(
      owner`UPDATE audit_events SET action = 'tampered' WHERE id = ${event!.id}`,
    ).rejects.toThrow(/append-only/);
  });

  it('refuses to delete an audit event', async () => {
    const [event] = await owner<{ id: string }[]>`
      SELECT id FROM audit_events WHERE workspace_id = ${insider.workspaceId} LIMIT 1
    `;
    await expect(owner`DELETE FROM audit_events WHERE id = ${event!.id}`).rejects.toThrow(
      /append-only/,
    );
  });

  it('refuses to persist a hard-stopped opportunity in a recommendable band (§11.5)', async () => {
    const [opportunity] = await owner<
      { id: string; workspace_id: string; assessment_id: string }[]
    >`
      SELECT id, workspace_id, assessment_id FROM opportunities LIMIT 1
    `;
    await expect(
      owner`
        INSERT INTO opportunity_scores (
          workspace_id, assessment_id, opportunity_id, score_version, factor_version,
          factors_json, raw_score, confidence_score, confidence_multiplier,
          priority_score, priority_band, hard_stops_json
        ) VALUES (
          ${opportunity!.workspace_id}, ${opportunity!.assessment_id}, ${opportunity!.id}, 99, 'v1',
          '[]'::jsonb, 95, 0.9, 0.96, 91.2, 'recommend',
          '[{"code":"no_daily_user","reason":"x","resolution":"y"}]'::jsonb
        )
      `,
    ).rejects.toThrow();
  });

  it('refuses a workflow stage whose work time exceeds its elapsed time (§8.4)', async () => {
    const [stage] = await owner<{ id: string }[]>`SELECT id FROM workflow_stages LIMIT 1`;
    await expect(
      owner`UPDATE workflow_stages SET work_time_minutes = 999999 WHERE id = ${stage!.id}`,
    ).rejects.toThrow();
  });
});
