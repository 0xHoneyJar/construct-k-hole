// Pure provider-error classifiers for dig-search.ts.
//
// No I/O, no subprocess — these are synchronous transforms over the raw
// output a provider returned, so they unit-test in isolation. Wired into
// dig-search.ts's CLI close handler and REST error path.
//
// Bug fix: construct-k-hole#24 — dig-search conflated transient provider
// conditions (CLI quota window) and unactionable raw bodies (REST 403) with
// generic hard failures, surfacing half-stringified `[Object]` fragments.

export interface CliRateLimit {
  /** Milliseconds the provider asked us to wait, or 0 when not surfaced. */
  retryDelayMs: number;
  /** retryDelayMs rounded to whole minutes, or 0 when not surfaced. */
  retryMinutes: number;
  /** Clean, operator-readable one-line message. Never contains `[Object]`. */
  message: string;
}

/**
 * Detect a Gemini CLI rate-limit / quota-exhaustion response in the CLI's
 * combined stderr + stdout.
 *
 * The CLI emits a structured error object (nested `[Object]`s plus a
 * `retryDelayMs` field) that is frequently NOT cleanly JSON-extractable from
 * stdout — the previous code dumped the truncated fragment raw. Here we scan
 * tolerantly for the rate-limit shape instead of parsing, and derive a clean
 * "retry in ~Nm" message from `retryDelayMs` when present.
 *
 * Returns null when the output is not a rate-limit response.
 */
export function classifyCliRateLimit(
  stderr: string,
  stdout: string,
): CliRateLimit | null {
  const haystack = `${stderr}\n${stdout}`;
  const lower = haystack.toLowerCase();
  const isRateLimit =
    lower.includes("retrydelayms") ||
    lower.includes("resource_exhausted") ||
    lower.includes("ratelimitexceeded") ||
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    /\b429\b/.test(haystack);
  if (!isRateLimit) return null;

  // retryDelayMs may be quoted or bare, `:` or `=` separated:
  //   retryDelayMs: 2209585.91929   |   "retryDelayMs": 2209585
  const m = haystack.match(
    /retrydelayms["']?\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i,
  );
  const retryDelayMs = m ? Math.round(parseFloat(m[1])) : 0;
  const retryMinutes =
    retryDelayMs > 0 ? Math.max(1, Math.round(retryDelayMs / 60_000)) : 0;
  const when =
    retryMinutes > 0 ? `retry in ~${retryMinutes}m` : "retry later";
  return {
    retryDelayMs,
    retryMinutes,
    message: `gemini CLI rate-limited (quota window) — ${when}`,
  };
}

/**
 * Classify a Gemini REST HTTP error response. Returns an actionable error
 * message for cases that warrant special framing, or null to fall through to
 * the caller's generic `Gemini <status>: <body>` handling.
 *
 * 403 PERMISSION_DENIED is a project-level access denial — credits/quota
 * won't fix it, so the message names the ops action (re-enable the project or
 * re-point the key) rather than dumping the raw 403 body.
 */
export function classifyRestHttpError(
  status: number,
  body: string,
): string | null {
  if (status === 403 && body.toUpperCase().includes("PERMISSION_DENIED")) {
    return (
      "Gemini REST: project access denied (PERMISSION_DENIED) — re-enable the " +
      "project or re-point GEMINI_API_KEY / GOOGLE_API_KEY to a working project"
    );
  }
  return null;
}
