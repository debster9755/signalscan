# Security

SignalScan handles confidential client marketing evidence — briefs, campaign performance, brand guidelines, occasionally commercial terms. The controls below are requirements from PRD §22, not suggestions.

## Reporting a vulnerability

Do not open a public issue. Contact the security owner listed in `.github/CODEOWNERS` directly. Include reproduction steps and the affected environment; do not include client data in the report.

## Non-negotiables

**Tenant isolation is enforced in the database.** Every client-owned table has row-level security keyed to active workspace membership. The application connects as `signalscan_app`, which is subject to every policy; only migrations run as the schema owner. Never add a table without a policy, and never work around RLS by moving a query to the owner connection.

**Authorisation is server-side, on every route.** `packages/security/src/authorization/permissions.ts` is the single decision point. A second implementation is a second chance to get it wrong.

**Evidence is private.** Private buckets only, signed URLs with a 15-minute default expiry, SHA-256 checksums on every upload, a file-type allowlist, size limits, and malware scanning that **fails closed** in production — if scanning is required and unconfigured, the process refuses to start.

**Uploaded content is data, never instructions.** §22.2: system instructions stay separate from retrieved content, evidence is wrapped in explicit delimiters, and model output cannot select tools or URLs. A document asking to reveal secrets or cross a workspace boundary is rejected. Adversarial fixtures are part of the eval suite.

**Retrieval is filtered before similarity.** Every vector query filters by `workspace_id` and `assessment_id` first. Prompt instructions are not a tenant boundary.

**No client content in logs, analytics or error messages.** §24.1 lists the permitted analytics properties; filenames, campaign names, uploaded text, email addresses and recommendation narrative are all prohibited. Errors carry a safe message and an internal code.

**Audit events are immutable.** Enforced by a database trigger. Sensitive changes — role changes, uploads, deletions, workflow validation, brand-rule decisions, score overrides, finalisation, approvals, exports, retention changes — all write one.

**Secrets live in deployment secret stores.** Never in the repository, never in a prompt, never in a message. `.env.example` contains names and safe defaults only; CI runs a secret scan over full history.

## Working with data

- Local, preview and staging use **synthetic data only**. Never copy production evidence anywhere else (§28.1).
- Fixtures must not contain real client logos, copy, personal data or confidential examples (§29).
- Prefer role names over personal names in campaign maps (§22.3).
- Default retention is 90 days after finalisation, configurable between 30 and 365.

## Before you ship

Anything touching evidence handling, retrieval, exports or permissions needs the §26.4 security tests to pass: cross-workspace access, object-storage URL guessing, expired signed URLs, privilege escalation, malicious file types and double extensions, oversize files, prompt injection inside documents, XSS in user, document and model-generated text, SQL injection, and CSRF or replay of mutation requests.
