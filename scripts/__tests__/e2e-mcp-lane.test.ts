/**
 * E2E — MCP lane positive path with REAL web data (S2.T3 / #21).
 *
 * The session has no reachable grounding provider (Exa key absent, Executor OAuth
 * pending, Gemini creds dead), so the network transport is the ONE substitution — the
 * DATA below is a real web-search result set (Berachain PoL, captured 2026-07-06) and the
 * code path is the production one: transport → ground() → groundForDig() → groundedToSearch().
 * This proves the migration's data path end-to-end: real sources normalize into the contract,
 * pass the fail-closed guard, and map into dig-search's {sources,webSearchQueries} shape.
 *
 * The negative/fallback path (DIG_LANE=mcp → degrade → Gemini fallback → graceful structured
 * error) was proven separately through the real dig-search binary (E2E-2, run log).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ground, groundForDig, isGrounded, type GroundTransport } from "../lib/grounding.js";
import { groundedToSearch } from "../lib/grounding-to-search.js";
import { validateGroundedResultWire, toWire } from "../lib/contract/index.js";

// Real web-search results (captured 2026-07-06). This is the ONLY substitution for the
// unreachable live provider — everything downstream is the production code path.
const REAL_RESULTS = [
  { title: "What is Berachain and Proof of Liquidity? | Fireblocks", url: "https://www.fireblocks.com/blog/what-is-berachain-and-proof-of-liquidity", snippet: "PoL extends PoS to incentivize DeFi liquidity over asset lockup." },
  { title: "What Is BeraChain and Proof of Liquidity? | CoinGecko", url: "https://www.coingecko.com/learn/what-is-berachain-crypto-proof-of-liquidity", snippet: "Validator weight is determined by BGT delegation." },
  { title: "What is Proof of Liquidity? - Berachain", url: "https://docs.berachain.com/learn/what-is-proof-of-liquidity", snippet: "Security by liquidity: securing the chain by providing liquidity." },
  { title: "Berachain's Proof-of-Liquidity: Explained", url: "https://chorus.one/articles/berachains-proof-of-liquidity-explained", snippet: "Tri-token model: BERA gas, BGT governance, HONEY stablecoin." },
];

const realTransport: GroundTransport = async (q) => ({
  text: "Berachain uses Proof-of-Liquidity (PoL), extending PoS with liquidity-based security.",
  citations: REAL_RESULTS,
  executedQueries: [q],
});

test("E2E: real web results → schema-valid grounded MCP-lane result", async () => {
  const r = await ground("Berachain proof of liquidity", {
    runtime: "exa:direct",
    transport: realTransport,
  });
  assert.ok(r.ok, "grounding should succeed on real data");
  if (!r.ok) return;
  assert.equal(r.grounded.lane, "mcp");
  assert.equal(r.grounded.groundingProvenance, "exa");
  assert.equal(r.grounded.citations.length, 4);
  // real, parseable, unique URLs
  assert.equal(r.grounded.quality.citationUrlsParseable, true);
  assert.equal(r.grounded.quality.citationUrlsUnique, true);
  assert.ok(r.grounded.citations.every((c) => c.url.startsWith("https://")));
  assert.deepEqual(validateGroundedResultWire(toWire(r.grounded)).errors, []);
});

test("E2E: groundForDig reports grounded:true and passes the isGrounded guard on real data", async () => {
  const o = await groundForDig("Berachain proof of liquidity", { transport: realTransport });
  assert.equal(o.grounded, true);
  assert.equal(isGrounded(o.result), true);
});

test("E2E: real grounded result maps into dig-search's search shape with real sources", async () => {
  const o = await groundForDig("Berachain proof of liquidity", { transport: realTransport });
  const search = groundedToSearch(o.result);
  assert.equal(search.sources.length, 4);
  // real provenance flows all the way to dig-search's consumed shape
  assert.ok(search.sources.some((s) => s.uri.includes("docs.berachain.com")));
  assert.ok(search.sources.every((s) => s.uri.startsWith("https://") && s.title.length > 0));
  assert.deepEqual(search.webSearchQueries, ["Berachain proof of liquidity"]);
});
