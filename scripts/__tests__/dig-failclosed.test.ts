/**
 * Fail-closed /dig tests (S2.T2, FR-5). The in-session path must never present a
 * grounding failure as a grounded answer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groundForDig, isGrounded, type GroundTransport } from "../lib/grounding.js";
import { validateGroundedResultWire, toWire } from "../lib/contract/index.js";

const fixedNow = () => "2026-07-06T21:00:00Z";

test("success path: groundForDig reports grounded:true with real citations", async () => {
  const hit: GroundTransport = async (q) => ({ citations: [{ title: "A", url: "https://a.io", snippet: "s" }], executedQueries: [q] });
  const o = await groundForDig("q", { transport: hit, nowIso: fixedNow });
  assert.equal(o.grounded, true);
  assert.equal(isGrounded(o.result), true);
});

test("failure path: transport error → grounded:false + degraded marker, NOT a grounded answer", async () => {
  const boom: GroundTransport = async () => {
    throw new Error("exa down");
  };
  const o = await groundForDig("q", { transport: boom, nowIso: fixedNow });
  assert.equal(o.grounded, false);
  assert.equal(o.errorCode, "PROVIDER_UNAVAILABLE");
  // The degraded marker must be self-identifying and never pass isGrounded()
  assert.equal(isGrounded(o.result), false);
  assert.equal(o.result.extra?.degraded, true);
  assert.equal(o.result.groundingProvenance, "none");
  assert.equal(o.result.citations.length, 0);
});

test("empty-citations grounding is treated as a failure, not a silent empty success", async () => {
  const empty: GroundTransport = async () => ({ citations: [] });
  const o = await groundForDig("q", { transport: empty, nowIso: fixedNow });
  assert.equal(o.grounded, false);
  assert.equal(o.errorCode, "GROUNDING_EMPTY");
  assert.equal(isGrounded(o.result), false);
});

test("the degraded marker is still a schema-valid GroundedResult (typed, not malformed)", async () => {
  const boom: GroundTransport = async () => {
    throw new Error("x");
  };
  const o = await groundForDig("q", { transport: boom, nowIso: fixedNow });
  assert.deepEqual(validateGroundedResultWire(toWire(o.result)).errors, []);
});

test("never throws — even a totally broken transport yields a typed outcome", async () => {
  const broken: GroundTransport = async () => {
    throw { weird: "non-error throw" };
  };
  const o = await groundForDig("q", { transport: broken, nowIso: fixedNow });
  assert.equal(o.grounded, false);
});
