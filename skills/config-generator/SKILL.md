---
name: config-generator
description: Generates research config files from discovery results
user-invocable: true
allowed-tools: Read, Write, Glob, Grep, Edit
---

# Config Generator

Generates a complete research config file from domain discovery results. The config file drives the deep research pipeline.

## Trigger

```
/config
```

## Usage

```
/config                           # Interactive — asks for domain and discovery results
/config "animation"               # Generate config for a specific domain name
```

## Workflow

### Step 1: Gather Inputs

Read the discovery output document (from `/discover` phase) to get:
- The ranked list of research domains
- The user's context (what they know, what they want to learn)
- Specific search queries and focus areas per domain

If no discovery document exists, ask the user to run `/discover` first or provide the topic list manually.

### Step 2: Generate the Config

Create a TypeScript config file at `scripts/research-config-<domain>.ts` following this exact structure:

```typescript
/**
 * Research Config: <Domain Title>
 *
 * Focus areas:
 * <bullet list of all topics>
 */

export interface DiscoveryQuery {
  id: string;
  query: string;
}

export interface Topic {
  id: string;
  name: string;
  searchQueries: string[];
  focusAreas: string[];
}

// --- Discovery Queries (Phase 1) ---

export const DISCOVERY_QUERIES: DiscoveryQuery[] = [
  // 6-10 meta-research queries for landscape mapping
];

// --- Deep Research Topics (Phase 2) ---

export const TOPICS: Topic[] = [
  // 6-8 deep research topics with search queries and focus areas
];

// --- Synthesis Context ---

export const SYNTHESIS_CONTEXT = `<paragraph describing what the user knows and wants to learn>`;
```

### Step 3: Quality Check Each Topic

For each topic, verify:

**Search Queries (5-7 per topic):**
- Each query is hyper-specific, not generic
- Queries name real tools, frameworks, people, or projects
- Queries target expert-level content (engineering blogs, source code, conference talks)
- Queries cover different angles of the same topic
- Queries include enough context for grounded search to find high-quality results

**Focus Areas (3-6 per topic):**
- Each focus area is a specific technical question, not a vague topic
- Focus areas define what "done" looks like for this topic's research
- Focus areas guide the synthesis — the final document should answer each one
- Focus areas are ordered from foundational to advanced

**Query Quality Examples:**

```
BAD:  "React performance optimization techniques"
GOOD: "React concurrent rendering Suspense transition startTransition vs useDeferredValue
       performance comparison real-world benchmarks Dan Abramov blog posts"

BAD:  "Kubernetes networking"
GOOD: "Kubernetes CNI plugin comparison Cilium vs Calico vs Flannel eBPF dataplane
       throughput benchmarks production clusters 10000+ pods real world performance"
```

### Step 4: Generate SYNTHESIS_CONTEXT

Write a paragraph that tells the synthesis model:
- What the user has already built or knows
- What specific gap they're trying to fill
- What they'll build with the research output
- What "success" looks like for this research

This context is injected into every synthesis prompt to keep outputs focused and practical.

### Step 5: Validate and Save

1. Save to `scripts/research-config-<domain>.ts`
2. **Run validation (MANDATORY):**
   ```bash
   npx tsc --noEmit scripts/research-config-<domain>.ts
   ```
   If this fails, fix the TypeScript errors before presenting to the user. Common issues: missing commas in arrays, unescaped quotes in query strings, mismatched interface types.
3. **Verify exports:** The file must export `DISCOVERY_QUERIES`, `TOPICS`, and `SYNTHESIS_CONTEXT` matching the interfaces defined in Step 2.
4. **Path check:** Confirm the file path resolves correctly: `ls -la scripts/research-config-<domain>.ts`
5. Show the user a summary:
   - Number of discovery queries
   - Number of topics
   - Total search queries across all topics
   - Estimated API calls (discovery + deep research)

### Negative Constraints

- **NEVER generate a config with generic search queries.** "Best practices for X" is not a research query. Every query must name specific people, tools, codebases, or techniques.
- **Do NOT generate configs without discovery input.** If there's no discovery document, ask the user to run `/discover` first or provide the topic list manually. Do not invent topics from training data.
- **Do NOT skip the tsc validation.** A config that doesn't parse will crash the pipeline mid-run, wasting API calls on already-completed topics.

### Topic ID Convention

Use kebab-case IDs that are descriptive:
```
GOOD: "particle-morphing", "spring-physics-gpu", "gpgpu-velocity-fields"
BAD:  "topic-1", "research-area-a", "stuff"
```

## Output

A complete, ready-to-run research config file at `scripts/research-config-<domain>.ts`.

Run with:
```bash
npx tsx scripts/deep-research.ts --config <domain>
npx tsx scripts/deep-research.ts --config <domain> --discover-only  # discovery phase only
npx tsx scripts/deep-research.ts --config <domain> --topic <id>     # single topic
```
