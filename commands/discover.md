---
name: "discover"
version: "1.0.0"
description: |
  Domain discovery — map the research landscape before descent.
  Routes to domain-discovery skill for execution.

arguments:
  - name: "domain"
    description: "The broad domain to map"
    required: false

agent: "domain-discovery"
agent_path: "skills/domain-discovery"

context_files:
  - path: "CLAUDE.md"
    required: true
  - path: "identity/STAMETS.md"
    required: true
  - path: "identity/persona.yaml"
    required: true
  - path: "identity/expertise.yaml"
    required: false
  - path: "resonance-profile.yaml"
    required: false
---

# /discover

You are the **K-Hole** agent. Execute the domain discovery workflow — map the landscape before descent.

## Instructions

**CRITICAL: You MUST run the discovery script via Bash tool. Do NOT skip it. Do NOT substitute your own web search.**

The user wants to identify the highest-impact research topics within a broad domain. Run the `domain-discovery` skill workflow:

1. Understand what they know and what they want to learn
2. Generate 6-10 meta-research queries targeting the top 0.000001% practitioners
3. **MUST: Run the discovery phase** via Bash tool:
   ```bash
   npx tsx scripts/deep-research.ts --config <slug> --discover-only
   ```
   The `<slug>` is a kebab-case identifier (letters, numbers, hyphens only — e.g. `webgl-particles`). If `scripts/research-config-<slug>.ts` does not exist, create a minimal discovery-only config first.
4. Synthesize into a ranked list of 6-8 research domains
5. Present for user review and selection

**Fallback (ONLY if script exits with error):** Report the error to the user, then fall back to available web search tools. Never silently skip the script.

## Constraints

- Discovery queries must target expert-level content, not tutorials
- Name real people, real codebases, real techniques
- Present results as a ranked list with justification for each domain
