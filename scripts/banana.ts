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
// Normalize to canonical case: 1K / 2K / 4K stay uppercase; 512 has no
// lowercase form so toUpperCase is a no-op there. Anything off-list defaults
// to 1K to avoid sending the API an invalid imageSize.
const SIZE = /^(512|1k|2k|4k)$/i.test(SIZE_RAW) ? SIZE_RAW.toUpperCase() : "1K";

const N = Math.min(Math.max(parseInt(getArg("n") || "1", 10), 1), 8);

const OUT_DIR_OVERRIDE = getArg("out");
if (OUT_DIR_OVERRIDE) mkdirSync(OUT_DIR_OVERRIDE, { recursive: true });
const FINAL_OUT_DIR = OUT_DIR_OVERRIDE || BANANA_OUT;

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

  // The shape `generationConfig.responseFormat.image.{aspectRatio,imageSize}`
  // is what ai.google.dev/gemini-api/docs/image-generation documents as of
  // the cycle's fetch. Unknown fields are silently ignored by the API rather
  // than producing an error, so misconfiguration shows up as default-1:1-1K
  // output rather than a 400 — we verify the returned image dimensions
  // against the requested aspect/size in main() and surface a stderr warning
  // when they diverge (closes bridgebuilder F11).
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      responseFormat: {
        image: {
          aspectRatio: ASPECT,
          imageSize: SIZE,
          ...(N > 1 ? { numberOfImages: N } : {}),
        },
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

// Read PNG dimensions from raw bytes (PNG IHDR is at offset 16-23 after the
// 8-byte signature). Used to verify the API honored our aspect/size request.
function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  const sig = buf.subarray(0, 8);
  if (sig.toString("hex") !== "89504e470d0a1a0a") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

// Map an imageSize string to the documented short-side pixel count so we can
// sanity-check the API's response. Returns null for unknown sizes.
function sizeStringToPixels(s: string): number | null {
  if (s === "512") return 512;
  if (s === "1K") return 1024;
  if (s === "2K") return 2048;
  if (s === "4K") return 4096;
  return null;
}

// Check if width:height matches the requested aspect ratio within ±2% tolerance.
function aspectMatches(width: number, height: number, requested: string): boolean {
  const m = requested.match(/^(\d+):(\d+)$/);
  if (!m) return true; // unknown aspect format — skip check
  const targetRatio = parseInt(m[1], 10) / parseInt(m[2], 10);
  const actualRatio = width / height;
  return Math.abs(actualRatio - targetRatio) / targetRatio < 0.02;
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

  const requestedPx = sizeStringToPixels(SIZE);
  type ImageRecord = {
    path: string; mime: string; bytes: number;
    width?: number; height?: number; aspect_matches?: boolean; size_matches?: boolean;
  };
  const imageRecords: ImageRecord[] = [];

  for (const cand of data.candidates || []) {
    const parts = cand.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || "image/png";
        const ext = extToMime(mime);
        const filename = `${ts}_${stem}_${imageRecords.length + 1}${ext}`;
        const path = join(FINAL_OUT_DIR, filename);
        const buf = Buffer.from(part.inlineData.data, "base64");
        writeFileSync(path, buf);

        const rec: ImageRecord = { path, mime, bytes: buf.byteLength };
        // Verify the API honored our aspect/size request — PNG only since
        // dimensions are trivial to parse. Surfaces silent misconfiguration
        // (e.g. wrong field name → default 1:1 1K output).
        if (mime === "image/png") {
          const dims = readPngDimensions(buf);
          if (dims) {
            rec.width = dims.width;
            rec.height = dims.height;
            rec.aspect_matches = aspectMatches(dims.width, dims.height, ASPECT);
            if (requestedPx) {
              // "Short side ≈ requested px" within ±5% tolerance
              const shortSide = Math.min(dims.width, dims.height);
              rec.size_matches = Math.abs(shortSide - requestedPx) / requestedPx < 0.05;
            }
            if (rec.aspect_matches === false) {
              progress("banana", `WARN: returned ${dims.width}x${dims.height} doesn't match requested aspect ${ASPECT}`);
            }
            if (rec.size_matches === false) {
              progress("banana", `WARN: returned short side ${Math.min(dims.width, dims.height)}px doesn't match requested ${SIZE} (${requestedPx}px)`);
            }
          }
        }
        imageRecords.push(rec);
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
    returned_count: imageRecords.length,
    images: imageRecords.map((i) => ({
      path: i.path,
      mime_type: i.mime,
      bytes: i.bytes,
      ...(i.width !== undefined ? { width: i.width, height: i.height } : {}),
      ...(i.aspect_matches !== undefined ? { aspect_matches: i.aspect_matches } : {}),
      ...(i.size_matches !== undefined ? { size_matches: i.size_matches } : {}),
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
