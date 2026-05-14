// Subprocess integration tests for dig-search.ts.
//
// Strategy (SDD §6): these run the REAL CLI as a subprocess with the
// DIG_MOCK_PROVIDER env seam pointing at canned GeminiResponse fixtures — so
// the full arg-parse → branch → output path is exercised deterministically
// with zero API/subscription spend. The pre-merge ship-tail E2E uses the real
// gemini CLI; this suite proves logic.
//
// Run: npm test   (node --import tsx --test scripts/__tests__/*.test.ts)

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "dig-search.ts");
const FIX = join(HERE, "fixtures");

/** A throwaway temp dir for trail-file / state-dump side effects. */
function tmp(): string {
  return mkdtempSync(join(tmpdir(), "dig-test-"));
}

/** Run dig-search.ts as a subprocess. Returns { status, stdout, stderr }. */
function runDig(
  args: string[],
  env: Record<string, string> = {}
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync("npx", ["tsx", SCRIPT, ...args], {
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// ── Scenario 1 — scout happy path (REST mock, supports[] present) ──
test("S2/Scenario 1 — --scout returns the scout shape with grounded gists", () => {
  const { status, stdout } = runDig(
    ["--query", "miyazaki loneliness design philosophy", "--scout"],
    { DIG_MOCK_PROVIDER: join(FIX, "scout-rest.json") }
  );
  assert.equal(status, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.mode, "scout");
  assert.equal(out.query, "miyazaki loneliness design philosophy");
  assert.ok(Array.isArray(out.sources) && out.sources.length === 2);
  assert.ok(!("synthesis" in out), "scout output must not carry a synthesis key");
  assert.ok(!("findings" in out), "scout output must not carry a findings key");
  for (const s of out.sources) {
    assert.ok(s.title && s.url && s.gist, "each source has title/url/gist");
    assert.ok(
      ["grounded", "text-matched", "title-only"].includes(s.gist_quality),
      "gist_quality is a known tier"
    );
  }
  // REST fixture carries supports[] → both gists are tier-1 grounded.
  assert.equal(out.sources[0].gist_quality, "grounded");
  assert.equal(out.sources[1].gist_quality, "grounded");
});

// ── Scenario 2 — --scout ⊕ --depth mutual exclusion ──
test("S2/Scenario 2 — --scout --depth 2 is a validation error, exit 2", () => {
  const { status, stdout } = runDig(["--query", "x", "--scout", "--depth", "2"]);
  assert.equal(status, 2);
  const out = JSON.parse(stdout);
  assert.match(out.error, /mutually exclusive/);
});

// ── Scenario 3 — scout on a CLI-path mock (no supports[]) ──
test("S2/Scenario 3 — --scout degrades honestly when supports[] is absent", () => {
  const { status, stdout } = runDig(
    ["--query", "miyazaki loneliness design philosophy", "--scout"],
    { DIG_MOCK_PROVIDER: join(FIX, "scout-cli.json") }
  );
  assert.equal(status, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.mode, "scout");
  assert.equal(out.sources.length, 2);
  // No supports[] → tier 1 is impossible; gists fall to tier 2 or tier 3.
  for (const s of out.sources) {
    assert.notEqual(
      s.gist_quality,
      "grounded",
      "without supports[] no gist can be tier-1 grounded"
    );
  }
  // The source named in result.text resolves via tier-2 text-match.
  const named = out.sources.find((s: { title: string }) =>
    s.title.includes("Poetics of Solitude")
  );
  assert.equal(named.gist_quality, "text-matched");
  // The unrelated source has no groundable text → tier-3 title-only.
  const unrelated = out.sources.find((s: { title: string }) =>
    s.title.includes("Unrelated")
  );
  assert.equal(unrelated.gist_quality, "title-only");
  assert.match(unrelated.gist, /no snippet/);
});

// ── Scenario 4 — non-stream deep dig: single blob + failed_searches ──
test("S3/Scenario 4 — non-stream deep dig is a single JSON blob (regression guard)", () => {
  const dir = tmp();
  try {
    const { status, stdout } = runDig(
      ["--query", "creative tooling", "--depth", "2", "--trail", join(dir, "trail.md")],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-ok.json") }
    );
    assert.equal(status, 0);
    // Single blob — exactly one JSON value on stdout, not NDJSON.
    const out = JSON.parse(stdout); // throws if NDJSON / multi-line garbage
    assert.ok(!("mode" in out), "deep dig output must not carry mode:scout");
    assert.equal(out.failed_searches, 0, "additive field present, zero failures");
    assert.equal(out.search_count, 2);
    assert.ok("synthesis" in out && "findings" in out && "pull_threads" in out);
    assert.ok(Array.isArray(out.sources));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Scenario 5 — --stream deep dig: NDJSON events ──
test("S3/Scenario 5 — --stream emits NDJSON: one event per search + terminal complete", () => {
  const dir = tmp();
  try {
    const { status, stdout, stderr } = runDig(
      ["--query", "creative tooling", "--depth", "2", "--stream", "--trail", join(dir, "trail.md")],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-ok.json") }
    );
    assert.equal(status, 0);
    const lines = stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const searchEvents = lines.filter((l) => l.event === "search");
    const completeEvents = lines.filter((l) => l.event === "complete");
    assert.equal(searchEvents.length, 2, "one NDJSON line per completed search");
    assert.equal(completeEvents.length, 1, "exactly one terminal complete event");
    // query_index is stable definition-order 0..1 (IMP-001).
    assert.deepEqual(
      searchEvents.map((e) => e.query_index).sort(),
      [0, 1]
    );
    for (const e of searchEvents) assert.equal(e.of, 2);
    // complete payload carries the full output object.
    assert.ok("synthesis" in completeEvents[0] && "pull_threads" in completeEvents[0]);
    // stderr still carries the human progress lines, unchanged.
    assert.match(stderr, /\[dig\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Scenario 6 — one search rejects: dig continues (IMP-002) ──
test("S3/Scenario 6 — one failed search does not collapse the dig", () => {
  const dir = tmp();
  try {
    const { status, stdout } = runDig(
      ["--query", "creative tooling", "--depth", "2", "--trail", join(dir, "trail.md"), "--stream"],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-one-fails.json") }
    );
    assert.equal(status, 0, "a single search failure must NOT collapse the dig");
    const lines = stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(lines.filter((l) => l.event === "search").length, 1, "one search succeeded");
    assert.equal(lines.filter((l) => l.event === "search_error").length, 1, "one search_error event");
    const complete = lines.find((l) => l.event === "complete");
    assert.equal(complete.failed_searches, 1);
    assert.equal(complete.search_count, 1);
    assert.ok("synthesis" in complete, "dig still synthesized from the surviving search");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── AC3.4 — accumulator is populated on the NON-stream path (SKP-001a) ──
test("S3/AC3.4 — accumulator populates unconditionally (non-stream path)", () => {
  const dir = tmp();
  const statePath = join(dir, "state.json");
  try {
    const { status } = runDig(
      ["--query", "creative tooling", "--depth", "2", "--trail", join(dir, "trail.md")],
      {
        DIG_MOCK_PROVIDER: join(FIX, "deep-one-fails.json"),
        DIG_DUMP_STATE: statePath,
      }
    );
    assert.equal(status, 0);
    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    // 2 settled searches accumulated even WITHOUT --stream — this is the
    // SKP-001a fix: the escape hatch must work on the common path.
    assert.equal(state.accumulator.length, 2);
    assert.equal(state.accumulator.filter((s: { status: string }) => s.status === "ok").length, 1);
    assert.equal(state.accumulator.filter((s: { status: string }) => s.status === "error").length, 1);
    assert.equal(state.failed_searches, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Scenario 9 — --envelopes seeds the query set, QUERY slots reserved ──
test("S4/Scenario 9 — --envelopes threads seed queries without crowding out QUERY", () => {
  const dir = tmp();
  const statePath = join(dir, "state.json");
  try {
    const { status } = runDig(
      [
        "--query", "creative tooling",
        "--depth", "2",
        "--envelopes", join(FIX, "envelopes", "good"),
        "--trail", join(dir, "trail.md"),
      ],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-seeded.json"), DIG_DUMP_STATE: statePath }
    );
    assert.equal(status, 0);
    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    const queries = state.accumulator.map(
      (s: { result?: { query: string }; query?: string }) => s.result?.query ?? s.query
    );
    assert.equal(queries.length, 2, "depth 2 → 2 query slots total");
    // depth 2: reserve ceil(2/2)=1 for the QUERY, 1 slot for a seed (IMP-005).
    assert.ok(
      queries.some((q: string) => q.includes("seed thread one")),
      "an envelope seed thread became a query"
    );
    assert.ok(
      queries.some((q: string) => q.includes("leading practitioners")),
      "a QUERY-derived query is still present — seeds did not crowd it out"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Scenario 10 — --envelopes major-version mismatch is a hard stop ──
test("S4/Scenario 10 — --envelopes major-version mismatch exits 2", () => {
  const { status, stdout } = runDig([
    "--query", "x",
    "--depth", "2",
    "--envelopes", join(FIX, "envelopes", "bad", "bad-version.json"),
  ]);
  assert.equal(status, 2);
  assert.match(JSON.parse(stdout).error, /[Mm]ajor-version mismatch/);
});

// ── AC4.3 — malformed / missing --envelopes input degrades gracefully ──
test("S4/AC4.3 — missing --envelopes path is a note, not a crash", () => {
  const dir = tmp();
  try {
    const { status, stdout, stderr } = runDig(
      ["--query", "creative tooling", "--depth", "2", "--envelopes", join(dir, "does-not-exist"), "--trail", join(dir, "trail.md")],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-ok.json") }
    );
    // No seeds → falls back to a normal depth-2 dig, exit 0.
    assert.equal(status, 0);
    assert.match(stderr, /--envelopes path not found/);
    const out = JSON.parse(stdout);
    assert.equal(out.search_count, 2, "fell back to a normal depth-2 dig");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Scenario 11 — envelope emission with --trail ──
test("S5/Scenario 11 — deep dig with --trail emits a valid candidate envelope", () => {
  const dir = tmp();
  try {
    const { status, stdout } = runDig(
      ["--query", "creative tooling", "--depth", "2", "--trail", join(dir, "trail.md")],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-ok.json") }
    );
    assert.equal(status, 0);
    const out = JSON.parse(stdout);
    assert.ok(out.emitted_envelope, "output carries the emitted_envelope path");
    const env = JSON.parse(readFileSync(out.emitted_envelope, "utf-8"));
    // schema-required keys + key constraints (AC5.1)
    for (const k of ["schema_version", "envelope_id", "ref", "direction", "resonance", "why", "provenance"]) {
      assert.ok(k in env, `envelope has required key ${k}`);
    }
    assert.equal(env.provenance.candidate, true, "emitted envelopes are candidates");
    assert.match(env.envelope_id, /^[a-z0-9][a-z0-9_-]*$/);
    // AC5.5 — resonance.strength is a number in [0,1] (depthRatingToStrength)
    assert.equal(typeof env.resonance.strength, "number");
    assert.ok(env.resonance.strength >= 0 && env.resonance.strength <= 1);
    assert.ok(Array.isArray(env.resonance.evidence) && env.resonance.evidence.length >= 1);
    // threads_to_pull carried from the synthesis (the loop's payload)
    assert.ok(Array.isArray(env.threads_to_pull) && env.threads_to_pull.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Scenario 12 — no --trail → no emission ──
test("S5/Scenario 12 — no --trail means no envelope file, emitted_envelope:null", () => {
  const dir = tmp();
  try {
    const { status, stdout, stderr } = runDig(
      ["--query", "creative tooling", "--depth", "2"],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-ok.json") }
    );
    assert.equal(status, 0);
    const out = JSON.parse(stdout);
    assert.equal(out.emitted_envelope, null);
    assert.match(stderr, /envelope emission skipped/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── AC5.3 — --no-emit-envelope opts out even with --trail ──
test("S5/AC5.3 — --no-emit-envelope suppresses emission even with --trail", () => {
  const dir = tmp();
  try {
    const { status, stdout } = runDig(
      ["--query", "creative tooling", "--depth", "2", "--trail", join(dir, "trail.md"), "--no-emit-envelope"],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-ok.json") }
    );
    assert.equal(status, 0);
    assert.equal(JSON.parse(stdout).emitted_envelope, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Scenario 13 — the e2e loop: dig A emits → dig B consumes A's threads ──
test("S5/Scenario 13 — emit→consume loop: dig A's threads_to_pull seed dig B", () => {
  const dirA = tmp();
  const dirB = tmp();
  const stateB = join(dirB, "state.json");
  try {
    // dig A — emits an envelope with threads_to_pull from its synthesis.
    const a = runDig(
      ["--query", "creative tooling", "--depth", "2", "--trail", join(dirA, "trail.md")],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-ok.json") }
    );
    assert.equal(a.status, 0);
    const envPathA = JSON.parse(a.stdout).emitted_envelope;
    const envA = JSON.parse(readFileSync(envPathA, "utf-8"));
    assert.ok(envA.threads_to_pull.length >= 1, "dig A produced threads to pull");

    // dig B — consumes dig A's envelope; A's threads_to_pull become B's seeds.
    const b = runDig(
      ["--query", "a different thread", "--depth", "2", "--envelopes", envPathA, "--trail", join(dirB, "trail.md")],
      { DIG_MOCK_PROVIDER: join(FIX, "deep-ok.json"), DIG_DUMP_STATE: stateB }
    );
    assert.equal(b.status, 0);
    const state = JSON.parse(readFileSync(stateB, "utf-8"));
    const queriesB = state.accumulator.map(
      (s: { result?: { query: string }; query?: string }) => s.result?.query ?? s.query
    );
    // B's query set must include one of A's threads_to_pull — the loop closed.
    const firstThreadA = envA.threads_to_pull[0];
    assert.ok(
      queriesB.some((q: string) => q === firstThreadA),
      `dig B's queries include dig A's thread "${firstThreadA}"`
    );
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});
