---
title: Product Requirements Document — k-hole Phase 2 · Two Lanes, One Grounded-Result Contract
date: 2026-07-06
revision: r1
status: draft · pending Flatline gate
issue: 0xHoneyJar/construct-k-hole#21 (Phase 2/2.5/3 — the Effect-TS substrate rebuild kickoff)
cycle_vehicle: bonfire session, cd-bridged to construct-k-hole (same pattern as Phase 1 PRD)
supersedes_design: sdd-khole-hounfour.md (April OpenRouter design)
sdd: grimoires/loa/sdd.md (ported from bonfire redesign SDD, 2026-07-06)
operator_decisions: 2026-07-06 (5 binding answers, see §3)
---

# PRD — k-hole Phase 2: Two Lanes, One Grounded-Result Contract

## 1. Problem

k-hole is the operator's **construct researcher** — `dig-search.ts` is the mandated
web-research path for all DIG-mode work (global CLAUDE.md decree). Phase 1 (issue #21)
made the *question* cheap to iterate (streaming, scout, escape hatch, envelope loop) and
shipped. But Phase 1 left the **grounding substrate** untouched, and it is dishonest in
three ways:

1. **k-hole is the estate's only router-bypasser.** Its four scripts (`dig-search`,
   `deep-research`, `visual-review`, `visual-dig`) `fetch()` provider endpoints directly
   and hand-parse proprietary grounding metadata — ~400 lines of duplicated client code.
   Every other multi-model consumer in Loa+bonfire (Flatline, GPT-Review, Red-Team) goes
   through the `cheval` router; k-hole is the outlier (arch-brief-khole-openrouter.md).

2. **Transport churn is the failure mode.** The grounding transport has swapped
   Gemini-direct → OpenRouter `:online` → (proposed) Executor, each swap re-deriving the
   citation-parse and re-introducing flakiness. There is no stable seam, so each external
   dependency change breaks the researcher.

3. **Grounding is not fail-closed.** When grounding degrades, `/dig` can silently return
   a non-grounded answer — the worst outcome for a tool whose entire value is *grounding
   the agent in reality*. An ungrounded "research" result is confident fiction.

The correct question was never "which transport?" — it is **"what is the stable contract
both an internal-model lane and an external-tooling lane emit into, so we stop swapping?"**

## 2. Vision

k-hole becomes a **first-class citizen of the Loa router ecosystem** running on **two
lanes over one contract**:

- **cheval lane** (internal models): all model inference routes through `cheval` /
  `model-invoke` — the same router every other Loa consumer uses. k-hole stops carrying
  its own LLM client.
- **MCP lane** (external tooling): web grounding via **Executor MCP code-mode** (primary)
  and **Exa** (direct fallback) — external search/tools, dispatched like cheval dispatches
  models, but for tools.
- **One grounded-result contract** (harvested from `feat/khole-hounfour-framework`):
  both lanes normalize into `GroundedResult` / `Citation` / `GroundedQuality` with a
  pinned `CONTRACT_VERSION` and a `cheval --capabilities` probe. This is the harmonizing
  seam that makes "stop swapping transports" *mechanically* true — a new external provider
  changes the MCP lane's adapter, never the contract or the four scripts.

Deep research is a **stable combination of agents + tooling**, not a single pipe. The two
lanes are a feature, not redundancy: internal reasoning and external grounding are
genuinely different capabilities that compose.

## 3. Operator decisions (binding, 2026-07-06)

These were provided as five direct answers and are load-bearing requirements, not
inferences:

1. **External access rides through Executor MCP; code-mode is the path forward to prevent
   flakiness.** Executor code-mode collapses N flaky per-tool round-trips into one
   sandboxed execution. "We should be able to operate this way cleanly."
2. **All four scripts on the same substrate** so things don't break — no per-script
   client divergence.
3. **Remove OpenRouter.** The `:online` / `toOpenRouterModel` / `openrouterCall` path is
   deleted; the Exa it proxied becomes first-class in the MCP lane.
4. **Both consumers matter — programmatic and in-session.** In-session `/dig` is likely
   the *most-used*, standing in for WebSearch, because **grounding the agent in reality is
   crucially important** → grounding is fail-closed for the in-session path.
5. **First-class constructs within the Loa ecosystem** (`/recall`): research artifacts
   join the governed memory estate; k-hole reads `/recall` at descent start.

## 4. Goals & success metrics

| # | Goal | Success signal |
|---|------|----------------|
| G1 | Two lanes, one contract | All four scripts emit `GroundedResult` regardless of lane; contract `CONTRACT_VERSION` pinned; `cheval --capabilities` probe green |
| G2 | k-hole rides cheval | Zero direct provider `fetch()` in k-hole scripts; all inference via `model-invoke`; ~400 LoC of duplicated client deleted |
| G3 | Executor MCP code-mode grounding | `/dig` grounds via Executor code-mode; Exa-direct fallback behind the same `ground()` interface; a provider swap touches only the MCP-lane adapter |
| G4 | OpenRouter removed | No `:online` / `openrouterCall` / `toOpenRouterModel` references remain; Exa is first-class |
| G5 | Fail-closed grounding (in-session) | `/dig` never returns a silently-non-grounded answer; degraded grounding is a typed, explicit result |
| G6 | Parity preserved | Snapshot test: one `/dig` + one `/forge` pre/post produce equivalent `findings`/`sources`/`pull_threads` shape (Phase 1's streaming + envelope-loop behavior intact) |
| G7 | /recall first-class citizenship | Research artifacts carry Straylight frontmatter + QMD registration; k-hole reads `/recall` at descent start to dedupe/resume |

## 5. Users & consumers

- **Primary — in-session operator via `/dig`.** Replaces WebSearch for DIG-mode. Grounding
  correctness is non-negotiable here (decision #4). Fail-closed protects this path.
- **Secondary — programmatic construct consumers.** Other constructs/skills compose k-hole
  for grounded research; they consume the `GroundedResult` contract directly.
- **Ecosystem beneficiaries.** Once k-hole is on cheval, `model-invoke`'s retry/budget/trust
  logging covers k-hole traffic (today it flies blind).

## 6. Functional requirements

- **FR-1 (contract harvest).** Harvest `GroundedResult`/`Citation`/`GroundedQuality`
  dataclasses (`ce555e2b`) + `grounded-result-v1`/`error-v1`/`request-v1` schemas
  (`66c2fcd7`) + `CONTRACT_VERSION` and `cheval --capabilities` manifest (`c330c7b9`) +
  the 456-line test corpus (`1c123a16`) from `feat/khole-hounfour-framework`. Adapt
  `grounding_provenance` and add `grounded_runtime`/`lane` for the two-lane model. **Do
  NOT port** the OpenRouter adapter parse (`55861347`).
- **FR-2 (cheval lane).** All four scripts route inference through `model-invoke`. Delete
  per-script provider clients. Retire the redundant credential cascade.
- **FR-3 (MCP lane — Executor code-mode).** Web grounding via Executor MCP code-mode,
  returning structured citations into the contract. Exa-direct behind the same `ground()`
  interface as the baseline fallback (ship the fallback first; code-mode as it proves out).
- **FR-4 (remove OpenRouter).** Delete `:online`/`toOpenRouterModel`/`openrouterCall`.
- **FR-5 (fail-closed `/dig`).** In-session grounding failures produce a typed degraded
  result, never a silent non-grounded answer.
- **FR-6 (all four scripts on the substrate).** `dig-search`/`deep-research`/`visual-review`/
  `visual-dig` all route through the shared `scripts/lib/llm.ts` + `scripts/lib/grounding.ts`.
- **FR-7 (/recall citizenship).** Research artifacts get Straylight frontmatter + QMD
  registration; k-hole reads `/recall` at descent start to dedupe/resume prior research.
- **FR-8 (parity).** Preserve Phase 1's streaming + envelope-loop contract; snapshot test
  proves `/dig` + `/forge` output shape equivalence pre/post.

## 7. Non-functional requirements

- Node ≥20.10 (existing manifest); ESM; `child_process.spawn` streaming preserved.
- `capabilities` in `construct.yaml` gains `grounded_search` (today declares `tool_calling`
  only — the actual dependency was undeclared).
- Cost log carried forward + a `lane` field; budget enforcement via cheval; session-level
  ceiling for `/forge` fan-out.
- Standalone-repo resilience: soft-fail if `model-invoke` not on PATH.

## 8. Scope

**In scope (Phase 2 kickoff):** the two-lane substrate + harvested contract + all four
scripts migrated + OpenRouter removed + fail-closed `/dig` + `/recall` citizenship + parity
tests. The companion contract lands in `loa_cheval` (upstream loa) via a **separate PR**
(the contract's home is Python `loa_cheval/types.py`); this cycle harvests + adapts it and
consumes it from k-hole.

**Out of scope (Phase 2.5/3, separate kickoff per #21):** full Effect-TS core rewrite
(typed error channel via `Effect.Schedule`, layer-based DI, test mode), the kaironic depth
controller. This cycle rebuilds the *grounding substrate + contract seam*; the Effect-TS
*runtime* rebuild remains deferred.

## 9. Risks & dependencies

| Risk | Mitigation |
|------|------------|
| Executor code-mode can't cleanly return structured citations from its sandbox | Ship Exa-direct fallback FIRST behind `ground()`; code-mode defers to it until proven (SDD Open Question 1) |
| Some ecosystem consumer hard-depends on `hounfour.providers.openrouter` | Grep before deletion; k-hole stops using it but the provider entry can stay for others (decoupled) |
| Two lanes double the error surface vs one pipe | Accepted: the contract + fail-closed discipline make every failure typed/explicit; code-mode *reduces* net round-trips |
| Contract PR to loa (2nd repo) blocks k-hole | Harvest + adapt the contract in-repo first (vendored types acceptable interim); upstream PR lands in parallel |
| Companion cross-repo drift (loa `loa_cheval` vs k-hole vendored copy) | Pin `CONTRACT_VERSION`; `cheval --capabilities` probe detects mismatch and fails closed |

## 10. Provenance

- Phase-1 arc: issue #21, shipped via PRs #22/#25/#26; Phase-1 artifacts archived at
  `grimoires/loa/archive/2026-07-06-dig-search-phase1-shipped/`.
- Design: `grimoires/loa/sdd.md` (this cycle) supersedes April `sdd-khole-hounfour.md`.
- Grounding facts (repo-verified 2026-07-06): bonfire
  `grimoires/loa/context/khole-redesign-grounding-facts-2026-07-06.md`.
- Harvest source: `feat/khole-hounfour-framework` @ `1c123a16` (loa remote).
