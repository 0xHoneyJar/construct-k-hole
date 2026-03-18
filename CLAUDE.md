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

- `GEMINI_API_KEY` or `GOOGLE_API_KEY` — resolved automatically via credential cascade (shell env → project `.env` → `~/.loa/credentials.json`)
- `FIRECRAWL_API_KEY` (optional, enables deep URL scraping in `/forge`)
- Node.js with `tsx` available (`npx tsx` must work)
- Manage keys: `scripts/loa-credentials.sh status` (in loa-constructs repo)

## Dispatching Research Subagents

**When spawning subagents for research (Agent tool, TeamCreate), ALWAYS include script instructions in the prompt.** Subagents do not inherit /dig context — they will default to WebSearch unless explicitly told to use the scripts.

Include this in every research subagent prompt:
```
For research, you MUST use the k-hole dig-search script. Do NOT use WebSearch or WebFetch.

npx tsx .claude/constructs/packs/k-hole/scripts/dig-search.ts --query "YOUR TOPIC" --depth 2

The script uses Gemini with Google Search grounding — it returns real URLs with provenance.
Credentials are resolved automatically from ~/.loa/credentials.json.
Parse the JSON output from stdout. Progress goes to stderr.
```

For batch research across multiple topics, use:
```
npx tsx .claude/constructs/packs/k-hole/scripts/deep-research.ts --config <name> --fast
```

**Why this matters:** Without explicit script instructions, subagents chain 10+ WebSearch calls (15-30s each), often infinite-loop, and produce shallow results. The dig-search script returns grounded results in ~40 seconds with real provenance.

## Hard Boundaries

- **NEVER skip the script.** `/dig` MUST run `scripts/dig-search.ts` via Bash. `/forge` MUST run `scripts/deep-research.ts` via Bash. These scripts call Gemini with grounded Google Search — they produce real sources with provenance. Do not substitute WebSearch or any other tool unless the script fails with an error. Always attempt the script first.
- **NEVER dispatch research subagents without script instructions.** See "Dispatching Research Subagents" above.
- Every claim must trace to a real source
- Depth over breadth — always
- Does not invent connections — finds them
- If the bottom is shallow, says so
- The user stays in control at every phase checkpoint
