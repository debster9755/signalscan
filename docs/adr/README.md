# Architecture Decision Records

PRD §1: when implementation conflicts with the specification, record the decision here and update the specification in the same pull request.

## Decided

| #                                         | Decision                                            | Status   |
| ----------------------------------------- | --------------------------------------------------- | -------- |
| [0011](0011-no-sampling-parameters.md)    | Determinism is expressed as effort, not temperature | Accepted |
| [0012](0012-two-pass-cited-extraction.md) | Cited extraction runs as two passes                 | Accepted |

## Open — PRD §35, to be resolved before Day 1 ends

These do not block repository initialisation, and none of them blocks the current build: every one has a working local stand-in behind an adapter (§15.3). They **do** block production.

| #    | Decision                                                               | Owner       | Blocks                             | Current stand-in                              |
| ---- | ---------------------------------------------------------------------- | ----------- | ---------------------------------- | --------------------------------------------- |
| 0001 | Approved production LLM provider and data-use terms                    | Product     | Live extraction and generation     | Fixture-replay provider (`LLM_PROVIDER=mock`) |
| 0002 | Authentication provider; whether SSO is required for client zero       | Engineering | Invitations, real sessions         | Local magic-link stub, mail to Mailpit        |
| 0003 | Managed storage and malware-scanning provider                          | Security    | Real uploads                       | MinIO + EICAR-detecting stub scanner          |
| 0004 | Final retention period and the deletion evidence the contract requires | Legal       | Retention sweep, deletion manifest | 90 days, 30–365 configurable                  |
| 0005 | Whether client sponsors may export raw evidence                        | Product     | Sponsor export permission          | `FEATURE_CLIENT_RAW_EXPORT=false`             |
| 0006 | PDF, PPTX and DOCX parsing libraries or services                       | Engineering | Evidence ingestion                 | —                                             |
| 0007 | PDF-rendering provider                                                 | Engineering | Report PDF export                  | Headless Chromium via Playwright              |
| 0008 | Production region and data-residency requirement                       | Legal       | Deployment                         | —                                             |
| 0009 | Incident and support contacts                                          | Operations  | Production readiness               | —                                             |
| 0010 | Final privacy, terms and client-consent wording                        | Legal       | Public pages, production           | —                                             |

When one is decided, replace its row with a file named `000N-short-slug.md` using the template below and move it to the Decided table.

## Template

```markdown
# NNNN. Title

**Status:** Proposed | Accepted | Superseded by [NNNN](...)
**Date:** YYYY-MM-DD
**Deciders:** roles, not names

## Context

What forced the decision. Include the PRD section it touches.

## Decision

What we are doing.

## Consequences

What this makes easy, what it makes hard, and what we have accepted.

## Alternatives considered

What else was on the table and why it lost.
```
