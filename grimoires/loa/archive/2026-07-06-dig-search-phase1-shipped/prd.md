---
title: Product Requirements Document — dig-search Phase 1 · scout · streaming · escape hatch · envelope loop
date: 2026-05-14
revision: r2 (Flatline-integrated)
status: accepted · Flatline-gated r2 · operator-approved 2026-05-14
authors: claude-opus-4-7 (OPERATOR + FAGAN · bonfire session, cd-bridged to construct-k-hole)
issue: 0xHoneyJar/construct-k-hole#21 (Phase 1 scope only)
cycle_vehicle: lightweight author + Flatline-gate (operator-chosen 2026-05-14)
flatline_r1: 2-model effective (GPT-5.4-codex + gemini-3.0-pro · opus dropped to a
  construct-k-hole normalization bug, tracked separately). 12 findings, all clarifications,
  all integrated into r2. GPT/gemini agreed strongly across all 12.
---

# PRD — dig-search Phase 1: make the question cheap to validate

## 1. Problem

`dig-search.ts` is the mandated web-research tool (global CLAUDE.md decrees it for all
DIG-mode work). Today a depth-2 dig runs **5–25 minutes with zero visibility and no way
to course-correct**. The real cost is not the latency — it is that **the latency
prevents question iteration**. To make a 20-minute wait worth it, the operator must ask
the right question *blind, on the first try* — but you cannot validate a question
without running it.

Issue #21 proposes a full Effect-TS rebuild in three phases. The issue's own scope note
concedes *"Phase 1 alone resolves most of the pain."* A FAGAN unbundle of #21 (operator-
approved 2026-05-14) splits the work:

- **This PRD = Phase 1 + the envelope loop** — operator-pain relief, no rewrite.
- **Separate kickoff = Phase 2/2.5/3** — the Effect-TS substrate rebuild + the kaironic
  depth controller (from the #21 enrichment comment). Adopts `construct-effect-substrate`.

## 2. Goals

| ID | Goal |
|----|------|
| G1 | A **scout pass** that validates a question's *direction* in ≤45s — source list + one-line gist per source — before committing a deep run. |
| G2 | **Streaming** — progressive per-search visibility during a dig, so the operator/agent can decide continue-or-abort mid-flight instead of waiting blind. |
| G3 | An **escape hatch** — `SIGINT` flushes whatever completed as a valid partial artifact. Abort-with-partial is a first-class outcome, not a crash. |
| G4 | The **envelope loop** — `creative-resonance-envelope.threads_to_pull` from activated envelopes seed the next dig's queries; a dig emits a candidate envelope capturing what it surfaced. Question-iteration becomes a *data-flow*, not just a latency, fix. |
| G5 | **Land the schema** — `creative-resonance-envelope.schema.json` + fixtures + validator land canonically in the `construct-k-hole` repo (today they exist only in the `.loa` vendored copy). |

## 3. Non-goals (explicitly Phase 2/2.5/3 — separate kickoff)

- Effect-TS core: typed error channel, `Effect.Schedule` retry, layer-based DI, test mode.
- Content-addressed cache, provider racing (`Effect.race`), `--budget` config.
- The kaironic depth controller from the #21 enrichment: resonance-driven depth
  allocation, convergence detector, session chronos backstops, dig↔forge transition,
  the SEED→EXPLORE→SYNTHESIZE→EVALUATE phase model.
- Rewriting the existing cycle-098 retry patch (`DIG_CLI_TIMEOUT_MS` / `DIG_CLI_MAX_ATTEMPTS`).
  P1 leaves it intact; P2 formalizes it as `Effect.Schedule`.

P1 is **additive** — new flags and new code paths on the existing 1401-line script. No rewrite.

## 4. Users

- **The operator** running `/dig` interactively — pair-research, intentional depth.
- **Agents in DIG mode** invoking `dig-search.ts` per the global CLAUDE.md mandate.
- **Downstream constructs** that will consume emitted envelopes (rooms-substrate handoff
  packets — out of scope here, but the emitted envelope must be schema-valid for them).

## 5. Functional Requirements

### FR-1 — Scout pass
A fast shallow mode: one breadth search, **no synthesis phase**, output = source list +
one-line gist per source. Answers *"is this question pointed at the right space?"* for
~free, before the deep run.

- **Surface (resolves OQ-1, Flatline IMP-002):** scout uses a dedicated **`--scout`
  boolean flag**. `--depth 0` is NOT reused — `dig-search.ts:140-141` + `:1281` already
  define depth 0 as "Lilly's tank" (synthesis-only, skip search). `--scout` and
  `--depth N` are mutually exclusive; passing both is a validation error (preserves
  backward-compatible, unambiguous CLI semantics).
- **The gist is raw provider output (Flatline IMP-001).** The one-line gist per source
  is extracted from the search call's own returned snippets — **NOT a second model
  call.** This is what preserves both the ≤45s target and the "~free" claim. If a
  provider returns no usable snippet for a source, the gist is the source title +
  `(no snippet)` — never a synthesized summary.
- **Single-call limitation, documented (Flatline IMP-011).** A `--scout` pass is one
  search call; it cannot decompose a multi-faceted question the way a depth-N dig's
  `buildSearchQueries()` does. This is an accepted limitation, stated in `--help` and
  the dig SKILL.md — scout answers "right *space*?", not "right *facets*?".
- Target wall-clock ≤45s. Reuses the existing provider router; runs exactly one search.
- Output is a distinct, clearly-labeled "scout" shape — not a truncated deep result.

### FR-2 — Streaming
Emit each search result **as it completes**, not buffered until the synthesis call.
Today the agent + operator wait blind between "Running N searches" and "Done in 951s"
(`dig-search.ts` runs all searches, then `synthesize()` at `:1158`). Streaming surfaces
search 1 at ~T+90s.

- **stdout/stderr contract (resolves OQ-2, Flatline IMP-012):** structured stream events
  are **NDJSON on stdout** (one JSON line per completed search). Human-readable progress
  lines stay on **stderr** (unchanged from today). The final synthesis artifact still
  writes to its file. A non-streaming consumer that reads only the file sees no change;
  a consumer reading stdout gets the progressive stream. This contract is documented so
  future changes don't regress either channel.
- Composes with the existing trail-file write + stderr progress lines.

### FR-3 — SIGINT escape hatch
Trap `SIGINT` → flush whatever completed as a **valid partial artifact**, exit **130**
(POSIX SIGINT convention — clean exit, artifact flushed, `partial:true` set, but
automation-detectable). A wrong question is then discovered after 2 minutes, not 25.

> **Amendment (SDD r2, SKP-003, operator-confirmed 2026-05-14):** original r2 said
> "exit 0." Flatline flagged that exit 0 makes automation read an interrupted run as
> success. Changed to exit 130. The "not a crash" intent is preserved.

- **Atomic-synthesis semantics (Flatline IMP-008).** `synthesize()` is a single model
  call — it either completed or it did not. There is no "partial synthesis." The partial
  artifact is therefore one of two well-defined shapes:
  - `SIGINT before synthesis` → artifact = completed searches only, `synthesis: null`,
    `partial: true`, `completed_searches: N/total`.
  - `SIGINT during synthesis` → the in-flight synthesis call is abandoned (not awaited);
    artifact = completed searches only, same shape. The synthesis call is never
    presented half-rendered.
- The trail file (if `--trail`) records the partial run so the next dig has context.
- No orphaned subprocesses — the `spawn`'d provider CLI child (`dig-search.ts:30`) is
  terminated and reaped cleanly on the SIGINT path.
- **Highest blast radius — sequence last (Flatline IMP-007).** FR-3 touches process
  lifecycle + subprocess reaping. The sprint plan MUST sequence FR-3 after FR-1/FR-2
  land, and gate it behind its own test scenarios (see NFR-4) before merge.

### FR-4 — Envelope-seeded queries
`--resonance` already accepts a resonance profile path (`dig-search.ts:138,985`). Extend
it (or add `--envelopes`) so that when given a creative-resonance-envelope **set**, the
dig reads `threads_to_pull` from the activated envelopes and uses those named threads as
**seed queries** — the operator authors zero query text.

- **Schema-version pinning (Flatline IMP-010).** Each envelope carries `schema_version`
  (already required by the schema). On read, the dig validates the consumed envelope's
  `schema_version` against the in-repo schema. A minor-version-ahead envelope loads with
  a stderr warning; a major-version mismatch is a hard error (the consume-emit loop must
  not silently drift). This rule is the same on the FR-5 emit side.

### FR-5 — Envelope emission
A dig emits a `creative-resonance-envelope` (candidate, `provenance.candidate: true`)
capturing what it surfaced — `ref`, `resonance.evidence`, `why`, and critically
`threads_to_pull` for the *next* dig. This is what closes the loop: dig output
structurally becomes dig input.

- **Deterministic output paths + derivation rules (Flatline IMP-003).** Before this is
  buildable/testable the PRD must pin:
  - **Where:** emitted envelopes write to `<trail-dir>/envelopes/<envelope_id>.json` when
    `--trail` is set, else to `./dig-envelopes/<envelope_id>.json`. Path is deterministic
    from inputs, not timestamped.
  - **envelope_id derivation:** kebab-case slug derived from `direction.name` + a short
    content hash of `ref.name`, so re-running the same dig overwrites rather than
    duplicates. Collisions across distinct refs get a `-2` suffix.
  - **emission trigger (resolves OQ-3):** auto-emit on every non-scout dig as
    `provenance.candidate: true`. Scout passes do NOT emit (too shallow to ground a
    `why`). Opt-out via `--no-emit-envelope`.

### FR-6 — Land the envelope schema
`creative-resonance-envelope.schema.json` + `fixtures/` + `validate-fixtures.py` +
`README.md` land in `construct-k-hole/schemas/` (no `schemas/` dir exists yet). Today
they live only in `~/.loa/constructs/packs/k-hole/schemas/` — canonically wrong.

- **Canonical-divergence guard (Flatline IMP-006).** Once FR-6 lands, two copies exist
  (`construct-k-hole/schemas/` and the `.loa` vendored copy). The cycle MUST ship one of:
  (a) a CI sync-check that fails if the two diverge, or (b) an explicit
  `"x-canonical-source": "construct-k-hole"` marker in the schema + a note in the `.loa`
  copy's README that it is derived. Decision deferred to the SDD; the PRD requires that
  *one* of them ships — silent divergence already happened once.
- FR-4/FR-5 depend on FR-6 (schema in-repo). FR-6 has no dependencies — **do it first.**

## 6. Non-functional Requirements

- **NFR-1 — No new *runtime* dependencies.** P1 adds no npm dependency to
  `dig-search.ts`. **Clarification (Flatline IMP-005):** `validate-fixtures.py` is a
  Python **dev/CI tool**, not a runtime dependency of `dig-search.ts` — it validates
  fixtures in CI and is never imported or shelled-out by the dig at runtime. The
  no-new-runtime-deps claim is about the dig's execution path only. The SDD states the
  Python-for-fixtures dependency boundary explicitly.
- **NFR-2 — Backward compatible.** Existing `--query` / `--depth N` / `--trail` /
  `--resonance` / `--model` behavior is preserved unchanged. All P1 capabilities are
  additive flags/paths. `--scout` ⊕ `--depth N` is the only new mutual-exclusion.
- **NFR-3 — Determinism is NOT in scope.** Grounded web search is non-deterministic at
  the provider; predictable latency/cost belongs to P2 (cache + budget). P1 only makes
  the *wait observable and abortable*, not the *result reproducible*.
- **NFR-4 — Explicit test scenarios (Flatline IMP-004).** EDD `min_test_scenarios: 3`
  is a floor, not a target. The sprint plan MUST enumerate scenarios for, at minimum:
  (a) `--scout` returns the scout shape within budget; (b) streaming emits valid NDJSON
  per search and the file artifact is unaffected; (c) `SIGINT` before synthesis →
  `partial:true` artifact, exit 0, no orphan subprocess; (d) `SIGINT` during synthesis →
  same shape, in-flight call abandoned; (e) an emitted envelope validates against the
  in-repo schema; (f) a schema-version-major-mismatch envelope is a hard error on read.
- **NFR-5 — Load-bearing tool discipline.** `dig-search.ts` is mandated tooling — blast
  radius is every DIG session. FR-3 is the highest-risk change (see FR-3 sequencing).

## 7. Risks & Dependencies

| ID | Item |
|----|------|
| DEP-1 | FR-4/FR-5 depend on FR-6 (schema in-repo). FR-6 has no dependencies — do it first. |
| RISK-1 | SIGINT + `spawn`'d child reaping is the highest-blast-radius change. Mitigation: FR-3 sequenced last + NFR-4 scenarios (c)/(d) gate the merge. |
| RISK-2 | `.loa` vendored copy and the `construct-k-hole` repo already diverged once (the schema). FR-6's canonical-divergence guard closes it; the canonical sync *direction* is an SDD decision + cycle-retro flag. |
| RISK-3 | construct-k-hole's in-repo Flatline gate has an opus-normalization bug (fresh upstream loa 1.157.0) — tracked separately. This PRD's r1 review ran as an effective 2-model gate (GPT + gemini, strong mutual agreement). Not a PRD risk; a tooling risk noted for transparency. |

## 8. Success Metrics

All wall-clock metrics use this **measurement protocol (Flatline IMP-009):** median of
5 runs against a fixed query set, same machine, provider-warm; reported with min/max
range because providers are non-deterministic. A single run is never the metric.

- A `--scout` pass returns in **≤45s median** (vs 5–25 min for a deep dig).
- Streaming: first search result NDJSON line visible at **≤T+90s median**, not T+end.
- `SIGINT` during a dig produces a **usable `partial:true` artifact** and exits 0 — in
  100% of test runs (deterministic, not median).
- An envelope's `threads_to_pull` seeds a subsequent dig with **zero manual query text**.
- The envelope schema **validates all its fixtures** from within the `construct-k-hole`
  repo (deterministic).

## 9. Phasing

This PRD is **Phase 1 + the envelope loop** of issue #21. The envelope loop (G4/FR-4/FR-5)
is promoted from #21's "composes with existing work" footnote to a co-equal P1 deliverable
— the #21 enrichment comment confirms the envelope is the *substrate the whole kaironic
layer runs on*, not an add-on.

**Phase 2/2.5/3** (Effect-TS substrate rebuild + kaironic depth controller) earns a
separate kickoff issue that explicitly adopts `construct-effect-substrate` as its doctrine
pack — and carries the pack-graduation framing: `construct-k-hole` would be that pack's
non-Next.js third validator, moving it `candidate → active`.

---

## Appendix — Flatline r1 integration log

2-model effective gate (GPT-5.4-codex + gemini-3.0-pro; opus dropped to a construct-k-hole
normalization bug). All 12 findings were clarifications — none scope expansions — and all
were integrated:

| Finding | gpt/gem | Integrated into |
|---------|---------|-----------------|
| IMP-001 | 910/920 | FR-1 — gist is raw provider output, not a model call |
| IMP-002 | 895/950 | FR-1 — `--scout` flag resolved (was OQ-1); mutual-exclusion with `--depth` |
| IMP-003 | 880/890 | FR-5 — deterministic output paths + envelope_id derivation + emit trigger |
| IMP-008 | 835/810 | FR-3 — atomic-synthesis semantics; no "partial synthesis" |
| IMP-006 | 805/850 | FR-6 — canonical-divergence guard (CI sync-check or marker) |
| IMP-010 | 790/830 | FR-4 — schema-version pinning on consume + emit |
| IMP-005 | 730/890 | NFR-1 — Python validator is a dev/CI tool, not a runtime dep |
| IMP-004 | 760/910 | NFR-4 — explicit enumerated test scenarios |
| IMP-007 | 690/780 | FR-3 — sequenced last, gated behind its own scenarios |
| IMP-012 | 650/620 | FR-2 — stdout NDJSON / stderr human contract (was OQ-2) |
| IMP-009 | 705/720 | §8 — measurement protocol (median of 5, range reported) |
| IMP-011 | 560/580 | FR-1 — single-call multi-faceted limitation documented |
