#!/usr/bin/env bash
# Post-install hook for the Deep Research construct
set -euo pipefail

# Create output directory
mkdir -p scripts/research-output

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
echo "  Deep Research construct installed successfully"
echo ""
echo "  Quick start:"
echo "    /forge \"your domain\"     Full pipeline"
echo "    /discover \"domain\"       Discovery only"
echo "    /config                   Generate research config"
echo "    /research --config name   Run pipeline with config"
