# SignalScan

**Find the first profitable agentic marketing workflow in five business days.**

SignalScan is a strategist's evidence and decision system. It takes a client's campaign context and evidence, maps how campaigns actually get made, works out what the brand really sounds like, compares it against two competitors, and produces one scored, cited, human-approved recommendation with a business case and a 30-day pilot charter.

It is deliberately **not** an autonomous consultant. Software structures the evidence and the arithmetic; humans approve every recommendation.

The full specification is [`signal-scan-prd.md`](../signal-scan-prd.md). Section references throughout the code (`§11.4`, `§8.4`) point at it.

> **New here? Read [`QUICKSTART.md`](QUICKSTART.md)** — stepwise setup, what the code can and cannot do today, and which features need API keys.

---

## Top business benefits

- **Turns "we need AI" into a funded decision.** Five days, fixed scope, one scored recommendation — instead of an open-ended discovery retainer.
- **Kills the wrong projects early.** Eight hard stops (no data, no owner, unresolved legal risk) block an opportunity outright, regardless of how good its score looks.
- **Makes the decision defensible.** Every number traces to a source document, a page and an excerpt. No black-box scoring.
- **Creates a reusable baseline.** The KPI baseline captured on day one is what any later pilot gets measured against.
- **Compounds across clients.** The same 16-factor rubric scores every engagement, so patterns become benchmark data.

## Business metrics it is built to move

Baselines come from the client at intake; the engine models the delta. These are **modelled projections from client-supplied numbers, not guarantees.**

| Metric                           | Where it comes from                                   | What the scan does with it                               |
| -------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| **Time-to-decision**             | Length of the current "should we use AI here?" cycle  | Fixed at 5 business days                                 |
| **Workflow cycle time**          | Intake Q04 baseline + observed stage timings          | Finds the top-3 wait / work / rework points (§8)         |
| **Annual value of the workflow** | Hours saved × loaded rate, plus error and speed value | Conservative / base / upside scenarios (§12.2)           |
| **Payback period**               | Value vs. pilot cost                                  | Returns `null` — never a fake number — when value ≤ cost |
| **Rework rate**                  | Rework stages in the mapped flow                      | Quantified per stage, not estimated                      |
| **Approval turnaround**          | Stage elapsed vs. work time                           | Surfaces waiting time as its own line item               |

Two deliberate constraints worth knowing up front: the model **never estimates a missing input** (it records what it is waiting on), and it **never calls a saving "headcount reduction"** unless the client has explicitly confirmed that.

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

**In plain terms:** this is a tested engine and data layer, not yet a running application. There is no UI, no login, no file upload and no AI calls yet — see [what it can and cannot do](QUICKSTART.md#3-what-it-can-do-today).

---

## Prerequisites

| Need               | Version     | Why                                                 |
| ------------------ | ----------- | --------------------------------------------------- |
| **Node**           | 22 or newer | Runtime                                             |
| **pnpm**           | 11 or newer | Workspace manager — npm and yarn will not work here |
| **Docker Desktop** | any current | Postgres + pgvector, Mailpit, MinIO                 |
| **Git**            | any current | —                                                   |
| **RAM**            | 8 GB free   | Three containers plus the test suite                |

**No API keys, no cloud accounts, no credit card.** Everything below runs offline against synthetic data.

---

## Run it on a MacBook (stepwise)

Works on both Apple Silicon (M1–M4) and Intel.

**1. Install Homebrew** — skip if `brew -v` already works.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**2. Install the toolchain**

```bash
brew install node@22 pnpm git
brew install --cask docker
```

**3. Start Docker Desktop** — open it from Applications and wait for the whale icon to stop animating. `pnpm dev:services` fails until the engine is actually up.

```bash
open -a Docker
docker info > /dev/null 2>&1 && echo "Docker ready"
```

**4. Clone and install**

```bash
git clone https://github.com/debster9755/signalscan.git
cd signalscan
pnpm install --frozen-lockfile
```

**5. Create your env file** — every value in the template is safe and already works locally.

```bash
cp .env.example .env.local
```

**6. Start the local services** — Postgres + pgvector, Mailpit, MinIO.

```bash
pnpm dev:services
```

**7. Create the schema and load synthetic data**

```bash
pnpm db:migrate
pnpm db:seed
```

**8. Confirm it worked** — the seed prints the scored portfolio shown below.

```bash
pnpm test              # 304 unit tests
pnpm test:integration  # 28 tenant-isolation tests, needs step 7
```

**9. Stop the containers when you are done**

```bash
pnpm dev:services:down
```

**macOS gotchas**

- If port 5432 is taken, a local Postgres is already running: `brew services stop postgresql@16`.
- Apple Silicon needs no special flags — all three images are multi-arch.
- If `pnpm` is not found after `brew install`, open a new terminal tab.

<details>
<summary><strong>Windows (PowerShell) equivalents</strong> — §34 asks for these explicitly</summary>

```powershell
winget install OpenJS.NodeJS.LTS Docker.DockerDesktop Git.Git
npm install -g pnpm@latest

git clone https://github.com/debster9755/signalscan.git
cd signalscan
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev:services
$env:DATABASE_URL = "postgresql://signalscan:signalscan@localhost:5432/signalscan"
pnpm db:migrate
pnpm db:seed
```

`pnpm dev:services` needs Docker Desktop running. If `docker compose` reports it cannot find the pipe, start Docker Desktop and wait for the engine before retrying. Use PowerShell, not `cmd`.
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

| Command                                        | Does                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                                     | Run the application — **no-op today**, `apps/web` is empty |
| `pnpm dev:services` / `pnpm dev:services:down` | Start / stop local Postgres, Mailpit and MinIO             |
| `pnpm db:migrate`                              | Apply pending migrations and RLS policies                  |
| `pnpm db:migrate --dry-run`                    | List what would run                                        |
| `pnpm db:seed`                                 | Load the synthetic Northstar Cloud fixture                 |
| `pnpm db:reset`                                | Drop the schema, re-migrate, re-seed                       |
| `pnpm lint` / `pnpm format`                    | Lint / format                                              |
| `pnpm typecheck`                               | Type-check every package                                   |
| `pnpm test`                                    | Unit tests                                                 |
| `pnpm test:coverage`                           | Unit tests with coverage gates                             |
| `pnpm test:integration`                        | Integration tests — **needs services running and seeded**  |
| `pnpm test:e2e`                                | Browser end-to-end tests                                   |
| `pnpm test:evals`                              | AI evaluation gates                                        |
| `pnpm build`                                   | Build everything                                           |

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
