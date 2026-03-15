/**
 * Visual Review — Gemini Multimodal Image Analysis for /dig mode
 *
 * Compares renders against reference images, analyzes composition,
 * palette, and visual quality. Gives K-Hole eyes.
 *
 * Usage:
 *   npx tsx scripts/visual-review.ts --image path/to/render.png
 *   npx tsx scripts/visual-review.ts --image render.png --reference ref.png
 *   npx tsx scripts/visual-review.ts --image render.png --reference ref.png --focus "palette warmth"
 *   npx tsx scripts/visual-review.ts --image render.png --mode audit
 *   npx tsx scripts/visual-review.ts --help
 *
 * Output: JSON to stdout (analysis, comparisons, recommendations)
 * Supports: PNG, JPG, WEBP, GIF images
 */

import { readFileSync, existsSync, mkdirSync } from "fs";
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

// ─── Config ─────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

loadEnvFile(SCRIPT_DIR);

const GEMINI_KEY = resolveCredential("GEMINI_API_KEY", "GOOGLE_API_KEY");
if (!GEMINI_KEY) {
  fatal("Missing GEMINI_API_KEY or GOOGLE_API_KEY", {
    hint: "Get a key at https://aistudio.google.com/apikey",
  });
}

const OUTPUT_DIR = resolveOutputDir(SCRIPT_DIR, "k-hole");

// ─── CLI Args ────────────────────────────────────────────────────

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
    usage: "npx tsx scripts/visual-review.ts --image <path> [options]",
    options: {
      "--image": "Path to image to analyze (required)",
      "--reference": "Path to reference image for comparison",
      "--focus": "Specific aspect to focus analysis on (e.g. 'palette warmth', 'composition balance')",
      "--mode":
        "Analysis mode: 'review' (default), 'compare', 'audit', 'palette'",
      "--model": "Gemini model override (default: gemini-2.5-flash)",
      "--help": "Show this help",
    },
    modes: {
      review: "General visual quality review",
      compare: "Side-by-side comparison with reference (requires --reference)",
      audit: "Detailed technical audit (materials, lighting, composition)",
      palette: "Extract and analyze color palette",
    },
    output_format: {
      mode: "string",
      analysis: "string — main analysis text",
      scores: "object — rated dimensions (0-10)",
      recommendations: "string[] — prioritized action items",
      palette: "object[] — extracted colors (when mode=palette)",
    },
  });
  process.exit(0);
}

const IMAGE_PATH = getArg("image");
if (!IMAGE_PATH) {
  fatal('Usage: npx tsx scripts/visual-review.ts --image <path>', {
    hint: "Run with --help for all options",
  });
}

const REFERENCE_PATH = getArg("reference");
const FOCUS = getArg("focus");
const MODE = (getArg("mode") || "review") as
  | "review"
  | "compare"
  | "audit"
  | "palette";
const MODEL =
  getArg("model") || process.env.VISUAL_REVIEW_MODEL || "gemini-2.5-flash";

const FALLBACK_MODELS = ["gemini-2.0-flash"];

let activeModel = MODEL;

// ─── Image Loading ───────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

interface ImageData {
  base64: string;
  mimeType: string;
  path: string;
  sizeKB: number;
}

function loadImage(imagePath: string): ImageData {
  if (!existsSync(imagePath)) {
    fatal(`Image not found: ${imagePath}`);
  }

  const ext = extname(imagePath).toLowerCase();
  const mimeType = MIME_MAP[ext];
  if (!mimeType) {
    fatal(`Unsupported image format: ${ext}`, {
      supported: Object.keys(MIME_MAP),
    });
  }

  const buffer = readFileSync(imagePath);
  const sizeKB = Math.round(buffer.length / 1024);

  // Gemini has a ~20MB inline limit, warn above 4MB
  if (sizeKB > 4096) {
    progress("warn", `Large image (${sizeKB}KB) — may be slow`);
  }

  return {
    base64: buffer.toString("base64"),
    mimeType,
    path: imagePath,
    sizeKB,
  };
}

// ─── Prompt Construction ─────────────────────────────────────────

function buildPrompt(): string {
  const baseContext = `You are an expert environment artist and visual director at the level of Riot Games concept art, Fortiche animation, and Arc System Works cel-shading. You analyze images with the precision of a senior art director doing a crit.`;

  switch (MODE) {
    case "review":
      return `${baseContext}

Analyze this render and provide a structured visual review. Rate each dimension 0-10.

Dimensions to evaluate:
- **Composition**: Visual weight distribution, focal points, negative space
- **Palette**: Color harmony, warmth/coolness, saturation levels, value range
- **Contrast**: Light/dark separation, readability of shapes, silhouette clarity
- **Material Quality**: Surface read, cel-shading band separation, shader consistency
- **Landmark Readability**: How well distinct areas read as unique places
- **Atmosphere**: Mood, environmental storytelling, sense of place

${FOCUS ? `FOCUS specifically on: ${FOCUS}` : ""}

Respond in this exact JSON format:
{
  "analysis": "2-3 paragraph overall assessment",
  "scores": {
    "composition": N,
    "palette": N,
    "contrast": N,
    "material_quality": N,
    "landmark_readability": N,
    "atmosphere": N
  },
  "strengths": ["what's working well"],
  "recommendations": ["prioritized changes, most impactful first"],
  "palette_notes": "specific observations about color usage"
}`;

    case "compare":
      return `${baseContext}

Compare the FIRST image (the current render) against the SECOND image (the reference/target). Identify what matches the reference's quality and what doesn't yet.

${FOCUS ? `FOCUS specifically on: ${FOCUS}` : ""}

Respond in this exact JSON format:
{
  "analysis": "2-3 paragraph comparison",
  "match_score": N,
  "matching": ["aspects that match the reference well"],
  "gaps": ["aspects where the render falls short of the reference"],
  "recommendations": ["specific changes to close the gap, most impactful first"],
  "reference_qualities": "what makes the reference image work"
}`;

    case "audit":
      return `${baseContext}

Perform a detailed technical audit of this render. Evaluate it as if reviewing for a production game art pipeline.

${FOCUS ? `FOCUS specifically on: ${FOCUS}` : ""}

Respond in this exact JSON format:
{
  "analysis": "detailed technical assessment",
  "scores": {
    "composition": N,
    "palette": N,
    "contrast": N,
    "material_quality": N,
    "landmark_readability": N,
    "atmosphere": N,
    "outline_quality": N,
    "shadow_depth": N,
    "terrain_variation": N,
    "overall_polish": N
  },
  "technical_issues": ["specific technical problems"],
  "art_direction_notes": "observations about style consistency and intent",
  "recommendations": ["prioritized fixes"],
  "production_readiness": "assessment of how close to final this is"
}`;

    case "palette":
      return `${baseContext}

Extract and analyze the color palette from this image. Identify the dominant colors, their relationships, and how they serve the composition.

Respond in this exact JSON format:
{
  "analysis": "palette analysis — harmony, temperature, relationships",
  "dominant_colors": [
    {"hex": "#RRGGBB", "role": "what this color does", "coverage": "approximate percentage"},
  ],
  "color_temperature": "overall warm/cool assessment",
  "value_range": "lightest to darkest, contrast ratio observations",
  "harmony_type": "complementary/analogous/triadic/etc",
  "recommendations": ["palette adjustments to improve the piece"]
}`;
  }
}

// ─── Gemini Vision API ───────────────────────────────────────────

interface GeminiVisionResult {
  status: "success" | "model_not_found" | "error";
  text?: string;
  error?: string;
}

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

async function geminiVision(
  model: string,
  prompt: string,
  images: ImageData[]
): Promise<GeminiVisionResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  // Build multimodal content parts
  const parts: Array<Record<string, unknown>> = [];

  // Add images first
  for (const img of images) {
    parts.push({
      inline_data: {
        mime_type: img.mimeType,
        data: img.base64,
      },
    });
  }

  // Add text prompt
  parts.push({ text: prompt });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.3, // lower temp for analytical precision
      responseMimeType: "application/json",
    },
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 2min for vision

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();

        if (isModelNotFound(res.status, errText)) {
          return {
            status: "model_not_found",
            error: `${model}: ${errText.slice(0, 150)}`,
          };
        }

        if (res.status === 429 || res.status >= 500) {
          if (attempt < 2) {
            const wait = (attempt + 1) * 3000 + Math.random() * 2000;
            progress(
              "retry",
              `Attempt ${attempt + 1}/3 after ${res.status}...`
            );
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
        }

        return {
          status: "error",
          error: `Gemini ${res.status}: ${errText.slice(0, 200)}`,
        };
      }

      const data = await res.json();
      const cand = data.candidates?.[0];

      if (!cand || !cand.content?.parts?.length) {
        const reason = cand?.finishReason || "NO_CANDIDATES";
        if (attempt < 2) {
          progress("retry", `Empty response (${reason}), retrying...`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return { status: "error", error: `No response from model (${reason})` };
      }

      const text = cand.content.parts
        .filter((p: { text?: string }) => p.text)
        .map((p: { text: string }) => p.text)
        .join("");

      return { status: "success", text };
    } catch (err: unknown) {
      clearTimeout(timeout);

      if (err instanceof Error && err.name === "AbortError") {
        if (attempt < 2) {
          progress("retry", `Timeout, retrying (${attempt + 1}/3)...`);
          continue;
        }
        return { status: "error", error: "Request timed out after 120s" };
      }

      if (attempt < 2) {
        progress("retry", `Network error, retrying (${attempt + 1}/3)...`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      return {
        status: "error",
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { status: "error", error: "Exhausted retries" };
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  // Load images
  progress("load", `Loading image: ${basename(IMAGE_PATH!)}`);
  const mainImage = loadImage(IMAGE_PATH!);
  progress("load", `Image: ${mainImage.sizeKB}KB ${mainImage.mimeType}`);

  const images: ImageData[] = [mainImage];

  if (REFERENCE_PATH) {
    progress("load", `Loading reference: ${basename(REFERENCE_PATH)}`);
    const refImage = loadImage(REFERENCE_PATH);
    images.push(refImage);
    progress("load", `Reference: ${refImage.sizeKB}KB ${refImage.mimeType}`);
  }

  // Auto-switch to compare mode if reference provided
  const effectiveMode =
    REFERENCE_PATH && MODE === "review" ? "compare" : MODE;

  if (effectiveMode === "compare" && !REFERENCE_PATH) {
    fatal("Compare mode requires --reference <path>");
  }

  // Build prompt
  const prompt = buildPrompt();
  progress("analyze", `Mode: ${effectiveMode} | Model: ${activeModel}`);

  // Call Gemini with fallback chain
  let result: GeminiVisionResult | null = null;

  result = await geminiVision(activeModel, prompt, images);

  if (result.status === "model_not_found") {
    for (const fallback of FALLBACK_MODELS) {
      progress("fallback", `${activeModel} unavailable, trying ${fallback}...`);
      activeModel = fallback;
      result = await geminiVision(activeModel, prompt, images);
      if (result.status !== "model_not_found") break;
    }
  }

  if (!result || result.status !== "success" || !result.text) {
    fatal("Visual analysis failed", {
      error: result?.error || "Unknown error",
      model: activeModel,
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  progress("done", `Analysis complete in ${elapsed}s`);

  // Parse JSON response
  let analysis: Record<string, unknown>;
  try {
    // Handle markdown-wrapped JSON
    let jsonText = result.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    analysis = JSON.parse(jsonText);
  } catch {
    // If JSON parse fails, wrap raw text as analysis
    analysis = {
      analysis: result.text,
      parse_note: "Response was not structured JSON — raw text returned",
    };
  }

  // Compose final output
  const finalOutput = {
    mode: effectiveMode,
    model: activeModel,
    image: basename(IMAGE_PATH!),
    reference: REFERENCE_PATH ? basename(REFERENCE_PATH) : null,
    focus: FOCUS,
    duration_s: parseFloat(elapsed),
    ...analysis,
  };

  output(finalOutput);
}

main().catch((err) => {
  fatal("Unexpected error", { detail: String(err) });
});
