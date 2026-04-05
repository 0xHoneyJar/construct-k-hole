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
/research --config animation --fast             # Max parallelism (concurrency 6, batch 8)
/research --config animation --interactive      # Pause between phases for steering
/research --config animation --checkpoint       # Save/resume state per topic
```

## Prerequisites (Verify BEFORE Running)

Before executing any research pipeline, verify these. Do NOT proceed if any are missing.

1. **API keys:** `grep -E "GEMINI_API_KEY|GOOGLE_API_KEY" .env` — at least one must be set
2. **Optional:** `grep "FIRECRAWL_API_KEY" .env` — enables deep URL scraping (not required)
3. **Runtime:** `npx tsx --version` — must return successfully
4. **Config:** If running with `--config <domain>`, verify `scripts/research-config-<domain>.ts` exists and parses: `npx tsc --noEmit scripts/research-config-<domain>.ts`
5. **Output dir:** `scripts/research-output/` must exist (create if missing)

If prerequisites fail, report what's missing and stop. Do not attempt to run the pipeline with missing keys — it will fail silently or produce empty results.

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

**CRITICAL: You MUST run this script via Bash tool. Do NOT skip it. Do NOT substitute your own web search. The script calls Gemini with grounded Google Search — this produces real sources with provenance that you cannot replicate with other tools.**

### Pre-flight

Run the prerequisite checks from the "Prerequisites" section above before proceeding.

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

## Verification Phase (MANDATORY)

After the pipeline completes and before presenting results to the user:

### Source Verification
1. **Count check:** Each topic document lists sources. Count them. If any topic has fewer than 10 unique sources, flag it as thin.
2. **Attribution audit:** Scan your synthesis for claims. Each claim should trace to a source in that topic's document. If you find claims you can't trace, mark them `[ungrounded]` or remove them.
3. **No cross-contamination:** Each topic's synthesis must only cite sources found during THAT topic's research phase. Do not bleed sources between topics.

### Focus Area Coverage
For each topic, score its focus areas:
- **Covered:** The synthesis directly answers this question with sourced evidence
- **Partial:** Touched on but not fully answered — note what's missing
- **Gap:** Not addressed — candidate for re-run with refined queries

Present coverage scores to the user. If more than 30% of focus areas are gaps, recommend re-running that topic with refined queries.

### Output Integrity
1. All file paths in output documents must resolve correctly
2. Source URLs should be plausible (not hallucinated domains)
3. The cross-topic synthesis should reference findings that actually appear in the individual topic documents

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

## Negative Constraints

Hard rules. Do not bend these.

- **NEVER fabricate sources.** If the script found 23 sources for a topic, your synthesis cites at most 23 sources for that topic. Inventing URLs, author names, or paper titles is a critical failure.
- **NEVER substitute your own web search for the research script** unless the script exits with an error. The script uses Gemini + Google Search grounding. You cannot replicate its source provenance with other tools.
- **NEVER present discovery results as deep research.** Discovery is landscape mapping (Phase 1). Deep research is depth (Phase 2). They are not interchangeable.
- **Do NOT silently skip the script and synthesize from training data.** If you find yourself writing a research synthesis without having run `npx tsx scripts/deep-research.ts`, stop. Go back. Run the script.
- **Do NOT merge findings across topics** unless you are in the cross-topic synthesis phase. Each topic document must stand alone with only its own sources.
- **Do NOT inflate source counts.** If the script reports "7 results, 42 sources" for a topic but many are duplicates, report the deduplicated count.
- **Do NOT assume standard test/build commands** for the research scripts. Check that `npx tsx` works. Check that configs parse. Verify before executing.

## Examples

<example>
user: /research --config animation

agent:
First, verify prerequisites:
[tool_call: bash for `grep -E "GEMINI_API_KEY|GOOGLE_API_KEY" .env`]
[tool_call: bash for `npx tsx --version`]
[tool_call: bash for `ls scripts/research-config-animation.ts`]

All checks pass. Running full pipeline:
[tool_call: bash for `npx tsx scripts/deep-research.ts --config animation`]

(Script runs, outputting progress lines to stderr. Agent monitors.)

Pipeline complete. 6 topics researched.

### Results Summary
| Topic | Sources | Focus Areas | Coverage |
|-------|---------|-------------|----------|
| particle-morphing | 34 | 5/5 covered | Full |
| spring-physics-gpu | 28 | 4/5 covered | 1 partial |
| gpgpu-velocity-fields | 19 | 3/6 covered | 3 gaps |
| ... | ... | ... | ... |

Topic "gpgpu-velocity-fields" is thin — 3 of 6 focus areas are gaps. Recommend re-running with refined queries targeting FBO ping-pong and velocity texture encoding specifically.

Cross-topic synthesis saved to scripts/research-output/2026-04-05_animation_synthesis.md.
</example>

<example>
user: /research --config animation --topic spring-physics-gpu

agent:
[tool_call: bash for `npx tsx scripts/deep-research.ts --config animation --topic spring-physics-gpu`]

Script exits with error: rate limit (429).

The Gemini API hit rate limits on topic "spring-physics-gpu". The script retries automatically with exponential backoff, but all retries exhausted.

Options:
1. Wait 60 seconds and re-run: the rate limit window usually resets
2. Reduce concurrency: `--concurrency 1 --search-batch 2`
3. Switch to a different model: `--model gemini-2.5-flash`
</example>

## Final Reminder

This pipeline produces reference-quality documents. Every source must be real. Every synthesis must answer its focus areas. Run the script — do not substitute. Verify prerequisites before executing. If results are thin, say so honestly and offer to refine. You are building a knowledge base, not generating content. The difference is provenance.
