/**
 * MCP-lane grounding tests (S2.T1, FR-3). Injectable transport → no live network.
 * Both runtimes normalize into the contract; fail-closed on empty/error.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ground, type GroundTransport } from "../lib/grounding.js";
import { toWire, validateGroundedResultWire } from "../lib/contract/index.js";

const fixedNow = () => "2026-07-06T21:00:00Z";

const twoHits: GroundTransport = async (q) => ({
  text: "",
  citations: [
    { title: "A", url: "https://a.example/x", snippet: "alpha" },
    { title: "B", url: "https://b.example/y", snippet: "beta" },
  ],
  executedQueries: [q],
});

test("exa:direct normalizes into a schema-valid mcp-lane GroundedResult", async () => {
  const r = await ground("berachain pol", { runtime: "exa:direct", transport: twoHits, nowIso: fixedNow, numResults: 8 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.grounded.lane, "mcp");
  assert.equal(r.grounded.groundingProvenance, "exa");
  assert.equal(r.grounded.groundedRuntime, "exa:direct");
  assert.equal(r.grounded.citations.length, 2);
  assert.equal(r.grounded.quality.citationUrlsUnique, true);
  assert.equal(r.grounded.quality.coverageEstimate, 0.25);
  assert.deepEqual(validateGroundedResultWire(toWire(r.grounded)).errors, []);
});

test("executor:code-mode tags provenance 'executor' — same interface, one-line swap", async () => {
  const r = await ground("x", { runtime: "executor:code-mode", transport: twoHits, nowIso: fixedNow });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.grounded.groundingProvenance, "executor");
  assert.equal(r.grounded.groundedRuntime, "executor:code-mode");
  assert.equal(r.grounded.lane, "mcp");
});

test("fail-closed: empty citations → GROUNDING_EMPTY (not a silent empty success)", async () => {
  const empty: GroundTransport = async () => ({ citations: [] });
  const r = await ground("x", { runtime: "exa:direct", transport: empty });
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.equal(r.error.code, "GROUNDING_EMPTY");
});

test("fail-closed: transport throw → typed error, no crash", async () => {
  const boom: GroundTransport = async () => {
    throw new Error("network down");
  };
  const r = await ground("x", { transport: boom });
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.equal(r.error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(r.error.retryable, true);
});

test("citations missing url/title are dropped; unparseable urls flagged", async () => {
  const messy: GroundTransport = async () => ({
    citations: [
      { title: "ok", url: "https://ok.example" },
      { snippet: "no url or title" }, // dropped
      { title: "bad", url: "not a url" }, // kept but flagged unparseable
    ],
  });
  const r = await ground("x", { transport: messy, nowIso: fixedNow });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.grounded.citations.length, 2);
  assert.equal(r.grounded.quality.citationUrlsParseable, false);
});
