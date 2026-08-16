# SignalScan — Quickstart

Short, stepwise, and honest about what exists today.

---

## 1. What this is (30 seconds)

- A **five-day AI Marketing Opportunity Scan**, delivered as software + a strategist.
- Input: client campaign context and evidence. Output: **one scored, cited, human-approved recommendation** with a business case and a 30-day pilot charter.
- Software structures the evidence and does the arithmetic. **Humans approve every recommendation.**

---

## 2. Quickstart (stepwise)

Full macOS and Windows install steps are in the [README](README.md#run-it-on-a-macbook-stepwise). Once installed:

| #   | Step             | Command                          | You should see                |
| --- | ---------------- | -------------------------------- | ----------------------------- |
| 1   | Install deps     | `pnpm install --frozen-lockfile` | No lockfile changes           |
| 2   | Create env file  | `cp .env.example .env.local`     | Safe defaults, no keys needed |
| 3   | Start services   | `pnpm dev:services`              | 3 containers up               |
| 4   | Build schema     | `pnpm db:migrate`                | 24 tables, 23 RLS-protected   |
| 5   | Load data        | `pnpm db:seed`                   | Scored portfolio printed      |
| 6   | Verify           | `pnpm test`                      | 304 passing                   |
| 7   | Verify isolation | `pnpm test:integration`          | 28 passing                    |
| 8   | Stop             | `pnpm dev:services:down`         | Containers removed            |

**Step 5 prints this** — the fastest proof the engine works end to end:

```
 81.00  recommend    Brand-checked variant generation
 76.06  recommend    Brief completeness assistant
 61.25  conditional  Claims pre-check for legal review
 47.19  backlog      Localisation drafting for three markets
 38.58  backlog      Campaign performance summarisation
 47.78  blocked      Autonomous audience expansion
```

Note the last row: it outranks two backlog items and is **still blocked**. A hard stop overrides the score entirely. That is correct behaviour, not a bug.

**To start over:** `pnpm db:reset` (drops, re-migrates, re-seeds).

---

## 3. What it CAN do today

- ✅ Score opportunities deterministically — 16 factors, 4 bands, 8 hard stops. Same input, same score, every machine.
- ✅ Model the business case — conservative / base / upside, payback, currency-aware.
- ✅ Run the 20-question intake with branching and validation.
- ✅ Map campaign workflows and find the top-3 friction points.
- ✅ Enforce the full role permission matrix (6 roles × every capability).
- ✅ Create a real Postgres schema with row-level security, and **prove tenant isolation with tests** that connect as the application role.
- ✅ Load a complete synthetic client fixture (25 campaigns, 2 competitors, 6 opportunities).
- ✅ Run entirely offline. No keys, no accounts.

## 4. What it CANNOT do yet

Be clear-eyed here — these packages are scaffolded but **empty**:

- ❌ **No web UI.** `pnpm dev` currently does nothing — `apps/web` has no code. There is no browser experience yet.
- ❌ **No login.** Auth is not implemented.
- ❌ **No file upload or document parsing.** PDF/DOCX/PPTX ingestion is not built.
- ❌ **No AI calls.** The LLM adapters do not exist yet, so brand-rule extraction and opportunity generation are not automated.
- ❌ **No report exports.** No HTML, PDF, CSV, JSON or Markdown output.
- ❌ **No background jobs.** The 14 job types are specified, not implemented.

**Today this is a tested engine and data layer, not a running application.** Everything in §3 is exercised through tests and the seed script, not a UI.

---

## 5. Which functionalities need API keys

**Nothing in §3 needs a key.** Keys only matter for features that are not built yet — the variables exist as the contract for when those adapters land.

| Functionality                                               | Needs                  | Env vars                                                         | Status               |
| ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- | -------------------- |
| Everything in §3                                            | —                      | none                                                             | ✅ Works now         |
| Live AI extraction, brand inference, opportunity generation | Anthropic API key      | `LLM_PROVIDER=anthropic`, `LLM_API_KEY`                          | ⏳ Adapter not built |
| Semantic search over evidence                               | Embedding provider key | `EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`     | ⏳ Adapter not built |
| Real logins + hosted private storage                        | Supabase project       | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | ⏳ Not built         |
| Sending real invitation emails                              | Email provider         | `EMAIL_PROVIDER`, `EMAIL_API_KEY`                                | ⏳ Mailpit only      |
| Malware scanning on uploads                                 | Scanner service        | `MALWARE_SCAN_PROVIDER`, `MALWARE_SCAN_API_KEY`                  | ⏳ Stub only         |
| Durable jobs in production                                  | Hosted Inngest         | `JOB_SIGNING_KEY`, `JOB_EVENT_KEY`                               | ⏳ Dev server only   |
| Error tracking / analytics                                  | Sentry, etc.           | `ERROR_TRACKING_DSN`, `ANALYTICS_WRITE_KEY`                      | ⏳ Optional          |

⚠️ **Adding `LLM_API_KEY` today changes nothing** — there is no code to call it. It becomes live the moment `packages/ai` ships, with no other change.

🔒 `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. Never expose it to the browser.

---

## 6. Best practices

### Both platforms

- Use **pnpm**, never npm or yarn — this is a pnpm workspace and the lockfile is authoritative.
- Never put **real client data** in this repo — not in fixtures, tests or screenshots. Synthetic only.
- Never commit `.env.local`. `.env.example` holds names and safe defaults only.
- Run `pnpm db:reset` rather than hand-editing seeded rows.
- Before pushing: `pnpm lint && pnpm typecheck && pnpm test`.
- Scoring files require **100% branch coverage** — CI fails below it. This is deliberate.

### macOS

- Prefer **Homebrew** for Node, pnpm and Git.
- Start Docker Desktop _before_ `pnpm dev:services` and wait for the engine.
- Port 5432 conflict → `brew services stop postgresql@16`.
- Apple Silicon needs no `platform:` overrides; all images are multi-arch.
- Give Docker Desktop ≥4 GB RAM (Settings → Resources).

### Windows

- Use **PowerShell**, not `cmd`. Some scripts assume it.
- Install pnpm with `npm install -g pnpm@latest` — `corepack` can hit `EPERM` on `C:\Program Files\nodejs`.
- Set `DATABASE_URL` in the shell before `db:migrate` if it is not picked up from `.env.local`.
- Enable the **WSL 2 backend** in Docker Desktop for usable performance.
- Keep the repo on `C:\` — not a network or OneDrive-synced drive.
- Git line endings are handled by `.gitattributes`; do not override `core.autocrlf`.

---

## 7. Troubleshooting

| Symptom                                         | Fix                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `docker compose` cannot find the pipe / socket  | Docker Desktop is not running                                        |
| `ERR_PNPM_IGNORED_BUILDS`                       | Expected — `allowBuilds` in `pnpm-workspace.yaml` handles esbuild    |
| Integration tests fail with "Seed data missing" | Run `pnpm db:migrate && pnpm db:seed` first                          |
| Port 5432 in use                                | Stop your local Postgres, or change the port in `docker-compose.yml` |
| `pnpm dev` does nothing                         | Correct — `apps/web` is not built yet (see §4)                       |

---

## 8. Where to go next

- [`README.md`](README.md) — business benefits, metrics, full install
- [`SECURITY.md`](SECURITY.md) — read before touching evidence handling, retrieval or exports
- [`docs/adr/`](docs/adr/) — architecture decisions, including two live PRD conflicts and their resolutions
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch, commit and review conventions
