# 0011. Determinism is expressed as effort, not temperature

**Status:** Accepted
**Date:** 2026-08-16
**Deciders:** Engineering lead, AI owner

## Context

PRD §20.4 specifies model temperatures:

| Task                   | Specified temperature |
| ---------------------- | --------------------- |
| Extraction             | 0.0                   |
| Classification         | 0.0                   |
| Opportunity generation | 0.2                   |
| Report drafting        | 0.2                   |

`temperature`, `top_p` and `top_k` were **removed** from the current generation of Claude models. Sending any of them to Claude Opus 5, Claude Sonnet 5 or the Opus 4.7/4.8 family returns HTTP 400. The specification's intent — near-deterministic extraction and classification, slightly looser generation — is sound; the mechanism it names no longer exists.

Writing the parameters anyway would mean every extraction call fails in production while passing against a mock in development, which is the worst possible place to discover it.

## Decision

`LLMProvider` exposes a **`determinism`** parameter with two values rather than a numeric temperature:

| `determinism` | Used for                                | Anthropic mapping                   | Provider without effort |
| ------------- | --------------------------------------- | ----------------------------------- | ----------------------- |
| `strict`      | Extraction, classification              | `output_config: { effort: 'low' }`  | `temperature: 0`        |
| `creative`    | Opportunity generation, report drafting | `output_config: { effort: 'high' }` | `temperature: 0.2`      |

The adapter translates. Business logic never names a sampling parameter, so a future provider change is an adapter change.

Determinism where it actually matters comes from three things that are not sampling settings at all:

1. **Schema-constrained output.** `output_config.format` with a JSON Schema, per §10.2, so structure cannot drift.
2. **Tight, versioned prompts** with explicit data delimiters (§20.5, §22.2).
3. **Scores calculated outside the model** (§20.2). The number that has to reproduce exactly never comes from a model in the first place.

## Consequences

**Easier.** The adapter can target current models without a translation layer bolted on later. Effort is a better lever than temperature for the extraction/generation split, because it governs how much work the model does rather than only how it samples.

**Harder.** `determinism: 'strict'` is not bit-for-bit deterministic — no sampling setting ever was, including `temperature: 0`. Anything requiring exact reproducibility must not depend on model output. §11 and §12 already satisfy this; future features must too.

**Accepted.** PRD §20.4's temperature table is superseded by this ADR. The specification should be updated to name determinism modes.

## Alternatives considered

**Send the temperatures anyway.** Fails with 400 on every current model.

**Pin to an older model that still accepts sampling parameters.** Trades correctness of extraction and citation for a parameter that was never delivering the determinism it appeared to promise. Rejected.

**Expose the raw effort value in business logic.** Leaks a provider concept into the domain and breaks §15.3.
