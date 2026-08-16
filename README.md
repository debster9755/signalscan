# SignalScan

**Find the first profitable agentic marketing workflow in five business days.**

SignalScan is a strategist's evidence and decision system. It takes a client's campaign context and evidence, maps how campaigns actually get made, works out what the brand really sounds like, compares it against two competitors, and produces one scored, cited, human-approved recommendation with a business case and a 30-day pilot charter.

It is deliberately **not** an autonomous consultant. Software structures the evidence and the arithmetic; humans approve every recommendation.

---

## See it working in 60 seconds

No Docker, no database, no API key, no account.

```bash
git clone https://github.com/debster9755/signalscan.git
cd signalscan
corepack enable && pnpm install --frozen-lockfile

pnpm dev     # → http://localhost:3000   the scan, in a browser
pnpm demo    # → the same numbers, in your terminal
```

Both run the real scoring engine, the real hard-stop rules and the real business-case arithmetic over the synthetic Northstar Cloud fixture. Neither needs Docker, a database or a key — the page computes everything in memory and says so on the page. Point `DATABASE_URL` at a seeded database and it reads that instead.

Full stepwise instructions, macOS and Windows: **[docs/QUICKSTART.md](docs/QUICKSTART.md)**.

---

## Top business benefits

- **Turns a twelve-idea AI wish-list into one funded decision** — in five business days, not a six-week consulting engagement.
- **Kills non-viable ideas before they cost money.** Hard stops (no owner, no measurable outcome, prohibited data) block a candidate outright, whatever it scores.
- **Produces a business case a CFO can sign.** Missing inputs stay missing; nothing is estimated to make a slide look finished.
- **Survives brand, legal and procurement review.** Every claim carries a citation to the client's own evidence, and a named human approves every recommendation.
- **Same evidence, same answer, every time.** Scores are integer-exact server arithmetic, never model output — so a recommendation cannot drift between two runs or two machines.
- **Client evidence stays isolated by construction.** Tenant separation is enforced in the database by row-level security, not by a `WHERE` clause someone might forget.

### Business metrics it is built to move

| Metric                                | How SignalScan affects it                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| **Brief-to-launch cycle time**        | Maps every stage's wait vs. work time and targets the largest wait first          |
| **Rework events per campaign**        | Finds the stages sent back most often and scores fixes against them               |
| **Review turnaround** (brand / legal) | Pre-screens the queue so human reviewers start from a shorter list                |
| **Hours of capacity released**        | `volume × minutes saved × 12 ÷ 60`, from client-supplied volumes only             |
| **Pilot payback period**              | Months to recover pilot cost — suppressed entirely when net value is not positive |
| **Year-one net value**                | Gross value minus pilot cost minus annual run cost, per scenario                  |
| **Time-to-decision**                  | Five business days from intake to an approved recommendation and pilot charter    |

> The fixture in `pnpm demo` shows the shape of this: a 26-day campaign cycle that is **93% waiting**, and a top-ranked workflow worth 432 hours a year with a 6.6-month payback.

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

## What it can and cannot do today

**Can — runs now, on your machine:**

- Score 5–8 opportunities on 16 weighted factors and rank them into four priority bands
- Detect all eight hard stops and block a candidate regardless of its score
- Compute confidence from evidence coverage, source agreement, recency and reviewer validation
- Build a three-scenario business case, and report exactly which inputs are still missing
- Map a ten-stage campaign flow and rank its friction by wait time, workload and rework
- Serve 20 versioned intake questions with conditional branching and validation
- Enforce the assessment lifecycle and workspace RBAC across four roles
- Create the schema, apply row-level security, and load a full synthetic client
- Prove tenant isolation by connecting as the real application role and failing to read across workspaces
- Serve all of the above as a page at `localhost:3000`, reading a seeded database when one is reachable and computing in memory when it is not

**Cannot — not built yet:**

- **The web app is one read-only page.** It renders the scan; it cannot yet run one. No intake flow, no evidence upload, no approve/reject actions.
- No document parsing — PDF/DOCX/PPTX ingestion and citation extraction are next
- No live LLM calls — the adapters are specified but not yet implemented
- No report exports (HTML, PDF, CSV, JSON, Markdown)
- No authentication or user sign-in
- No hosted deployment or background workers
- No E2E or AI-eval suites — `pnpm test:e2e` and `pnpm test:evals` are configured and exit cleanly, but there is nothing to run yet

**Will never do, by design:**

- Let a model calculate a score, a priority band or a business-case figure
- Estimate a missing cost to make a business case look complete
- Present time savings as headcount reduction unless the client explicitly confirms that framing
- Ship a recommendation no human has approved

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
| Read-only scan page (§14, first slice)                | ✅ Runs at `localhost:3000`           |
| Intake, upload and approval UI (§14)                  | 🚧 Next                               |
| Auth, E2E suite, AI eval gates, deployment            | 📋 Planned                            |

---

## Run it on a MacBook

### Prerequisites

| Tool               | Version                | Install                                                    | Needed for                        |
| ------------------ | ---------------------- | ---------------------------------------------------------- | --------------------------------- |
| **macOS**          | 13 Ventura or later    | —                                                          | Apple Silicon and Intel both work |
| **Node.js**        | **22.13+** (or 24 LTS) | `brew install node@22` — or `nvm install 22 && nvm use 22` | Everything                        |
| **pnpm**           | 11.22+                 | `corepack enable` (ships with Node)                        | Everything                        |
| **Git**            | any                    | `xcode-select --install`                                   | Cloning                           |
| **Docker Desktop** | 4.x                    | `brew install --cask docker`                               | **Only** the database steps       |

> **Node 22.13 is the real floor** — that is what pnpm 11.22 requires, and what `engines.node` pins. On anything older you will see `This version of pnpm requires at least Node.js v22.13`.

### Steps

```bash
# 1. Clone
git clone https://github.com/debster9755/signalscan.git
cd signalscan

# 2. Check your Node — must be 22.13 or newer
node -v

# 3. Enable pnpm (bundled with Node, no install needed)
corepack enable

# 4. Install exactly what the lockfile pins
pnpm install --frozen-lockfile

# 5. See the decision engine run — no Docker, no keys, ~1 second
pnpm demo

# 6. Prove it with the test suite — 304 unit tests
pnpm test
```

**Stop at step 6** unless you need the database. Steps 7–10 add Postgres, Mailpit and MinIO:

```bash
# 7. Environment template — every value in it is safe, no real credential needed
cp .env.example .env.local

# 8. Start Docker Desktop first, then bring up the services
pnpm dev:services

# 9. Create the schema and apply row-level security
pnpm db:migrate

# 10. Load the synthetic Northstar Cloud client
pnpm db:seed
```

The seed prints the scored portfolio — the fastest confirmation everything is wired up:

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

### Is there a localhost option?

| URL                                      | What it is                                             | Needs               |
| ---------------------------------------- | ------------------------------------------------------ | ------------------- |
| [localhost:3000](http://localhost:3000)  | **The scan page** — started by `pnpm dev`              | nothing             |
| [localhost:8025](http://localhost:8025)  | Mailpit — every outbound email, captured               | `pnpm dev:services` |
| [localhost:9001](http://localhost:9001)  | MinIO console (`signalscan` / `signalscan-dev-secret`) | `pnpm dev:services` |
| `postgresql://localhost:5432/signalscan` | Postgres + pgvector (`signalscan` / `signalscan`)      | `pnpm dev:services` |

Only `localhost:3000` needs no setup. The other three appear once `pnpm dev:services` is running.

Windows steps, day-to-day workflow and troubleshooting: **[docs/QUICKSTART.md](docs/QUICKSTART.md)**.

---

## Which functionalities need an API key

**None of the following need any key, account or network access:**

`pnpm demo` · `pnpm test` · `pnpm test:coverage` · `pnpm typecheck` · `pnpm lint` · `pnpm build` · `pnpm dev:services` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm test:integration`

That is every command in the repo today. The defaults in `.env.example` point at local containers and fixture-replay adapters.

| Capability                           | Default (free, local)        | Live mode needs                                                            | Status           |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------------------------- | ---------------- |
| LLM extraction and generation        | `LLM_PROVIDER=mock`          | `LLM_PROVIDER=anthropic` + `LLM_API_KEY`                                   | 🚧 Not built     |
| Semantic retrieval / embeddings      | `EMBEDDING_PROVIDER=mock`    | `EMBEDDING_API_KEY` + `EMBEDDING_MODEL`                                    | 🚧 Not built     |
| Auth and sign-in                     | `AUTH_PROVIDER=local`        | `AUTH_PROVIDER=supabase` + the three `SUPABASE_*` keys                     | 📋 Planned       |
| File storage                         | `STORAGE_PROVIDER=minio`     | Supabase Storage credentials                                               | 🚧 Not built     |
| Email delivery                       | `EMAIL_PROVIDER=mailpit`     | `EMAIL_API_KEY` for a real provider                                        | 📋 Planned       |
| Malware scanning on upload           | `MALWARE_SCAN_PROVIDER=stub` | `MALWARE_SCAN_API_KEY` — **production fails closed without it**            | 📋 Planned       |
| Background jobs                      | Inngest dev server, offline  | `JOB_SIGNING_KEY` + `JOB_EVENT_KEY`                                        | 📋 Planned       |
| Error tracking / tracing / analytics | Off                          | `ERROR_TRACKING_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `ANALYTICS_WRITE_KEY` | Optional, always |

Two rules worth knowing:

- **Model names are never defaulted in code** (§21.6). If a model slot is empty while the provider is not `mock`, startup fails rather than quietly picking one.
- Switching from `mock` to a live provider is **configuration only** — no code change. Business logic never imports a vendor SDK; everything external sits behind an adapter (§15.3).

---

## Commands

| Command                                        | Does                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| `pnpm demo`                                    | **Run the deterministic core in memory — no services**    |
| `pnpm dev`                                     | **Run the web app at `localhost:3000`**                   |
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
| `pnpm test:e2e`                                | Browser end-to-end tests — _no suite yet; exits 0_        |
| `pnpm test:evals`                              | AI evaluation gates — _no suite yet; exits 0_             |
| `pnpm build`                                   | Build everything                                          |

---

## Layout

Directories marked `—` are specified but not yet created.

```
packages/
  domain/          ✅ Scoring, business case, intake, workflow, assessment
  security/        ✅ Authorization
  ai/              —  LLM and embedding adapters, versioned prompts, eval sets
  documents/       —  Parsers, chunking, citation extraction
  reports/         —  HTML, PDF, CSV, JSON, Markdown renderers
  ui/              —  Design system
apps/web/          ✅ Next.js scan page (read-only first slice)
workers/           —  Durable analysis, export and deletion jobs
db/                ✅ Migrations, RLS policies, synthetic seed
scripts/demo.ts    ✅ Zero-dependency demonstration of the core
tests/             ✅ Fixtures and integration tests (E2E and evals to come)
docs/              ✅ Quickstart and ADRs
```

Packages resolve by name — `@signalscan/domain` for everything, or a subpath such as `@signalscan/domain/scoring` to keep a dependency legible.

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

Everything is in [`.env.example`](.env.example), grouped by §21 section. See [Which functionalities need an API key](#which-functionalities-need-an-api-key) above — the short version is that the committed defaults need none.

---

## Security

Read [`SECURITY.md`](SECURITY.md) before working on evidence handling, retrieval or exports. In short: private storage only, signed URLs, SHA-256 checksums, malware scanning that fails closed in production, no client content in logs or analytics, and uploaded documents treated as untrusted data rather than instructions (§22.2).

**Never put real client data in this repository** — not in fixtures, not in tests, not in screenshots (§29, §33).

---

## A note on the section references

`§11.4`, `§8.4` and similar throughout the code and docs point at `signal-scan-prd.md`, the full internal specification. That document is not published in this repository.

---

## Licence

Proprietary. See [`LICENSE`](LICENSE).
