# Demo runbook

End-to-end steps for demonstrating SignalScan on a machine that has never run it.

> ### 📦 You never supply any data
>
> - **`pnpm db:migrate` creates the tables and applies row-level security. Structure only, no data.**
> - **`pnpm db:seed` loads Northstar Cloud: an entirely invented client — 25 campaigns, 2 competitors, a 10-stage workflow, 6 opportunities.**
>
> It is committed to the repository precisely so that **nobody ever needs real client data to demo this** (§29, §33).

---

## Before the day

Roughly 15 minutes, most of it downloads. **Do not leave this until the demo** — the first `pnpm dev:services` pulls about 1 GB of container images.

### 1. Prerequisites

| Tool           | Version              | Install                                                                                       |
| -------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| Node.js        | **22.13+** or 24 LTS | `nvm install 24` or `brew install node`                                                       |
| pnpm           | 11.22+               | `corepack enable` — ships with Node                                                           |
| Git            | any                  | `xcode-select --install`                                                                      |
| Docker Desktop | 4.x                  | [docker.com](https://www.docker.com/products/docker-desktop/) or `brew install --cask docker` |

If Docker Desktop is already installed, **skip it** — `brew install --cask docker` will refuse with `There is already an App at '/Applications/Docker.app'`, which is Homebrew declining to overwrite an install it does not manage. Nothing is wrong.

```bash
node -v            # must be v22.13.0 or higher
pnpm -v            # 11.x — if missing: corepack enable
docker version     # Docker Desktop must be running
```

### 2. Set up

```bash
git clone https://github.com/debster9755/signalscan.git
cd signalscan
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

### 3. Warm the containers and load the client

Start Docker Desktop and wait for the whale icon to settle, then:

```bash
pnpm dev:services   # pulls Postgres+pgvector, Mailpit, MinIO — slow, once
pnpm db:migrate     # 4 migrations
pnpm db:seed        # Northstar Cloud
```

`db:seed` must end with the scored portfolio. If it does, the whole stack works:

```
Scored portfolio:
   81.00  recommend    Brand-checked variant generation
   76.06  recommend    Brief completeness assistant
   61.25  conditional  Claims pre-check for legal review
   47.19  backlog      Localisation drafting for three markets
   38.58  backlog      Campaign performance summarisation
   47.78  blocked      Autonomous audience expansion
```

---

## Pre-flight, ten minutes before

```bash
open -a Docker            # wait for the engine
cd signalscan
pnpm dev:services         # fast now, images are cached
pnpm dev                  # → http://localhost:3000
```

Open the page and **check the badge under the title reads `Data source: Postgres`.** If it says _in-memory fixture_, the page is not reading the database — see Troubleshooting.

Have two terminal tabs ready: one running `pnpm dev`, one free.

---

## The demo

### 1. Open with the finding, not the software — 1 min

`localhost:3000`, top section.

> Ten stages. Twenty-six days end to end, of which under two days is anyone actually working. Ninety-three percent is queue. Legal review alone is an eight-day wait.

The point: automating the _work_ does almost nothing to a cycle that is mostly _waiting_. That is why the scan maps the flow before scoring anything.

### 2. The ranked portfolio — 2 min

Scroll to **Scored portfolio**.

> Six candidates, scored on sixteen weighted factors. Not a workshop vote — server arithmetic, and reproducible: same evidence, same score, on any machine, forever.

Then point at the bottom row:

> This one scores 47.78 — higher than two of the backlog items — and it is still blocked. A hard stop overrides the ranking entirely.

### 3. Why it is blocked — 2 min

Scroll to **Hard stops**. Three codes, each with a plain-language reason and what would clear it.

> No daily user. No measurable outcome. Required data prohibited. Any one of those blocks a recommendation no matter how attractive the score. This is where most AI pilots die — six months in, not on day four.

### 4. The business case — 2 min

Scroll to **Business case**.

> 432 hours a year released, ₹9.9 lakh gross, 6.6-month payback.

Then the second table, which is the one that earns trust:

> This candidate has no cost data. Gross value is a dash. Payback is _not shown_ — not zero, not estimated, not a plausible-looking placeholder. It lists the four inputs it is waiting on. A business case that invents a number to look complete is a liability.

### 5. Prove it is not a mock — 2 min

In the free tab:

```bash
pnpm demo
```

> Same numbers, computed in a terminal, no browser involved. The page is a view over this engine.

```bash
pnpm test
```

> 304 unit tests, under a second. The scoring rules hold 100% branch coverage — that is a release gate in CI, not an aspiration.

### 6. If the audience is technical — 3 min

```bash
pnpm test:integration
```

> Twenty-eight tenant-isolation tests. They connect as the real application role — the one the app uses, subject to every row-level-security policy — and prove a cross-workspace read fails. Tenant separation is enforced in the database, not by a `WHERE` clause someone might forget.

Optional supporting tabs:

- [localhost:8025](http://localhost:8025) — Mailpit, catching every outbound email so nothing is ever delivered from a dev machine
- [localhost:9001](http://localhost:9001) — MinIO, private object storage (`signalscan` / `signalscan-dev-secret`)

### 7. Close honestly — 1 min

> Everything you just saw runs with no API key, no account and no network. The scoring, hard stops, business case and tenant isolation are done. The page is read-only — it renders a scan, it cannot yet run one. Intake, evidence upload, the approval flow, document parsing and live model calls are the next milestone. Nothing here needed a model to produce a number, and by design nothing ever will.

---

## Between runs

```bash
pnpm db:reset      # drop, re-migrate, re-seed — back to a clean client
```

## Afterwards

```bash
# Ctrl-C the dev server, then:
pnpm dev:services:down
```

Data persists in a Docker volume, so the next `pnpm dev:services` is instant and still seeded.

---

## Troubleshooting

| Symptom                                          | Fix                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Badge says _in-memory fixture_, not _Postgres_   | `.env.local` missing at the repo root, or the database is not seeded. `cp .env.example .env.local`, then `pnpm db:seed`. |
| `Migration failed: ECONNREFUSED`                 | Docker Desktop is not running, or `pnpm dev:services` has not been run                                                   |
| `This version of pnpm requires … v22.13`         | Upgrade Node to 22.13+ or 24                                                                                             |
| Port 3000 in use                                 | `pnpm --filter @signalscan/web dev -- --port 3001`                                                                       |
| Port 5432 in use                                 | `brew services stop postgresql@16`, or remap the port in `docker-compose.yml`                                            |
| `brew install --cask docker` says the app exists | Docker Desktop is already installed. Skip the command; nothing is wrong.                                                 |
| Page loads but is empty                          | Migrated but not seeded — `pnpm db:seed`                                                                                 |

**Worst case, mid-demo:** `Ctrl-C`, then `pnpm demo`. It needs no Docker, no database and no network, and produces the same numbers in about a second.
