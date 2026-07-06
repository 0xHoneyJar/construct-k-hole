---
title: Software Design Document — dig-search Phase 1 · scout · streaming · escape hatch · envelope loop
date: 2026-05-14
revision: r3 (sprint-Flatline corrections + operator-goal: primitives, entry point, surface contract)
status: accepted · r3 · operator-approved 2026-05-14 (SKP-003 exit-130 confirmed · goal-reshape §10 added)
authors: claude-opus-4-7 (OPERATOR + FAGAN · bonfire session, cd-bridged to construct-k-hole)
prd: grimoires/loa/prd.md (r2, accepted 2026-05-14)
issue: 0xHoneyJar/construct-k-hole#21 (Phase 1 scope only)
flatline_r1: 3-model (GPT-5.4-codex + opus + gemini-3.0-pro) — 72% agreement,
  HIGH=4 DISPUTED=3 BLOCKERS=5. Caught real design bugs, not just clarifications.
  All 12 integrated into r2. One (SKP-003) amends PRD FR-3 — see §9.
---

# SDD — dig-search Phase 1

## 1. Architecture overview

P1 is **additive surgery on the existing 1401-line `scripts/dig-search.ts`** — no
rewrite, no new runtime dependency. Every change is a new flag, a new branch in `dig()`,
or a new helper. The existing depth-N path keeps its behavior **except** for two
explicit, additive deltas (SKP-001b correction): the default deep path now (a) writes a
candidate envelope file and (b) gains an `emitted_envelope` field in its output object.
Both are additive per NFR-2; the SDD no longer claims "byte-identical."

Current `dig()` flow (`scripts/dig-search.ts:1261`):
```
loadResonance() / loadTrail()
  → [depth 0: Lilly's tank]  OR  buildSearchQueries() → Promise.all(gemini(q,{search}))
  → dedupe sources
  → synthesize()  → parseSynthesis()  → rateDepth()
  → appendFileSync(trailFile, trailEntry)
  → console.log(JSON.stringify(output))     // single blob → stdout
```

P1 inserts seams into this flow and adds one standalone path:
```
                          ┌─ FR-1 --scout ──────────────┐  (standalone path, bypasses synthesize)
parse args ──► validate ──┤                             │
                          └─ deep path:                 │
   FR-4 envelope-seeded queries ─► search loop (allSettled) ─► FR-2 per-search NDJSON emit
                                       │  └─ accumulator push (UNCONDITIONAL — SKP-001a)
                                       │  └─ FR-3 SIGINT trap flushes accumulator
                                       ▼
                                   synthesize ─► FR-5 emit envelope ─► output
```

## 2. CLI surface changes

| Flag | Type | Behavior | Back-comp |
|------|------|----------|-----------|
| `--scout` | boolean | FR-1. One search, no synthesis, scout-shape output. Mutually exclusive with `--depth N` (validation error if both). | new — additive |
| `--stream` | boolean | FR-2. stdout becomes NDJSON (one event per completed/failed search + a terminal `complete` event). Absent → current single-blob behavior. **Note:** `--stream` gates only the *emit*; the SIGINT accumulator is populated unconditionally (SKP-001a). | new — opt-in |
| `--envelopes <path>` | string | FR-4. Path to a creative-resonance-envelope JSON or a dir of them. `threads_to_pull` seed the dig (but never crowd out QUERY — IMP-005). | new — additive |
| `--no-emit-envelope` | boolean | FR-5 opt-out. Default = auto-emit a candidate envelope on every non-scout dig **that has a `--trail`** (IMP-011). | new — additive, default-on |

Arg parsing extends the existing `getArg()` block (`dig-search.ts:122-165`). Validation
runs immediately after parse: `--scout && depth-arg-present` → stderr error, exit 2.

## 3. FR-by-FR design

### FR-1 — Scout pass (`--scout`)
New `async function scout()` parallel to `dig()`:
1. One `gemini(QUERY, { search: true, maxTokens: 2048, temperature: 0.0 })` — reuses the
   provider router unchanged.
2. Dedupe sources (reuse `dig-search.ts:1318-1326`).
3. **Cross-provider gist extraction (SKP-002a).** `supports[].text` is Gemini-REST-
   specific; the CLI and OpenRouter routes may not return it. Gist extraction is a
   strategy with a defined precedence, applied per source:
   1. **REST path** — if `supports[]` cites this source index, use that snippet (≤200 chars).
   2. **All paths** — else, scan `result.text` for the first sentence mentioning the
      source's title or domain; use that.
   3. **Fallback** — else `"<title> (no snippet — provider returned no groundable text)"`.
   The scout output carries `gist_quality: "grounded" | "text-matched" | "title-only"`
   per source, so the consumer knows which strategy fired. Scout's value is **provider-
   dependent and disclosed**, not silently degraded.
4. Output the **scout shape** (§4.1) — distinct `mode: "scout"`.
5. No trail append, no envelope emission.
- **Latency (IMP-003):** ≤45s is a *measured expectation* (PRD §8 protocol), **not a
  hard-enforced timeout** in P1. A hard `--budget` belongs to P2. The SDD states this so
  no implementer adds a premature timeout.

### FR-2 — Streaming (`--stream`)
The search loop (`dig-search.ts:1284-1305`) changes in two ways:
1. **`Promise.all` → `Promise.allSettled` (IMP-002).** One rejected provider call must
   not collapse the whole dig. A rejected search becomes a `search_error` outcome:
   excluded from results, the dig continues with the successes. Per-search failure
   semantics: `{ status: "error", query, error }` — surfaced as a stream event (below)
   and counted in the final output's `failed_searches`.
2. Each task, **as it settles**, does two things:
   - **Unconditionally** push its result (or error marker) into the module-level
     `accumulator` (SKP-001a — this is what FR-3 flushes; it must NOT be `--stream`-gated).
   - **If `--stream`**, `emitEvent()` one NDJSON line.

Stream event shapes (NDJSON on stdout):
```
{"event":"search","query_index":0,"of":3,"query":"...","source_count":12,"elapsed_ms":4200}
{"event":"search_error","query_index":1,"of":3,"query":"...","error":"..."}
{"event":"complete", <...the full deep-dig output object...>}
```
- **`query_index` is the stable definition-order index (IMP-001)** — NOT completion
  order. Completion order is implicit in line order. `of` is the total query count. A
  consumer correlates by `query_index`, sequences by line arrival.
- `--stream` OFF → exactly today's path plus the §1 additive deltas.
- Human progress stays on **stderr**, unchanged, both modes.

### FR-3 — SIGINT escape hatch
*(r3 — sprint-Flatline corrections: SKP-001a/b, SKP-002, IMP-003, IMP-013.)*

0. **AbortController (IMP-003).** A module-level `const abortController = new
   AbortController()` is created at the top of `main` and its `.signal` is threaded into
   **every** `fetch` — searches (`geminiCall`, `openrouterCall`) and `synthesize()`.
   "Abandoning a promise" is not cancellation; the in-flight HTTP request keeps running
   and consuming quota. `abortController.abort()` in the signal handler genuinely cancels
   them. No new dependency — `AbortController` is built into Node.
1. **Accumulator** — module-level `const accumulator: SettledSearch[] = []`. Populated
   **unconditionally** by the FR-2 settle-handler (SKP-001a — the escape hatch must work
   on the non-`--stream` path). **Reset to `[]` at the top of every `main` run (SKP-001a)**
   — module-level state must not bleed across runs (tests run many digs in one process).
2. **Child handles (SKP-002b)** — searches run concurrently under `Promise.allSettled`,
   so multiple gemini-CLI children may be live at once. `geminiCliCall` registers each
   `spawn`'d child in a module-level `const activeChildren = new Set<ChildProcess>()`;
   removes on close. The handler kills **all** of them.
3. **Handler** — `["SIGINT","SIGTERM"]` both trapped (IMP-013 — orchestrators send
   SIGTERM), installed at the top of `main` before any await:
   ```
   let aborting = false;
   const onSignal = (sig: "SIGINT" | "SIGTERM") => () => {
     if (aborting) return;                    // double-signal guard
     aborting = true;
     abortController.abort();                 // IMP-003: cancel in-flight fetches
     for (const c of activeChildren) c.kill("SIGTERM");   // SKP-002b: reap all
     const partial = buildPartialArtifact(accumulator);   // §4.3
     if (TRAIL_PATH) appendFileSync(resolveTrailPath(date), partialTrailEntry);
     // SKP-002: process.exit does NOT flush async stdout — write SYNCHRONOUSLY.
     fs.writeSync(1, JSON.stringify(partial) + "\n");
     process.exit(sig === "SIGTERM" ? 143 : 130);
   };
   process.on("SIGINT",  onSignal("SIGINT"));
   process.on("SIGTERM", onSignal("SIGTERM"));
   ```
- **Synchronous flush (SKP-002).** `process.stdout.write()` is async; `process.exit()`
  does not drain it — a large partial artifact truncates mid-write. The handler uses
  `fs.writeSync(1, …)` so the artifact is fully on the wire before exit.
- **Exit 130 / 143 (SKP-003 — amends PRD FR-3).** SIGINT→130, SIGTERM→143 (POSIX
  128+signal). Still a *clean* exit (no stack trace, artifact flushed, `partial:true`),
  but automation-detectable. See §9.
- **Atomic synthesis (PRD FR-3 / IMP-008):** `partial.synthesis` is always `null`. With
  the AbortController, "SIGINT during synthesis" genuinely cancels the synthesis fetch
  rather than leaving it running until process death.
- **Sequencing (IMP-007):** implemented LAST. Gated on test scenarios 7–8.

### FR-4 — Envelope-seeded queries (`--envelopes`)
New `function loadEnvelopeSeeds(path): string[]`:
1. Resolve `path` — file → one envelope; dir → all `*.json`.
2. Parse each (try/catch, untrusted input — §5); **validate `schema_version`** against
   the in-repo schema (FR-6). Major mismatch → hard error exit 2; minor-ahead → stderr warn.
3. Collect `threads_to_pull[]`, dedupe → seed list.
4. **Seed budgeting (IMP-005) — seeds never crowd out QUERY.** Of `SEARCH_DEPTH` total
   query slots, **at least `ceil(SEARCH_DEPTH/2)` are reserved for QUERY-derived queries**
   (`buildSearchQueries(QUERY, …)`). Seeds fill the *remaining* slots, prepended. If
   `SEARCH_DEPTH == 1`, the single slot goes to QUERY; seeds are ignored with a stderr
   note (raise depth to use seeds). The user's immediate intent is always served.
- `--envelopes` and `--resonance` compose; neither required.

### FR-5 — Envelope emission
After `output` is built in `dig()`, unless `--scout`, `--no-emit-envelope`, **or no
`--trail` (IMP-011)**:
1. `buildEmittedEnvelope(QUERY, parsed, uniqueSources, synthesis)` constructs a
   schema-valid envelope:
   - `schema_version` — read from the in-repo schema (single source of truth).
   - `envelope_id` — `slugify(direction.name) + "-" + sha256(ref.name).slice(0,8)`;
     deterministic. Cross-ref collision → `-2` suffix.
   - `ref` = `{ name: QUERY, type: "concept" }`.
   - `direction.name` = `slugify(QUERY)`.
   - `resonance.strength` — **explicit mapping table (IMP-009)**, not ad-hoc:
     | `depthRating` (Shulgin) | `resonance.strength` |
     |---|---|
     | `surface` | 0.30 |
     | `notable` | 0.55 |
     | `deep` | 0.80 |
     | `profound` | 0.95 |
     The function `depthRatingToStrength()` is a pure lookup; unknown rating → 0.30 + warn.
   - `resonance.evidence` = `parsed.findings` entries (concrete; schema requires ≥1).
   - `why` = `{ design: <synthesis first paragraph> }` (≥32 chars; ≥1 lens required).
   - **`threads_to_pull` = `parsed.pull_threads`** (`dig-search.ts:1110`) — the
     loop-closing mapping: this dig's pull-threads become the next dig's FR-4 seeds.
   - `provenance` = `{ surfaced_by: <trail file>, ratified_at: <date>, candidate: true }`.
2. **Path (IMP-011):** envelopes write to `<trail-dir>/envelopes/<envelope_id>.json`.
   **No `--trail` → no emission** (stderr note: "envelope emission skipped — no --trail").
   No surprising cwd writes; envelopes are loop artifacts and the trail *is* the loop's home.
3. Validate the constructed envelope against the in-repo schema before write; a
   construction bug → stderr warn + skip emit (never crash the dig over emission).
4. `output` gains `emitted_envelope: <path> | null` (this is the §1 additive delta).

### FR-6 — Land the envelope schema
1. Copy `~/.loa/constructs/packs/k-hole/schemas/` → `construct-k-hole/schemas/`:
   `creative-resonance-envelope.schema.json`, `fixtures/`, `validate-fixtures.py`,
   `README.md`. New `schemas/` dir.
2. **Canonical-divergence guard (IMP-006)** — ship both:
   - `"x-canonical-source": "0xHoneyJar/construct-k-hole"` at the schema's top level.
   - A CI step in the existing `.github/workflows/validate.yml` — runs
     `validate-fixtures.py`, and `diff`s against the `.loa` vendored copy if reachable,
     **warning** (not failing) on divergence.
3. **DEP-1:** FR-6 ships FIRST — FR-4/FR-5 import the schema.
4. `.loa`-copy ← repo sync direction flagged for the cycle retro.

## 4. Data models

### 4.1 Scout shape (`--scout` stdout)
```json
{
  "mode": "scout",
  "query": "<QUERY>",
  "sources": [{ "title": "...", "url": "...", "gist": "<one line>", "gist_quality": "grounded" }],
  "source_count": 12,
  "elapsed_s": "31.4",
  "note": "scout pass — direction check only, not a deep result"
}
```

### 4.2 Stream events (`--stream` stdout, NDJSON)
See §FR-2. `search` | `search_error` | `complete`. `query_index` is stable
definition-order; line order is completion order.

### 4.3 Partial artifact (SIGINT, stdout — exit 130)
```json
{
  "partial": true,
  "query": "<QUERY>",
  "completed_searches": 2,
  "failed_searches": 0,
  "total_searches": 3,
  "sources": [ ... from accumulator ... ],
  "synthesis": null,
  "reason": "SIGINT — aborted with partial results"
}
```

### 4.4 Emitted envelope
Conforms to the landed `creative-resonance-envelope.schema.json`. Construction mapping is
§FR-5 step 1. `provenance.candidate: true` always.

## 5. Security & failure design

- **No new attack surface** — no new network calls, no new subprocess types.
- **`--envelopes` is untrusted input** — `JSON.parse` in try/catch, schema-validate
  before use, never `eval`'d. `threads_to_pull` strings are used only as search query
  text — never shelled out, never path-interpolated.
- **`Promise.allSettled` (IMP-002)** — one provider failure can no longer collapse the
  dig. `failed_searches` is surfaced; a dig with all searches failed → structured error
  output (today's `dig().catch` shape), exit 1.
- **Signal double-flush guard** — `aborting` boolean (§FR-3).
- **Cancellation, not abandonment (IMP-003)** — in-flight `fetch`es carry the
  `abortController.signal`; the signal handler `.abort()`s them. Abandoning a promise
  leaves the HTTP request live; `AbortController` genuinely cancels it.
- **Synchronous exit flush (SKP-002)** — the signal handler writes the partial artifact
  with `fs.writeSync(1, …)`, never `process.stdout.write` + `process.exit` (which truncates).
- **Emission never crashes the dig** — malformed constructed envelope → warn + skip.
- **No-orphan guarantee** — `activeChildren` Set, all killed on SIGINT/SIGTERM (SKP-002b).

## 6. Test design (NFR-4 — enumerated, Flatline-revised)

| # | Scenario | Asserts |
|---|----------|---------|
| 1 | `--scout` happy path (REST mock) | scout shape, `mode:"scout"`, `gist_quality:"grounded"`, no `synthesis` key |
| 2 | `--scout --depth 2` | validation error, exit 2 |
| 3 | `--scout` on a CLI-path mock (no `supports[]`) | gists fall to `text-matched`/`title-only`, `gist_quality` reflects it — scout still usable (SKP-002a) |
| 4 | non-`--stream` deep dig | stdout == today's blob **plus** `emitted_envelope` field — regression guard on everything else (SKP-001b) |
| 5 | `--stream` deep dig | each search → one valid NDJSON line; `query_index` stable; terminal `complete`; stderr unchanged |
| 6 | one search rejects (IMP-002) | `search_error` event/field; dig continues; `failed_searches:1`; not a full collapse |
| 7 | SIGINT before synthesis, non-`--stream` | `partial:true`, `completed_searches` == actual (NOT 0 — SKP-001a), exit 130, all children killed |
| 8 | SIGINT during synthesis | same shape as #7; in-flight synthesis not awaited |
| 9 | `--envelopes` valid set | seeds become queries; QUERY slots reserved per IMP-005; depth budget respected |
| 10 | `--envelopes` major-version mismatch | hard error, exit 2 |
| 11 | envelope emission with `--trail` | file at `<trail-dir>/envelopes/<id>.json`, validates against in-repo schema, `candidate:true` |
| 12 | envelope emission, no `--trail` | no file written, stderr note, `emitted_envelope:null` |
| 13 | **e2e loop (IMP-010)** | dig A emits envelope → dig B `--envelopes` consumes A's `threads_to_pull` as seeds → B's queries include A's threads. The whole value path, not isolated halves. |
| 14 | FR-6 fixtures | `validate-fixtures.py` passes from within `construct-k-hole/schemas/` |
| 15 | **subprocess reaping (SKP-001b/IMP-004)** | mock at the **`spawn` seam**, not `gemini()` — register a fake child in `activeChildren`, fire SIGINT, assert `.kill()` was called on it. The `gemini()`-boundary mock never reaches `geminiCliCall`, so it cannot exercise this. |
| 16 | flag-combination matrix (IMP-002) | every reachable flag pair behaves per §10.3's matrix — documented behavior or documented ignore-rule, no silent ambiguity |

**Two mock seams (SKP-001b correction).** Scenarios 1–14, 16 mock at the `gemini()`
function boundary (no real spend). Scenario 15 mocks at the **`spawn` seam** inside
`geminiCliCall` — the only way to exercise subprocess registration/reaping.

**Real-Gemini-CLI E2E (operator goal).** Beyond the mocked unit suite, a `tests/e2e/`
script exercises the full path against the **real `gemini` CLI** (subscription auth, the
default route): one `--scout`, one deep `--depth 2 --stream`, one `--envelopes` consume,
one SIGINT abort. This is the pre-merge gate — mocked tests prove logic, the E2E proves
the integration. Run before the PR per the operator's ship sequence.

## 7. Sequencing (sprint-plan input)

```
S1  FR-6  land schema + divergence guard          (no deps — DEP-1)
S2  FR-1  --scout + cross-provider gist           (BREADTH primitive)
S3  FR-2  --stream + allSettled + accumulator     (DEPTH visibility; builds S6's accumulator)
S4  FR-4  --envelopes seeded queries + budgeting  (PULLING-THREADS consume; deps: S1)
S5  FR-5  envelope emission + strength table      (PULLING-THREADS emit + RESONANCE; deps: S1,S4)
S6  FR-3  SIGINT/SIGTERM escape hatch             (DEPTH safety valve; deps: S3; LAST per IMP-007)
S7  surface contract + single entry point        (operator goal — §10; deps: S1–S6 shapes)
S8  code cleanup — leave it better                (operator goal; strangler, not rewrite)
S9  skills restructure around the 4 primitives    (operator goal; remove unfit skills)
 — ship: real-CLI E2E → PR → /bridgebuilder-review → merge
```
FR-3 last, merge-gated on scenarios 7–8, 15. S3 builds the unconditional accumulator +
the `allSettled` conversion S6 and IMP-002 depend on. S7–S9 crystallize the cycle per
the operator's goal; full task breakdown in `grimoires/loa/sprint.md`.

## 8. Out of scope (P2/2.5/3 — separate kickoff)

No Effect-TS, no typed error channel, no `Effect.Schedule`, no layer DI, no
content-addressed cache, no provider racing, no `--budget` (the 45s scout figure is a
measured expectation, NOT a hard timeout — IMP-003), no kaironic depth controller. P1
mocks at the `gemini()` boundary; the cycle-098 retry patch stays intact.

## 9. PRD amendment flagged for operator

**SKP-003 amends PRD r2 FR-3.** The PRD says SIGINT exits **0** ("first-class outcome,
not a crash"). The Flatline blocker is correct that exit 0 makes automation treat an
interrupted run as a success. This SDD specifies exit **130** (POSIX SIGINT convention):
still a clean exit — no stack trace, the `partial:true` artifact is fully flushed first —
but automation can now distinguish "completed" from "aborted." The *spirit* of PRD FR-3
("not a crash") is preserved; only the exit code changes from 0 to 130. Operator: confirm
this amendment when promoting the SDD, or revert to exit 0 if automation-detectability is
not wanted.

## 10. Surface contract — 4 primitives, one entry point (operator goal)

The operator's goal: *"There should be primitives and a single clear entry point. Provide
a surface schema/contract that allows humans/agents to drive and operate."* And: *"Do NOT
extend beyond these core primitives that are already designed."* This section crystallizes
what the P1 FRs already build into a named, contracted surface — it adds **no new
capability**, only structure and a contract.

### 10.1 The four primitives

Every P1 FR is the mechanics of one of four primitives. This is the cycle's north star:

| Primitive | What it is | Mechanics (P1 FRs) | Drive surface |
|-----------|-----------|--------------------|--------------|
| **breadth** | a fast wide shallow pass — "is this question pointed at the right space?" | FR-1 scout | `--scout` |
| **depth** | intentional descent into one thread, N angles deep | existing `--depth N` + FR-2 streaming (visibility) + FR-3 escape hatch (safety valve) | `--depth N`, `--stream`, SIGINT |
| **pulling-threads** | a dig's surfaced threads become the next dig's seeds — the loop | FR-4 consume + FR-5 emit | `--envelopes <path>`, auto-emit |
| **resonance** | how strongly a reference/thread grounds a direction — governs which threads pull hardest | FR-5 envelope `resonance{strength,evidence}` + `--resonance` profile | `--resonance`, envelope `resonance` field |

These four are the whole surface. Nothing else is in P1 scope.

### 10.2 Single entry point

`scripts/dig-search.ts` is **the** executable entry point — the four primitives are
expressed as flags/modes on it, not as separate scripts. `skills/dig/` is **the** skill
entry point. The skills audit (S9) consolidates: anything in `commands/` or `skills/`
that does not serve breadth/depth/threads/resonance is removed or folded in. Target
end-state: one script, one skill, four primitives, one contract.

### 10.3 Surface contract (`schemas/dig-surface.schema.json`)

S7 authors a published contract — a JSON Schema (sibling to the envelope schema) that
formalizes, in one file, everything a human or agent needs to drive the tool:
- **inputs** — every flag (`--query`, `--depth`, `--scout`, `--stream`, `--envelopes`,
  `--resonance`, `--trail`, `--model`, `--no-emit-envelope`), its type, and the
  **flag-combination matrix** (IMP-002): which pairs compose, which are mutually
  exclusive (`--scout ⊕ --depth`), which are ignored-with-note (`--envelopes` at depth 1).
- **outputs** — the four output shapes already in §4 (scout shape, deep output, stream
  events, partial artifact) + the emitted-envelope reference.
- **exit codes** — 0 success · 1 all-searches-failed · 2 validation error · 130 SIGINT
  · 143 SIGTERM.
The contract is the durable promise; `--help` text and `skills/dig/SKILL.md` are
generated-from / kept-in-sync-with it. An agent reads `dig-surface.schema.json` and knows
how to operate the tool with zero source-reading.

### 10.4 Cleanup discipline (S8)

"Leave it better than we started" — within the **strangler, not rewrite** constraint
(PRD §3). S8 may: extract the new primitive paths into named functions, tidy immediately-
adjacent code, delete dead branches it can prove are dead, improve naming/comments. S8
may NOT: restructure the provider router, rewrite `synthesize()`, or touch the
cycle-098 retry patch. Cleanup is bounded to what the P1 changes make legible.
