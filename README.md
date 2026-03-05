# Deep Research

> Expert-level research pipeline that discovers, explores, and synthesizes domain knowledge from the top 0.1% of sources. Produces comprehensive research documents for any domain.

## What It Does

Deep Research is a construct that packages a multi-phase research pipeline. Give it a domain you want to master, and it will:

1. **Discover** the landscape — who are the top practitioners, what are the key sub-domains, what separates amateurs from experts
2. **Generate** a research config with hyper-specific search queries and focus areas
3. **Execute** deep research — grounded search via Gemini + Google Search, optional deep scraping via Firecrawl, multi-round synthesis with gap analysis
4. **Synthesize** findings into comprehensive, actionable reference documents

The output is designed for depth, not speed. Each topic goes through grounded search, first-pass synthesis, gap analysis, gap-fill search, and final exhaustive synthesis. The result is the kind of knowledge dump you'd get from interviewing the top 0.1% of practitioners.

## Quick Start

```bash
# Install the construct
# (follow your constructs network installation method)

# Run the full pipeline
/forge "WebGL particle animations"

# Or step by step:
/discover "React Native performance"    # Find what to research
/config                                  # Generate research config
/research --config react-native          # Run the pipeline
```

## Skills

| Command | Skill | Purpose |
|---------|-------|---------|
| `/forge` | orchestrator | Full pipeline with user checkpoints |
| `/discover` | domain-discovery | Meta-research to find highest-impact topics |
| `/config` | config-generator | Generate research config from discovery results |
| `/research` | deep-research | Execute the multi-phase pipeline |

## Pipeline Architecture

```
User: "I want to master X"
         |
         v
    /discover
    Meta-research via Gemini + Google Search (6-10 queries)
         |
         v
    Ranked list of 6-8 research domains
    [USER CHECKPOINT: review and adjust]
         |
         v
    /config
    Generate research config (search queries + focus areas per topic)
    [USER CHECKPOINT: review queries]
         |
         v
    /research
    For each topic (parallel):
      1. Grounded Search (5-7 queries via Gemini + Google Search)
      2. Deep Scraping (top N URLs via Firecrawl, optional)
      3. First Synthesis (merge findings against focus areas)
      4. Gap Analysis (identify unanswered questions)
      5. Gap Fill (3-5 additional grounded searches)
      6. Final Synthesis (exhaustive merge of all rounds)
         |
         v
    Cross-Topic Synthesis
    (patterns, implementation order, key findings)
         |
         v
    Output: scripts/research-output/*.md
```

## Requirements

| Requirement | Required | Notes |
|---|---|---|
| Gemini API Key | Yes | `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `.env` |
| Firecrawl API Key | No | `FIRECRAWL_API_KEY` in `.env` — adds depth via full URL scraping |
| Node.js + tsx | Yes | `npx tsx` must work |

## Research Quality

The pipeline is designed for the top 0.1%, not the top 10%. Quality signals:

- **Source diversity** — Engineering blogs, conference talks, source code, papers. Not tutorials.
- **Named practitioners** — Real people who shipped real systems.
- **Actionable output** — Code, formulas, specific numbers. Not vague advice.
- **Gap coverage** — Two rounds of search. The first pass always misses things.
- **Cross-topic patterns** — Techniques that appear across multiple domains.

## Example Output

The `webgl-particles` construct was built using this pipeline:
- 8 research domains, 229 unique sources
- Topics: GPU architecture, procedural math, production case studies, optical realism, motion physics, R3F patterns, globe geometry, creative coding workflows
- Each topic: 15-40 sources, complete code recipes, production values, amateur vs professional comparisons

## License

MIT
