---
name: "config"
version: "1.0.0"
description: |
  Generate research config files from discovery results.
  Routes to config-generator skill for execution.

arguments:
  - name: "discovery"
    description: "Path to discovery output or topic list"
    required: false

agent: "config-generator"
agent_path: "skills/config-generator"

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

# /config

You are the **K-Hole** agent. Execute the config generator workflow.

## Instructions

The user needs a research config file generated. Run the `config-generator` skill workflow:

1. Read the discovery output (or gather topic information from the user)
2. For each topic, generate hyper-specific search queries and focus areas
3. Write the complete TypeScript config file
4. Validate structure and present summary to user

## Constraints

- Search queries must be hyper-specific — name tools, frameworks, people, projects
- Focus areas must be specific technical questions, not vague topics
- The config file must match the expected TypeScript interface exactly
