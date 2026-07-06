---
title: Sprint Plan — dig-search Phase 1 · the four primitives, one entry point, one contract
date: 2026-05-14
revision: r2 (Flatline-integrated + operator-goal reshape)
status: accepted · driving to completion
prd: grimoires/loa/prd.md (r2 accepted · FR-3 amended exit-130)
sdd: grimoires/loa/sdd.md (r3 accepted · §10 surface contract)
issue: 0xHoneyJar/construct-k-hole#21 (Phase 1 scope only)
goal: crystallize depth/breadth/pulling-threads/resonance as named primitives behind one
  entry point + a published surface contract; clean the code; restructure skills; ship via
  real-CLI E2E → PR → /bridgebuilder-review → merge. Do NOT extend beyond these primitives.
---

# Sprint Plan — dig-search Phase 1

9 sprints + a ship tail. S1–S6 build the four primitives' mechanics (the P1 FRs); S7–S9
crystallize per the operator goal (§10 of the SDD). Every sprint is additive surgery on
`scripts/dig-search.ts` or its siblings — **strangler, not rewrite**. FR-3 (S6) is
sequenced last and merge-gated. Test scenario numbers reference SDD §6.

**Sprint-Flatline r1** (GPT=14, Opus=7 · HIGH=5 DISPUTED=7 BLOCKERS=3) — all 15 findings
integrated below; the 3 SDD-level ones (SKP-002 exit-flush, IMP-003 AbortController,
SKP-001b mock-seam) landed in SDD r3 §FR-3/§5/§6.

---

## S1 — Land the envelope schema (FR-6) · foundation

**Goal:** `creative-resonance-envelope` schema exists canonically in-repo so S4/S5 import it.

**Tasks**
- T1.1 — `mkdir schemas/`; copy from `~/.loa/constructs/packs/k-hole/schemas/`:
  `creative-resonance-envelope.schema.json`, `fixtures/`, `validate-fixtures.py`, `README.md`.
- T1.2 — Add `"x-canonical-source": "0xHoneyJar/construct-k-hole"` to the schema top level.
- T1.3 — Extend `.github/workflows/validate.yml`: run `validate-fixtures.py`; add a
  **non-failing** `diff` warning against the `.loa` vendored copy if reachable
  (IMP-011 — clarify: this is local/CI hygiene, never a merge gate).
- T1.4 — `README.md` notes the `.loa` copy is derived; sync direction flagged for retro (IMP-012).

**Acceptance**
- AC1.1 — schema file exists; `x-canonical-source` present.
- AC1.2 — `python3 schemas/validate-fixtures.py` passes valid + rejects invalid fixtures
  from within the repo *(Scenario 14)*.
- AC1.3 — `validate.yml` runs the validator; divergence diff is warn-only.

**Deps:** none (DEP-1). **Risk:** low.

---

## S2 — BREADTH primitive: scout pass (FR-1)

**Goal:** `--scout` — a fast wide shallow pass, cross-provider-honest gists.

**Tasks**
- T2.1 — Parse `--scout` (boolean); validation `--scout` + any `--depth` arg → stderr, exit 2.
- T2.2 — `async function scout()`: one `gemini(QUERY,{search:true,maxTokens:2048,temperature:0})`;
  reuse dedup (`dig-search.ts:1318-1326`).
- T2.3 — `extractGist(source,result)`: 3-tier strategy (SDD §FR-1.3) → `{gist,gist_quality}`.
- T2.4 — Emit scout shape (SDD §4.1); `main` branches to `scout()` on `--scout`.
- T2.5 — **Docs (IMP-001):** single-call limitation in `--help` + `skills/dig/SKILL.md`.

**Acceptance**
- AC2.1 — `--scout` → `mode:"scout"`, `gist`+`gist_quality` per source, no `synthesis` key *(Scen 1)*.
- AC2.2 — `--scout --depth 2` → exit 2 *(Scen 2)*.
- AC2.3 — CLI-path mock (no `supports[]`): gists via `text-matched`/`title-only`, quality
  disclosed, scout still usable *(Scen 3)*.
- AC2.4 — no trail append, no envelope emission on scout.

**Deps:** none. **Risk:** low.

---

## S3 — DEPTH visibility: streaming + allSettled + accumulator (FR-2)

**Goal:** progressive NDJSON; one failed search no longer collapses the dig; build the
accumulator S6 depends on.

**Tasks**
- T3.1 — Parse `--stream` (boolean).
- T3.2 — Search loop (`:1284-1305`) `Promise.all` → `Promise.allSettled` (IMP-002).
  Rejected search → `{status:"error",query,error}`, excluded, counted in `failed_searches`.
- T3.3 — Module-level `accumulator: SettledSearch[]`; **reset `[]` at top of `main`**
  (SKP-001a); settle-handler pushes **unconditionally** (not `--stream`-gated).
- T3.4 — `emitEvent()`; under `--stream` emit `search`/`search_error` per settle +
  terminal `complete`. `query_index` = stable definition-order (IMP-001).
- T3.5 — Add `failed_searches` to output (IMP-010 — additive field, NFR-2 compatible).
- T3.6 — **Observable accumulator hook (IMP-014):** export a test-only `__getAccumulator()`
  so AC3.4 / Scenario 15 can assert on it.
- T3.7 — **Docs (IMP-001):** `--stream` + the stdout-NDJSON / stderr-human contract in `--help`.

**Acceptance**
- AC3.1 — non-`--stream` deep dig: stdout == today's blob + `failed_searches` (+
  `emitted_envelope` after S5); else byte-identical *(Scen 4 — standing regression guard)*.
- AC3.2 — `--stream`: one NDJSON line/search, stable `query_index`, terminal `complete`,
  stderr unchanged *(Scen 5)*.
- AC3.3 — one search rejects → `search_error`, dig continues, `failed_searches:1` *(Scen 6)*.
- AC3.4 — accumulator populated on the non-`--stream` path (via `__getAccumulator()`).

**Deps:** none. **Risk:** medium — core search loop. T3.2 is load-bearing; review closely.

---

## S4 — PULLING-THREADS (consume): envelope-seeded queries (FR-4)

**Goal:** `--envelopes` feeds `threads_to_pull` as seeds without crowding out QUERY.

**Tasks**
- T4.1 — Parse `--envelopes <path>`.
- T4.2 — `loadEnvelopeSeeds(path)`: resolve **file-or-dir**; **empty dir / no `*.json` →
  stderr note, proceed with no seeds (IMP-009)**; `JSON.parse` try/catch (untrusted —
  SDD §5); schema-validate each (S1); major-version mismatch → exit 2, minor-ahead → warn
  (IMP-008).
- T4.3 — Collect + dedupe `threads_to_pull[]`; **deterministic order** = envelope-file
  order then in-array order (IMP-006 — truncation must be reproducible).
- T4.4 — Seed budgeting (IMP-005): reserve `ceil(SEARCH_DEPTH/2)` slots for QUERY-derived
  queries; seeds fill the remainder, prepended; `SEARCH_DEPTH==1` → seeds ignored + note.
- T4.5 — **Docs (IMP-001):** `--envelopes` in `--help` + SKILL.md.

**Acceptance**
- AC4.1 — valid set: seeds appear as queries; ≥`ceil(depth/2)` QUERY-derived; total
  respects `SEARCH_DEPTH`; truncation deterministic *(Scen 9)*.
- AC4.2 — major-version mismatch → exit 2 *(Scen 10)*; minor-ahead → warn + proceed (IMP-008).
- AC4.3 — malformed JSON / empty dir → structured stderr, no crash (IMP-009).

**Deps:** S1. **Risk:** low-medium (untrusted-input parsing).

---

## S5 — PULLING-THREADS (emit) + RESONANCE: envelope emission (FR-5)

**Goal:** every non-scout dig with `--trail` auto-emits a schema-valid candidate envelope;
the emit→consume loop works end-to-end; `resonance` is a first-class field.

**Tasks**
- T5.1 — Parse `--no-emit-envelope` (default emit-on).
- T5.2 — `depthRatingToStrength()` — explicit lookup table (SDD §FR-5.1 / IMP-009): the
  resonance primitive's quantitative anchor.
- T5.3 — `buildEmittedEnvelope(...)` — full construction mapping (SDD §FR-5.1): deterministic
  `envelope_id`, `resonance{strength,evidence}`, `why`, `threads_to_pull = parsed.pull_threads`.
- T5.4 — Write to `<trail-dir>/envelopes/<envelope_id>.json`; **no `--trail` → skip + note
  (IMP-011)**; `mkdir -p`.
- T5.5 — Validate constructed envelope against in-repo schema before write; bug → warn+skip.
- T5.6 — Add `emitted_envelope: <path>|null` to output.

**Acceptance**
- AC5.1 — with `--trail`: file validates against in-repo schema, `candidate:true` *(Scen 11)*.
- AC5.2 — no `--trail`: no file, stderr note, `emitted_envelope:null` *(Scen 12)*.
- AC5.3 — `--no-emit-envelope`: no file even with `--trail`.
- AC5.4 — **e2e loop:** dig A emits → dig B `--envelopes <A>` consumes A's `threads_to_pull`
  as seeds → B's queries include A's threads *(Scen 13)*.
- AC5.5 — `depthRatingToStrength` pure lookup; every Shulgin rating maps; unknown → 0.30 + warn.

**Deps:** S1, S4. **Risk:** low-medium.

---

## S6 — DEPTH safety valve: SIGINT/SIGTERM escape hatch (FR-3) · LAST, GATED

**Goal:** SIGINT/SIGTERM flushes a valid `partial:true` artifact, exits 130/143, no orphans,
in-flight fetches genuinely cancelled.

**Tasks**
- T6.1 — Module-level `abortController` at top of `main`; thread `.signal` into every
  `fetch` (`geminiCall`, `openrouterCall`, `synthesize`) — IMP-003.
- T6.2 — `activeChildren: Set<ChildProcess>` — `geminiCliCall` registers each `spawn`'d
  child, removes on close (SKP-002b).
- T6.3 — `buildPartialArtifact(accumulator)` → SDD §4.3 shape.
- T6.4 — Signal handler (SDD §FR-3.3): traps **SIGINT + SIGTERM** (IMP-013); `aborting`
  double-guard; `abortController.abort()`; kill all `activeChildren`; **`fs.writeSync(1,…)`
  synchronous flush (SKP-002 — `process.exit` truncates async writes)**; partial trail
  append if `--trail`; `process.exit(130|143)`.

**Acceptance**
- AC6.1 — SIGINT before synthesis, **non-`--stream`** → `partial:true`, `completed_searches`
  == actual (NOT 0 — proves SKP-001a), exit 130, all `activeChildren` killed *(Scen 7)*.
- AC6.2 — SIGINT during synthesis → same shape; synthesis fetch `.abort()`ed, not awaited *(Scen 8)*.
- AC6.3 — double-signal → second ignored.
- AC6.4 — exit code exactly 130 (SIGINT) / 143 (SIGTERM).
- AC6.5 — large partial artifact (many `completed_searches`) flushed **complete**, not
  truncated (SKP-002 — `fs.writeSync`).
- AC6.6 — **subprocess reaping exercised at the `spawn` seam** (Scenario 15 / SKP-001b) —
  not the vacuous `gemini()`-boundary mock.

**Deps:** S3 (accumulator). **Risk:** HIGH — process lifecycle + subprocess + fetch
cancellation. **Merge gate:** S6 does not merge until AC6.1–AC6.6 green.

---

## S7 — Single entry point + surface contract (operator goal · SDD §10)

**Goal:** the four primitives behind one entry point, with a published machine-readable
contract humans and agents drive from.

**Tasks**
- T7.1 — Author `schemas/dig-surface.schema.json` (SDD §10.3): all flags + types, the
  **flag-combination matrix** (IMP-002 — compose / mutually-exclusive / ignored-with-note),
  the four output shapes (ref §4), exit codes (0/1/2/130/143).
- T7.2 — `dig-search.ts --help` text generated-from / kept-in-sync-with the contract;
  add a `--print-contract` flag that emits `dig-surface.schema.json` to stdout (agents
  self-discover).
- T7.3 — Confirm `scripts/dig-search.ts` is THE executable entry point — the 4 primitives
  are flags on it, no sibling scripts duplicate a primitive.
- T7.4 — Add a contract fixture + a test asserting `--print-contract` output validates as
  JSON Schema and matches the file.

**Acceptance**
- AC7.1 — `dig-surface.schema.json` exists, is valid JSON Schema, covers every flag +
  output shape + exit code.
- AC7.2 — `--print-contract` emits it; `--help` is consistent with it.
- AC7.3 — the flag-combination matrix has an entry for every reachable pair (IMP-002).

**Deps:** S1–S6 (the shapes the contract formalizes). **Risk:** low.

---

## S8 — Code cleanup: leave it better (operator goal · SDD §10.4)

**Goal:** the P1 changes land legible — bounded cleanup, **strangler not rewrite**.

**Tasks**
- T8.1 — Extract the new primitive paths (`scout`, the streaming wrapper, envelope
  load/emit, the signal handler) into named, single-responsibility functions.
- T8.2 — Tidy immediately-adjacent code the P1 work touched: naming, comments, dead-branch
  removal **only where provably dead**.
- T8.3 — Confirm the no-touch list held: provider router, `synthesize()` internals, the
  cycle-098 retry patch — unchanged.
- T8.4 — Run the full test suite; no regression.

**Acceptance**
- AC8.1 — every new primitive path is a named function, not inline in `dig()`/`main()`.
- AC8.2 — no change to the provider router / `synthesize()` / retry patch (diff-confirmed).
- AC8.3 — full mocked suite green; Scenario 4 regression guard holds.

**Deps:** S1–S7. **Risk:** medium — cleanup can over-reach; T8.3 is the guardrail.

---

## S9 — Skills restructure around the four primitives (operator goal)

**Goal:** `skills/` and `commands/` reflect depth/breadth/pulling-threads/resonance; remove
what no longer suits.

**Tasks**
- T9.1 — Audit every entry in `skills/` and `commands/` against the four primitives.
  Classify: **keep** (serves a primitive), **fold** (merge into `skills/dig/`), **remove**
  (no longer suits this purpose).
- T9.2 — `skills/dig/SKILL.md` becomes THE skill entry point — documents the four
  primitives + points at `dig-surface.schema.json` as the contract.
- T9.3 — Apply the audit: fold/remove per T9.1. **Removals are listed explicitly in the
  PR description** for operator visibility (per the operator's "we can remove skills"
  grant — but make every removal auditable).
- T9.4 — Update `construct.yaml` / `manifest.json` if skill removals change the pack surface.

**Acceptance**
- AC9.1 — the audit table (keep/fold/remove + rationale) is in the PR description.
- AC9.2 — `skills/dig/SKILL.md` names the four primitives + links the contract.
- AC9.3 — pack manifest consistent with the post-restructure skill set.

**Deps:** S7 (the contract is what SKILL.md points at). **Risk:** medium — removals have
blast radius; T9.3's explicit listing is the safety mechanism.

---

## Ship tail

1. **Real-Gemini-CLI E2E** — `tests/e2e/` exercises the real `gemini` CLI (subscription
   auth, default route): `--scout`, deep `--depth 2 --stream`, `--envelopes` consume, a
   SIGINT abort. Mocked suite proves logic; this proves integration. **Pre-PR gate.**
2. **PR** — open against `construct-k-hole` from `chore/loa-mount` (or a renamed feature
   branch); description includes the S9 skill-removal audit table + the Flatline trail.
3. **/bridgebuilder-review** — the external review gate (replaces per-sprint Flatline for
   the implementation phase).
4. **Merge** — into `construct-k-hole` after BB review + E2E green. Per the operator goal.

## Cross-sprint discipline

- **Scope fence:** if any task tempts toward Effect-TS, typed errors, `Effect.Schedule`,
  caching, provider racing, `--budget`, `/forge` full breadth-mapping, or the kaironic
  depth controller — **stop.** That is the separate P2/3 kickoff (draft already at
  `grimoires/loa/context/kickoff-dig-search-p2-p3-draft.md`).
- **Provider mocking:** unit tests mock at the `gemini()` boundary; Scenario 15 mocks at
  the `spawn` seam; the ship-tail E2E uses the real CLI. Three seams, deliberately.
- **Regression guard:** Scenario 4 (non-`--stream` deep dig) is the standing check that
  the strangler stayed a strangler.
