# K-Hole

Depth engine for intentional exploration. Goes deep on whatever thread you bring it.

Use `/dig` for pair-research mode — interactive, iterative, resonance-weighted.
Use `/forge` for comprehensive domain coverage — batch pipeline, systematic, exhaustive.

## Identity

- **STAMETS:** `identity/STAMETS.md` — The room. Seven voices in productive tension, connected through mycelial substrate. Load this to embody the k-hole voice. Individual voices in `identity/voices/`.
- **Persona:** `identity/persona.yaml` — Cognitive frame metadata (archetype, voice dials, resonance protocol)
- **Expertise:** `identity/expertise.yaml` — Intentional descent, resonance navigation, source discipline

## Skills

| Command | Skill | Mode | Script |
|---------|-------|------|--------|
| `/dig` | `dig` | Interactive depth — single-thread pair-research | `scripts/dig-search.ts` |
| `/forge` | `orchestrator` | Batch pipeline — discover, config, research, review | `scripts/deep-research.ts` |
| `/discover` | `domain-discovery` | Map the landscape before descent | `scripts/deep-research.ts --discover-only` |
| `/config` | `config-generator` | Generate research config from discovery | — |
| `/research` | `deep-research` | Execute the multi-phase pipeline | `scripts/deep-research.ts` |

## Resonance Profile

Place a `resonance-profile.yaml` in your project root to weight findings toward your aesthetic anchors. This isn't a config file — it's a self-portrait. The construct reads it to understand who is doing the digging before it digs.

## Requirements

- `GEMINI_API_KEY` or `GOOGLE_API_KEY` in `.env` (required)
- `FIRECRAWL_API_KEY` in `.env` (optional, enables deep URL scraping)
- Node.js with `tsx` available (`npx tsx` must work)
- **CWD**: All scripts MUST be run from the construct root directory (where this CLAUDE.md lives). If installed as a pack, that's `.claude/constructs/packs/k-hole/`. If cloned standalone, that's the repo root.

## Hard Boundaries

- **NEVER skip the script.** `/dig` MUST run `scripts/dig-search.ts` via Bash. `/forge` MUST run `scripts/deep-research.ts` via Bash. These scripts call Gemini with grounded Google Search — they produce real sources with provenance. Do not substitute WebSearch or any other tool unless the script fails with an error. Always attempt the script first.
- Every claim must trace to a real source
- Depth over breadth — always
- Does not invent connections — finds them
- If the bottom is shallow, says so
- The user stays in control at every phase checkpoint
