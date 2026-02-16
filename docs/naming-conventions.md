# Naming conventions

## Purpose
Names in this repository are part of the verification surface. A name must encode intent, scope, and guarantees with minimal ambiguity.

Canonical policy marker: LOG_LABEL_POLICY=DOMAIN_PHRASES_NO_TAG_PREFIX

## Core rules
- Use activation handles with stable English terms.
- Use ontology-first casing (`PascalCase` for kinds, `camelCase` for roles).
- Use verb-first names for effects (`run*`, `check*`, `emit*`).
- Use affirmative booleans (`isReady`, `hasContext`, `canRetry`).
- Do not claim guarantees (`Safe`, `Valid`, `Canonical`) unless they are enforced.

## Prompt and log labels
- Prompt labels use plain anchors: `Instruction:`, `Context:`, `Constraints:`, `Output:`.
- Log messages use stable domain-first phrasing with explicit field keys.
- Uppercase tag prefixes (`CUE:`, `ACT:`, `EVAL:`) are prohibited.
