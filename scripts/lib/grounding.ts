/**
 * MCP lane — external-tooling grounding (SDD §1.4, §3.1, FR-3).
 *
 * One `ground()` interface, two runtimes behind it:
 *   - "exa:direct"        — baseline (ship first): call Exa search directly.
 *   - "executor:code-mode" — primary as it proves out: dispatch a sandboxed code-mode
 *                            job to Executor MCP that runs the search and returns citations.
 *
 * Both normalize into the ONE GroundedResult contract with lane:"mcp". A provider swap
 * changes only a transport here — never the contract, never the four scripts. That is the
 * seam that ends the transport churn (Gemini-direct → OpenRouter → Executor).
 *
 * Fail-closed (feeds FR-5): transport failure / empty / malformed all return a typed
 * error, never a silently-empty "success".
 */
import {
  type Citation,
  type GroundedResult,
  type GroundingProvenance,
  type ErrorCode,
} from "./contract/index.js";

export type GroundingRuntime = "exa:direct" | "executor:code-mode";

export type GroundOutcome =
  | { ok: true; grounded: GroundedResult }
  | { ok: false; error: { code: ErrorCode; message: string; retryable: boolean } };

/** Normalized transport response — each runtime's transport returns this shape. */
export interface RawGrounding {
  /** Synthesized answer text, if the runtime produced one (Exa can return contents). */
  text?: string;
  citations: Array<{ title?: string; url?: string; snippet?: string; publisher?: string | null }>;
  executedQueries?: string[];
}

export type GroundTransport = (query: string, opts: GroundOpts) => Promise<RawGrounding>;

export interface GroundOpts {
  runtime?: GroundingRuntime;
  numResults?: number;
  /** Injectable transport (tests + custom runtimes). Overrides the built-in for `runtime`. */
  transport?: GroundTransport;
  /** Exa key for the exa:direct baseline; falls back to EXA_API_KEY env. */
  apiKey?: string;
  /** Executor MCP endpoint for code-mode; falls back to EXECUTOR_MCP_URL env. */
  executorUrl?: string;
  nowIso?: () => string;
}

const PROVENANCE: Record<GroundingRuntime, GroundingProvenance> = {
  "exa:direct": "exa",
  "executor:code-mode": "executor",
};

function normalizeCitations(raw: RawGrounding["citations"]): Citation[] {
  return raw
    .filter((c) => c && (c.url || c.title))
    .map((c) => ({
      title: String(c.title ?? ""),
      url: String(c.url ?? ""),
      snippet: String(c.snippet ?? ""),
      publisher: c.publisher ?? undefined,
      snippetChars: (c.snippet ?? "").length,
    }));
}

function urlsParseable(cites: Citation[]): boolean {
  return cites.every((c) => {
    try {
      new URL(c.url);
      return true;
    } catch {
      return false;
    }
  });
}

function urlsUnique(cites: Citation[]): boolean {
  return new Set(cites.map((c) => c.url)).size === cites.length;
}

// ── built-in transports ─────────────────────────────────────────────────────

/** exa:direct — POST Exa /search with contents. Requires an Exa key. */
export const exaDirectTransport: GroundTransport = async (query, opts) => {
  const key = opts.apiKey ?? process.env.EXA_API_KEY;
  if (!key) throw new GroundingError("INVALID_CONFIG", "EXA_API_KEY not set for exa:direct");
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      query,
      numResults: opts.numResults ?? 8,
      contents: { text: { maxCharacters: 1200 } },
    }),
  });
  if (!res.ok) throw new GroundingError(res.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE", `exa ${res.status}`);
  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const citations = (data.results ?? []).map((r) => ({
    title: r.title as string | undefined,
    url: r.url as string | undefined,
    snippet: (r.text as string | undefined) ?? (r.snippet as string | undefined),
    publisher: (r.author as string | undefined) ?? null,
  }));
  return { citations, executedQueries: [query] };
};

/**
 * executor:code-mode — dispatch a sandboxed job to Executor MCP that runs the search.
 * The Executor HTTP contract is confirmed at the S2.T3 live gate; this transport POSTs the
 * code-mode request and expects a { citations, text? } result. Behind the same interface,
 * so promoting it over exa:direct is a one-line default flip.
 */
export const executorCodeModeTransport: GroundTransport = async (query, opts) => {
  const url = opts.executorUrl ?? process.env.EXECUTOR_MCP_URL;
  if (!url) throw new GroundingError("INVALID_CONFIG", "EXECUTOR_MCP_URL not set for executor:code-mode");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "code", tool: "exa_search", input: { query, numResults: opts.numResults ?? 8 } }),
  });
  if (!res.ok) throw new GroundingError(res.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE", `executor ${res.status}`);
  const data = (await res.json()) as { citations?: RawGrounding["citations"]; text?: string };
  return { citations: data.citations ?? [], text: data.text, executedQueries: [query] };
};

export class GroundingError extends Error {
  constructor(public code: ErrorCode, message: string, public retryable = false) {
    super(message);
  }
}

function pickTransport(runtime: GroundingRuntime, opts: GroundOpts): GroundTransport {
  if (opts.transport) return opts.transport;
  return runtime === "executor:code-mode" ? executorCodeModeTransport : exaDirectTransport;
}

/**
 * Ground a query via the MCP lane. Returns a typed outcome — fail-closed: an empty or
 * malformed grounding is an error, not a silent empty success.
 */
export async function ground(query: string, opts: GroundOpts = {}): Promise<GroundOutcome> {
  const runtime = opts.runtime ?? "exa:direct";
  const nowIso = opts.nowIso ?? (() => new Date().toISOString());
  const start = Date.now();
  let raw: RawGrounding;
  try {
    raw = await pickTransport(runtime, opts)(query, opts);
  } catch (e) {
    if (e instanceof GroundingError) {
      return { ok: false, error: { code: e.code, message: e.message, retryable: e.retryable } };
    }
    return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: String(e), retryable: true } };
  }

  const citations = normalizeCitations(raw.citations);
  if (citations.length === 0) {
    return { ok: false, error: { code: "GROUNDING_EMPTY", message: `no citations from ${runtime}`, retryable: false } };
  }

  const text = raw.text ?? "";
  const grounded: GroundedResult = {
    text,
    citations,
    executedQueries: raw.executedQueries ?? [query],
    groundingProvenance: PROVENANCE[runtime],
    groundedRuntime: runtime,
    lane: "mcp",
    retrievedAt: nowIso(),
    latencyMs: Math.max(0, Date.now() - start),
    quality: {
      citationCount: citations.length,
      executedQueryCount: (raw.executedQueries ?? [query]).length,
      textChars: text.length,
      citationUrlsParseable: urlsParseable(citations),
      citationUrlsUnique: urlsUnique(citations),
      coverageEstimate: Math.min(1, citations.length / (opts.numResults ?? 8)),
    },
  };
  return { ok: true, grounded };
}

// ── fail-closed /dig path (S2.T2, FR-5, SDD §3.4) ───────────────────────────
// The in-session /dig consumer replaces WebSearch; grounding the agent in reality is
// the whole point. So a grounding failure must NEVER be presented as a grounded answer.
// groundForDig() always returns a typed outcome: on failure it yields a DEGRADED marker
// (grounded:false, extra.degraded:true, empty citations) that downstream must render as
// "grounding unavailable — not grounded", not silently continue with model-only text.

export interface DigGroundOutcome {
  /** true only when real citations were retrieved. Callers MUST branch on this. */
  grounded: boolean;
  result: GroundedResult;
  reason?: string;
  errorCode?: ErrorCode;
}

function degradedMarker(query: string, reason: string, code: ErrorCode, nowIso: () => string): GroundedResult {
  return {
    text: "",
    citations: [],
    executedQueries: [query],
    groundingProvenance: "none",
    groundedRuntime: "degraded",
    lane: "mcp",
    retrievedAt: nowIso(),
    latencyMs: 0,
    quality: {
      citationCount: 0,
      executedQueryCount: 1,
      textChars: 0,
      citationUrlsParseable: true,
      citationUrlsUnique: true,
      coverageEstimate: 0,
    },
    extra: { degraded: true, reason, error_code: code },
  };
}

/**
 * Ground for the in-session /dig path, fail-closed. Never throws, never returns
 * non-grounded text as if grounded. On any grounding failure the outcome is
 * `{ grounded: false, result: <degraded marker> }`.
 */
export async function groundForDig(query: string, opts: GroundOpts = {}): Promise<DigGroundOutcome> {
  const nowIso = opts.nowIso ?? (() => new Date().toISOString());
  const outcome = await ground(query, opts);
  if (outcome.ok) {
    return { grounded: true, result: outcome.grounded };
  }
  // `in`-guard narrows the union under the repo's non-strict tsc flags too.
  const err = "error" in outcome ? outcome.error : { code: "PROVIDER_UNAVAILABLE" as const, message: "unknown", retryable: false };
  return {
    grounded: false,
    reason: err.message,
    errorCode: err.code,
    result: degradedMarker(query, err.message, err.code, nowIso),
  };
}

/** Guard: true if a result is a real grounded answer (not the degraded marker). */
export function isGrounded(r: GroundedResult): boolean {
  return r.groundingProvenance !== "none" && r.citations.length > 0 && r.extra?.degraded !== true;
}
