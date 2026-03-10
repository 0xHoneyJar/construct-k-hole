---
name: orchestrator
description: Batch pipeline — systematic domain research from landscape mapping to exhaustive synthesis
user-invocable: true
allowed-tools: Read, Write, Glob, Grep, Edit, Bash, Agent
---

# Forge — Batch Research Pipeline

Systematic domain mastery. Maps the landscape, generates hyper-specific search queries, executes deep research with gap analysis across 6-8 domains in parallel, synthesizes everything into reference-quality documents.

This is the cartographic mode of K-Hole. If `/dig` is immersive pair-research, `/forge` is comprehensive territory mapping. Use `/forge` when you want coverage. Use `/dig` when you want depth on a single thread. Use both when you want to map first, then descend into what pulled hardest.

## Trigger

```
/forge
```

## Usage

```
/forge "WebGL particle animations"
/forge "Rust async runtime internals"
/forge "Production Kubernetes networking"
```

## Full Pipeline

The orchestrator runs four phases in sequence:

### Phase 1: Domain Discovery (`/discover`)

**Input:** The user's high-level domain description (e.g., "WebGL particle animations")

**What happens:**
1. **MUST run via Bash tool:**
   ```bash
   npx tsx scripts/deep-research.ts --config <domain> --discover-only
   ```
2. The script runs 6-10 grounded meta-research queries — Gemini + Google Search finds the landscape: who the top practitioners are, what the key sub-domains are, what separates amateurs from experts
3. Synthesize findings into a ranked list of 6-8 high-impact research topics
4. Present the ranked topics to the user for review and selection

**Output:** A topic discovery document with ranked research domains

**User checkpoint:** The user reviews and can add/remove/reprioritize topics before proceeding.

### Phase 2: Config Generation (`/config`)

**Input:** The approved topic list from Phase 1

**What happens:**
1. For each approved topic, generate:
   - 5-7 highly specific search queries targeting the top 0.000001% of sources
   - 3-6 focus areas defining what specific technical questions to answer
2. Generate a `SYNTHESIS_CONTEXT` paragraph describing what the user already knows and what they want to learn
3. Write the complete research config file to `scripts/research-config-<domain>.ts`
4. Validate the config structure matches the expected interface

**Output:** A ready-to-run research config file

**User checkpoint:** The user can review and tweak queries/focus areas.

### Phase 3: Deep Research (`/research`)

**Input:** The generated config file

**What happens:**
1. **MUST run via Bash tool:**
   ```bash
   npx tsx scripts/deep-research.ts --config <domain>
   ```
   Add `--model <model>` to override default. Add `FORGE_MODEL=<model>` env var for sticky override.
2. For each topic, the script runs:
   - Grounded search (Gemini + Google Search) with all search queries
   - Optional deep scraping (Firecrawl) of the highest-value URLs found
   - First-pass synthesis against focus areas
   - Gap analysis to identify what's still missing
   - Second round of grounded search on gap queries
   - Final exhaustive synthesis merging all findings
3. Cross-topic synthesis identifying patterns across all domains
4. All outputs saved to `scripts/research-output/`

**Output:** Individual topic research documents + cross-topic synthesis

### Phase 4: Review & Organize

**Input:** All research output documents

**What happens:**
1. Read all generated research documents
2. Present a summary of findings to the user:
   - Total sources consulted
   - Key discoveries per topic
   - Cross-cutting patterns
   - Highest-impact findings
3. Identify any remaining gaps or areas that need deeper investigation
4. Optionally re-run specific topics with refined queries

**Output:** Final organized research collection ready for use

## Environment Requirements

Before running, verify:
1. `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set in `.env`
2. `FIRECRAWL_API_KEY` is set in `.env` (optional, enables deep URL scraping)
3. Node.js and `tsx` are available (`npx tsx` must work)
4. The `scripts/` directory exists with `deep-research.ts`

## Error Handling

- If Gemini returns 429 (rate limit): the script retries with exponential backoff
- If a topic fails: the script continues with remaining topics and reports the failure
- If Firecrawl is unavailable: the script skips deep scraping and relies on Gemini's grounded search summaries
- If the user's domain is too broad: suggest narrowing before proceeding

## Principles

1. **Depth over breadth** — 6 deeply-researched topics beat 20 shallow ones
2. **Real sources only** — Every claim must trace to a real person, codebase, or publication
3. **Actionable over theoretical** — Code, numbers, formulas. Not opinions or vague advice
4. **Gap-fill is mandatory** — The first pass always misses things. The second pass catches them
5. **User stays in control** — Checkpoints between phases let the user steer the research
