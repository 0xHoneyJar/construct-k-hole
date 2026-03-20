/**
 * Visual Dig — K-Hole perceptive exploration tool
 *
 * Combines Gemini multimodal analysis with grounded web research.
 * Feed it an image (render, screenshot, reference) and a creative brief,
 * and it returns: visual critique + relevant web research + synthesis.
 *
 * The creative director loop:
 *   1. Gemini SEES the image (multimodal vision)
 *   2. Gemini RESEARCHES techniques to improve it (grounded search)
 *   3. Gemini SYNTHESIZES actionable shader/code recommendations
 *
 * Usage:
 *   npx tsx scripts/visual-dig.ts --image render.png --brief "make this look like UE5 stylized water"
 *   npx tsx scripts/visual-dig.ts --image render.png --reference ref.png --brief "match this reference"
 *   npx tsx scripts/visual-dig.ts --help
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname, extname, basename } from "path";
import { fileURLToPath } from "url";
import {
  loadEnvFile,
  resolveCredential,
  resolveOutputDir,
  progress,
  output,
  fatal,
} from "./lib/construct-runtime.ts";

// ── Config ──────────────────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

loadEnvFile(SCRIPT_DIR);

const GEMINI_KEY = resolveCredential("GEMINI_API_KEY", "GOOGLE_API_KEY");
if (!GEMINI_KEY) {
  fatal("Missing GEMINI_API_KEY or GOOGLE_API_KEY", {
    hint: "Get a key at https://aistudio.google.com/apikey",
  });
}

const OUTPUT_DIR = resolveOutputDir(SCRIPT_DIR, "k-hole");

const MODEL = process.env.VISUAL_DIG_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const API = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}`;

let activeModel = MODEL;

// ── CLI ──────────────────────────────────────────────────────────────────────

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

if (hasFlag("help")) {
  output({
    usage: "npx tsx scripts/visual-dig.ts --image <path> [options]",
    options: {
      "--image": "Path to image to analyze (required)",
      "--reference": "Path to reference image for comparison",
      "--brief": "Creative brief — what you want to achieve (default: general analysis)",
      "--model": `Gemini model override (default: ${MODEL})`,
      "--help": "Show this help",
    },
    pipeline: {
      step_1: "SEE — Gemini multimodal vision scores the image across creative dimensions",
      step_2: "RESEARCH — grounded web search for GLSL/shader techniques matching the brief",
      step_3: "SYNTHESIZE — actionable shader modifications with working code",
    },
    output_format: {
      analysis: "string — visual critique with scored dimensions",
      research: "string — grounded web findings (truncated)",
      synthesis: "string — 3-5 shader modifications with GLSL code",
      brief: "string — the creative brief",
      image: "string — input image path",
    },
  });
  process.exit(0);
}

const imagePath = getArg("image");
const refPath = getArg("reference");
const brief = getArg("brief") || "Analyze this render and suggest improvements";
const modelOverride = getArg("model");

if (modelOverride) {
  activeModel = modelOverride;
}

if (!imagePath || !existsSync(imagePath)) {
  fatal("Usage: npx tsx scripts/visual-dig.ts --image <path> --brief <text>", {
    hint: "Run with --help for all options",
  });
}

// ── Image Loading ────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function img64(p: string) {
  const ext = extname(p).toLowerCase();
  const mime = MIME_MAP[ext] || "image/png";
  return { mime_type: mime, data: readFileSync(p).toString("base64") };
}

// ── Gemini Helpers ───────────────────────────────────────────────────────────

function isModelNotFound(status: number, body: string): boolean {
  if (status !== 404) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("not_found") ||
    lower.includes("not found") ||
    lower.includes("deprecated") ||
    lower.includes("is not available")
  );
}

async function callWithFallback(
  parts: any[],
  sys?: string,
): Promise<string> {
  const models = [activeModel, ...FALLBACK_MODELS.filter(m => m !== activeModel)];

  for (const model of models) {
    const body: any = {
      contents: [{ parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    };
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };

    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);

      try {
        const r = await fetch(`${API(model)}:generateContent?key=${GEMINI_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!r.ok) {
          const errText = await r.text();
          if (isModelNotFound(r.status, errText)) {
            progress("fallback", `${model} unavailable, trying next...`);
            break; // try next model
          }
          if (r.status === 429 || r.status >= 500) {
            if (attempt < 2) {
              const wait = (attempt + 1) * 3000 + Math.random() * 2000;
              progress("retry", `Attempt ${attempt + 1}/3 after ${r.status}...`);
              await new Promise(resolve => setTimeout(resolve, wait));
              continue;
            }
          }
          throw new Error(`Gemini ${r.status}: ${errText.slice(0, 200)}`);
        }

        const text = ((await r.json()) as any).candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) {
          activeModel = model;
          return text;
        }

        if (attempt < 2) {
          progress("retry", `Empty response, retrying (${attempt + 1}/3)...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      } catch (err: unknown) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === "AbortError") {
          if (attempt < 2) {
            progress("retry", `Timeout, retrying (${attempt + 1}/3)...`);
            continue;
          }
        }
        if (attempt < 2) {
          progress("retry", `Error, retrying (${attempt + 1}/3)...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw err;
      }
    }
  }

  fatal("All models exhausted", { tried: models });
  throw new Error("unreachable"); // satisfy TS
}

async function search(query: string): Promise<string> {
  const models = [activeModel, ...FALLBACK_MODELS.filter(m => m !== activeModel)];

  for (const model of models) {
    const body = {
      contents: [{ parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    };

    try {
      const r = await fetch(`${API(model)}:generateContent?key=${GEMINI_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const errText = await r.text();
        if (isModelNotFound(r.status, errText)) {
          progress("fallback", `${model} unavailable for search, trying next...`);
          continue;
        }
        throw new Error(`Search ${r.status}: ${errText.slice(0, 200)}`);
      }

      const text = ((await r.json()) as any).candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .filter(Boolean)
        .join("\n") ?? "";
      if (text) return text;
    } catch {
      progress("fallback", `${model} search failed, trying next...`);
      continue;
    }
  }

  return "(search returned no results)";
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  progress("start", `Visual Dig`);
  progress("start", `Image: ${basename(imagePath!)}`);
  if (refPath) progress("start", `Reference: ${basename(refPath)}`);
  progress("start", `Brief: ${brief}`);
  progress("start", `Model: ${activeModel}`);

  const parts: any[] = [{ inline_data: img64(imagePath!) }];
  if (refPath && existsSync(refPath)) {
    parts.push({ inline_data: img64(refPath) });
    progress("load", `Reference loaded: ${basename(refPath)}`);
  }

  // Step 1: See
  progress("see", "Step 1: Visual analysis...");
  parts.push({
    text: `Analyze this render as a creative director for a stylized game (Ghibli/Arcane quality bar). Brief: ${brief}. Score 0-10: material quality, noise visibility, Fresnel/rim, color richness, illustrative style, overall. Then list specific gaps with GLSL technique names.`,
  });
  const analysis = await callWithFallback(
    parts,
    "World-class technical art director. Precise GLSL feedback. Compare against UE5/Arcane/Hearthstone standards.",
  );

  // Step 2: Research
  progress("research", "Step 2: Grounded web search...");
  const research = await search(
    `GLSL shader techniques for: ${brief}. Based on analysis: "${analysis.slice(0, 400)}..." Find code examples, Three.js/R3F implementations, technique breakdowns.`,
  );

  // Step 3: Synthesize
  progress("synthesize", "Step 3: Synthesis...");
  const synthesis = await callWithFallback(
    [{
      text: `Analysis:\n${analysis}\n\nResearch:\n${research}\n\nGive 3-5 specific shader modifications with working GLSL code. Each: what to change, why, code snippet.`,
    }],
    "Shader engineer. Every recommendation includes working GLSL code.",
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  progress("done", `Visual Dig complete in ${elapsed}s`);

  // Save to research-output
  const outPath = join(OUTPUT_DIR, `visual-dig-${Date.now()}.json`);
  const result = {
    timestamp: new Date().toISOString(),
    image: basename(imagePath!),
    reference: refPath ? basename(refPath) : null,
    brief,
    model: activeModel,
    duration_s: parseFloat(elapsed),
    analysis,
    research: research.slice(0, 3000),
    synthesis,
  };
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  progress("save", `Report: ${outPath}`);

  output(result);
}

main().catch((err) => {
  fatal("Unexpected error", { detail: String(err) });
});
