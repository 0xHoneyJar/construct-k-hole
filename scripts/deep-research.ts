/**
 * Deep Research Pipeline — Domain-Agnostic Expert Knowledge Extraction
 *
 * Multi-phase pipeline that discovers, searches, scrapes, and synthesizes
 * expert-level knowledge from the top 0.000001% of sources in any domain.
 *
 * Phases:
 * 1. DISCOVER  — Meta-research to identify highest-impact sub-domains
 * 2. SEARCH    — Gemini + Google Search grounding finds real sources per topic
 * 3. SCRAPE    — Firecrawl deep-extracts the highest-value URLs (optional)
 * 4. SYNTHESIZE — First-pass synthesis against focus areas
 * 5. GAP ANALYSIS — Identify unanswered questions
 * 6. FILL GAPS — Second round of grounded search on gaps
 * 7. FINAL MERGE — Exhaustive synthesis with all findings
 * 8. CROSS-TOPIC — Pattern extraction across all domains
 *
 * Usage:
 *   npx tsx scripts/deep-research.ts --config <name>
 *   npx tsx scripts/deep-research.ts --config <name> --topic <id>
 *   npx tsx scripts/deep-research.ts --config <name> --discover-only
 *   npx tsx scripts/deep-research.ts --config <name> --concurrency 4
 *   npx tsx scripts/deep-research.ts --config <name> --search-batch 6
 *   npx tsx scripts/deep-research.ts --config <name> --scrape-top 5
 *   npx tsx scripts/deep-research.ts --config <name> --interactive
 *   npx tsx scripts/deep-research.ts --config <name> --checkpoint
 *   npx tsx scripts/deep-research.ts --config <name> --fast
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync } from "fs";
import { join, basename } from "path";
import { createInterface } from "readline";

// ─── Config ─────────────────────────────────────────────────────

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
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
const GEMINI_KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "")
  .replace(/^["']|["']$/g, "").trim();
if (!GEMINI_KEY) {
  console.error("Missing GEMINI_API_KEY or GOOGLE_API_KEY in .env");
  process.exit(1);
}

const FIRECRAWL_KEY = (process.env.FIRECRAWL_API_KEY || "").replace(/^["']|["']$/g, "").trim();
const HAS_FIRECRAWL = !!FIRECRAWL_KEY;

mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── CLI Args ───────────────────────────────────────────────────

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

// Model configurable via --model flag or FORGE_MODEL env var
const MODEL_PRIMARY = getArg("model") || process.env.FORGE_MODEL || "gemini-3.1-pro-preview";

// Fallback chain for model deprecation resilience (quality-tier)
const FORGE_FALLBACK_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

let MODEL = MODEL_PRIMARY;

const CONFIG_NAME = getArg("config");
if (!CONFIG_NAME) {
  console.error("Usage: npx tsx scripts/deep-research.ts --config <name>");
  console.error("Example: npx tsx scripts/deep-research.ts --config animation");
  process.exit(1);
}

const SINGLE_TOPIC = getArg("topic");
const FAST_MODE = process.argv.includes("--fast");
const DISCOVER_ONLY = process.argv.includes("--discover-only");
const INTERACTIVE = process.argv.includes("--interactive");
const CHECKPOINT = process.argv.includes("--checkpoint");
const CLEAR_CHECKPOINTS = process.argv.includes("--clear-checkpoints");
const SEARCH_BATCH_SIZE = parseInt(getArg("search-batch") || (FAST_MODE ? "8" : "6"), 10);

// Interactive mode forces concurrency=1 to avoid stdin contention
const CONCURRENCY = INTERACTIVE
  ? 1
  : parseInt(getArg("concurrency") || (FAST_MODE ? "6" : "3"), 10);

if (INTERACTIVE && !process.stdin.isTTY) {
  console.error("Error: --interactive requires a TTY (cannot be piped or run in CI)");
  process.exit(1);
}
const SCRAPE_TOP_N = parseInt(getArg("scrape-top") || "5", 10);
const CHECKPOINT_DIR = join(OUTPUT_DIR, ".checkpoints", CONFIG_NAME);

// ─── Resonance Profile ──────────────────────────────────────────

interface ResonanceProfile {
  keywords: string[];
  references: string[];
  touchstones: string[];
  aesthetic: string;
}

const MAX_RESONANCE_SIZE = 50_000; // 50KB cap on resonance profile

function loadResonanceProfile(): ResonanceProfile | null {
  for (const dir of [join(SCRIPT_DIR, ".."), SCRIPT_DIR]) {
    for (const name of ["resonance-profile.yaml", "resonance-profile.yml", "taste.md"]) {
      const p = join(dir, name);
      if (!existsSync(p)) continue;
      try {
        const raw = readFileSync(p, "utf-8").slice(0, MAX_RESONANCE_SIZE);
        // Simple YAML-like parser — supports: key: value, - list items, # comments
        const profile: ResonanceProfile = { keywords: [], references: [], touchstones: [], aesthetic: "" };
        const validKeys = new Set<string>(["keywords", "references", "touchstones", "aesthetic"]);
        let currentKey = "";
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const keyMatch = line.match(/^(\w+):\s*(.*)$/);
          if (keyMatch) {
            currentKey = validKeys.has(keyMatch[1]) ? keyMatch[1] : "";
            if (currentKey === "aesthetic" && keyMatch[2]) {
              profile.aesthetic = keyMatch[2].trim().replace(/^["']|["']$/g, "");
            }
            continue;
          }
          const listMatch = line.match(/^\s*-\s+(.+)$/);
          if (listMatch && currentKey && currentKey !== "aesthetic") {
            const value = listMatch[1].trim().replace(/^["']|["']$/g, "");
            (profile[currentKey as "keywords" | "references" | "touchstones"]).push(value);
          }
        }
        // For taste.md, use entire content as aesthetic (capped)
        if (name === "taste.md") {
          profile.aesthetic = raw.slice(0, 2000);
        }
        log("CONFIG", `Loaded resonance profile from ${name}`);
        return profile;
      } catch (err) {
        log("WARN", `Failed to load resonance profile ${name}: ${String(err).slice(0, 100)}`);
      }
    }
  }
  return null;
}

const RESONANCE = loadResonanceProfile();

function resonanceContext(): string {
  if (!RESONANCE) return "";
  const parts: string[] = ["\n## Resonance Profile (weight these connections prominently)"];
  if (RESONANCE.aesthetic) parts.push(`Aesthetic sensibility: ${RESONANCE.aesthetic}`);
  if (RESONANCE.keywords.length) parts.push(`Keywords that resonate: ${RESONANCE.keywords.join(", ")}`);
  if (RESONANCE.references.length) parts.push(`Reference works: ${RESONANCE.references.join(", ")}`);
  if (RESONANCE.touchstones.length) parts.push(`Domain touchstones: ${RESONANCE.touchstones.join(", ")}`);
  parts.push("Surface findings that connect to these aesthetic/conceptual anchors. Weight resonant connections prominently in the synthesis.");
  return parts.join("\n");
}

// ─── Interactive Prompt ──────────────────────────────────────────

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function interactiveCheckpoint(phase: string, summary: string): Promise<{ action: "continue" | "skip" | "add"; extra?: string }> {
  if (!INTERACTIVE) return { action: "continue" };

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  CHECKPOINT: ${phase}`);
  console.log(`${"─".repeat(60)}`);
  console.log(summary);
  console.log(`\nOptions:`);
  console.log(`  [enter]  Continue to next phase`);
  console.log(`  s        Skip remaining topics`);
  console.log(`  a        Add a follow-up query (go deeper on something)`);
  console.log(`${"─".repeat(60)}`);

  const answer = await prompt("→ ");

  if (answer.toLowerCase() === "s") return { action: "skip" };
  if (answer.toLowerCase().startsWith("a")) {
    const extra = answer.length > 2 ? answer.slice(2).trim() : await prompt("What to explore deeper? → ");
    return { action: "add", extra };
  }
  return { action: "continue" };
}

// ─── Checkpoint Save/Resume ──────────────────────────────────────

function sanitizeId(id: string): string {
  return basename(id).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function saveCheckpoint(topicId: string, data: unknown) {
  if (!CHECKPOINT) return;
  mkdirSync(CHECKPOINT_DIR, { recursive: true });
  const target = join(CHECKPOINT_DIR, `${sanitizeId(topicId)}.json`);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, target); // atomic on most filesystems
  log("CKPT", `Saved checkpoint for ${topicId}`);
}

function loadCheckpoint(topicId: string): Record<string, unknown> | null {
  if (!CHECKPOINT) return null;
  const p = join(CHECKPOINT_DIR, `${sanitizeId(topicId)}.json`);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf-8"));
    log("CKPT", `Resuming ${topicId} from checkpoint`);
    return data;
  } catch {
    log("WARN", `Corrupt checkpoint for ${topicId} — deleting and re-running`);
    try { rmSync(p); } catch { /* ignore cleanup failure */ }
    return null;
  }
}

function clearCheckpoints() {
  if (existsSync(CHECKPOINT_DIR)) {
    rmSync(CHECKPOINT_DIR, { recursive: true });
    log("CKPT", `Cleared checkpoints for ${CONFIG_NAME}`);
  }
}

// ─── Load Research Config ───────────────────────────────────────

interface DiscoveryQuery {
  id: string;
  query: string;
}

interface Topic {
  id: string;
  name: string;
  searchQueries: string[];
  focusAreas: string[];
}

interface ResearchConfig {
  DISCOVERY_QUERIES: DiscoveryQuery[];
  TOPICS: Topic[];
  SYNTHESIS_CONTEXT: string;
}

async function loadConfig(): Promise<ResearchConfig> {
  const configPath = join(SCRIPT_DIR, `research-config-${CONFIG_NAME}.ts`);
  if (!existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    console.error(`Create scripts/research-config-${CONFIG_NAME}.ts first.`);
    console.error(`Use /config to generate one, or copy scripts/templates/research-config.template.ts`);
    process.exit(1);
  }
  return import(configPath) as Promise<ResearchConfig>;
}

// ─── Gemini API ─────────────────────────────────────────────────

interface GeminiResponse {
  text: string;
  sources: { title: string; uri: string }[];
}

type GeminiCallResult =
  | { status: "success"; response: GeminiResponse }
  | { status: "model_not_found"; error: string }
  | { status: "error"; error: string };

function isModelNotFound(status: number, body: string): boolean {
  if (status !== 404) return false;
  const lower = body.toLowerCase();
  return lower.includes("not_found") || lower.includes("not found")
    || lower.includes("deprecated") || lower.includes("is not available");
}

async function geminiDirect(
  model: string,
  prompt: string,
  opts?: {
    search?: boolean;
    maxTokens?: number;
    temperature?: number;
    retries?: number;
  },
): Promise<GeminiCallResult> {
  const { search = false, maxTokens = 8192, temperature = 0.7, retries = 3 } = opts ?? {};
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature },
  };

  if (search) {
    body.tools = [{ google_search: {} }];
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

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
          if (attempt < retries) {
            const wait = (attempt + 1) * 4000 + Math.random() * 3000;
            log("RETRY", `${res.status} — waiting ${(wait / 1000).toFixed(1)}s (attempt ${attempt + 1}/${retries})`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
        }

        return { status: "error", error: `Gemini ${res.status}: ${errText.slice(0, 300)}` };
      }

      const data = await res.json();
      const cand = data.candidates?.[0];

      // Safety block or empty response
      if (!cand || !cand.content?.parts?.length) {
        const reason = cand?.finishReason || "NO_CANDIDATES";
        if (reason === "SAFETY" || reason === "RECITATION") {
          log("WARN", `Response blocked (${reason}), retrying...`);
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          return { status: "success", response: { text: `[Search blocked by safety filter: ${reason}]`, sources: [] } };
        }
        return { status: "error", error: `No candidates (finishReason: ${reason})` };
      }

      const text =
        cand.content.parts
          .filter((p: { text?: string }) => p.text)
          .map((p: { text: string }) => p.text)
          .join("\n") ?? "";

      if (!text.trim()) {
        if (attempt < retries) {
          log("WARN", "Empty response, retrying...");
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return { status: "success", response: { text: "[Empty response from model]", sources: [] } };
      }

      const sources = (cand.groundingMetadata?.groundingChunks ?? []).map(
        (c: { web?: { title?: string; uri?: string } }) => ({
          title: c.web?.title ?? "?",
          uri: c.web?.uri ?? "",
        }),
      );

      return { status: "success", response: { text, sources } };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        log("RETRY", "Request timed out (120s)");
      }
      if (attempt < retries) {
        const wait = (attempt + 1) * 4000;
        log("RETRY", `Error — waiting ${wait / 1000}s: ${String(err).slice(0, 100)}`);
        await new Promise((r) => setTimeout(r, wait));
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
    retries?: number;
  },
): Promise<GeminiResponse> {
  const modelsToTry = [MODEL, ...FORGE_FALLBACK_MODELS.filter(m => m !== MODEL)];
  let lastError = "";

  for (const model of modelsToTry) {
    if (model !== modelsToTry[0]) {
      log("INFO", `Trying fallback model: ${model}`);
    }

    const result = await geminiDirect(model, prompt, opts);

    if (result.status === "success") {
      if (model !== MODEL) {
        MODEL = model; // Sticky for rest of session
        log("INFO", `Fell back to ${model} (sticky for this session)`);
      }
      return result.response;
    }

    lastError = result.error;

    if (result.status === "model_not_found") {
      log("WARN", `Model ${model} not found, continuing fallback chain...`);
      continue;
    }

    // Transient error after retries exhausted — also try next model
    log("WARN", `Model ${model} failed (${result.error.slice(0, 80)}), trying next...`);
  }

  throw new Error(`All models failed. Last error: ${lastError}. Tried: ${modelsToTry.join(", ")}`);
}

// ─── Firecrawl API (Optional Deep Scraping) ─────────────────────

interface ScrapeResult {
  url: string;
  title: string;
  content: string;
}

async function firecrawlScrape(url: string): Promise<ScrapeResult | null> {
  if (!HAS_FIRECRAWL) return null;

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FIRECRAWL_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000,
      }),
    });

    if (!res.ok) {
      log("SCRAPE", `Failed ${res.status} for ${url}`);
      return null;
    }

    const data = await res.json();
    const doc = data.data;
    if (!doc) return null;

    return {
      url,
      title: doc.metadata?.title ?? url,
      content: (doc.markdown ?? "").slice(0, 15000), // Cap to avoid token overflow
    };
  } catch (err) {
    log("SCRAPE", `Error scraping ${url}: ${String(err).slice(0, 80)}`);
    return null;
  }
}

async function scrapeTopSources(
  sources: { title: string; uri: string }[],
  topN: number,
): Promise<ScrapeResult[]> {
  if (!HAS_FIRECRAWL || topN <= 0) return [];

  // Deduplicate and pick top N URLs
  const unique = [...new Map(sources.map((s) => [s.uri, s])).values()]
    .filter((s) => s.uri.startsWith("http"))
    .slice(0, topN);

  if (unique.length === 0) return [];

  log("SCRAPE", `Deep-scraping ${unique.length} URLs via Firecrawl...`);

  const results = await parallelMap(
    unique,
    async (source) => {
      const result = await firecrawlScrape(source.uri);
      if (result) {
        log("SCRAPE", `OK: ${source.title.slice(0, 50)}`);
      }
      return result;
    },
    3, // Firecrawl concurrency
  );

  return results.filter((r): r is ScrapeResult => r !== null);
}

// ─── Logging ────────────────────────────────────────────────────

const startTime = Date.now();

function log(stage: string, msg: string) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`  [${elapsed.padStart(4)}s] ${stage.padEnd(10)} ${msg}`);
}

// ─── Parallel Runner with Concurrency Limit ─────────────────────

async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Phase 1: Topic Discovery ───────────────────────────────────

async function runDiscovery(config: ResearchConfig): Promise<string> {
  console.log("\n=== Phase 1: Topic Discovery ===\n");
  console.log(
    `Running ${config.DISCOVERY_QUERIES.length} grounded searches (concurrency: ${SEARCH_BATCH_SIZE})...\n`,
  );

  // Run all discovery queries in parallel
  const allFindings: { id: string; text: string; sources: { title: string; uri: string }[] }[] = [];

  const results = await parallelMap(
    config.DISCOVERY_QUERIES,
    async (q) => {
      log("SEARCH", q.id);
      const result = await gemini(q.query, { search: true, maxTokens: 4096 });
      log("DONE", `${q.id} — ${result.sources.length} sources`);
      return { id: q.id, ...result };
    },
    SEARCH_BATCH_SIZE,
  );

  allFindings.push(...results);

  const allSources = allFindings.flatMap((f) => f.sources);
  const uniqueSources = [...new Map(allSources.map((s) => [s.uri, s])).values()];

  // Optional: deep-scrape top discovery sources
  const scraped = await scrapeTopSources(uniqueSources, Math.min(SCRAPE_TOP_N, 3));

  console.log(
    `\nCollected ${allFindings.length} results, ${uniqueSources.length} unique sources${scraped.length > 0 ? `, ${scraped.length} deep-scraped` : ""}. Synthesizing...\n`,
  );

  const scrapedContext =
    scraped.length > 0
      ? `\n## Deep-Scraped Source Content\n\n${scraped.map((s) => `### ${s.title}\nURL: ${s.url}\n\n${s.content.slice(0, 5000)}`).join("\n\n---\n\n")}`
      : "";

  const synthesisPrompt = `You are a senior researcher synthesizing findings to identify the most impactful research domains.

## Context
${config.SYNTHESIS_CONTEXT}
${resonanceContext()}

## Your Task
Based on the research findings below, identify and rank the **6-8 most impactful research domains** for building deep expertise in this field.

## Fresh Research Findings
${allFindings.map((f) => `### ${f.id}\n${f.text}`).join("\n\n---\n\n")}
${scrapedContext}

## Sources Found (${uniqueSources.length} unique)
${uniqueSources.slice(0, 40).map((s) => `- ${s.title}: ${s.uri}`).join("\n")}

## Instructions
Produce a ranked list of research domains. For EACH domain:
1. **Domain name** — Clear, specific title
2. **Why it's high-ROI** — What specific improvement it unlocks
3. **What's currently missing** — Specific gaps
4. **Key practitioners** — Real names, real contributions
5. **Search queries** — 5-7 highly specific search queries
6. **Focus areas** — 3-6 specific technical questions to answer
7. **Expected output** — Concrete artifacts the research should produce

Rank by impact on practical expertise. Be extremely specific. Name real people, codebases, techniques.
Distinguish between trending hype and proven expert techniques.`;

  log("SYNTH", "Running topic synthesis...");
  const synthesis = await gemini(synthesisPrompt, { search: false, maxTokens: 8192, temperature: 0.4 });

  const date = new Date().toISOString().split("T")[0];
  const outputPath = join(OUTPUT_DIR, `${date}_${CONFIG_NAME}_topic-discovery.md`);

  const output = `# Topic Discovery: ${CONFIG_NAME} — Meta-Research Results

_Generated: ${date} | Model: ${MODEL} + Google Search${HAS_FIRECRAWL ? " + Firecrawl" : ""} | Config: ${CONFIG_NAME}_

${synthesis.text}

---

## Sources Consulted (${uniqueSources.length} unique)

${uniqueSources.map((s) => `- [${s.title}](${s.uri})`).join("\n")}

---

## Raw Research Summaries

${allFindings.map((f) => `### ${f.id}\n\n${f.text}\n\n_Sources: ${f.sources.length}_`).join("\n\n---\n\n")}
`;

  writeFileSync(outputPath, output);
  log("SAVED", outputPath);

  return outputPath;
}

// ─── Phase 2: Deep Research (Per Topic) ─────────────────────────

async function groundedSearch(topic: Topic): Promise<{
  findings: string[];
  allSources: { title: string; uri: string }[];
}> {
  log("SEARCH", `${topic.id} — ${topic.searchQueries.length} queries`);

  const findings: string[] = [];
  const allSources: { title: string; uri: string }[] = [];

  const results = await parallelMap(
    topic.searchQueries,
    async (query) => {
      const prompt = `Search for: "${query}"

Find specific, technical details from real sources. Focus on:
- Exact code patterns, implementation details, mathematical formulas
- Specific numeric values, thresholds, ratios, benchmarks
- Implementation details from engineering blogs, source code, conference talks
- What the top 0.000001% professionals specifically do differently from everyone else
- Named techniques, frameworks, libraries with version-specific details

Be thorough. Extract every actionable technical detail you find.
Prioritize practitioner content (engineering blogs, talks, source code) over tutorials and documentation.`;

      return gemini(prompt, { search: true, maxTokens: 4096 });
    },
    SEARCH_BATCH_SIZE,
  );

  for (const result of results) {
    findings.push(result.text);
    allSources.push(...result.sources);
  }

  log("SEARCH", `${topic.id} — ${findings.length} results, ${allSources.length} sources`);
  return { findings, allSources };
}

async function synthesize(
  topic: Topic,
  findings: string[],
  sources: { title: string; uri: string }[],
  scrapedContent: ScrapeResult[],
  context: string,
): Promise<string> {
  log("SYNTH", `${topic.id} — analyzing`);

  const sourceList = [...new Set(sources.map((s) => `- ${s.title}: ${s.uri}`))]
    .slice(0, 25)
    .join("\n");

  const scrapedSection =
    scrapedContent.length > 0
      ? `\n## Deep-Scraped Source Content (${scrapedContent.length} pages)\n\n${scrapedContent.map((s) => `### ${s.title}\nURL: ${s.url}\n\n${s.content.slice(0, 8000)}`).join("\n\n---\n\n")}`
      : "";

  const prompt = `You are a world-class researcher synthesizing findings into a comprehensive knowledge base.
Your goal is to capture the COMPLETE mental model that the top 0.000001% of practitioners use.

## Context
${context}
${resonanceContext()}

## Research Topic: ${topic.name}
Focus areas: ${topic.focusAreas.join(", ")}

## Raw Research Findings (from grounded search)
${findings.join("\n\n---\n\n")}
${scrapedSection}

## Sources Found
${sourceList}

## Your Task
Extract EVERYTHING of value. Write the definitive reference for this domain.

### Expert Mental Models & Decision Frameworks
- How do the top practitioners THINK about this? What is their decision-making process?
- What do they check FIRST when something goes wrong?
- What tradeoffs do they consciously make?

### Core Techniques (with exact implementation)
- Every technique mentioned, with complete code or step-by-step implementation
- The WHY behind each technique — what problem it solves, what it replaces
- Common mistakes and how experts avoid them

### Production Values & Thresholds
| Parameter | Value | Context | Why This Number |
|-----------|-------|---------|-----------------|

### Code Recipes (complete, production-ready)
Every recipe with: what it does, when to use it, what to watch out for.

### Amateur vs Professional Comparison
| Aspect | Amateur Approach | Professional Approach | Why It Matters |
|--------|-----------------|----------------------|----------------|

### Key Sources & Who to Learn From
- Most valuable sources and what they uniquely contribute
- Specific people to follow and what they are best at

Be EXHAUSTIVE. Every technique needs code, every value needs a number, every pattern needs an example.
This is a knowledge dump, not a summary. Completeness is the goal.`;

  const result = await gemini(prompt, { search: false, maxTokens: 8192, temperature: 0.3 });
  return result.text;
}

async function gapAnalysis(topic: Topic, synthesis: string): Promise<string[]> {
  log("GAPS", `${topic.id}`);

  const prompt = `Given this synthesis of research on "${topic.name}":

${synthesis.slice(0, 6000)}

And the focus areas we wanted to cover:
${topic.focusAreas.map((a) => `- ${a}`).join("\n")}

What specific technical questions remain UNANSWERED or INSUFFICIENTLY DETAILED?
Consider:
- Are there specific numbers, formulas, or code patterns still missing?
- Are there named practitioners or techniques mentioned but not explained in depth?
- Are there focus areas that got shallow treatment?
- Are there contradictions between sources that need resolution?

Generate 3-5 highly specific search queries that would fill the remaining gaps.
Return ONLY the search queries, one per line, no numbering or bullets.`;

  const result = await gemini(prompt, { search: false, maxTokens: 1024, temperature: 0.5 });
  return result.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 10 && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("*"));
}

async function fillGaps(gapQueries: string[]): Promise<string[]> {
  const results = await parallelMap(
    gapQueries,
    async (query) => {
      const prompt = `Search for: "${query}"
Find the most specific, technical, actionable details available.
Include exact code, formulas, numeric values, benchmarks.
Prioritize content from recognized practitioners over generic tutorials.
No vague descriptions — every finding must be actionable.`;
      return gemini(prompt, { search: true, maxTokens: 3072 });
    },
    gapQueries.length,
  );

  return results.map((r) => r.text);
}

async function finalSynthesis(
  topic: Topic,
  firstSynthesis: string,
  gapFindings: string[],
  context: string,
): Promise<string> {
  log("FINAL", `${topic.id} — merging`);

  const prompt = `You are producing the FINAL, DEFINITIVE research document for: "${topic.name}"

This document will become part of a permanent knowledge base used to build expert-level capability in this domain.
It must be so thorough that someone reading ONLY this document could replicate expert-level work.

## Context
${context}
${resonanceContext()}

## First Round Synthesis
${firstSynthesis}

## Gap-Filling Research (second round)
${gapFindings.join("\n\n---\n\n")}

## Instructions
Merge into a single, comprehensive, non-redundant document:

### Expert Mental Model
How do the top 0.000001% think about this domain? What is their decision framework?
What do they optimize for? What do they check when something goes wrong?

### Core Concepts (with full explanations)
Every key concept explained clearly enough that someone could understand AND implement it.
Include the WHY — not just what to do, but why it works and what problem it solves.

### Complete Code Recipes
Production-ready implementations. Each recipe must include:
- What it does and when to use it
- The complete code (not snippets — full implementations)
- Common pitfalls and how to avoid them

### Production Values & Reference Tables
Exact values, thresholds, ratios, benchmarks — everything numeric in table format.
Include the reasoning behind each number.

### Amateur vs Professional Comparison
| Aspect | Amateur Approach | Professional Approach | Why It Matters |

### Key People, Sources & Learning Path
Who to study, what they are known for, and the recommended order to learn concepts.

IMPORTANT: Be EXHAUSTIVE. This is a knowledge dump, not a summary.
Every technique, every value, every code pattern.
Remove redundancy but keep all unique information.
Length is correct — completeness is the goal.`;

  const result = await gemini(prompt, { search: false, maxTokens: 16384, temperature: 0.3 });
  return result.text;
}

async function researchTopic(topic: Topic, context: string): Promise<string> {
  // Check for existing checkpoint
  const cached = loadCheckpoint(topic.id) as { final?: string } | null;
  if (cached?.final) {
    log("CKPT", `${topic.id} — using cached result (${cached.final.length} chars)`);
    return cached.final;
  }

  const topicStart = Date.now();
  log("START", `${topic.id}: ${topic.name}`);

  // Stage 1: Grounded search
  const { findings, allSources } = await groundedSearch(topic);

  // Stage 2: Deep scrape top sources (if Firecrawl available)
  const scraped = await scrapeTopSources(allSources, SCRAPE_TOP_N);

  // Stage 3: First synthesis
  const synthesis = await synthesize(topic, findings, allSources, scraped, context);

  // Interactive checkpoint after first synthesis
  const checkpoint = await interactiveCheckpoint(
    `${topic.name} — First Synthesis`,
    `${synthesis.slice(0, 800)}...\n\n[${allSources.length} sources found, ${findings.length} search results]`,
  );

  if (checkpoint.action === "skip") {
    log("SKIP", `${topic.id} — user skipped gap-fill`);
    saveCheckpoint(topic.id, { final: synthesis });
    return synthesis;
  }

  // Stage 4: Gap analysis
  const gapQueries = await gapAnalysis(topic, synthesis);
  log("GAPS", `${topic.id} — ${gapQueries.length} gaps found`);

  // If user wants to add a query, inject it
  if (checkpoint.action === "add" && checkpoint.extra) {
    gapQueries.push(checkpoint.extra);
    log("ADD", `${topic.id} — added user query: ${checkpoint.extra.slice(0, 60)}`);
  }

  // Stage 5: Fill gaps
  log("FILL", `${topic.id} — ${gapQueries.length} gap queries`);
  const gapFindings = await fillGaps(gapQueries);

  // Stage 6: Final synthesis
  const final = await finalSynthesis(topic, synthesis, gapFindings, context);

  saveCheckpoint(topic.id, { final });

  const elapsed = ((Date.now() - topicStart) / 1000).toFixed(0);
  log("DONE", `${topic.id} — ${elapsed}s, ${final.length} chars`);

  return final;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  if (CLEAR_CHECKPOINTS) {
    clearCheckpoints();
    if (DISCOVER_ONLY || (!getArg("config"))) return;
  }

  const config = await loadConfig();
  const timestamp = new Date().toISOString().slice(0, 10);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Deep Research Pipeline — ${CONFIG_NAME}`);
  console.log(`  ${timestamp} | Model: ${MODEL}`);
  console.log(`  Search: Gemini + Google Search grounding`);
  console.log(`  Scraping: ${HAS_FIRECRAWL ? `Firecrawl (top ${SCRAPE_TOP_N} URLs/topic)` : "Disabled (no FIRECRAWL_API_KEY)"}`);
  console.log(`  Concurrency: ${CONCURRENCY} topics | ${SEARCH_BATCH_SIZE} queries${FAST_MODE ? " (fast mode)" : ""}`);
  console.log(`  Interactive: ${INTERACTIVE ? "ON" : "OFF"} | Checkpoint: ${CHECKPOINT ? "ON" : "OFF"}`);
  if (RESONANCE) console.log(`  Resonance: loaded (${RESONANCE.keywords.length} keywords, ${RESONANCE.references.length} refs)`);
  console.log(`${"=".repeat(60)}\n`);

  // Phase 1: Discovery
  const discoveryPath = await runDiscovery(config);
  console.log(`\nDiscovery saved: ${discoveryPath}`);

  if (DISCOVER_ONLY) {
    console.log("\n--discover-only flag set. Stopping after discovery.");
    return;
  }

  // Interactive checkpoint after discovery — user can skip or note a direction to explore
  const discoveryCheckpoint = await interactiveCheckpoint(
    "Discovery Complete",
    `Discovery saved to ${discoveryPath}\nTopics configured: ${config.TOPICS.map((t) => t.id).join(", ")}\n\nReady to start deep research on ${config.TOPICS.length} topics.\n\nTip: use "a <query>" to add an extra exploration direction to all topics.`,
  );

  if (discoveryCheckpoint.action === "skip") {
    console.log("\nStopping after discovery (user choice).");
    return;
  }

  // If user added a direction at discovery, inject it into all topics' search queries
  if (discoveryCheckpoint.action === "add" && discoveryCheckpoint.extra) {
    for (const topic of config.TOPICS) {
      topic.searchQueries.push(discoveryCheckpoint.extra);
    }
    log("ADD", `Injected user query into all ${config.TOPICS.length} topics: ${discoveryCheckpoint.extra.slice(0, 60)}`);
  }

  // Phase 2: Deep research on all topics (in parallel)
  const topicsToRun = SINGLE_TOPIC
    ? config.TOPICS.filter((t) => t.id === SINGLE_TOPIC)
    : config.TOPICS;

  if (topicsToRun.length === 0) {
    console.error(
      `Topic "${SINGLE_TOPIC}" not found. Available: ${config.TOPICS.map((t) => t.id).join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `\n=== Phase 2: Deep Research — ${topicsToRun.length} topics (concurrency: ${CONCURRENCY}) ===\n`,
  );

  const topicResults = await parallelMap(
    topicsToRun,
    async (topic) => {
      const result = await researchTopic(topic, config.SYNTHESIS_CONTEXT);

      const filename = `${timestamp}_${CONFIG_NAME}_${topic.id}_deep.md`;
      const filepath = join(OUTPUT_DIR, filename);
      writeFileSync(
        filepath,
        `# ${topic.name} — Deep Research\n\n_Generated: ${timestamp} | Model: ${MODEL} + Google Search${HAS_FIRECRAWL ? " + Firecrawl" : ""} | Config: ${CONFIG_NAME}_\n\n${result}`,
      );
      log("SAVED", filename);

      return { topic, result, filename };
    },
    CONCURRENCY,
  );

  // Phase 3: Cross-topic synthesis
  console.log(`\n=== Phase 3: Cross-Topic Synthesis ===\n`);

  const crossPrompt = `You are synthesizing ${topicResults.length} deep research reports into a unified knowledge base.

## Context
${config.SYNTHESIS_CONTEXT}

## Individual Topic Reports (summaries)

${topicResults.map((r) => `### ${r.topic.name}\n${r.result.slice(0, 3000)}\n`).join("\n---\n\n")}

## Task
Create a UNIFIED SYNTHESIS that:

1. **Cross-cutting patterns** — What techniques, principles, or mental models appear across multiple domains?
2. **Implementation order** — What should be learned/built first, second, third? What are the dependencies?
3. **Highest-impact findings** — The top 10 most impactful discoveries across all topics
4. **Knowledge gaps remaining** — What wasn't fully answered and deserves further research?
5. **Practitioner map** — Who are the key people across all domains and what's their specific contribution?

Be concrete and actionable. Reference specific techniques from the individual reports.
This synthesis should serve as the executive summary and roadmap for applying all the research.`;

  log("SYNTH", "Cross-topic synthesis...");
  const crossSynthesis = await gemini(crossPrompt, {
    search: false,
    maxTokens: 12000,
    temperature: 0.3,
  });

  const summaryPath = join(OUTPUT_DIR, `${timestamp}_${CONFIG_NAME}_synthesis.md`);
  writeFileSync(
    summaryPath,
    `# ${CONFIG_NAME} — Cross-Topic Research Synthesis

_Generated: ${timestamp} | Model: ${MODEL} | Config: ${CONFIG_NAME}_
_Topics: ${topicResults.map((r) => r.topic.id).join(", ")}_

${crossSynthesis.text}

---

## Individual Reports

${topicResults.map((r) => `- \`${r.filename}\` — ${r.topic.name}`).join("\n")}
`,
  );

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const totalSources = topicResults.reduce(
    (acc, r) => acc + (r.result.match(/http/g) || []).length,
    0,
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  COMPLETE — ${totalElapsed}s total`);
  console.log(`  ${topicResults.length} topic reports + 1 cross-topic synthesis`);
  console.log(`  ~${totalSources} source references`);
  console.log(`  Output: ${OUTPUT_DIR}/`);
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
