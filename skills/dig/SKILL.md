---
name: dig
description: Rabbit hole mode - iterative deep-dive into a single research thread
user-invocable: true
allowed-tools: Read, Write, Glob, Grep, Edit, Bash
---

# Rabbit Hole Mode

Interactive, iterative deep-dive into a single research thread. Instead of batch-processing topics, this mode lets you and the agent explore a single thread together in real-time, going deeper with each exchange.

## Trigger

```
/dig
```

## Usage

```
/dig "Miyazaki loneliness design philosophy"
/dig "CRT phosphor decay as memory metaphor"
/dig "Dark Souls bloodstain collective consequence mechanics"
```

## How It Works

Each `/dig` invocation:

1. Takes a phrase, finding, or question from the user
2. Runs a focused grounded search (Gemini + Google Search) on that exact thread
3. Synthesizes findings inline with resonance profile weighting (if available)
4. Presents results with highlighted threads worth pulling on further
5. The user can then `/dig` again on any thread that resonated

Each dig inherits context from previous digs in the session, building a cumulative understanding.

## Workflow

### Step 1: Accept the Thread

The user provides a phrase, concept, or question to explore. This can be:
- A raw idea: `"loneliness as game mechanic"`
- A finding from prior research: `"the bloodstain system in Dark Souls"`
- A cross-domain connection: `"grief rituals mapped to UI transitions"`

### Step 2: Execute Focused Search

Run 2-3 highly targeted grounded searches via Gemini + Google Search:
1. Focus on practitioner content, not tutorials
2. Look for unexpected connections and adjacent domains
3. Use the Gemini API directly (grounded search) rather than the batch pipeline

### Step 3: Synthesize with Resonance

When synthesizing findings:
- Load `resonance-profile.yaml` if it exists
- Weight findings that connect to the user's aesthetic anchors
- Surface unexpected cross-domain connections prominently
- Identify 3-5 "pull threads" — specific sub-topics worth digging deeper on

### Step 4: Present Results

Format the output as:

```markdown
## Dig: <query>

### Findings
<synthesized results, weighted by resonance>

### Pull Threads
These threads showed signal worth exploring deeper:
1. **<thread>** — <why it's interesting, what connection it reveals>
2. **<thread>** — ...
3. **<thread>** — ...

### Sources
- <source list>
```

### Step 5: Chain

The user reads results and picks a thread:
```
/dig "World Tendency collective consequence"
```

Each subsequent dig carries forward context from previous digs, building a cumulative trail.

## Session Context

Maintain a running context of all previous digs in the session. Store in `scripts/research-output/dig-session-<timestamp>.md`. Each new dig appends to this file, creating a trail of exploration.

The synthesis prompt for each dig should include summaries of previous digs so the agent can:
- Avoid re-covering ground
- Build on prior findings
- Identify patterns emerging across the trail

## Resonance Integration

If `resonance-profile.yaml` exists, the dig synthesis should:
- Highlight findings that connect to the user's keywords, references, and touchstones
- Flag unexpected resonances: "This connects to [reference] because..."
- Weight aesthetic/experiential connections alongside technical findings

## Quality Standards

- Each dig should return in under 30 seconds
- Findings must trace to real sources
- Pull threads should be specific enough to dig on directly
- The trail document should be readable as a standalone exploration log
