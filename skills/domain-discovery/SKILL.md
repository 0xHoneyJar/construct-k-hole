---
name: domain-discovery
description: Meta-research to discover the highest-impact sub-domains within a field before committing to deep research
user-invocable: true
allowed-tools: Read, Write, Glob, Grep, Edit, Bash
---

# Domain Discovery

Meta-research skill that takes a broad domain and identifies the specific sub-domains worth researching deeply. This is the "what should we research?" phase — it uses grounded search to map the landscape before committing resources.

## Trigger

```
/discover
```

## Usage

```
/discover "WebGL particle animations"
/discover "Production Kubernetes networking"
/discover "React Native performance optimization"
```

## Workflow

### Step 0: Verify Environment

Before running any discovery:
1. `grep -E "GEMINI_API_KEY|GOOGLE_API_KEY" .env` — at least one must be set
2. `npx tsx --version` — must return successfully
3. `ls scripts/deep-research.ts` — the pipeline script must exist

Do NOT proceed if prerequisites fail. Report what's missing and stop.

### Step 1: Understand the User's Goal

Ask the user:
1. **What's the domain?** (e.g., "WebGL particle animations")
2. **What do you already know?** (existing skills, experience level)
3. **What's the goal state?** (e.g., "Build production-quality particle morphing transitions")
4. **What will you build with this knowledge?** (concrete output, not abstract learning)

### Step 2: Generate Discovery Queries

Based on the user's input, generate 6-10 meta-research queries. These are NOT the deep research queries — they're landscape-mapping queries designed to find:

- **Who are the top 0.000001% practitioners** in this domain and what do they specifically do?
- **What separates amateur from expert** work in this field?
- **What are the real bottlenecks** and breakthroughs?
- **What are the sub-domains** that have the highest impact?
- **What are the specific techniques** that the top practitioners use?
- **What are the common mistakes** that everyone makes?

**Query format — be hyper-specific:**
```
BAD:  "Best practices for WebGL"
GOOD: "What specific techniques do Stripe, GitHub, Vercel engineers use for production
       WebGL particle systems that differ from typical Three.js tutorials? Search for
       engineering blogs, conference talks, and open source implementations."
```

### Step 3: Run Discovery

**MUST run via Bash tool. Do NOT skip this step. Do NOT substitute your own web search.**

Write a temporary research config with ONLY the discovery queries and run the pipeline in discover-only mode:

```bash
npx tsx scripts/deep-research.ts --config <domain> --discover-only
```

If no config exists yet, create a minimal one with just the discovery queries (no TOPICS needed for discover-only mode).

**Fallback (ONLY if script exits with error):** Report the error to the user, then fall back to available web search tools. Never silently skip the script.

### Step 4: Synthesize Results

After the discovery queries return, synthesize them into a ranked list of 6-8 research domains. For EACH domain provide:

1. **Domain name** — Clear, specific title (not generic)
2. **Why it's high-ROI** — What specific improvement it unlocks
3. **What the user is currently missing** — Specific gaps relative to their stated knowledge
4. **Who the key practitioners are** — Real names, real contributions
5. **Search queries** — 5-7 highly specific search queries that would go deep
6. **Focus areas** — 3-6 specific technical questions to answer
7. **Expected output** — Concrete artifacts the research should produce

### Step 5: Present to User

Show the ranked topic list and ask:
- Which topics to include (default: all)
- Which to prioritize (research order)
- Any topics to add that the meta-research missed
- Any adjustments to focus areas

Save the discovery output to `scripts/research-output/<date>_<domain>_topic-discovery.md`.

## Negative Constraints

- **NEVER fabricate discovery results.** If the grounded search found 4 sub-domains, report 4. Don't pad to 8 from your training data.
- **NEVER substitute your own web search for the discovery script** unless it exits with an error. Grounded search provenance cannot be replicated.
- **NEVER skip the user checkpoint.** Discovery outputs must be reviewed and approved before becoming config inputs. The user steering the topic selection is the entire point of this phase.
- **Do NOT present generic topic lists.** "Performance optimization" is not a discovery finding. "How Stripe's particle system avoids GPU stalls on M1 by batching draw calls into 4-instance groups" is a discovery finding.
- **Do NOT confuse discovery with deep research.** Discovery maps the territory at reconnaissance depth. It identifies WHAT to research deeply, not the deep findings themselves.

## Quality Criteria for Discovery Queries

A good discovery query:
- Names specific companies, people, or projects
- Asks for "what they specifically do differently" not "best practices"
- Targets engineering blogs, conference talks, and source code — not tutorials
- Includes enough context that Gemini + Google Search can find expert-level content
- Covers multiple angles: practitioners, techniques, mistakes, breakthroughs

A bad discovery query:
- Is generic ("WebGL best practices")
- Targets tutorial-level content
- Asks for opinions instead of techniques
- Is too narrow for a discovery phase (save specificity for deep research)

## Output Format

The discovery document should be structured as:

```markdown
# Domain Discovery: <domain>

## User Context
<what they know, what they want to learn, what they'll build>

## Discovery Method
<number of queries, sources consulted>

## Ranked Research Domains

### 1. <Domain Name>
**Why:** <specific improvement it unlocks>
**Gap:** <what the user is missing>
**Key people:** <real names>
**Suggested queries:** <5-7 queries>
**Focus areas:** <3-6 questions>

### 2. ...
```
