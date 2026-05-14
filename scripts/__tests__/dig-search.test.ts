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
