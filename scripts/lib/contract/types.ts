/**
 * Grounded-result contract — camelCase TS surface (SDD §3.1, FR-1).
 *
 * Harvested from loa feat/khole-hounfour-framework@1c123a16 and adapted for
 * k-hole Phase 2's two-lane model (issue #21):
 *   - `groundingProvenance` gains "executor"
 *   - `lane` distinguishes the cheval (internal-model) vs mcp (external-tooling) lane
 *
 * The wire format is snake_case (see schemas/grounded-result-v1.json). Both lanes
 * normalize into this one interface — the harmonizing seam that lets a provider swap
 * touch only a lane adapter, never the four scripts. Field parity between this
 * interface and the JSON schema is enforced by scripts/__tests__/contract.test.ts.
 */

/** Shared contract version. Must match schemas + `cheval --capabilities` (SDD §3.3). */
export const CONTRACT_VERSION = "1.0";

/** Where the grounding came from. "executor"/"exa" are the Phase-2 MCP lane. */
export type GroundingProvenance =
  | "google_search"
  | "exa"
  | "executor"
  | "native"
  | "none";

/** Which lane produced the result (Phase 2). */
export type GroundedLane = "cheval" | "mcp";

/** Single citation from grounded search. */
export interface Citation {
  title: string;
  url: string;
  snippet: string;
  publisher?: string | null;
  snippetChars?: number;
  rank?: number | null;
  extra?: Record<string, unknown>;
}

/** Quality signals computed at parse time; the shim surfaces, tests assert. */
export interface GroundedQuality {
  citationCount: number;
  executedQueryCount: number;
  textChars: number;
  citationUrlsParseable: boolean;
  citationUrlsUnique: boolean;
  coverageEstimate: number;
  reachabilityChecked?: boolean;
  reachabilityReachableRatio?: number | null;
}

/** Provider-agnostic grounded-search result. Both lanes emit this. */
export interface GroundedResult {
  text: string;
  citations: Citation[];
  executedQueries: string[];
  groundingProvenance: GroundingProvenance;
  /** e.g. "exa:direct" | "executor:code-mode" | "gemini:native" | "cheval:<model>". */
  groundedRuntime: string;
  /** Phase 2: which lane produced this. Optional for wire-compat with v1.0 producers. */
  lane?: GroundedLane;
  /** ISO 8601 UTC. */
  retrievedAt: string;
  latencyMs: number;
  quality: GroundedQuality;
  extra?: Record<string, unknown>;
}

/** Error envelope codes (schemas/error-v1.json). Enum extensions ADD only. */
export type ErrorCode =
  | "INVALID_INPUT"
  | "INVALID_CONFIG"
  | "NATIVE_RUNTIME_REQUIRED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "RETRIES_EXHAUSTED"
  | "BUDGET_EXCEEDED"
  | "CONTEXT_TOO_LARGE"
  | "PAYLOAD_TOO_LARGE"
  | "GROUNDING_EMPTY"
  | "GROUNDING_MALFORMED"
  | "PROVIDER_FAILOVER_EXHAUSTED"
  | "GOVERNANCE_MISSING"
  | "GOVERNANCE_CONTENT_REJECTED"
  | "GOVERNANCE_CONSENT_MISSING";

export interface ErrorEnvelope {
  ok: false;
  schemaVersion?: string;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    provider?: string;
    attempt?: number;
    chain?: Array<{ provider?: string; code?: string; attempt?: number }>;
  };
}

// ── camelCase ↔ snake_case wire conversion ────────────────────────────────
// The wire (cheval.py stdin/stdout, vendored schemas) is snake_case; the TS
// surface is camelCase. These are the single crossing point.

type Wire = Record<string, unknown>;

function citationToWire(c: Citation): Wire {
  const w: Wire = { title: c.title, url: c.url, snippet: c.snippet };
  if (c.publisher !== undefined) w.publisher = c.publisher;
  if (c.snippetChars !== undefined) w.snippet_chars = c.snippetChars;
  if (c.rank !== undefined) w.rank = c.rank;
  if (c.extra !== undefined) w.extra = c.extra;
  return w;
}

function citationFromWire(w: Wire): Citation {
  return {
    title: String(w.title ?? ""),
    url: String(w.url ?? ""),
    snippet: String(w.snippet ?? ""),
    publisher: (w.publisher as string | null | undefined) ?? undefined,
    snippetChars: (w.snippet_chars as number | undefined) ?? undefined,
    rank: (w.rank as number | null | undefined) ?? undefined,
    extra: (w.extra as Record<string, unknown> | undefined) ?? undefined,
  };
}

function qualityToWire(q: GroundedQuality): Wire {
  const w: Wire = {
    citation_count: q.citationCount,
    executed_query_count: q.executedQueryCount,
    text_chars: q.textChars,
    citation_urls_parseable: q.citationUrlsParseable,
    citation_urls_unique: q.citationUrlsUnique,
    coverage_estimate: q.coverageEstimate,
  };
  if (q.reachabilityChecked !== undefined) w.reachability_checked = q.reachabilityChecked;
  if (q.reachabilityReachableRatio !== undefined)
    w.reachability_reachable_ratio = q.reachabilityReachableRatio;
  return w;
}

function qualityFromWire(w: Wire): GroundedQuality {
  return {
    citationCount: Number(w.citation_count ?? 0),
    executedQueryCount: Number(w.executed_query_count ?? 0),
    textChars: Number(w.text_chars ?? 0),
    citationUrlsParseable: Boolean(w.citation_urls_parseable),
    citationUrlsUnique: Boolean(w.citation_urls_unique),
    coverageEstimate: Number(w.coverage_estimate ?? 0),
    reachabilityChecked: (w.reachability_checked as boolean | undefined) ?? undefined,
    reachabilityReachableRatio:
      (w.reachability_reachable_ratio as number | null | undefined) ?? undefined,
  };
}

/** GroundedResult → snake_case wire object (schema-shaped). */
export function toWire(r: GroundedResult): Wire {
  const w: Wire = {
    text: r.text,
    citations: r.citations.map(citationToWire),
    executed_queries: r.executedQueries,
    grounding_provenance: r.groundingProvenance,
    grounded_runtime: r.groundedRuntime,
    retrieved_at: r.retrievedAt,
    latency_ms: r.latencyMs,
    quality: qualityToWire(r.quality),
  };
  if (r.lane !== undefined) w.lane = r.lane;
  if (r.extra !== undefined) w.extra = r.extra;
  return w;
}

/** snake_case wire object → GroundedResult. */
export function fromWire(w: Wire): GroundedResult {
  return {
    text: String(w.text ?? ""),
    citations: Array.isArray(w.citations) ? (w.citations as Wire[]).map(citationFromWire) : [],
    executedQueries: Array.isArray(w.executed_queries) ? (w.executed_queries as string[]) : [],
    groundingProvenance: (w.grounding_provenance as GroundingProvenance) ?? "none",
    groundedRuntime: String(w.grounded_runtime ?? ""),
    lane: (w.lane as GroundedLane | undefined) ?? undefined,
    retrievedAt: String(w.retrieved_at ?? ""),
    latencyMs: Number(w.latency_ms ?? 0),
    quality: qualityFromWire((w.quality as Wire) ?? {}),
    extra: (w.extra as Record<string, unknown> | undefined) ?? undefined,
  };
}
