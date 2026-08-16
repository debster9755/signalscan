# Quickstart

Get SignalScan running and see the decision engine work. Two tiers — pick one.

| Tier                     | Time    | Needs                 | You get                                                         |
| ------------------------ | ------- | --------------------- | --------------------------------------------------------------- |
| **A — Core only**        | ~2 min  | Node 22.13+           | Scoring, hard stops, business case, friction analysis running   |
| **B — Full local stack** | ~10 min | Node + Docker Desktop | Tier A plus Postgres, RLS, the synthetic client, Mailpit, MinIO |

Nothing on this page needs an API key, an account, or network access after `pnpm install`.

---

## Prerequisites

| Tool               | Version              | macOS                                      | Windows                                             |
| ------------------ | -------------------- | ------------------------------------------ | --------------------------------------------------- |
| **Node.js**        | **22.13+** or 24 LTS | `brew install node@22` or `nvm install 22` | `winget install OpenJS.NodeJS.LTS` or `nvm-windows` |
| **pnpm**           | 11.22+               | `corepack enable`                          | `corepack enable`                                   |
| **Git**            | any                  | `xcode-select --install`                   | `winget install Git.Git`                            |
| **Docker Desktop** | 4.x — _Tier B only_  | `brew install --cask docker`               | `winget install Docker.DockerDesktop`               |

Check before you start:

```bash
node -v     # must be v22.13.0 or higher
pnpm -v     # 11.x — if missing, run: corepack enable
```

> **Node 22.11 will fail.** `package.json` allows `>=22.0.0`, but pnpm 11.22 requires Node 22.13+. The error is `This version of pnpm requires at least Node.js v22.13`.

---

## Tier A — core only (no Docker)

```bash
# 1
git clone https://github.com/debster9755/signalscan.git
cd signalscan

# 2  pnpm ships with Node; this activates it
corepack enable

# 3  install exactly what the lockfile pins
pnpm install --frozen-lockfile

# 4  run the engine
pnpm demo

# 5  prove it — 304 unit tests, under a second
pnpm test
```

`pnpm demo` prints six sections:

1. **Campaign flow friction** — 10 stages, 26 days elapsed, 93% of it waiting
2. **Scored portfolio** — six candidates ranked into four priority bands
3. **Hard stops** — why the blocked candidate is blocked, and what would clear it
4. **The recommendation** — raw score, confidence multiplier, owner, KPI, human gates
5. **Business case** — hours saved, gross value, year-one net, payback
6. **Missing data** — a candidate with no cost inputs, reported as incomplete rather than guessed

Run it twice. The numbers are byte-identical — that is the point (§32.1).

---

## Tier B — full local stack

Do Tier A first, then:

```bash
# 6  environment template — every value in it is safe to commit
cp .env.example .env.local          # macOS / Linux
# Copy-Item .env.example .env.local # Windows PowerShell

# 7  START DOCKER DESKTOP and wait for the whale icon to settle
pnpm dev:services

# 8  schema + row-level security policies
pnpm db:migrate

# 9  synthetic Northstar Cloud client
pnpm db:seed

# 10 prove tenant isolation is real
pnpm test:integration
```

`db:migrate` and `db:seed` read `.env.local` themselves, so step 6 is all the configuration needed on any platform. To point them at a different database instead, export the variable — an explicit environment variable always wins over the file:

```bash
DATABASE_URL="postgresql://user:pass@host:5432/db" pnpm db:migrate   # macOS / Linux
```

```powershell
$env:DATABASE_URL = "postgresql://user:pass@host:5432/db"            # Windows PowerShell
pnpm db:migrate
```

### What is now running on localhost

| URL / DSN                                                      | Service                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `postgresql://signalscan:signalscan@localhost:5432/signalscan` | Postgres 16 + pgvector                                       |
| [http://localhost:8025](http://localhost:8025)                 | Mailpit — catches every outbound email, nothing is delivered |
| [http://localhost:9001](http://localhost:9001)                 | MinIO console — `signalscan` / `signalscan-dev-secret`       |

**There is no SignalScan web UI yet.** `apps/web` is the next milestone; `pnpm dev` currently starts nothing. Until it lands, `pnpm demo` is how you see the product working.

Tear down when finished:

```bash
pnpm dev:services:down
```

---

## Day-to-day

| You want to…                         | Run                  |
| ------------------------------------ | -------------------- |
| See the engine work                  | `pnpm demo`          |
| Run tests while editing              | `pnpm test:watch`    |
| Check the coverage gates CI enforces | `pnpm test:coverage` |
| Type-check everything                | `pnpm typecheck`     |
| Fix formatting before pushing        | `pnpm format`        |
| Start over with clean data           | `pnpm db:reset`      |

Before opening a PR, run what CI runs: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test:coverage`.

---

## Best practices

### Both platforms

- **Install with `--frozen-lockfile`.** A fresh resolve can pull a different tree than CI tested.
- **Use `corepack enable`, not `npm i -g pnpm`.** The repo pins `pnpm@11.22.0` in `packageManager`; corepack honours that pin, a global install does not.
- **Never put real client data in the repo** — not in fixtures, tests, or screenshots (§29, §33). The Northstar Cloud fixture is entirely invented and is the only data any developer should see.
- **Keep `.env.local` local.** It is gitignored. The committed `.env.example` is safe precisely because it contains no real credential.
- **Leave `LLM_PROVIDER=mock`** unless you specifically need live extraction. Mock mode is deterministic, offline, and free.

### macOS

- **Use `nvm` if you juggle Node versions.** `nvm install 22 && nvm use 22` avoids the 22.13 trap that a stale Homebrew Node walks into.
- **Apple Silicon is fine.** The `pgvector/pgvector:pg16` image has an arm64 build; nothing needs Rosetta.
- **Give Docker Desktop 4 GB.** Settings → Resources. Three containers on the default 2 GB will thrash.
- **If port 5432 is taken** by a Homebrew Postgres: `brew services stop postgresql@16`, or change the host port in `docker-compose.yml`.
- Paths are case-insensitive on macOS but case-sensitive in CI — `forceConsistentCasingInFileNames` is on so `pnpm typecheck` will catch a bad import before Linux does.

### Windows

- **Use PowerShell, not `cmd`.** The command substitutions in these docs assume it.
- **WSL2 is the smoother path.** Run the repo inside WSL2 and point Docker Desktop at the WSL2 backend — file watching and install times are noticeably better than on native Windows.
- **Keep the repo out of `C:\Users\…\OneDrive\`.** OneDrive sync and `node_modules` fight each other.
- **Set `git config --global core.autocrlf input`** before cloning. `.gitattributes` normalises line endings, but a CRLF checkout still trips `pnpm format:check`.
- **`pnpm dev:services` needs Docker Desktop already running.** If `docker compose` reports it cannot find the pipe, start Docker Desktop and wait for the engine before retrying.

---

## Troubleshooting

| Symptom                                                 | Fix                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `This version of pnpm requires at least Node.js v22.13` | Upgrade Node to 22.13+ or 24. `package.json`'s `>=22.0.0` is too loose. |
| `pnpm: command not found`                               | `corepack enable`, then reopen the terminal                             |
| Corepack signature error on `corepack prepare`          | `npm i -g corepack@latest`, then `corepack enable`                      |
| `pnpm dev` prints "No tasks were executed"              | Expected — there is no app to run yet. Use `pnpm demo`.                 |
| `DATABASE_URL is not set`                               | You skipped step 6 — run `cp .env.example .env.local`                   |
| `Migration failed: ECONNREFUSED`                        | Docker Desktop is not running, or `pnpm dev:services` was never run     |
| `docker compose` cannot find the pipe / socket          | Start Docker Desktop and wait for the engine to report ready            |
| Port 5432 already allocated                             | Stop your local Postgres, or remap the port in `docker-compose.yml`     |
| `pnpm test:integration` fails to connect                | Run `pnpm dev:services` and `pnpm db:seed` first — it needs real data   |
| `pnpm test:e2e` / `pnpm test:evals` find nothing        | Expected — those suites are not written yet                             |
