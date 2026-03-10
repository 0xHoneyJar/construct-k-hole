/**
 * Dig Search — Lightweight Gemini Grounded Search for /dig mode
 *
 * Single-query depth search for interactive pair-research.
 * Designed for conversational speed — returns in seconds, not minutes.
 *
 * Usage:
 *   npx tsx scripts/dig-search.ts --query "your thread"
 *   npx tsx scripts/dig-search.ts --query "your thread" --resonance path/to/profile.yaml
 *   npx tsx scripts/dig-search.ts --query "your thread" --trail path/to/trail.md
 *   npx tsx scripts/dig-search.ts --query "your thread" --depth 3
 *   npx tsx scripts/dig-search.ts --query "your thread" --depth 0 --trail path/to/trail.md
 *   npx tsx scripts/dig-search.ts --query "your thread" --model gemini-2.5-pro
 *
 * Output: JSON to stdout (findings, sources, pull threads)
 * Side effect: appends to dig session trail file
 */

import {
  readFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from "fs";
import { join, dirname, resolve, relative } from "path";
import { fileURLToPath } from "url";

// ─── Config ─────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(SCRIPT_DIR, "research-output");

// Load .env — walk up from script directory to filesystem root.
// Handles both standalone repos (.env one level up) and installed packs
// (.env at project root, many levels above .claude/constructs/packs/k-hole/scripts/).
function loadEnv() {
  let dir = SCRIPT_DIR;
  while (true) {
    const envPath = join(dir, ".env");
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf-8").split("\n")) {
        const match = line.match(/^(\w+)=(.*)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
        }
      }
      return;
    }
    const parent = join(dir, "..");
    if (parent === dir) return; // hit filesystem root
    dir = parent;
  }
}
loadEnv();

// Strip wrapping quotes — handles both .env parser output and shell-injected values
// where agents pass GOOGLE_API_KEY="$(grep ...)" with literal quotes leaking through
const GEMINI_KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
  .replace(/^["']|["']$/g, "").trim();
if (!GEMINI_KEY) {
  console.log(
    JSON.stringify({
      error: "Missing GEMINI_API_KEY or GOOGLE_API_KEY in .env",
      hint: "Get a key at https://aistudio.google.com/apikey",
    })
  );
  process.exit(1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── CLI Args ────────────────────────────────────────────────────

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const QUERY = getArg("query");
if (!QUERY) {
  console.log(
    JSON.stringify({
      error: 'Usage: npx tsx scripts/dig-search.ts --query "your thread"',
    })
  );
  process.exit(1);
}

const RESONANCE_PATH = getArg("resonance");
const TRAIL_PATH = getArg("trail");
const SEARCH_DEPTH = Math.min(
  Math.max(parseInt(getArg("depth") || "2", 10), 0),
  4
);
const MODEL_PRIMARY =
  getArg("model") || process.env.DIG_MODEL || "gemini-3-flash-preview";

// Fallback chain for model deprecation resilience (speed-tier)
const DIG_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

let activeModel = MODEL_PRIMARY;

// ─── Gemini API ──────────────────────────────────────────────────

interface GeminiResponse {
  text: string;
  sources: { title: string; uri: string }[];
  supports: { text: string; sourceIndices: number[] }[];
  webSearchQueries: string[];
}

type GeminiCallResult =
  | { status: "success"; response: GeminiResponse }
  | { status: "model_not_found"; error: string }
  | { status: "error"; error: string };

function isModelNotFound(status: number, body: string): boolean {
  if (status !== 404) return false;
  const lower = body.toLowerCase();
  // Gemini returns JSON with error.status or plain text — check both
  return lower.includes("not_found") || lower.includes("not found")
    || lower.includes("deprecated") || lower.includes("is not available");
}

async function geminiCall(
  model: string,
  prompt: string,
  opts?: {
    search?: boolean;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<GeminiCallResult> {
  const {
    search = false,
    maxTokens = 8192,
    temperature = 0.7,
  } = opts ?? {};

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };

  if (search) {
    body.tools = [{ google_search: {} }];
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Read body exactly once for error responses
      if (!res.ok) {
        const errText = await res.text();

        if (isModelNotFound(res.status, errText)) {
          return { status: "model_not_found", error: `${model}: ${errText.slice(0, 150)}` };
        }

        if (res.status === 429 || res.status >= 500) {
          if (attempt < 2) {
            const wait = (attempt + 1) * 3000 + Math.random() * 2000;
            process.stderr.write(
              `[dig] Retry ${attempt + 1}/3 after ${res.status}...\n`
            );
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
        }

        return { status: "error", error: `Gemini ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data = await res.json();
      const cand = data.candidates?.[0];

      // Safety block or empty response
      if (!cand || !cand.content?.parts?.length) {
        const reason = cand?.finishReason || "NO_CANDIDATES";
        if (reason === "SAFETY" || reason === "RECITATION") {
          process.stderr.write(
            `[dig] Response blocked (${reason}), retrying...\n`
          );
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          return { status: "success", response: { text: `[Search blocked by safety filter: ${reason}]`, sources: [], supports: [], webSearchQueries: [] } };
        }
        return { status: "error", error: `No candidates (finishReason: ${reason})` };
      }

      const text =
        cand.content.parts
          .filter((p: { text?: string }) => p.text)
          .map((p: { text: string }) => p.text)
          .join("\n") ?? "";

      if (!text.trim()) {
        if (attempt < 2) {
          process.stderr.write(`[dig] Empty response, retrying...\n`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return { status: "success", response: { text: "[Empty response from model]", sources: [], supports: [], webSearchQueries: [] } };
      }

      const sources = (
        cand.groundingMetadata?.groundingChunks ?? []
      ).map((c: { web?: { title?: string; uri?: string } }) => ({
        title: c.web?.title ?? "?",
        uri: c.web?.uri ?? "",
      }));

      const supports = (
        cand.groundingMetadata?.groundingSupports ?? []
      ).map((s: { segment?: { text?: string }; groundingChunkIndices?: number[] }) => ({
        text: s.segment?.text ?? "",
        sourceIndices: s.groundingChunkIndices ?? [],
      }));

      const webSearchQueries: string[] = cand.groundingMetadata?.webSearchQueries ?? [];

      return { status: "success", response: { text, sources, supports, webSearchQueries } };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        process.stderr.write(`[dig] Request timed out (60s), retrying...\n`);
      }
      if (attempt < 2) {
        await new Promise((r) =>
          setTimeout(r, (attempt + 1) * 3000)
        );
        continue;
      }
      return { status: "error", error: String(err) };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { status: "error", error: "Exhausted retries" };
}

async function gemini(
  prompt: string,
  opts?: {
    search?: boolean;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<GeminiResponse> {
  const modelsToTry = [activeModel, ...DIG_FALLBACK_MODELS.filter(m => m !== activeModel)];
  let lastError = "";

  for (const model of modelsToTry) {
    if (model !== modelsToTry[0]) {
      process.stderr.write(`[dig] Trying fallback model: ${model}...\n`);
    }

    const result = await geminiCall(model, prompt, opts);

    if (result.status === "success") {
      if (model !== activeModel) {
        activeModel = model; // Sticky for rest of session
        process.stderr.write(`[dig] Fell back to ${model} (sticky for this session)\n`);
      }
      return result.response;
    }

    lastError = result.error;

    if (result.status === "model_not_found") {
      process.stderr.write(`[dig] Model ${model} not found, continuing fallback chain...\n`);
      continue;
    }

    // Transient error after retries exhausted — also try next model
    process.stderr.write(`[dig] Model ${model} failed (${result.error.slice(0, 80)}), trying next...\n`);
  }

  throw new Error(`All models failed. Last error: ${lastError}. Tried: ${modelsToTry.join(", ")}`);
}

// ─── Resonance Profile ───────────────────────────────────────────

function loadResonance(): string | null {
  // If explicit path provided, use it directly
  if (RESONANCE_PATH && existsSync(RESONANCE_PATH)) {
    return readFileSync(RESONANCE_PATH, "utf-8");
  }

  // Walk up from script directory to find resonance profile at any level
  // (handles pack installs where project root is many levels up)
  const names = ["resonance-profile.yaml", "resonance-profile.yml", "taste.md"];
  let d = SCRIPT_DIR;
  while (true) {
    for (const name of names) {
      const p = join(d, name);
      if (existsSync(p)) return readFileSync(p, "utf-8");
    }
    const parent = join(d, "..");
    if (parent === d) break;
    d = parent;
  }
  return null;
}

// ─── Trail Context ───────────────────────────────────────────────

function loadTrail(): string | null {
  if (!TRAIL_PATH) return null;

  // Validate read path — must be a .md file inside research-output/
  const candidate = resolve(process.cwd(), TRAIL_PATH);
  const rel = relative(OUTPUT_DIR, candidate);
  if (!rel || rel.startsWith("..") || rel.includes(":") || !candidate.endsWith(".md")) {
    process.stderr.write(
      `[dig] Warning: --trail read path outside research-output/. Ignoring trail.\n`
    );
    return null;
  }

  if (!existsSync(candidate)) return null;
  const content = readFileSync(candidate, "utf-8");
  // Keep context manageable — last 4000 chars
  return content.length > 4000 ? content.slice(-4000) : content;
}

function resolveTrailPath(date: string): string {
  const defaultTrail = join(OUTPUT_DIR, `dig-session-${date}.md`);
  if (!TRAIL_PATH) return defaultTrail;

  const candidate = resolve(process.cwd(), TRAIL_PATH);
  // Allow writes to OUTPUT_DIR or any .md file under the construct root
  const rel = relative(OUTPUT_DIR, candidate);
  const insideOutput = rel && !rel.startsWith("..") && !rel.includes(":");

  if (!insideOutput || !candidate.endsWith(".md")) {
    process.stderr.write(
      `[dig] Warning: --trail path outside research-output/. Using default.\n`
    );
    return defaultTrail;
  }

  return candidate;
}

// ─── Phase-Dependent Temperature (Carhart) ──────────────────────
// REBUS model: high entropy early in descent, low entropy deep.
// Trail length is our proxy for how deep we are.

function synthesisTemperature(trail: string | null): number {
  if (!trail) return 0.7; // No trail = first dig, maximum entropy
  const len = trail.length;
  // Linear interpolation: 0 chars → 0.7, 4000 chars (max trail) → 0.2
  return Math.max(0.2, 0.7 - (len / 4000) * 0.5);
}

// ─── Depth Rating (Shulgin) ─────────────────────────────────────
// Heuristic −/±/+/++/+++ based on structural signals in synthesis.

function rateDepth(
  synthesis: string,
  sourceCount: number,
  hasEmergence: boolean
): string {
  let score = 0;
  // Named practitioners (proper nouns + verbs of creation)
  if (/[A-Z][a-z]+\s+(published|documented|built|created|designed|wrote|proposed)/i.test(synthesis)) score++;
  // Cross-domain connections
  if (/connects? to|echoes|parallels?|structural similarit/i.test(synthesis)) score++;
  // Emergence present and substantive
  if (hasEmergence) score++;
  // Source diversity
  if (sourceCount >= 5) score++;
  // Novel territory markers
  if (/no one has|underexplored|gap in|overlooked|contrarian/i.test(synthesis)) score++;

  const scale = ["\u2212", "\u00b1", "+", "++", "+++"];
  return scale[Math.min(score, 4)];
}

// ─── Synthesis Parser (Warburg + Nelson) ─────────────────────────
// Extract emergence and pull threads as first-class structured fields.

function parseSynthesis(text: string): {
  findings: string;
  pull_threads: string[];
  emergence: string | null;
} {
  // Extract ### Emergence section
  const emergenceMatch = text.match(/###\s*Emergence\s*\n([\s\S]*?)(?=###|$)/);
  const emergenceRaw = emergenceMatch?.[1]?.trim() || null;
  const emergence = emergenceRaw && emergenceRaw.length > 10 ? emergenceRaw : null;

  // Extract ### Pull Threads as array of searchable query strings
  const threadsMatch = text.match(/###\s*Pull Threads\s*\n([\s\S]*?)(?=###|$)/);
  const threadsRaw = threadsMatch?.[1]?.trim() || "";
  const pull_threads = threadsRaw
    .split(/\n/)
    .map(line => line.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim())
    .filter(line => line.length > 10)
    // Extract the searchable part before any " — " or " - " explanation
    .map(line => {
      const sep = line.match(/\s[\u2014\u2013-]\s/);
      return sep ? line.slice(0, sep.index).trim() : line;
    })
    .filter(Boolean);

  // Extract ### Findings
  const findingsMatch = text.match(/###\s*Findings\s*\n([\s\S]*?)(?=###|$)/);
  const findings = findingsMatch?.[1]?.trim() || text;

  return { findings, pull_threads, emergence };
}

// ─── Search Query Generation ─────────────────────────────────────

function buildSearchQueries(thread: string, depth: number): string[] {
  const queries: string[] = [];

  // Depth 1 (always): direct practitioner knowledge
  queries.push(
    `Who are the leading practitioners and researchers working on ${thread}, ` +
    `and what specific techniques, tools, or approaches have they documented? ` +
    `Include named individuals, published work, and engineering tradeoffs they discuss.`
  );

  if (depth >= 2) {
    // Depth 2: cross-domain structural parallels
    queries.push(
      `What fields outside of ${thread} share structural similarities or ` +
      `offer transferable techniques? Who are practitioners that bridge ` +
      `${thread} with adjacent domains, and what have they published about those connections?`
    );
  }

  if (depth >= 3) {
    // Depth 3: historical lineage and intellectual origins
    queries.push(
      `What are the historical origins and foundational ideas behind ${thread}? ` +
      `Who were the earliest practitioners, what problems were they solving, ` +
      `and how has the field's thinking evolved from its origins to now?`
    );
  }

  if (depth >= 4) {
    // Depth 4: critical and contrarian perspectives
    queries.push(
      `What are the strongest critiques, known limitations, and contrarian views on ${thread}? ` +
      `Where does conventional wisdom break down, and what do former practitioners ` +
      `say about why they moved on or changed approach?`
    );
  }

  return queries;
}

// ─── Synthesis ───────────────────────────────────────────────────

async function synthesize(
  thread: string,
  searches: { query: string; text: string; sources: { title: string; uri: string }[] }[],
  resonance: string | null,
  trail: string | null
): Promise<string> {
  const resonanceBlock = resonance
    ? `\n## Resonance Profile\nWeight connections to these anchors. When a finding connects, name the connection explicitly.\n\n${resonance}`
    : "";

  const trailBlock = trail
    ? `\n## Previous Digs (build on these, don't repeat)\n${trail}`
    : "";

  const searchBlock = searches.length > 0
    ? [`## Search Results`, ...searches.map((s, i) => `### Search ${i + 1}\n${s.text}`)].join("\n")
    : `No search results. Synthesize entirely from trail context and resonance anchors above.`;

  const prompt = [
    `Merge these inputs into a focused synthesis with pull threads for deeper exploration.`,
    ``,
    `## Thread: ${thread}`,
    resonanceBlock,
    trailBlock,
    ``,
    searchBlock,
    ``,
    `## Instructions`,
    `Produce a synthesis in this exact structure:`,
    ``,
    `### Findings`,
    `Lead with the most interesting discovery. Name specific people, projects, artifacts.`,
    `If something connects to a resonance anchor, name it: "this echoes [anchor] because..."`,
    `3-4 paragraphs max.`,
    ``,
    `### Pull Threads`,
    `3-5 specific sub-topics. Each line:`,
    `- A specific searchable phrase or question \u2014 then " \u2014 " then WHY it has pull`,
    ``,
    `### Emergence`,
    `Patterns across findings or previous digs. Observations, not conclusions.`,
    `Skip this section if nothing emerges yet.`,
  ].join("\n");

  const result = await gemini(prompt, {
    search: false,
    maxTokens: 4096,
    temperature: synthesisTemperature(trail),
  });

  return result.text;
}

// ─── Main ────────────────────────────────────────────────────────

async function dig() {
  const startTime = Date.now();
  const resonance = loadResonance();
  const trail = loadTrail();

  process.stderr.write(
    `[dig] Thread: "${QUERY}" | Depth: ${SEARCH_DEPTH} | Model: ${activeModel}\n`
  );
  if (resonance) process.stderr.write(`[dig] Resonance profile loaded\n`);
  if (trail) process.stderr.write(`[dig] Trail context loaded\n`);

  // Phase: Search (skip at depth 0 — Lilly's tank)
  type SearchResult = {
    query: string; text: string;
    sources: { title: string; uri: string }[];
    supports: { text: string; sourceIndices: number[] }[];
    webSearchQueries: string[];
  };
  let searches: SearchResult[] = [];

  if (SEARCH_DEPTH === 0) {
    process.stderr.write(`[dig] Depth 0: tank mode \u2014 synthesizing from trail + resonance only\n`);
  } else {
    const queries = buildSearchQueries(QUERY, SEARCH_DEPTH);
    process.stderr.write(`[dig] Running ${queries.length} search(es) in parallel...\n`);

    searches = await Promise.all(
      queries.map(async (query, i) => {
        const result = await gemini(query, {
          search: true,
          maxTokens: 4096,
          temperature: 0.0,
        });
        if (result.webSearchQueries.length) {
          process.stderr.write(`[dig] Search ${i + 1}: ${result.webSearchQueries.join(" | ")}\n`);
        }
        return {
          query,
          text: result.text,
          sources: result.sources,
          supports: result.supports,
          webSearchQueries: result.webSearchQueries,
        };
      })
    );
  }

  // Deduplicate sources
  const allSources = searches.flatMap((s) => s.sources);
  const uniqueSources = [
    ...new Map(allSources.map((s) => [s.uri, s])).values(),
  ].filter((s) => s.uri.startsWith("http"));

  process.stderr.write(
    `[dig] ${uniqueSources.length} unique sources found. Synthesizing...\n`
  );

  // Synthesize
  const synthesis = await synthesize(QUERY, searches, resonance, trail);

  // Parse structured fields (Warburg + Nelson + Shulgin)
  const parsed = parseSynthesis(synthesis);
  const depthRating = rateDepth(synthesis, uniqueSources.length, !!parsed.emergence);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Operational data to stderr (Nakamoto — clean stdout)
  process.stderr.write(
    `[dig] Done in ${elapsed}s | Model: ${activeModel}` +
    (activeModel !== MODEL_PRIMARY ? ` (fallback from ${MODEL_PRIMARY})` : ``) +
    ` | Depth rating: ${depthRating}\n`
  );

  // Build trail entry
  const timestamp = new Date().toISOString();
  const date = timestamp.split("T")[0];
  const trailFile = resolveTrailPath(date);

  const trailEntry = [
    ``,
    `## Dig: ${QUERY}`,
    `_${timestamp} | ${uniqueSources.length} sources | ${elapsed}s | depth: ${depthRating}_`,
    ``,
    synthesis,
    ``,
    `### Sources`,
    ...uniqueSources.map((s) => `- [${s.title}](${s.uri})`),
    ``,
    `---`,
    ``,
  ].join("\n");

  appendFileSync(trailFile, trailEntry);

  // Collect all web search queries Gemini actually executed
  const allWebSearchQueries = [...new Set(searches.flatMap((s) => s.webSearchQueries))];
  if (allWebSearchQueries.length) {
    process.stderr.write(`[dig] Gemini executed ${allWebSearchQueries.length} unique searches\n`);
  }

  // Output JSON to stdout — structured fields first, no operational noise
  const output = {
    query: QUERY,
    depth_rating: depthRating,
    findings: parsed.findings,
    emergence: parsed.emergence,
    pull_threads: parsed.pull_threads,
    synthesis,
    sources: uniqueSources.map((s) => ({
      title: s.title,
      url: s.uri,
    })),
    source_count: uniqueSources.length,
    search_count: searches.length,
    web_search_queries: allWebSearchQueries,
    had_resonance: !!resonance,
    had_trail: !!trail,
    trail_file: trailFile,
  };

  console.log(JSON.stringify(output, null, 2));
}

dig().catch((err) => {
  console.log(
    JSON.stringify({
      error: String(err),
      query: QUERY,
    })
  );
  process.exit(1);
});
