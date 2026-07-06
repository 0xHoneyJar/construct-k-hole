---
title: Sprint Plan — k-hole Phase 2 · Two Lanes, One Grounded-Result Contract
date: 2026-07-06
status: draft · driving to run-bridge
issue: 0xHoneyJar/construct-k-hole#21 (Phase 2 kickoff)
prd: grimoires/loa/prd.md
sdd: grimoires/loa/sdd.md
branch: feat/khole-phase2-two-lane-grounding
build_discipline: |
  Sequenced by dependency. The contract + lib seams + fail-closed logic + OpenRouter removal
  are self-contained and unit/contract-testable offline. Live-credential integration points
  (Executor MCP code-mode, Exa API, model-invoke on PATH) are built behind interfaces with
  contract/mock tests; live e2e is gated on creds and marked as such (never stubbed-and-claimed).
  Test-first per Loa/Karpathy: every FR lands a runnable check that fails if the logic breaks.
---

# Sprint Plan — k-hole Phase 2

Three sprints, dependency-ordered. Each task carries test-first acceptance criteria.
Traceability: every task cites its PRD FR + SDD section.

## Sprint 1 — Contract + cheval lane foundation (FR-1, FR-2)

The substrate everything else sits on. Fully offline-testable.

- **S1.T1 — Harvest grounded-result contract.** Port `GroundedResult`/`Citation`/
  `GroundedQuality` dataclasses (`ce555e2b`) + `grounded-result-v1`/`error-v1`/`request-v1`
  schemas (`66c2fcd7`) + `CONTRACT_VERSION` (`c330c7b9`) from loa `feat/khole-hounfour-framework`
  into k-hole (vendored `scripts/lib/contract/`). Adapt: `grounding_provenance` enum gains
  `executor` + `exa`; add `grounded_runtime` + `lane` fields. **Do NOT port** OpenRouter parse.
  - AC: the 456-line harvested test corpus (`test_grounded_result` + `test_error_contract`
    equivalents, ported to the repo's TS test runner) passes. `CONTRACT_VERSION` pinned + asserted.
  - AC: a `GroundedResult` with `lane: "cheval"` and one with `lane: "mcp"` both validate
    against `grounded-result-v1`.
  - SDD §3.1, §3.2, §3.3 · FR-1.
- **S1.T2 — `scripts/lib/llm.ts` (cheval lane).** Thin shim over `model-invoke`: resolve
  agent → model, invoke, normalize response → `GroundedResult`. Soft-fail (typed error) if
  `model-invoke` not on PATH.
  - AC: unit test with a mocked `model-invoke` returns a schema-valid `GroundedResult`.
  - AC: `model-invoke` absent → typed `NATIVE_RUNTIME_REQUIRED` error, not a crash.
  - SDD §2.3, §1.4 · FR-2.
- **S1.T3 — `cheval --capabilities` probe.** Port the capability-manifest probe; k-hole
  reads it once per process, caches, and gates lane availability on it.
  - AC: probe returns `{schema_version, grounded_result, ...}`; version mismatch → fail-closed.
  - SDD §3.3 · FR-1.

## Sprint 2 — MCP lane + fail-closed grounding (FR-3, FR-5)

- **S2.T1 — `scripts/lib/grounding.ts` `ground()` interface.** One interface, two impls:
  `exa:direct` (baseline, ship first) and `executor:code-mode` (primary once proven). Both
  return `Citation[]` normalized into `GroundedResult`.
  - AC: `ground()` with the `exa:direct` impl (mocked Exa response) returns schema-valid
    citations with `grounding_provenance: "exa"`.
  - AC: `executor:code-mode` impl (mocked Executor sandbox return) yields
    `grounding_provenance: "executor"`; a provider swap changes only this file.
  - SDD §1.4, §3.1 · FR-3.
- **S2.T2 — Fail-closed `/dig`.** In-session grounding failure → typed degraded
  `GroundedResult` (never a silent non-grounded answer).
  - AC: forced grounding failure on the `/dig` path yields `{grounded: false, degraded: true, ...}`
    typed result; test asserts no non-grounded synthesis is returned as if grounded.
  - SDD §3.4 · FR-5.
- **S2.T3 — Live integration gate (creds-gated).** e2e against real Executor MCP + Exa,
  skipped-with-reason when creds absent (never stubbed-and-passed).
  - AC: when `EXA_API_KEY` / Executor creds present, one live `ground()` returns real
    citations; when absent, test reports `SKIPPED: no creds` (visible, not silent).
  - SDD §1.6 · FR-3.

## Sprint 3 — Migrate four scripts, remove OpenRouter, /recall, parity (FR-4, FR-6, FR-7, FR-8)

- **S3.T1 — Migrate all four scripts onto the substrate.** `dig-search`/`deep-research`/
  `visual-review`/`visual-dig` route inference through `scripts/lib/llm.ts` and grounding
  through `scripts/lib/grounding.ts`. Delete per-script provider clients (~400 LoC).
  - AC: zero direct provider `fetch()` remains in the four scripts (grep gate in CI).
  - AC: each script's existing tests pass against the new substrate.
  - SDD §2.2 · FR-6.
- **S3.T2 — Remove OpenRouter.** Delete `:online`/`toOpenRouterModel`/`openrouterCall`;
  grep-before-delete for external `hounfour.providers.openrouter` consumers, note findings.
  - AC: no `openrouter`/`:online` references remain in k-hole scripts (grep gate).
  - SDD §2.4 · FR-4.
- **S3.T3 — `construct.yaml` capability redeclaration.** Add `grounded_search` (+ `vision`)
  to capabilities; reconcile with the stashed domain-block WIP (`git stash list`).
  - AC: `validating-construct-manifest` passes; `grounded_search` declared.
  - SDD §2.5 · FR (NFR).
- **S3.T4 — /recall first-class citizenship.** Research artifacts get Straylight frontmatter
  + QMD registration; k-hole reads `/recall` at descent start to dedupe/resume.
  - AC: a completed `/dig` writes an artifact with valid Straylight frontmatter; a re-run of
    the same query surfaces the prior artifact via `/recall`.
  - SDD §3.6 · FR-7.
- **S3.T5 — Parity snapshot test.** One `/dig` + one `/forge` pre/post produce equivalent
  `findings`/`sources`/`pull_threads` shape; Phase 1 streaming + envelope-loop intact.
  - AC: snapshot diff on the shape fields is empty (content may differ; shape must not).
  - SDD §1.5 · FR-8, G6.

## Companion (separate, not in this branch's autonomous run)

- **C1 — Upstream contract PR to loa** (`loa_cheval/types.py`): land the harvested +
  adapted contract in its canonical Python home. k-hole vendors interim; `CONTRACT_VERSION`
  + `cheval --capabilities` detect drift. Tracked in bonfire bead
  `bd-khole-executor-redesign-harvest-qrkt`. **Out of this repo's run-bridge scope.**

## Verification gate (per sprint)

- All ACs have a runnable test; `npm test` green for the sprint's scope.
- No stubbed-and-claimed external calls (theater gate): creds-gated tests report SKIPPED
  visibly, never fake a PASS.
- Grep gates: no direct provider `fetch()`, no `openrouter`/`:online` in migrated scripts.
