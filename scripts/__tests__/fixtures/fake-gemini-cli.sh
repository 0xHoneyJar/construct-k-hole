#!/usr/bin/env bash
# Test double for the gemini CLI — exercises geminiCliCall's spawn seam
# (SKP-001b: the gemini()-boundary mock can't reach the real spawn path).
#
#   --version            → respond so HAS_GEMINI_CLI probes true
#   any real invocation  → stay alive (so SIGINT catches it as a live child);
#                          on SIGTERM, touch $DIG_CLI_KILLED_MARKER so the test
#                          can prove the activeChildren reaper killed it.
#
# NOTE: `sleep` runs in the BACKGROUND with `wait` — a foreground child would
# defer the SIGTERM trap until it finished (classic bash gotcha).
if [ "$1" = "--version" ]; then
  echo "fake-gemini 0.0.0-test"
  exit 0
fi
trap '[ -n "$DIG_CLI_KILLED_MARKER" ] && touch "$DIG_CLI_KILLED_MARKER"; kill "$SLEEP_PID" 2>/dev/null; exit 0' SIGTERM SIGINT
sleep 30 &
SLEEP_PID=$!
wait "$SLEEP_PID"
