/**
 * Capability probe (S1.T3, FR-1, SDD §3.3).
 *
 * k-hole reads `cheval --capabilities` once per process, caches it, and gates lane
 * availability on it. The manifest declares which lanes/features cheval can serve and
 * pins the shared CONTRACT_VERSION.
 *
 * FAIL-CLOSED (SDD §3.3): if cheval does not support `--capabilities` (older/diverged
 * cheval.py — the port of `cmd_capabilities` into .claude/adapters/cheval.py is a
 * separate framework-authorized change, System Zone), OR the reported schema_version
 * disagrees with CONTRACT_VERSION, the probe returns `available: false`. Callers must
 * treat an unavailable probe as "do not use this lane" rather than assuming capability.
 *
 * The Python side is intentionally NOT edited here (System Zone). This TS probe degrades
 * safely until that port lands, so Phase 2 is unblocked without touching framework files.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { CONTRACT_VERSION } from "./contract/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODEL_INVOKE = join(HERE, "..", "..", ".claude", "scripts", "model-invoke");

export interface CapabilityManifest {
  schemaVersion: string;
  groundedResult: boolean;
  failoverChain: boolean;
  costLog: boolean;
  governanceEnforcement: boolean;
}

export type ProbeResult =
  | { available: true; manifest: CapabilityManifest }
  | { available: false; reason: string };

export interface ProbeDeps {
  modelInvokePath?: string;
  exists?: (p: string) => boolean;
  run?: (bin: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
}

function realRun(bin: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: { toString(): string }) => (stdout += d.toString()));
    child.stderr.on("data", (d: { toString(): string }) => (stderr += d.toString()));
    child.on("error", () => resolve({ code: 127, stdout: "", stderr: "spawn failed" }));
    child.on("close", (code: number | null) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

let cached: ProbeResult | null = null;

/** Probe cheval capabilities. Cached after first call; pass `force` to re-probe. */
export async function probeCapabilities(deps: ProbeDeps = {}, force = false): Promise<ProbeResult> {
  if (cached && !force) return cached;

  const bin = deps.modelInvokePath ?? DEFAULT_MODEL_INVOKE;
  const exists = deps.exists ?? existsSync;

  if (!exists(bin)) {
    cached = { available: false, reason: `model-invoke not found at ${bin}` };
    return cached;
  }

  const run = deps.run ?? realRun;
  const { code, stdout, stderr } = await run(bin, ["--capabilities"]);

  // Unsupported flag (diverged cheval.py) → argparse exits non-zero. Fail closed.
  if (code !== 0) {
    cached = {
      available: false,
      reason: `cheval --capabilities unsupported (exit ${code}): ${stderr.trim().slice(0, 120) || "no stderr"}`,
    };
    return cached;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(stdout);
  } catch {
    cached = { available: false, reason: "capabilities output was not valid JSON" };
    return cached;
  }

  const schemaVersion = String(payload.schema_version ?? "");
  if (schemaVersion !== CONTRACT_VERSION) {
    cached = {
      available: false,
      reason: `contract version mismatch: cheval='${schemaVersion}' shim='${CONTRACT_VERSION}'`,
    };
    return cached;
  }

  cached = {
    available: true,
    manifest: {
      schemaVersion,
      groundedResult: Boolean(payload.grounded_result),
      failoverChain: Boolean(payload.failover_chain),
      costLog: Boolean(payload.cost_log),
      governanceEnforcement: Boolean(payload.governance_enforcement),
    },
  };
  return cached;
}

/** Test/reset seam — clears the process-lifetime cache. */
export function _resetCapabilitiesCache(): void {
  cached = null;
}
