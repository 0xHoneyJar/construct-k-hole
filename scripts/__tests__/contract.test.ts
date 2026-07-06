/**
 * Contract tests (FR-1) — ports the intent of the harvested corpus
 * (test_grounded_result.py + test_error_contract.py, loa @1c123a16) into the
 * repo's node:test idiom, plus the Phase-2 two-lane additions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_VERSION,
  toWire,
  fromWire,
  validateGroundedResultWire,
  validateErrorWire,
  groundedResultSchema,
  type GroundedResult,
} from "../lib/contract/index.js";

function sampleResult(overrides: Partial<GroundedResult> = {}): GroundedResult {
  return {
    text: "Berachain is a proof-of-liquidity L1.",
    citations: [
      { title: "Berachain docs", url: "https://docs.berachain.com", snippet: "PoL...", snippetChars: 6 },
    ],
    executedQueries: ["what is berachain proof of liquidity"],
    groundingProvenance: "exa",
    groundedRuntime: "exa:direct",
    lane: "mcp",
    retrievedAt: "2026-07-06T21:00:00Z",
    latencyMs: 812,
    quality: {
      citationCount: 1,
      executedQueryCount: 1,
      textChars: 37,
      citationUrlsParseable: true,
      citationUrlsUnique: true,
      coverageEstimate: 0.8,
    },
    ...overrides,
  };
}

test("CONTRACT_VERSION is pinned to 1.0", () => {
  assert.equal(CONTRACT_VERSION, "1.0");
});

test("valid mcp-lane (exa) result validates on the wire", () => {
  const r = validateGroundedResultWire(toWire(sampleResult()));
  assert.deepEqual(r.errors, []);
  assert.ok(r.valid);
});

test("valid cheval-lane result validates", () => {
  const r = validateGroundedResultWire(
    toWire(sampleResult({ lane: "cheval", groundingProvenance: "native", groundedRuntime: "cheval:gemini-3-flash" })),
  );
  assert.ok(r.valid, r.errors.join("; "));
});

test("two-lane addition: grounding_provenance 'executor' is accepted", () => {
  const r = validateGroundedResultWire(
    toWire(sampleResult({ groundingProvenance: "executor", groundedRuntime: "executor:code-mode" })),
  );
  assert.ok(r.valid, r.errors.join("; "));
});

test("bad lane value is rejected", () => {
  const wire = toWire(sampleResult());
  (wire as Record<string, unknown>).lane = "bogus";
  const r = validateGroundedResultWire(wire);
  assert.ok(!r.valid);
  assert.match(r.errors.join(";"), /lane/);
});

test("missing required field is rejected", () => {
  const wire = toWire(sampleResult()) as Record<string, unknown>;
  delete wire.grounding_provenance;
  const r = validateGroundedResultWire(wire);
  assert.ok(!r.valid);
  assert.match(r.errors.join(";"), /grounding_provenance/);
});

test("coverage_estimate out of [0,1] is rejected", () => {
  const wire = toWire(sampleResult({ quality: { ...sampleResult().quality, coverageEstimate: 1.5 } }));
  const r = validateGroundedResultWire(wire);
  assert.ok(!r.valid);
  assert.match(r.errors.join(";"), /coverage_estimate/);
});

test("toWire produces snake_case, fromWire inverts it (round-trip parity)", () => {
  const original = sampleResult();
  const wire = toWire(original);
  // wire uses snake_case for the required fields
  for (const key of groundedResultSchema.required as string[]) {
    assert.ok(key in (wire as Record<string, unknown>), `wire missing ${key}`);
  }
  const back = fromWire(wire);
  assert.equal(back.groundingProvenance, original.groundingProvenance);
  assert.equal(back.lane, original.lane);
  assert.equal(back.groundedRuntime, original.groundedRuntime);
  assert.equal(back.citations[0].url, original.citations[0].url);
  assert.equal(back.quality.coverageEstimate, original.quality.coverageEstimate);
});

test("field parity: every schema required field is populated by toWire", () => {
  const wire = toWire(sampleResult()) as Record<string, unknown>;
  const missing = (groundedResultSchema.required as string[]).filter((k) => !(k in wire));
  assert.deepEqual(missing, [], `toWire omits schema-required fields: ${missing.join(", ")}`);
});

// ── error contract ─────────────────────────────────────────────────────────

test("valid error envelope validates", () => {
  const r = validateErrorWire({
    ok: false,
    schema_version: "1.0",
    error: { code: "GROUNDING_EMPTY", message: "no citations returned", retryable: false },
  });
  assert.ok(r.valid, r.errors.join("; "));
});

test("NATIVE_RUNTIME_REQUIRED error (cheval lane, model-invoke absent) validates", () => {
  const r = validateErrorWire({
    ok: false,
    error: { code: "NATIVE_RUNTIME_REQUIRED", message: "model-invoke not on PATH", retryable: false },
  });
  assert.ok(r.valid, r.errors.join("; "));
});

test("unknown error code is rejected", () => {
  const r = validateErrorWire({ ok: false, error: { code: "MADE_UP", message: "x", retryable: false } });
  assert.ok(!r.valid);
  assert.match(r.errors.join(";"), /code/);
});

test("error with ok:true is rejected", () => {
  const r = validateErrorWire({ ok: true, error: { code: "RATE_LIMITED", message: "x", retryable: true } });
  assert.ok(!r.valid);
});
