/**
 * Capability probe tests (S1.T3, FR-1). Fail-closed is the point: only an explicit,
 * version-matching manifest yields available:true. Everything else → available:false.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { probeCapabilities, _resetCapabilitiesCache, type ProbeDeps } from "../lib/capabilities.js";
import { CONTRACT_VERSION } from "../lib/contract/index.js";

const present = { exists: () => true } satisfies Pick<ProbeDeps, "exists">;

test("supported + version-matching manifest → available", async () => {
  _resetCapabilitiesCache();
  const deps: ProbeDeps = {
    ...present,
    run: async () => ({
      code: 0,
      stdout: JSON.stringify({
        schema_version: CONTRACT_VERSION,
        grounded_result: true,
        failover_chain: false,
        cost_log: false,
        governance_enforcement: false,
      }),
      stderr: "",
    }),
  };
  const r = await probeCapabilities(deps, true);
  assert.ok(r.available);
  if (!r.available) return;
  assert.equal(r.manifest.groundedResult, true);
  assert.equal(r.manifest.failoverChain, false);
});

test("fail-closed: --capabilities unsupported (diverged cheval, non-zero exit)", async () => {
  _resetCapabilitiesCache();
  const deps: ProbeDeps = {
    ...present,
    run: async () => ({ code: 2, stdout: "", stderr: "error: unrecognized arguments: --capabilities" }),
  };
  const r = await probeCapabilities(deps, true);
  assert.ok(!r.available);
  if (r.available) return;
  assert.match(r.reason, /unsupported/);
});

test("fail-closed: contract version mismatch", async () => {
  _resetCapabilitiesCache();
  const deps: ProbeDeps = {
    ...present,
    run: async () => ({ code: 0, stdout: JSON.stringify({ schema_version: "0.9", grounded_result: true }), stderr: "" }),
  };
  const r = await probeCapabilities(deps, true);
  assert.ok(!r.available);
  if (r.available) return;
  assert.match(r.reason, /version mismatch/);
});

test("fail-closed: model-invoke absent", async () => {
  _resetCapabilitiesCache();
  const r = await probeCapabilities({ exists: () => false }, true);
  assert.ok(!r.available);
});

test("fail-closed: malformed capabilities JSON", async () => {
  _resetCapabilitiesCache();
  const deps: ProbeDeps = { ...present, run: async () => ({ code: 0, stdout: "not json", stderr: "" }) };
  const r = await probeCapabilities(deps, true);
  assert.ok(!r.available);
});

test("result is cached across calls until force", async () => {
  _resetCapabilitiesCache();
  let calls = 0;
  const deps: ProbeDeps = {
    ...present,
    run: async () => {
      calls++;
      return { code: 2, stdout: "", stderr: "nope" };
    },
  };
  await probeCapabilities(deps, true);
  await probeCapabilities(deps); // cached
  assert.equal(calls, 1);
});
