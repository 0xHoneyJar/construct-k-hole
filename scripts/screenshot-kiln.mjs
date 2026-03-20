#!/usr/bin/env node
/**
 * Screenshot each stylized material from The Kiln in Sky-eyes.
 * Uses precise selectors to avoid hitting sidebar nav buttons.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const OUT = "grimoires/purupuru/research/kiln-screenshots";
mkdirSync(OUT, { recursive: true });

const MATS = ["Water", "Fire", "Wood", "Earth", "Metal", "Honey", "Sakura"];

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  console.log("Loading Sky-eyes...");
  await page.goto("http://localhost:3000/dev/sky-eyes", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2500);

  // Click The Kiln in sidebar — it's the nav button with FlaskConical icon
  await page.locator('button:has-text("The Kiln")').click();
  await page.waitForTimeout(3000);

  // Click Stylized pill if present (inside the main content area, not sidebar)
  const mainContent = page.locator('main');
  const stylizedBtn = mainContent.locator('button:has-text("Stylized")');
  if (await stylizedBtn.count() > 0) {
    await stylizedBtn.click();
    await page.waitForTimeout(1000);
  }

  for (const mat of MATS) {
    console.log(`  ${mat}...`);

    // Material pills are small rounded buttons in the main content area
    // They contain a colored dot + text. Use main content scope to avoid sidebar.
    const pill = mainContent.locator(`button:has-text("${mat}")`).first();
    if (await pill.count() === 0) {
      console.log(`    Skipped (not found)`);
      continue;
    }
    await pill.click();
    await page.waitForTimeout(3500); // wait for shader + animation

    // Screenshot the full main area (includes the R3F canvas + info panel)
    await mainContent.screenshot({ path: `${OUT}/${mat.toLowerCase()}.png` });
    console.log(`    ✓ ${mat.toLowerCase()}.png`);
  }

  await browser.close();
  console.log(`\nDone → ${OUT}/`);
}

run().catch(console.error);
