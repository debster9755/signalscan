# 0012. Cited extraction runs as two passes

**Status:** Accepted
**Date:** 2026-08-16
**Deciders:** Engineering lead, AI owner, Product owner

## Context

Two PRD requirements collide at the API level.

§9.1 requires every extracted brand rule to show its exact source asset, the page/slide/sheet/URL section, a short evidence excerpt, an extraction confidence and a human review status. §32.2 makes this a release gate: _"Every finalizable guideline, campaign, competitor and workflow claim has a citation."_

§10.2 requires all model output to conform to a server-validated JSON schema, with one repair attempt and then a visible `needs_review` state.

Anthropic's native citations (`citations: { enabled: true }` on a document block) produce exactly what §9.1 wants — `cited_text` with a real `page_location` the model cannot fabricate, because the API derives it from the document rather than the model asserting it. But **citations and `output_config.format` are mutually exclusive**: combining them returns HTTP 400.

So we can have verifiable page-accurate citations, or schema-guaranteed structure, but not both in one call.

## Decision

Extraction runs as two passes.

**Pass 1 — cited extraction.** The document goes in as a native document block with `citations: { enabled: true }`, no output format. The model returns prose with citation blocks attached. We persist each cited span as an `evidence_citations` row carrying the real `page_location` and excerpt, and hash the excerpt so later tampering is detectable.

**Pass 2 — structured normalisation.** Pass 1's cited spans go back in as text, each tagged with the citation id we just minted, under `output_config.format` with the `BrandRule` schema. The model's job is now normalisation, not retrieval: map cited text to rule categories and reference the citation ids it was given.

A rule surviving pass 2 with a citation id that pass 1 did not mint is rejected outright. The model cannot invent a source, because it never sees the citation namespace — only the ids handed to it.

## Consequences

**Easier.** Citations point at genuine page locations rather than a model's claim about one, which is what §32.2's "citation points to relevant evidence ≥ 90%" gate actually measures. Structured output stays fully schema-validated. The two passes are independently testable and independently repairable — a pass-2 schema failure does not discard the expensive extraction.

**Harder.** Two model calls per document instead of one: more latency and more tokens. Mitigated by prompt caching on the stable assessment prefix, and by the fact that pass 2 is cheap — it processes extracted spans, not whole documents.

**Accepted.** Pass 2 can still mis-categorise a rule while citing correctly. That is precisely what human review in §9.1 exists for, and inferred rules stay labelled `pending` until a reviewer approves them (§32.2).

## Alternatives considered

**Structured output only, model asserts its own page numbers.** Simplest, and wrong. A model-asserted page number is an unverifiable claim in a field the client will trust because it looks like provenance. Rejected outright — this is the failure mode §32.2 exists to prevent.

**Citations only, parse the prose ourselves.** Trades a schema guarantee for a bespoke parser over free text, and reintroduces exactly the fragility `output_config.format` removes.

**Strict tool use instead of `output_config.format`.** Same incompatibility with citations; no advantage.

**Chunk-level citations from our own parser only.** We do this anyway for retrieval, but our chunker's page mapping is less reliable than the API's for PDFs, and it does nothing for the model's tendency to cite the wrong chunk. The two-pass approach uses both: our chunk ids for retrieval scope, the API's locations for display.
