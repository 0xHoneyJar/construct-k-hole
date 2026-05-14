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

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "dig-search.ts");
const FIX = join(HERE, "fixtures");

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
