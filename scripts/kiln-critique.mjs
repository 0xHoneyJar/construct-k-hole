#!/usr/bin/env node
/**
 * Kiln Critique — Screenshot + Gemini Visual Review pipeline
 *
 * Takes screenshots of each stylized material from Sky-eyes → The Kiln,
 * then runs each through visual-review.ts for structured Gemini critique.
 * Outputs a combined report to grimoires/purupuru/research/kiln-critique.json
 *
 * Usage:
 *   node scripts/kiln-critique.mjs                    # all materials
 *   node scripts/kiln-critique.mjs --materials water,fire  # specific ones
 *   node scripts/kiln-critique.mjs --reference path/to/ref.png  # compare against reference
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const SCREENSHOT_DIR = "grimoires/purupuru/research/kiln-screenshots";
const OUTPUT_PATH = "grimoires/purupuru/research/kiln-critique.json";
const VISUAL_REVIEW_SCRIPT = ".claude/constructs/packs/k-hole/scripts/visual-review.ts";

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const ALL_MATERIALS = [
  "Water", "Fire", "Wood", "Earth", "Metal",
  "Honey", "Sakura",
];

// Parse CLI args
const materialsArg = process.argv.find(a => a.startsWith("--materials="))?.split("=")[1]
  ?? process.argv[process.argv.indexOf("--materials") + 1];
const referenceArg = process.argv.find(a => a.startsWith("--reference="))?.split("=")[1]
  ?? process.argv[process.argv.indexOf("--reference") + 1];

const materials = materialsArg
  ? materialsArg.split(",").map(m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())
  : ALL_MATERIALS;

async function captureScreenshots() {
  console.log("📸 Capturing Kiln screenshots...\n");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto("http://localhost:3000/dev/sky-eyes", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2000);

  // Navigate to The Kiln
  const kilnBtn = page.locator("button", { hasText: "The Kiln" });
  await kilnBtn.click();
  await page.waitForTimeout(2000);

  // Ensure Stylized mode
  const stylizedPill = page.locator("button", { hasText: "Stylized" });
  if (await stylizedPill.count() > 0) {
    await stylizedPill.click();
    await page.waitForTimeout(500);
  }

  const paths = {};

  for (const mat of materials) {
    process.stdout.write(`  ${mat}... `);
    const btn = page.locator(`button:has-text("${mat}")`).first();
    if (await btn.count() === 0) {
      console.log("skipped (not found)");
      continue;
    }
    await btn.click();
    await page.waitForTimeout(3000); // longer wait for shader to stabilize

    const outPath = join(SCREENSHOT_DIR, `${mat.toLowerCase()}-stylized.png`);

    // Try to screenshot just the canvas (R3F viewport)
    const canvas = page.locator("canvas").first();
    if (await canvas.count() > 0) {
      await canvas.screenshot({ path: outPath });
    } else {
      await page.screenshot({ path: outPath, clip: { x: 260, y: 200, width: 800, height: 500 } });
    }
    paths[mat.toLowerCase()] = outPath;
    console.log("✓");
  }

  await browser.close();
  return paths;
}

function runVisualReview(imagePath, referencePath = null) {
  const args = [`--image`, imagePath, `--mode`, `review`];
  if (referencePath) {
    args.push(`--reference`, referencePath);
  }
  args.push(`--focus`, `material quality, illustrative style fidelity, color richness, noise pattern visibility, Fresnel rim quality, surface texture detail, comparison to UE5/Arcane/Hearthstone stylized shader quality`);

  try {
    const result = execSync(
      `npx tsx ${VISUAL_REVIEW_SCRIPT} ${args.join(" ")}`,
      { encoding: "utf-8", timeout: 60000, cwd: process.cwd() }
    );
    // Parse JSON from output
    const lines = result.trim().split("\n");
    for (const line of lines.reverse()) {
      try { return JSON.parse(line); } catch {}
    }
    return { raw: result.trim() };
  } catch (err) {
    return { error: err.message?.slice(0, 200) };
  }
}

async function main() {
  console.log("🔥 Kiln Critique Pipeline\n");

  // Step 1: Screenshots
  const paths = await captureScreenshots();
  console.log(`\n📸 Captured ${Object.keys(paths).length} screenshots\n`);

  // Step 2: Visual review
  console.log("🔍 Running Gemini visual review...\n");
  const results = {};

  for (const [name, path] of Object.entries(paths)) {
    process.stdout.write(`  Reviewing ${name}... `);
    const review = runVisualReview(path, referenceArg || null);
    results[name] = { screenshot: path, review };
    console.log("✓");
  }

  // Step 3: Save combined report
  const report = {
    timestamp: new Date().toISOString(),
    materials_reviewed: Object.keys(results),
    reference: referenceArg || null,
    results,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n📋 Report saved to ${OUTPUT_PATH}`);

  // Step 4: Print summary
  console.log("\n── Summary ──────────────────────────────────────────\n");
  for (const [name, data] of Object.entries(results)) {
    const r = data.review;
    if (r.error) {
      console.log(`  ${name}: ❌ ${r.error}`);
    } else if (r.scores) {
      const avg = Object.values(r.scores).reduce((a, b) => a + b, 0) / Object.values(r.scores).length;
      console.log(`  ${name}: ${avg.toFixed(1)}/10 — ${r.one_liner || ""}`);
    } else {
      console.log(`  ${name}: review completed`);
    }
  }
}

main().catch(console.error);
