/**
 * Banana — Gemini Image Generation via Nano Banana
 *
 * Wraps Google's Nano Banana family (Gemini 2.5 / 3 / 3.1 Flash & Pro Image
 * preview models) for k-hole's visual loop: close the research-to-render
 * loop by turning /dig findings into reference imagery.
 *
 * Models the script understands (aliases collapse into REST slugs):
 *   - gemini-3-flash-image      (default — Nano Banana 2, recommended)
 *   - gemini-3-pro-image        (Nano Banana Pro — professional quality)
 *   - gemini-2.5-flash-image    (original Nano Banana — speed-tier)
 *
 * Usage:
 *   npx tsx scripts/banana.ts --prompt "<text>"
 *   npx tsx scripts/banana.ts --prompt "<text>" --image ref1.png --image ref2.png
 *   npx tsx scripts/banana.ts --prompt "<text>" --model gemini-3-pro-image
 *   npx tsx scripts/banana.ts --prompt "<text>" --aspect 16:9 --size 2K
 *   npx tsx scripts/banana.ts --prompt "<text>" --n 4 --out ./out/
 *
 * Output: JSON to stdout (paths to written images + response text + metadata).
 * Side effect: writes PNG file(s) to OUTPUT_DIR.
 *
 * Auth:
 *   GEMINI_API_KEY or GOOGLE_API_KEY (resolved via the standard k-hole cascade).
 *   Image generation requires the REST API — the gemini CLI does not yet
 *   expose image-output modalities.
 *
 * See: https://ai.google.dev/gemini-api/docs/image-generation
 */

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname, basename, extname } from "path";
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
    hint: "Get a key at https://aistudio.google.com/apikey. The gemini CLI subscription does not yet expose image-output modalities; banana requires REST API auth.",
  });
}

const OUTPUT_DIR = resolveOutputDir(SCRIPT_DIR, "k-hole");
const BANANA_OUT = join(OUTPUT_DIR, "banana");
import { mkdirSync } from "fs";
mkdirSync(BANANA_OUT, { recursive: true });

// ─── CLI Args ────────────────────────────────────────────────────

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function getMultiArg(name: string): string[] {
  const flag = `--${name}`;
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && process.argv[i + 1]) {
      values.push(process.argv[i + 1]);
    }
  }
  return values;
}

const PROMPT = getArg("prompt");
if (!PROMPT) {
  fatal('Usage: npx tsx scripts/banana.ts --prompt "<text>"', {
    flags: {
      "--prompt": "REQUIRED. Descriptive prompt. Narrative paragraphs > keyword lists.",
      "--image PATH": "Optional. Reference image for editing/composition. Repeatable.",
      "--model NAME": "Default gemini-3-flash-image (Nano Banana 2). Other: gemini-3-pro-image, gemini-2.5-flash-image.",
      "--aspect RATIO": 'Default "1:1". Supported: 16:9, 9:16, 4:3, 3:4, 21:9, 1:1, and friends.',
      "--size SIZE": 'Default "1K". Options: 512, 1K, 2K, 4K.',
      "--n COUNT": "Default 1. Number of candidate images to request.",
      "--out DIR": "Override output directory (default grimoires/k-hole/research-output/banana).",
    },
  });
}

// Model aliasing — accept friendly names, send canonical REST slugs.
const MODEL_ALIASES: Record<string, string> = {
  // Nano Banana 2 — recommended default
  "gemini-3-flash-image": "gemini-3.1-flash-image-preview",
  "gemini-3.1-flash-image": "gemini-3.1-flash-image-preview",
  "nano-banana-2": "gemini-3.1-flash-image-preview",
  // Nano Banana Pro — professional asset production
  "gemini-3-pro-image": "gemini-3-pro-image-preview",
  "nano-banana-pro": "gemini-3-pro-image-preview",
  // Original Nano Banana — speed-tier
  "gemini-2.5-flash-image": "gemini-2.5-flash-image",
  "nano-banana": "gemini-2.5-flash-image",
};

const MODEL_REQUESTED = getArg("model") || process.env.BANANA_MODEL || "gemini-3-flash-image";
const MODEL = MODEL_ALIASES[MODEL_REQUESTED] || MODEL_REQUESTED;

const ASPECT = getArg("aspect") || "1:1";
const SIZE_RAW = getArg("size") || "1K";
const SIZE = /^(512|1k|2k|4k)$/i.test(SIZE_RAW) ? SIZE_RAW.toUpperCase().replace("512", "512") : "1K";

const N = Math.min(Math.max(parseInt(getArg("n") || "1", 10), 1), 8);

const OUT_DIR_OVERRIDE = getArg("out");
const FINAL_OUT_DIR = OUT_DIR_OVERRIDE
  ? (mkdirSync(OUT_DIR_OVERRIDE, { recursive: true }), OUT_DIR_OVERRIDE)
  : BANANA_OUT;

const INPUT_IMAGES = getMultiArg("image");

// ─── Image input handling ───────────────────────────────────────

const SUPPORTED_INPUT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function mimeFromExt(p: string): string {
  const ext = extname(p).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".png":
    default:
      return "image/png";
  }
}

function loadInputImages(): { inlineData: { mimeType: string; data: string } }[] {
  const parts: { inlineData: { mimeType: string; data: string } }[] = [];
  for (const path of INPUT_IMAGES) {
    if (!existsSync(path)) {
      fatal(`Input image not found: ${path}`);
    }
    if (!SUPPORTED_INPUT.has(extname(path).toLowerCase())) {
      fatal(`Unsupported input format: ${path}. Use PNG, JPG, WEBP, or GIF.`);
    }
    const buf = readFileSync(path);
    parts.push({
      inlineData: {
        mimeType: mimeFromExt(path),
        data: buf.toString("base64"),
      },
    });
    progress("banana", `loaded reference: ${basename(path)} (${(buf.byteLength / 1024).toFixed(0)}KB)`);
  }
  return parts;
}

// ─── API call ────────────────────────────────────────────────────

interface ImagePart {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}

interface BananaResponse {
  candidates: { content: { parts: ImagePart[] } }[];
  promptFeedback?: { blockReason?: string };
}

async function callBanana(): Promise<BananaResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const referenceParts = loadInputImages();

  const contents = [
    {
      parts: [
        // Text part FIRST so the model anchors instruction context before
        // interpreting reference images. Matches the documented examples.
        { text: PROMPT },
        ...referenceParts,
      ],
    },
  ];

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      // imageConfig is the v1beta field name (some doc revisions also accept
      // responseFormat.image — imageConfig is the stable post-2025-10 path).
      imageConfig: {
        aspectRatio: ASPECT,
        imageSize: SIZE,
        ...(N > 1 ? { numberOfImages: N } : {}),
      },
    },
  };

  progress("banana", `model=${MODEL} aspect=${ASPECT} size=${SIZE} n=${N} refs=${referenceParts.length}`);

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeoutMs = 120_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_KEY,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        if (res.status === 429 || res.status >= 500) {
          if (attempt < 2) {
            const wait = (attempt + 1) * 3000 + Math.random() * 2000;
            progress("banana", `retry ${attempt + 1}/3 after ${res.status}`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
        }
        fatal(`Banana ${res.status}: ${errText.slice(0, 400)}`);
      }
      const data = (await res.json()) as BananaResponse;
      return data;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        progress("banana", `timeout (${timeoutMs / 1000}s), retrying...`);
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      fatal(`Banana request failed: ${String(err)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  fatal("Exhausted retries");
}

// ─── Output extraction ──────────────────────────────────────────

function safeFilename(seed: string): string {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 48) || "banana";
}

function extToMime(mime: string): string {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  return ".png";
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const data = await callBanana();

  if (data.promptFeedback?.blockReason) {
    fatal(`Banana blocked by safety filter: ${data.promptFeedback.blockReason}`);
  }

  const stem = safeFilename(PROMPT);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const images: { path: string; mime: string; bytes: number }[] = [];
  const textParts: string[] = [];

  for (const cand of data.candidates || []) {
    const parts = cand.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || "image/png";
        const ext = extToMime(mime);
        const filename = `${ts}_${stem}_${images.length + 1}${ext}`;
        const path = join(FINAL_OUT_DIR, filename);
        const buf = Buffer.from(part.inlineData.data, "base64");
        writeFileSync(path, buf);
        images.push({ path, mime, bytes: buf.byteLength });
        progress("banana", `wrote ${filename} (${(buf.byteLength / 1024).toFixed(0)}KB)`);
      } else if (part.text) {
        textParts.push(part.text);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  progress("banana", `done in ${elapsed}s | ${images.length} image(s) written`);

  if (images.length === 0) {
    fatal("Banana returned no images", {
      text_parts: textParts,
      hint: "Check that --model supports image output (Nano Banana family) and that responseModalities includes IMAGE.",
    });
  }

  output({
    prompt: PROMPT,
    model: MODEL,
    model_requested: MODEL_REQUESTED,
    aspect_ratio: ASPECT,
    image_size: SIZE,
    requested_count: N,
    returned_count: images.length,
    images: images.map((i) => ({
      path: i.path,
      mime_type: i.mime,
      bytes: i.bytes,
    })),
    response_text: textParts.join("\n") || null,
    input_references: INPUT_IMAGES,
    elapsed_seconds: parseFloat(elapsed),
    watermark: "SynthID (Google embeds an invisible watermark in every generated image)",
  });
}

main().catch((err) => {
  fatal(String(err), { prompt: PROMPT });
});
