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
