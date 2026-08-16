# Contributing

## Branches and pull requests

- `main` is always releasable. No direct commits, no force pushes.
- Branch names: `feat/SS-###-short-name`, `fix/SS-###-short-name`.
- Every change enters through a pull request with at least one approval, and CODEOWNERS approval for scoring, security, database and prompt changes.
- Releases are semantic tags (`v0.1.0`).

## Definition of done (§33)

A feature is done when **all** of these are true:

- [ ] Behaviour matches the PRD, or an approved ADR in `docs/adr/` records the deviation
- [ ] UI has loading, empty, error and permission-denied states
- [ ] Server-side validation and authorisation exist
- [ ] Migrations and RLS policies are reviewed
- [ ] Audit events are written for sensitive changes
- [ ] Tests cover the success **and** failure paths
- [ ] Accessibility considered — keyboard operation, focus states, and never colour alone for status
- [ ] No real client data in tests, fixtures or screenshots
- [ ] Documentation and `.env.example` updated
- [ ] CI passes

## Conventions

**Cite the specification.** When code implements a specific rule, reference the section (`§11.5`). Six months from now the reason a band boundary is `>= 60` and not `> 60` will not be obvious, and the reference is cheaper than an archaeology session.

**Deviating from the PRD requires an ADR.** §1 is explicit: record the decision in `docs/adr/` and update the specification in the same pull request.

**Never edit a released factor weight or question definition in place.** Publish a new version. Historical scores and responses must stay interpretable (§7.3, §11.7).

**Keep vendor SDKs out of business logic.** They belong in adapters (§15.3).

**Scoring changes need 100% branch coverage.** Enforced by `vitest.config.ts`; CI fails below it.

## Running things

See the command table in [`README.md`](README.md). The integration suite needs `pnpm dev:services && pnpm db:migrate && pnpm db:seed` first — it connects as the real RLS-bound application role, so it will not pass against an empty database.

## Commit messages

Conventional commits, with the issue key where one exists:

```
feat(SS-402): implement confidence-adjusted priority scoring
fix(SS-105): stop parse failures from marking an asset deleted
```
