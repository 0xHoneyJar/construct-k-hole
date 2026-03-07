#!/usr/bin/env bash
# Post-install hook for the K-Hole construct
set -euo pipefail

CONSTRUCT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Create output directory (relative to construct root, not CWD)
mkdir -p "$CONSTRUCT_DIR/scripts/research-output"

# Check for required API keys
if [ -f .env ]; then
  if grep -q "GEMINI_API_KEY\|GOOGLE_API_KEY" .env; then
    echo "  Gemini API key found"
  else
    echo "  WARNING: No GEMINI_API_KEY or GOOGLE_API_KEY found in .env"
    echo "  The research pipeline requires a Gemini API key."
    echo "  Get one at: https://aistudio.google.com/apikey"
  fi

  if grep -q "FIRECRAWL_API_KEY" .env; then
    echo "  Firecrawl API key found (deep scraping enabled)"
  else
    echo "  NOTE: No FIRECRAWL_API_KEY found. Deep URL scraping will be disabled."
    echo "  The pipeline works without it, but Firecrawl adds depth."
    echo "  Get one at: https://firecrawl.dev"
  fi
else
  echo "  WARNING: No .env file found. Create one with:"
  echo "    GEMINI_API_KEY=your-key-here"
  echo "    FIRECRAWL_API_KEY=your-key-here  # optional"
fi

echo ""
echo "  K-Hole construct installed"
echo ""
echo "  Depth modes:"
echo "    /dig \"your thread\"        Interactive pair-research (k-hole mode)"
echo "    /forge \"your domain\"      Full batch pipeline"
echo ""
echo "  Pipeline steps:"
echo "    /discover \"domain\"        Map the landscape"
echo "    /config                    Generate research config"
echo "    /research --config name    Execute the pipeline"
