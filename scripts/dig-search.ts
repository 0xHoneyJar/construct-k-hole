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
 *   npx tsx scripts/dig-search.ts --query "your thread" --model gemini-2.5-pro
 *
 * Output: JSON to stdout (findings, sources, pull threads)
 * Side effect: appends to dig session trail file
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  appendFileSync,
} from "fs";
import { join } from "path";

// ─── Config ─────────────────────────────────────────────────────

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const OUTPUT_DIR = join(SCRIPT_DIR, "research-output");

// Load .env from project root or script directory
for (const envDir of [join(SCRIPT_DIR, ".."), SCRIPT_DIR]) {
  const envPath = join(envDir, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const match = line.match(/^(\w+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
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
  Math.max(parseInt(getArg("depth") || "2", 10), 1),
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
        if (attempt < 2) {
          process.stderr.write(`[dig] Empty response, retrying...\n`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return { status: "success", response: { text: "[Empty response from model]", sources: [] } };
      }

      const sources = (
        cand.groundingMetadata?.groundingChunks ?? []
      ).map((c: { web?: { title?: string; uri?: string } }) => ({
        title: c.web?.title ?? "?",
        uri: c.web?.uri ?? "",
      }));

      return { status: "success", response: { text, sources } };
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
  const candidates = [
    RESONANCE_PATH,
    join(SCRIPT_DIR, "..", "resonance-profile.yaml"),
    join(SCRIPT_DIR, "..", "resonance-profile.yml"),
    join(process.cwd(), "resonance-profile.yaml"),
    join(process.cwd(), "resonance-profile.yml"),
    join(process.cwd(), "taste.md"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (existsSync(p)) {
      return readFileSync(p, "utf-8");
    }
  }
  return null;
}

// ─── Trail Context ───────────────────────────────────────────────

function loadTrail(): string | null {
  if (!TRAIL_PATH || !existsSync(TRAIL_PATH)) return null;
  const content = readFileSync(TRAIL_PATH, "utf-8");
  // Keep context manageable — last 4000 chars
  return content.length > 4000 ? content.slice(-4000) : content;
}

// ─── Search Query Generation ─────────────────────────────────────

function buildSearchQueries(thread: string, depth: number): string[] {
  const queries: string[] = [];

  // Primary: direct grounded search on the thread
  queries.push(
    [
      `Expert analysis and practitioner insights on: ${thread}.`,
      `Find specific people, projects, techniques, and source material`,
      `from the top practitioners in this domain.`,
      `Prioritize conference talks, engineering blogs, academic papers,`,
      `and source code over tutorials and listicles.`,
    ].join(" ")
  );

  if (depth >= 2) {
    // Secondary: cross-domain connections and adjacent fields
    queries.push(
      [
        `Unexpected connections and adjacent domains related to: ${thread}.`,
        `Look for structural parallels in other fields,`,
        `cross-disciplinary insights, and practitioners who approach`,
        `this from non-obvious angles. Find the lateral connections`,
        `that someone deep in this domain might miss.`,
      ].join(" ")
    );
  }

  if (depth >= 3) {
    // Tertiary: historical depth and philosophical roots
    queries.push(
      [
        `Historical origins, philosophical foundations, and evolution of: ${thread}.`,
        `Who were the earliest practitioners? What were the foundational`,
        `ideas? How has thinking about this changed over time?`,
        `What was the context that made this idea emerge?`,
      ].join(" ")
    );
  }

  if (depth >= 4) {
    // Quaternary: contrarian and critical perspectives
    queries.push(
      [
        `Critical perspectives, limitations, and contrarian views on: ${thread}.`,
        `What are the strongest arguments against the mainstream view?`,
        `Where does the conventional wisdom break down?`,
        `What do practitioners who left this field say about why?`,
      ].join(" ")
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

  const prompt = [
    `You are a depth-first research synthesizer. Merge grounded search results into a focused synthesis with pull threads for deeper exploration.`,
    ``,
    `## Thread: ${thread}`,
    resonanceBlock,
    trailBlock,
    ``,
    `## Search Results`,
    ...searches.map(
      (s, i) => `### Search ${i + 1}\n${s.text}`
    ),
    ``,
    `## Instructions`,
    `Produce a synthesis in this exact structure:`,
    ``,
    `### Findings`,
    `Merge results into a coherent narrative. Lead with the most interesting discovery.`,
    `Name specific people, projects, artifacts. If something connects to a resonance`,
    `anchor, name the connection: "this echoes [anchor] because..."`,
    `Keep it focused — 3-4 paragraphs max.`,
    ``,
    `### Pull Threads`,
    `3-5 specific sub-topics worth following deeper. Each must be:`,
    `- Specific enough to search on directly (not a vague topic header)`,
    `- Accompanied by WHY it has pull — what connection it reveals`,
    `- Framed as a question or concept, not a task`,
    ``,
    `### Emergence`,
    `If you notice patterns across findings (or across previous digs), name them.`,
    `Not as conclusions — as observations. Skip this section if nothing emerges yet.`,
    ``,
    `Be concise. This is for conversational flow, not a report.`,
    `If something is genuinely interesting, say so.`,
  ].join("\n");

  const result = await gemini(prompt, {
    search: false,
    maxTokens: 4096,
    temperature: 0.5,
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

  // Run grounded searches
  const queries = buildSearchQueries(QUERY, SEARCH_DEPTH);
  const searches: {
    query: string;
    text: string;
    sources: { title: string; uri: string }[];
  }[] = [];

  for (let i = 0; i < queries.length; i++) {
    process.stderr.write(
      `[dig] Search ${i + 1}/${queries.length}...\n`
    );
    const result = await gemini(queries[i], {
      search: true,
      maxTokens: 4096,
      temperature: 0.7,
    });
    searches.push({
      query: queries[i],
      text: result.text,
      sources: result.sources,
    });
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
  const synthesis = await synthesize(
    QUERY,
    searches,
    resonance,
    trail
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stderr.write(`[dig] Done in ${elapsed}s\n`);

  // Build trail entry
  const timestamp = new Date().toISOString();
  const date = timestamp.split("T")[0];
  const trailFile =
    TRAIL_PATH ||
    join(OUTPUT_DIR, `dig-session-${date}.md`);

  const trailEntry = [
    ``,
    `## Dig: ${QUERY}`,
    `_${timestamp} | ${uniqueSources.length} sources | ${elapsed}s_`,
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

  // Output JSON to stdout
  const output = {
    query: QUERY,
    synthesis,
    sources: uniqueSources.map((s) => ({
      title: s.title,
      url: s.uri,
    })),
    source_count: uniqueSources.length,
    search_count: searches.length,
    model: activeModel,
    model_primary: MODEL_PRIMARY,
    used_fallback: activeModel !== MODEL_PRIMARY,
    elapsed_seconds: parseFloat(elapsed),
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
