#!/usr/bin/env bash
# dig-search Phase 1 — real-Gemini-CLI E2E gate.
#
# The mocked subprocess suite (npm test) proves the LOGIC with zero spend.
# This proves the INTEGRATION: the four primitives running end-to-end against
# the REAL gemini CLI (subscription auth). It is the pre-merge gate — slow,
# uses real quota, run deliberately. NOT part of `npm test`.
#
# Usage:  bash tests/e2e/dig-e2e.sh
# Requires: the gemini CLI authenticated (OAuth via ~/.gemini/settings.json).
set -u
cd "$(dirname "$0")/../.." || exit 1

DIG="npx tsx scripts/dig-search.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

echo "── E2E 1/4 — BREADTH: --scout against the real CLI ──"
SCOUT="$($DIG --query "phenomenology of ketamine dissociation as creative tool" --scout 2>"$TMP/scout.err")"
if echo "$SCOUT" | jq -e '.mode == "scout"' >/dev/null 2>&1; then
  ok "scout shape returned (mode:scout)"
  N=$(echo "$SCOUT" | jq '.sources | length')
  [ "$N" -gt 0 ] && ok "scout returned $N sources" || bad "scout returned no sources"
  # SKP-002a in the real world: which gist tier does the real CLI path hit?
  echo "$SCOUT" | jq -r '.sources[0].gist_quality' | sed 's/^/  · real-CLI gist_quality: /'
else
  bad "scout did not return a scout shape"; echo "    stderr: $(tail -2 "$TMP/scout.err")"
fi

echo "── E2E 2/4 — DEPTH + streaming: --depth 1 --stream --trail ──"
$DIG --query "CRT phosphor decay as a memory metaphor" --depth 1 --stream \
  --trail "$TMP/trail.md" >"$TMP/stream.ndjson" 2>"$TMP/stream.err"
if grep -q '"event":"complete"' "$TMP/stream.ndjson" && grep -q '"event":"search"' "$TMP/stream.ndjson"; then
  ok "stream emitted search + complete NDJSON events"
else
  bad "stream did not emit the expected NDJSON events"; echo "    $(tail -2 "$TMP/stream.err")"
fi
ENV_PATH="$(grep '"event":"complete"' "$TMP/stream.ndjson" | tail -1 | jq -r '.emitted_envelope // empty')"
if [ -n "$ENV_PATH" ] && [ -f "$ENV_PATH" ]; then
  ok "envelope emitted: $ENV_PATH"
  jq -e '.provenance.candidate == true and (.threads_to_pull | type == "array")' "$ENV_PATH" >/dev/null 2>&1 \
    && ok "emitted envelope is a valid candidate with threads_to_pull" \
    || bad "emitted envelope failed shape check"
else
  bad "no envelope emitted"
fi

echo "── E2E 3/4 — PULLING-THREADS: --envelopes consume the emitted envelope ──"
if [ -n "${ENV_PATH:-}" ] && [ -f "$ENV_PATH" ]; then
  $DIG --query "a fresh thread" --depth 2 --envelopes "$ENV_PATH" \
    --trail "$TMP/trail2.md" --no-emit-envelope >"$TMP/consume.json" 2>"$TMP/consume.err"
  if jq -e '.search_count >= 1' "$TMP/consume.json" >/dev/null 2>&1; then
    ok "consuming dig completed (search_count $(jq '.search_count' "$TMP/consume.json"))"
  else
    bad "consuming dig failed"; echo "    $(tail -2 "$TMP/consume.err")"
  fi
else
  bad "skipped — no envelope from E2E 2 to consume"
fi

echo "── E2E 4/4 — DEPTH safety valve: SIGINT abort-with-partial ──"
$DIG --query "grief rituals mapped to UI transitions" --depth 3 \
  --trail "$TMP/trail3.md" >"$TMP/abort.json" 2>"$TMP/abort.err" &
DIG_PID=$!
sleep 6
kill -INT "$DIG_PID" 2>/dev/null
wait "$DIG_PID"; ABORT_EXIT=$?
if [ "$ABORT_EXIT" -eq 130 ]; then
  ok "SIGINT exited 130"
else
  bad "SIGINT exit code was $ABORT_EXIT (expected 130)"
fi
if jq -e '.partial == true and .synthesis == null' "$TMP/abort.json" >/dev/null 2>&1; then
  ok "partial artifact flushed (partial:true, synthesis:null)"
else
  bad "no clean partial artifact on SIGINT"; echo "    $(head -c 200 "$TMP/abort.json")"
fi

echo ""
echo "── E2E result: $PASS passed, $FAIL failed ──"
[ "$FAIL" -eq 0 ] && echo "✓ real-Gemini-CLI E2E GATE PASSED" || echo "✗ E2E GATE FAILED"
exit "$FAIL"
