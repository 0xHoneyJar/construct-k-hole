/**
 * Cheval-lane shim tests (S1.T2, FR-2). Uses the injectable `deps` seam so no live
 * model-invoke is needed. Asserts: schema-valid GroundedResult on success, typed
 * NATIVE_RUNTIME_REQUIRED when model-invoke is absent (soft-fail, no crash), and
 * error-v1 envelope parsing on provider failure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { invoke, type InvokeDeps } from "../lib/llm.js";
import { toWire, validateGroundedResultWire } from "../lib/contract/index.js";

const present: Pick<InvokeDeps, "exists"> = { exists: () => true };

test("cheval lane: text response normalizes to a schema-valid GroundedResult", async () => {
  const deps: InvokeDeps = {
    ...present,
    run: async () => ({
      code: 0,
      stdout: JSON.stringify({ content: "Berachain is a PoL L1.", model: "gemini-3-flash", latency_ms: 640 }),
      stderr: "",
    }),
  };
  const r = await invoke({ agent: "k-hole-dig", prompt: "what is berachain" }, deps);
  assert.ok(r.ok, "expected ok result");
  if (!r.ok) return;
  assert.equal(r.grounded.lane, "cheval");
  assert.equal(r.grounded.groundingProvenance, "none");
  assert.equal(r.grounded.groundedRuntime, "cheval:gemini-3-flash");
  const v = validateGroundedResultWire(toWire(r.grounded));
  assert.deepEqual(v.errors, []);
});

test("cheval lane: passes through a grounded sub-object from cheval, tagged cheval", async () => {
  const groundedWire = {
    text: "grounded answer",
    citations: [{ title: "T", url: "https://x.io", snippet: "s" }],
    executed_queries: ["q"],
    grounding_provenance: "native",
    grounded_runtime: "gemini:native",
    retrieved_at: "2026-07-06T21:00:00Z",
    latency_ms: 700,
    quality: {
      citation_count: 1,
      executed_query_count: 1,
      text_chars: 15,
      citation_urls_parseable: true,
      citation_urls_unique: true,
      coverage_estimate: 0.5,
    },
  };
  const deps: InvokeDeps = {
    ...present,
    run: async () => ({ code: 0, stdout: JSON.stringify({ grounded: groundedWire }), stderr: "" }),
  };
  const r = await invoke({ agent: "k-hole-dig", prompt: "x", tools: ["grounded_search"] }, deps);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.grounded.lane, "cheval");
  assert.equal(r.grounded.citations[0].url, "https://x.io");
});

test("soft-fail: model-invoke absent → typed NATIVE_RUNTIME_REQUIRED, no throw", async () => {
  const r = await invoke({ agent: "k-hole-dig", prompt: "x" }, { exists: () => false });
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.equal(r.error.code, "NATIVE_RUNTIME_REQUIRED");
  assert.equal(r.error.retryable, false);
});

test("provider error: error-v1 envelope on stderr is parsed into a typed error", async () => {
  const deps: InvokeDeps = {
    ...present,
    run: async () => ({
      code: 1,
      stdout: "",
      stderr: JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "slow down", retryable: true } }),
    }),
  };
  const r = await invoke({ agent: "k-hole-dig", prompt: "x" }, deps);
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.equal(r.error.code, "RATE_LIMITED");
  assert.equal(r.error.retryable, true);
});

test("malformed stdout → typed GROUNDING_MALFORMED, no throw", async () => {
  const deps: InvokeDeps = { ...present, run: async () => ({ code: 0, stdout: "not json", stderr: "" }) };
  const r = await invoke({ agent: "k-hole-dig", prompt: "x" }, deps);
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.equal(r.error.code, "GROUNDING_MALFORMED");
});

test("unknown non-zero exit without envelope → PROVIDER_UNAVAILABLE", async () => {
  const deps: InvokeDeps = { ...present, run: async () => ({ code: 2, stdout: "", stderr: "boom" }) };
  const r = await invoke({ agent: "k-hole-dig", prompt: "x" }, deps);
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.equal(r.error.code, "PROVIDER_UNAVAILABLE");
});
