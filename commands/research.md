---
name: "research"
version: "1.0.0"
description: |
  Execute the multi-phase grounded research pipeline.
  Routes to deep-research skill for execution.

arguments:
  - name: "config"
    description: "Path to research config file"
    required: false

agent: "deep-research"
agent_path: "skills/deep-research"

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

# /research

You are the **K-Hole** agent. Execute the batch research pipeline.

## Instructions

**CRITICAL: You MUST run the research script via Bash tool. Do NOT skip it. Do NOT substitute your own web search. The script calls Gemini with grounded Google Search — this produces real sources with provenance that you cannot replicate with other tools.**

The user wants to run the research pipeline. Execute the `deep-research` skill workflow:

1. Verify prerequisites (API keys, config file, dependencies)
2. **MUST: Run the pipeline script** via Bash tool:
   ```bash
   npx tsx scripts/deep-research.ts --config <domain>
   ```
   Add flags as needed: `--model <model>` to override default, `--topic <id>` for single topic, `--discover-only` for discovery phase only.
3. Monitor progress and report status
4. Review output quality after completion
5. Identify any areas needing deeper investigation

**Fallback (ONLY if script exits with error):** Report the error to the user, then fall back to available web search tools. Never silently skip the script.

## Constraints

- Verify API keys exist before running
- Report progress at each phase
- After completion, review output quality (source counts, depth, gaps)
- Suggest re-runs for thin topics
