// Unit tests for the pure provider-error classifiers (scripts/lib/provider-errors.ts).
//
// Unlike dig-search.test.ts (subprocess integration tests), these import the
// classifiers directly — they are pure synchronous transforms with no I/O.
//
// Bug fix: construct-k-hole#24 — both Gemini provider paths failed:
//   #1 CLI rate-limit response surfaced as a truncated `[Object]` dump
//   #2 REST 403 PERMISSION_DENIED surfaced as a raw body, no actionable framing
//
// Run: npm test   (node --import tsx --test scripts/__tests__/*.test.ts)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  classifyCliRateLimit,
  classifyRestHttpError,
} from "../lib/provider-errors.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "fixtures");

// ── Bug #1 — CLI rate-limit classification ─────────────────────────

test("#24 bug1 — CLI rate-limit fixture yields a clean retry-in-Nm message, not [Object]", () => {
  // The verbatim shape the CLI emitted (issue #24): nested [Object]s + a
  // retryDelayMs field, NOT cleanly JSON-parseable.
  const cliOutput = readFileSync(join(FIX, "cli-ratelimit-output.txt"), "utf8");

  const result = classifyCliRateLimit(cliOutput, "");
  assert.ok(result, "a rate-limit response must be classified, not null");
  // retryDelayMs: 2209585.91929 → ~37 minutes
  assert.equal(result.retryMinutes, 37, "2209585.91929ms rounds to ~37m");
  assert.match(result.message, /rate-limited/i);
  assert.match(result.message, /~37m/, "message names the quota window");
  // The whole point of the bug fix: NO half-stringified object fragment.
  assert.doesNotMatch(
    result.message,
    /\[Object\]/,
    "message must never contain a [Object] fragment",
  );
});

test("#24 bug1 — retryDelayMs extracted from both bare and quoted forms", () => {
  const bare = classifyCliRateLimit("retryDelayMs: 120000, reason: x", "");
  assert.equal(bare?.retryMinutes, 2);
  const quoted = classifyCliRateLimit('{"retryDelayMs": 90000}', "");
  assert.equal(quoted?.retryMinutes, 2, "90000ms rounds to 2m (Math.round)");
});

test("#24 bug1 — RESOURCE_EXHAUSTED without retryDelayMs still classifies as rate-limited", () => {
  const result = classifyCliRateLimit("Error: RESOURCE_EXHAUSTED quota", "");
  assert.ok(result, "RESOURCE_EXHAUSTED alone is enough to classify");
  assert.equal(result.retryMinutes, 0, "no retryDelayMs → 0");
  assert.match(result.message, /retry later/);
});

test("#24 bug1 — a normal CLI error is NOT misclassified as rate-limited", () => {
  assert.equal(
    classifyCliRateLimit("gemini CLI exit 1: unknown model foo-bar", ""),
    null,
    "model-not-found errors must fall through, not be eaten as rate-limit",
  );
  assert.equal(
    classifyCliRateLimit("", "connection refused"),
    null,
    "connection errors must fall through",
  );
});

// ── Bug #2 — REST 403 PERMISSION_DENIED classification ─────────────

test("#24 bug2 — REST 403 PERMISSION_DENIED yields an actionable re-point message", () => {
  const body = readFileSync(join(FIX, "rest-403-permission-denied.json"), "utf8");

  const msg = classifyRestHttpError(403, body);
  assert.ok(msg, "a 403 PERMISSION_DENIED body must be classified, not null");
  assert.match(msg, /access denied/i);
  assert.match(msg, /PERMISSION_DENIED/);
  assert.match(
    msg,
    /re-point|re-enable/i,
    "message names the ops action the operator must take",
  );
  // The bug: the raw body was dumped verbatim. The fix surfaces framing, not
  // the raw JSON payload.
  assert.doesNotMatch(
    msg,
    /Please contact support/,
    "actionable message must not just echo the raw body",
  );
});

test("#24 bug2 — non-403 and non-PERMISSION_DENIED errors fall through to generic handling", () => {
  assert.equal(
    classifyRestHttpError(429, "rate limit exceeded"),
    null,
    "429 is transient — handled by the caller's retry path, not here",
  );
  assert.equal(
    classifyRestHttpError(403, "some other forbidden reason"),
    null,
    "a 403 that is not PERMISSION_DENIED falls through",
  );
  assert.equal(classifyRestHttpError(500, "internal error"), null);
});
