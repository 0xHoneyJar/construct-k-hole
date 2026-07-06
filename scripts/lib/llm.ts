/**
 * Cheval lane — internal-model inference shim (SDD §2.3, FR-2).
 *
 * k-hole stops carrying its own provider client. All model inference routes through
 * the repo's `model-invoke` (→ cheval.py), the same router every other Loa consumer
 * uses. The response normalizes into the one GroundedResult contract.
 *
 * model-invoke contract (verified against .claude/adapters/cheval.py):
 *   model-invoke --agent <name> --prompt <text> --output-format json --json-errors [--model m]
 *   success → JSON on stdout; error → error-v1 envelope on stderr; NATIVE_RUNTIME_REQUIRED
 *   exit when model-invoke / cheval is absent.
 *
 * Soft-fail (FR-2/NFR): if model-invoke is not on PATH, return a typed
 * NATIVE_RUNTIME_REQUIRED result — never crash. The `deps` seam makes this unit-testable
 * without a live model-invoke.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CONTRACT_VERSION,
  fromWire,
  validateGroundedResultWire,
  type ErrorCode,
  type GroundedResult,
} from "./contract/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo model-invoke: scripts/lib/ → repo root → .claude/scripts/model-invoke */
const DEFAULT_MODEL_INVOKE = join(HERE, "..", "..", ".claude", "scripts", "model-invoke");

export interface InvokeOpts {
  agent: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}
// Note (BB HIGH-2): the cheval lane is pure INFERENCE. External grounding is the MCP
// lane's job (scripts/lib/grounding.ts) — so this shim intentionally exposes no `tools`
// option. If cheval itself returns a `grounded` sub-object (a natively-grounding model),
// we still accept it below, but VALIDATED (BB HIGH-1), never trusted blindly.

export type InvokeResult =
  | { ok: true; grounded: GroundedResult }
  | { ok: false; error: { code: ErrorCode; message: string; retryable: boolean } };

/** Injectable process seam so tests don't need a live model-invoke. */
export interface InvokeDeps {
  modelInvokePath?: string;
  exists?: (p: string) => boolean;
  run?: (
    bin: string,
    args: string[],
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
}

function realRun(
  bin: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
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

function nowIso(): string {
  // Injected in tests via a fixed grounded fixture; real path uses wall clock.
  return new Date().toISOString();
}

function textToGrounded(content: string, model: string, latencyMs: number): GroundedResult {
  const textChars = content.length;
  return {
    text: content,
    citations: [],
    executedQueries: [],
    groundingProvenance: "none",
    groundedRuntime: `cheval:${model || "default"}`,
    lane: "cheval",
    retrievedAt: nowIso(),
    latencyMs,
    quality: {
      citationCount: 0,
      executedQueryCount: 0,
      textChars,
      citationUrlsParseable: true,
      citationUrlsUnique: true,
      coverageEstimate: 0,
    },
  };
}

function parseErrorEnvelope(stderr: string): { code: ErrorCode; message: string; retryable: boolean } | null {
  const trimmed = stderr.trim();
  if (!trimmed) return null;
  // error-v1 envelope may be the last JSON line on stderr.
  const line = trimmed.split("\n").reverse().find((l) => l.trim().startsWith("{"));
  if (!line) return null;
  try {
    const obj = JSON.parse(line);
    const err = obj.error ?? obj; // tolerate {error:{...}} or bare {code,message}
    if (err && typeof err.code === "string") {
      return {
        code: err.code as ErrorCode,
        message: String(err.message ?? "model-invoke error"),
        retryable: Boolean(err.retryable),
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Invoke an internal model via the cheval lane. Returns a typed result — never throws
 * for the "model-invoke absent" or "provider error" cases (fail-closed, FR-2).
 */
export async function invoke(opts: InvokeOpts, deps: InvokeDeps = {}): Promise<InvokeResult> {
  const bin = deps.modelInvokePath ?? DEFAULT_MODEL_INVOKE;
  const exists = deps.exists ?? existsSync;

  if (!exists(bin)) {
    return {
      ok: false,
      error: {
        code: "NATIVE_RUNTIME_REQUIRED",
        message: `model-invoke not found at ${bin}; cheval lane unavailable (contract ${CONTRACT_VERSION})`,
        retryable: false,
      },
    };
  }

  const args = [
    "--agent",
    opts.agent,
    "--prompt",
    opts.prompt,
    "--output-format",
    "json",
    "--json-errors",
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.maxTokens) args.push("--max-tokens", String(opts.maxTokens));

  const run = deps.run ?? realRun;
  const { code, stdout, stderr } = await run(bin, args);

  if (code !== 0) {
    const parsed = parseErrorEnvelope(stderr);
    return {
      ok: false,
      error: parsed ?? {
        code: "PROVIDER_UNAVAILABLE",
        message: `model-invoke exited ${code}: ${stderr.trim().slice(0, 200) || "no stderr"}`,
        retryable: code === 124, // timeout convention
      },
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      error: { code: "GROUNDING_MALFORMED", message: "model-invoke stdout was not valid JSON", retryable: false },
    };
  }

  // If cheval already produced a grounded sub-object (a natively-grounding model), accept
  // it — but VALIDATE against the contract first (BB HIGH-1). Fail closed on malformed
  // rather than coercing bad enums/missing fields into a GroundedResult.
  if (payload.grounded && typeof payload.grounded === "object") {
    const wire = payload.grounded as Record<string, unknown>;
    const v = validateGroundedResultWire(wire);
    if (!v.valid) {
      return {
        ok: false,
        error: { code: "GROUNDING_MALFORMED", message: `cheval grounded output invalid: ${v.errors[0]}`, retryable: false },
      };
    }
    const g = fromWire(wire);
    if (!g.lane) g.lane = "cheval";
    return { ok: true, grounded: g };
  }

  // Text-only cheval response → synthesize a lane-tagged GroundedResult.
  const content = String(payload.content ?? payload.text ?? "");
  const model = String(payload.model ?? opts.model ?? "");
  const latencyMs = Number(payload.latency_ms ?? 0);
  return { ok: true, grounded: textToGrounded(content, model, latencyMs) };
}
