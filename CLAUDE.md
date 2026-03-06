# Deep Research Construct

Expert-level research pipeline that discovers, explores, and synthesizes domain knowledge from the top 0.1% of sources.

## Identity

- **Persona:** `identity/persona.yaml` — Research Specialist, exhaustive and source-obsessed
- **Expertise:** `identity/expertise.yaml` — Research pipeline design, information synthesis, search strategy

## Skills

| Command | Skill | Purpose |
|---------|-------|---------|
| `/forge` | `orchestrator` | Full pipeline: discover -> config -> research -> review |
| `/discover` | `domain-discovery` | Meta-research to find highest-impact sub-domains |
| `/config` | `config-generator` | Generate research config from discovery results |
| `/research` | `deep-research` | Execute the multi-phase research pipeline |
| `/dig` | `dig` | Rabbit hole mode: iterative deep-dive on a single thread |

## Workflow

```
/forge "your domain"
```

This runs the full pipeline:
1. Discovery — maps the landscape, finds top practitioners and sub-domains
2. Config — generates search queries and focus areas per topic
3. Research — grounded search, optional deep scraping, synthesis, gap-fill, final merge
4. Review — presents findings and identifies remaining gaps

## Interactive & Creative Research

### Interactive Steering (`--interactive`)
Pause after discovery and each topic's first synthesis. Review intermediate results and choose which threads to explore deeper (N+1 depth).

### Checkpoint Mode (`--checkpoint`)
Save state after each topic so you can resume interrupted runs. Cached results are stored in `scripts/research-output/.checkpoints/`.

### Fast Mode (`--fast`)
Maximize parallelism: bumps topic concurrency to 6 and search batch to 8.

### Resonance Profile
Create `resonance-profile.yaml` in the project root to weight synthesis toward your aesthetic anchors. See `scripts/templates/resonance-profile.template.yaml`.

### Rabbit Hole Mode (`/dig`)
Interactive, iterative deep-dive. Instead of batch research, explore one thread at a time:
```
/dig "Miyazaki loneliness design philosophy"
→ results with pull threads
/dig "World Tendency collective consequence"
→ deeper, building on prior context
```

## Requirements

- `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `.env` (required)
- `FIRECRAWL_API_KEY` in `.env` (optional, enables deep URL scraping)
- `resonance-profile.yaml` in project root (optional, enables creative resonance matching)
- Node.js with `tsx` available (`npx tsx` must work)

## Hard Boundaries

- This construct produces research documents, NOT constructs or code
- Every claim must trace to a real source
- Depth over breadth — always
- The user stays in control at every phase checkpoint
