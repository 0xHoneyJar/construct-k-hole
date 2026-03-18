/**
 * Construct Runtime — Shared utilities for construct scripts
 *
 * Extracted from dig-search.ts (the reference implementation).
 * Any construct that ships scripts can import these to get:
 *   - Credential resolution with cascade (.env → ~/.loa/credentials.json → process.env)
 *   - Output directory resolution (pack-installed vs standalone)
 *   - Clean stdout/stderr separation (Nakamoto protocol)
 *
 * Usage:
 *   import { loadEnvFile, resolveCredential, resolveOutputDir, progress, output, fatal } from "./lib/construct-runtime.ts";
 */

import { readFileSync, existsSync, mkdirSync, writeSync } from "fs";
import { join, dirname } from "path";

// ─── Project Root Detection ──────────────────────────────────────

/**
 * Walk up from startDir to find a project root.
 * A project root is a directory containing .git or .claude/.
 * Returns null if no project root is found (hit filesystem root).
 */
function findProjectRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, ".git")) || existsSync(join(dir, ".claude"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ─── Credential Cascade ──────────────────────────────────────────

/**
 * Walk up from startDir looking for .env. Returns true if found and loaded.
 */
function loadEnvFrom(startDir: string): boolean {
  let dir = startDir;
  while (true) {
    const envPath = join(dir, ".env");
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf-8").split("\n")) {
        const match = line.match(/^(\w+)=(.*)$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
        }
      }
      return true;
    }
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * Load environment variables from the nearest .env file.
 * Does NOT overwrite already-set env vars.
 *
 * Strategy: find the project root from process.cwd() first, then fall back
 * to walking up from startDir. This handles the global store symlink case
 * where startDir (from import.meta.url) resolves to ~/.loa/ — walk-up
 * from there never reaches the project root where .env lives.
 */
export function loadEnvFile(startDir: string): void {
  // Try project root from cwd first (handles symlink + subdirectory cases)
  const projectRoot = findProjectRoot(process.cwd());
  if (projectRoot && loadEnvFrom(projectRoot)) return;

  // Fallback: walk up from startDir (standalone repo case)
  loadEnvFrom(startDir);
}

/**
 * Load construct-level credentials from ~/.loa/credentials.json.
 *
 * File format:
 *   {
 *     "GEMINI_API_KEY": "your-key",
 *     "FIRECRAWL_API_KEY": "your-key"
 *   }
 *
 * Permissions: file should be chmod 600 (this function does not enforce,
 * but the /loa-credentials skill creates it with correct permissions).
 *
 * Keys are never logged or returned in stdout.
 */
export function loadLoaCredentials(): Record<string, string> {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (!home) return {};

  const credPath = join(home, ".loa", "credentials.json");
  if (!existsSync(credPath)) return {};

  try {
    const raw = JSON.parse(readFileSync(credPath, "utf-8"));
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Resolve a credential by trying multiple names in cascade order:
 *   1. process.env (includes .env if loadEnvFile was called first)
 *   2. ~/.loa/credentials.json
 *
 * Returns the resolved value (stripped of wrapping quotes), or null.
 * Call loadEnvFile() before this to include .env in the cascade.
 *
 * Example:
 *   loadEnvFile(SCRIPT_DIR);
 *   const key = resolveCredential("GEMINI_API_KEY", "GOOGLE_API_KEY");
 */
export function resolveCredential(...names: string[]): string | null {
  // 1. process.env (already includes .env if loadEnvFile was called)
  for (const name of names) {
    const val = process.env[name];
    if (val) return val.replace(/^["']|["']$/g, "").trim();
  }

  // 2. ~/.loa/credentials.json
  const loaCreds = loadLoaCredentials();
  for (const name of names) {
    const val = loaCreds[name];
    if (val) return val.replace(/^["']|["']$/g, "").trim();
  }

  return null;
}

// ─── Output Directory ────────────────────────────────────────────

/**
 * Resolve the output directory for a construct's file output.
 *
 * Pack-installed (.claude/constructs/packs/{slug}/scripts/):
 *   → {project_root}/grimoires/{slug}/research-output/
 *
 * Standalone repo (scripts/):
 *   → scripts/research-output/
 *
 * Creates the directory if it doesn't exist.
 */
export function resolveOutputDir(scriptDir: string, slug: string): string {
  // Prevent path traversal via malformed slug
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
    throw new Error(`Invalid construct slug: ${slug}`);
  }

  // Direct path detection (non-symlinked packs)
  const packMarker = ".claude/constructs/packs/";
  const idx = scriptDir.indexOf(packMarker);
  if (idx !== -1) {
    const projectRoot = scriptDir.slice(0, idx);
    const output = join(projectRoot, "grimoires", slug, "research-output");
    mkdirSync(output, { recursive: true });
    return output;
  }
  // Symlink case: scriptDir resolves to global store (~/.loa/) via symlink.
  // Walk up from cwd to find project root (handles subdirectory invocation).
  const projectRoot = findProjectRoot(process.cwd());
  if (projectRoot && existsSync(join(projectRoot, ".claude", "constructs", "packs", slug))) {
    const output = join(projectRoot, "grimoires", slug, "research-output");
    mkdirSync(output, { recursive: true });
    return output;
  }
  const output = join(scriptDir, "research-output");
  mkdirSync(output, { recursive: true });
  return output;
}

// ─── Stderr Progress (Nakamoto Protocol) ─────────────────────────
//
// stdout = structured JSON output only (one write, at script exit)
// stderr = all operational noise (progress, retries, timing, errors)
//
// This separation ensures agents read clean JSON from stdout
// while users see progress in real-time on stderr.

/**
 * Emit structured progress to stderr.
 * Format: [tag] message
 */
export function progress(tag: string, message: string): void {
  process.stderr.write(`[${tag}] ${message}\n`);
}

/**
 * Emit timed progress to stderr with elapsed seconds.
 * Format: [  42s] STAGE      message
 */
export function timedProgress(
  startTime: number,
  stage: string,
  message: string,
): void {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  process.stderr.write(
    `  [${elapsed.padStart(4)}s] ${stage.padEnd(10)} ${message}\n`,
  );
}

/**
 * Emit a banner to stderr (for pipeline phase headers).
 */
export function banner(lines: string[]): void {
  const sep = "=".repeat(60);
  process.stderr.write(`\n${sep}\n`);
  for (const line of lines) {
    process.stderr.write(`  ${line}\n`);
  }
  process.stderr.write(`${sep}\n\n`);
}

// ─── Stdout Output ───────────────────────────────────────────────

/**
 * Write structured JSON to stdout. Call ONCE at script exit.
 * Everything else goes to stderr via progress/timedProgress.
 */
export function output(data: unknown): void {
  writeSync(1, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Write structured JSON error to stdout and exit with code 1.
 * Agents can parse this to surface the error and suggest fallbacks.
 */
export function fatal(error: string, extra?: Record<string, unknown>): never {
  const payload = JSON.stringify({ error, ...extra }, null, 2) + "\n";
  writeSync(1, payload); // fd 1 = stdout, synchronous to avoid truncation on exit
  process.exit(1);
}
