/**
 * MCP-lane → search-shape mapping tests (S3.T1, FR-6). Verifies dig-search can consume
 * the MCP lane's GroundedResult without touching its downstream shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groundedToSearch } from "../lib/grounding-to-search.js";
import { ground, type GroundTransport } from "../lib/grounding.js";

test("maps citations → sources{title,uri} and executedQueries → webSearchQueries", async () => {
  const transport: GroundTransport = async (q) => ({
    text: "answer",
    citations: [
      { title: "Docs", url: "https://docs.example/a", snippet: "s1" },
      { title: "Blog", url: "https://blog.example/b", snippet: "s2" },
    ],
    executedQueries: [q, q + " deep"],
  });
  const r = await ground("berachain", { runtime: "exa:direct", transport });
  assert.ok(r.ok);
  if (!r.ok) return;
  const s = groundedToSearch(r.grounded);
  assert.equal(s.text, "answer");
  assert.deepEqual(s.sources, [
    { title: "Docs", uri: "https://docs.example/a" },
    { title: "Blog", uri: "https://blog.example/b" },
  ]);
  assert.deepEqual(s.webSearchQueries, ["berachain", "berachain deep"]);
  assert.deepEqual(s.supports, []);
});

test("shape parity: output has exactly the fields dig-search's GeminiResponse expects", async () => {
  const transport: GroundTransport = async () => ({
    citations: [{ title: "T", url: "https://t.io", snippet: "x" }],
  });
  const r = await ground("q", { transport });
  assert.ok(r.ok);
  if (!r.ok) return;
  const s = groundedToSearch(r.grounded);
  assert.deepEqual(Object.keys(s).sort(), ["sources", "supports", "text", "webSearchQueries"]);
});
