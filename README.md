# SignalScan

**Find the first profitable agentic marketing workflow in five business days.**

SignalScan is a strategist's evidence and decision system. It takes a client's campaign context and evidence, maps how campaigns actually get made, works out what the brand really sounds like, compares it against two competitors, and produces one scored, cited, human-approved recommendation with a business case and a 30-day pilot charter.

It is deliberately **not** an autonomous consultant. Software structures the evidence and the arithmetic; humans approve every recommendation.

The full specification is [`signal-scan-prd.md`](../signal-scan-prd.md). Section references throughout the code (`§11.4`, `§8.4`) point at it.

---

## The loop

```
CLIENT CONTEXT + EVIDENCE
  → VALIDATED CAMPAIGN FLOW
  → APPROVED OR INFERRED BRAND RULES
  → TWO-COMPETITOR DIFFERENTIATION
  → 5-8 SCORED OPPORTUNITIES
  → ONE HUMAN-APPROVED RECOMMENDATION
  → BUSINESS CASE + 30-DAY PILOT CHARTER
```

Four analysis stages carry the work:

| Stage                          | Does                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Evidence ingestion**         | Parses uploads, chunks them, and attaches a citable location to every excerpt                              |
| **Campaign-flow mapping**      | Normalises three capture paths into one stage schema and finds the real friction                           |
| **Brand / competitor analyst** | Extracts guideline rules, or infers them from ~25 campaigns, then compares against exactly two competitors |
| **Opportunity scoring engine** | Scores candidates deterministically on the server — never in a prompt                                      |

---

## Status

Foundation and deterministic core, running locally against synthetic data.

| Area                                                  | State                                 |
| ----------------------------------------------------- | ------------------------------------- |
| Monorepo, TypeScript strict, CI                       | ✅ Complete                           |
| Opportunity scoring, confidence, hard stops (§11)     | ✅ Complete, 100% branch coverage     |
| Business-case model (§12)                             | ✅ Complete                           |
| Assessment lifecycle (§5.1)                           | ✅ Complete                           |
| 20 intake questions + branching (§7)                  | ✅ Complete                           |
| Campaign-flow mapping and friction analysis (§8)      | ✅ Complete                           |
| Workspace RBAC (§4.2)                                 | ✅ Complete                           |
| Schema, RLS policies, Northstar Cloud seed (§17, §29) | ✅ Complete, isolation proven by test |
| Document parsing, LLM adapters, report exports        | 🚧 Next                               |
| Web application (§14)                                 | 🚧 Next                               |
| Auth, E2E suite, AI eval gates, deployment            | 📋 Planned                            |

---

## Getting started

Requires **Node 22+**, **pnpm 11+** and **Docker**.

```bash
# 1. Install from the lockfile
pnpm install --frozen-lockfile

# 2. Copy the environment template. Every value in it is safe; nothing here
#    needs a real credential to run locally.
cp .env.example .env.local

# 3. Start Postgres (with pgvector), Mailpit and MinIO
pnpm dev:services

# 4. Create the schema, apply row-level security, and load synthetic data
pnpm db:migrate
pnpm db:seed
```

<details>
<summary><strong>Windows (PowerShell) equivalents</strong> — §34 asks for these explicitly</summary>

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev:services
$env:DATABASE_URL = "postgresql://signalscan:signalscan@localhost:5432/signalscan"
pnpm db:migrate
pnpm db:seed
```

`pnpm dev:services` needs Docker Desktop running. If `docker compose` reports it cannot find the pipe, start Docker Desktop and wait for the engine before retrying.
</details>

The seed prints the scored portfolio, which is the fastest way to confirm everything is wired up:

```
Scored portfolio:
   81.00  recommend    Brand-checked variant generation
   76.06  recommend    Brief completeness assistant
   61.25  conditional  Claims pre-check for legal review
   47.19  backlog      Localisation drafting for three markets
   38.58  backlog      Campaign performance summarisation
   47.78  blocked      Autonomous audience expansion
```

Note the last row: it scores higher than two backlog items and is still blocked. A hard stop overrides the ranking entirely (§11.5) — that is the behaviour, not a bug.

---

## Commands

| Command                                        | Does                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                                     | Run the application                                       |
| `pnpm dev:services` / `pnpm dev:services:down` | Start / stop local Postgres, Mailpit and MinIO            |
| `pnpm db:migrate`                              | Apply pending migrations and RLS policies                 |
| `pnpm db:migrate --dry-run`                    | List what would run                                       |
| `pnpm db:seed`                                 | Load the synthetic Northstar Cloud fixture                |
| `pnpm db:reset`                                | Drop the schema, re-migrate, re-seed                      |
| `pnpm lint` / `pnpm format`                    | Lint / format                                             |
| `pnpm typecheck`                               | Type-check every package                                  |
| `pnpm test`                                    | Unit tests                                                |
| `pnpm test:coverage`                           | Unit tests with coverage gates                            |
| `pnpm test:integration`                        | Integration tests — **needs services running and seeded** |
| `pnpm test:e2e`                                | Browser end-to-end tests                                  |
| `pnpm test:evals`                              | AI evaluation gates                                       |
| `pnpm build`                                   | Build everything                                          |

---

## Layout

```
apps/web/          Next.js application and API routes
packages/
  ai/              LLM and embedding adapters, versioned prompts, eval sets
  documents/       Parsers, chunking, citation extraction
  domain/          Scoring, business case, intake, workflow, brand, assessment
  reports/         HTML, PDF, CSV, JSON, Markdown renderers
  security/        Authorization, audit, retention
  ui/              Design system
workers/           Durable analysis, export and deletion jobs
db/                Migrations, RLS policies, synthetic seed
tests/             Fixtures, integration, E2E, evals
docs/              ADRs, threat model, data flow, operations
```

Business logic never imports a vendor SDK directly. Everything external sits behind an adapter in `packages/*/adapters` (§15.3), which is what makes the local, zero-credential setup possible.

---

## Design decisions worth knowing

**Scores are integer-exact.** `raw_score` sums `score × weight` as integers and divides once at the end. Summing sixteen floats and comparing to a band boundary is how an opportunity scores 74.99999999999999 and lands in a different band on a different machine. §32.1 requires reproducibility, so the arithmetic has to earn it.

**The LLM never calculates a score.** §20.2 prohibits it, and the scoring package has no model dependency at all.

**Hard stops beat scores.** A blocked opportunity sorts below every unblocked one regardless of its number.

**Missing values stay missing.** The business case returns `null` and records which inputs it is waiting on. It never estimates, and it never shows a payback that does not exist.

**Tenant isolation lives in the database.** Row-level security, not a `WHERE` clause in a service. One forgotten filter in one handler would be a cross-client leak; `tests/integration/tenant-isolation.test.ts` connects as the real application role and proves it.

**Audit events are append-only** at the database level. An audit log an operator can edit is not an audit log.

---

## Configuration

Everything is in [`.env.example`](.env.example), grouped by §21 section. Two things worth calling out:

- **`LLM_PROVIDER=mock`** replays fixture responses deterministically. The whole pipeline runs with no API key and no network. Set it to `anthropic` and add `LLM_API_KEY` for live extraction — no code change.
- **Model names are never defaulted in code** (§21.6). If a model slot is empty while the provider is not `mock`, startup fails rather than quietly picking one.

---

## Security

Read [`SECURITY.md`](SECURITY.md) before working on evidence handling, retrieval or exports. In short: private storage only, signed URLs, SHA-256 checksums, malware scanning that fails closed in production, no client content in logs or analytics, and uploaded documents treated as untrusted data rather than instructions (§22.2).

**Never put real client data in this repository** — not in fixtures, not in tests, not in screenshots (§29, §33).

---

## Licence

Proprietary. See [`LICENSE`](LICENSE).
