/**
 * Adapter: GroundedResult (MCP lane) → dig-search's internal search shape (S3.T1, FR-6).
 *
 * dig-search's router speaks {text, sources:{title,uri}[], supports, webSearchQueries}.
 * The MCP lane emits the GroundedResult contract. This pure mapping lets dig-search consume
 * the MCP lane behind a flag WITHOUT changing its downstream (SearchResult, envelope loop,
 * streaming) — the migration is additive, not a rewrite. Pure + unit-tested so the wiring
 * is verifiable without a live provider.
 */
import { type GroundedResult } from "./contract/index.js";

export interface SearchShape {
  text: string;
  sources: { title: string; uri: string }[];
  supports: { text: string; sourceIndices: number[] }[];
  webSearchQueries: string[];
}

export function groundedToSearch(g: GroundedResult): SearchShape {
  return {
    text: g.text,
    sources: g.citations.map((c) => ({ title: c.title, uri: c.url })),
    supports: [], // MCP lane doesn't emit per-span support offsets; kept for shape parity.
    webSearchQueries: g.executedQueries,
  };
}
