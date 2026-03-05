---
name: deep-research
description: Executes the multi-phase grounded research pipeline
user-invocable: true
allowed-tools: Read, Write, Glob, Grep, Edit, Bash
---

# Deep Research Pipeline

Executes the full multi-phase research pipeline using a config file. This is the engine that does the actual research — grounded search, optional deep scraping, synthesis, gap analysis, and final merge.

## Trigger

```
/research
```

## Usage

```
/research --config animation                    # Run full pipeline
/research --config animation --discover-only    # Discovery phase only
/research --config animation --topic spring-physics  # Single topic
/research --config animation --concurrency 4    # Parallel topics
```

## Pipeline Architecture

The research script (`scripts/deep-research.ts`) runs this pipeline for each topic:

```
Discovery Queries (Phase 1)
    |
    v
[Gemini + Google Search] x 6-10 queries
    |
    v
Topic Synthesis --> Ranked domain list
    |
    v
Per-Topic Deep Research (Phase 2) --- runs N topics in parallel
    |
    +-- Grounded Search: 5-7 queries per topic via Gemini + Google Search
    |       |
    |       v
    +-- Deep Scraping (optional): Firecrawl extracts top URLs found
    |       |
    |       v
    +-- First Synthesis: merge all findings against focus areas
    |       |
    |       v
    +-- Gap Analysis: identify unanswered questions
    |       |
    |       v
    +-- Gap Fill: 3-4 additional grounded searches
    |       |
    |       v
    +-- Final Synthesis: exhaustive merge of all rounds
    |
    v
Cross-Topic Synthesis (Phase 3)
    |
    v
Output: research-output/<date>_<config>_*.md
```

## Running the Pipeline

### Prerequisites

1. Verify API keys:
```bash
# Check .env file
grep -E "GEMINI_API_KEY|GOOGLE_API_KEY|FIRECRAWL_API_KEY" .env
```

2. Verify config exists:
```bash
ls scripts/research-config-<domain>.ts
```

3. Ensure dependencies:
```bash
# tsx must be available
npx tsx --version
```

### Execution

Run the pipeline from the project root:

```bash
# Full pipeline — all topics
npx tsx scripts/deep-research.ts --config <domain>

# Discovery only — fast, maps the landscape
npx tsx scripts/deep-research.ts --config <domain> --discover-only

# Single topic — useful for re-running or testing
npx tsx scripts/deep-research.ts --config <domain> --topic <topic-id>

# Higher parallelism — faster but more API calls at once
npx tsx scripts/deep-research.ts --config <domain> --concurrency 4

# Larger search batches — more parallel search queries per topic
npx tsx scripts/deep-research.ts --config <domain> --search-batch 6
```

### Monitor Progress

The script outputs live progress:
```
[  12s] SEARCH     particle-morphing -- 7 queries
[  34s] DONE       particle-morphing -- 7 results, 42 sources
[  35s] SYNTH      particle-morphing -- analyzing
[  52s] GAPS       particle-morphing -- 4 gaps found
[  53s] FILL       particle-morphing -- 4 gaps
[  68s] FINAL      particle-morphing -- merging
[  85s] DONE       particle-morphing -- 85s, 12847 chars
[  86s] SAVED      2026-03-05_animation_particle-morphing_deep.md
```

## Output Files

All outputs go to `scripts/research-output/`:

| File Pattern | Content |
|---|---|
| `<date>_<config>_topic-discovery.md` | Phase 1: ranked domain list with sources |
| `<date>_<config>_<topic-id>_deep.md` | Phase 2: deep research per topic |
| `<date>_<config>_synthesis.md` | Phase 3: cross-topic synthesis |

## Post-Research Review

After the pipeline completes:

1. **Read the cross-topic synthesis** first — it identifies patterns across all domains
2. **Scan individual topic reports** for depth and completeness
3. **Check source counts** — each topic should have 15-40 unique sources
4. **Identify thin areas** — if any topic has fewer than 10 sources, consider re-running with refined queries
5. **Look for contradictions** — different sources may disagree, note these for the user

## Research Quality Standards

The pipeline is designed for depth, not speed. Quality indicators:

- **Source diversity:** Engineering blogs, conference talks, source code, academic papers — not just tutorials
- **Practitioner names:** Real people who shipped real systems, not anonymous content
- **Actionable output:** Code snippets, formulas, specific numbers — not vague advice
- **Gap coverage:** The gap-fill phase should close at least 70% of identified gaps
- **Cross-topic patterns:** The synthesis should identify techniques that appear across multiple domains

## Troubleshooting

| Issue | Fix |
|---|---|
| Rate limit (429) | Reduce `--concurrency` and `--search-batch`, script auto-retries |
| Empty results | Check API key validity, try a simpler test query |
| Thin synthesis | Add more specific search queries to the config |
| Missing sources | Check if topic's search queries are too generic |
| Script crash | Check `scripts/deep-research.ts` for syntax errors, run `npx tsc --noEmit` |
