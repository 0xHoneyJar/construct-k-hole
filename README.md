# K-Hole

A depth engine. Give it a thread worth pulling — it goes deep.

> **k-hole** (constructive sense): intentional descent into a domain, chosen because the depth itself is the reward. not a rabbit hole — those are accidental. a k-hole is deliberate.

## Two Modes

### /dig — Pair-Research (the k-hole)

Interactive, iterative deep-dive into a single thread. You and the agent explore together in real-time, going deeper with each exchange. Each dig surfaces pull threads — specific sub-topics worth following further.

```
/dig "Miyazaki loneliness design philosophy"
/dig "CRT phosphor decay as memory metaphor"
/dig "Dark Souls bloodstain collective consequence mechanics"
/dig "grief rituals mapped to UI transitions"
```

These aren't research queries. They're invitations to depth.

Each dig inherits context from previous digs, building a cumulative trail of exploration. If you have a `resonance-profile.yaml`, findings that connect to your aesthetic anchors are surfaced prominently.

### /forge — Batch Pipeline (systematic coverage)

Full multi-phase research pipeline for when you want comprehensive domain mastery. Give it a domain and it maps the landscape, generates hyper-specific search queries, executes deep research with gap analysis, and synthesizes everything into reference-quality documents.

```
/forge "WebGL particle animations"
```

This runs: discovery (landscape mapping) -> config (query generation) -> research (grounded search + scrape + synthesis + gap-fill) -> cross-topic synthesis.

## Resonance Profile

Place a `resonance-profile.yaml` in your project root. This tells the construct what you're drawn to — the findings that match get surfaced prominently.

```yaml
keywords:
  - loneliness as design
  - collective consequence
  - phosphor decay

references:
  - Dark Souls
  - Neuromancer
  - Wabi-sabi

touchstones:
  - game mechanics as emotional language
  - decay and impermanence in interfaces
  - constraint as creative catalyst

aesthetic: Minimalist, melancholic, systems-driven.
```

Fill this in before you dig anything meaningful. It's fifteen minutes that changes what you find.

## Pipeline Architecture

```
/dig "your thread"                         /forge "your domain"
     |                                          |
     v                                          v
  Focused grounded search              Discovery (6-10 meta-queries)
     |                                          |
     v                                          v
  Synthesis with resonance             Config generation (queries + focus areas)
     |                                          |
     v                                          v
  Pull threads surfaced                Per-topic deep research (parallel):
     |                                    grounded search -> scrape -> synthesize
     v                                    -> gap analysis -> gap fill -> final merge
  User picks a thread,                          |
  /dig again (deeper)                           v
                                        Cross-topic synthesis
                                                |
                                                v
                                        Output: research-output/*.md
```

## Requirements

| Requirement | Required | Notes |
|---|---|---|
| Gemini API Key | Yes | `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `.env` |
| Firecrawl API Key | No | `FIRECRAWL_API_KEY` — adds depth via full URL scraping |
| Node.js + tsx | Yes | `npx tsx` must work |

## All Commands

| Command | Purpose |
|---------|---------|
| `/dig` | Interactive pair-research — k-hole mode |
| `/forge` | Full batch pipeline with user checkpoints |
| `/discover` | Meta-research to map the landscape |
| `/config` | Generate research config from discovery |
| `/research` | Execute the multi-phase pipeline |

## License

MIT

