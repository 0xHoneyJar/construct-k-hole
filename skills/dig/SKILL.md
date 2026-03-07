---
name: dig
description: K-hole mode — intentional depth, pair-research, resonance-guided exploration
user-invocable: true
allowed-tools: Read, Write, Glob, Grep, Edit, Bash
---

# K-Hole Mode

Intentional descent into a single thread. You and the agent explore together in real-time, going deeper with each exchange. Not delegated-research — pair-research. You're both going somewhere.

A k-hole is chosen. You look at the threshold, understand what going in means, and step through anyway — because the depth itself is the point.

## Trigger

```
/dig
```

## Usage

```
/dig "phenomenology of ketamine dissociation as creative tool"
/dig "Miyazaki loneliness design philosophy"
/dig "CRT phosphor decay as memory metaphor"
/dig "grief rituals mapped to UI transitions"
```

These aren't research queries. They're invitations to depth. The phrasing is already half-synthesized — someone who types this already knows the direction. The construct follows the pull.

## Two Ways to Play

This construct has two modes. They serve different human states. Choose the strategy that works for how you learn.

### /dig — The K-Hole (you are here)

Interactive. Iterative. You go deep on one thread, surface pull threads, pick the one that resonates, go deeper. Each dig builds on the last. The trail IS the output — not a document, but the path you walked through a domain. You come back with a perspective, not a deliverable.

**Best for:** people who learn by following their nose. who trust resonance as a signal. who know what they're after even if they can't name it yet. the thread reveals itself by pulling on it.

### /forge — Batch Pipeline

Systematic. Comprehensive. Discover the landscape, generate configs, execute multi-phase research across 6-8 domains in parallel. Produces exhaustive reference documents with 200+ sources. The output IS the output — documents you can reference, share, build on.

**Best for:** people who learn by mapping territory. who want coverage before committing to depth. who need the document as a foundation for the work that follows.

Both are valid. Both produce knowledge. The difference is the relationship to the material — /dig is immersive, /forge is cartographic. Some domains want one, some want the other. Some want both: /forge to map, then /dig to descend into what pulled hardest.

## How It Works

Each `/dig` invocation:

1. Takes a phrase, finding, or question — a raw thread
2. Runs 2-3 focused grounded searches (Gemini + Google Search)
3. Synthesizes findings with resonance profile weighting
4. Surfaces 3-5 **pull threads** — specific sub-topics worth following deeper
5. The user picks a thread. `/dig` again. Deeper.

Each dig inherits context from every previous dig in the session. The cumulative trail means the agent can build on prior findings, avoid re-covering ground, and notice patterns emerging across the descent.

## Workflow

### Step 1: Accept the Thread

The user provides a phrase, concept, or question. This can be:
- A raw idea: `"loneliness as game mechanic"`
- A finding from prior research: `"the bloodstain system in Dark Souls"`
- A cross-domain connection: `"grief rituals mapped to UI transitions"`
- A resonance from a previous dig: any pull thread that fired

Don't ask clarifying questions unless the thread is genuinely ambiguous. Trust the phrasing. The user chose those words for a reason.

### Step 2: Execute Focused Search

Run 2-3 highly targeted grounded searches via Gemini + Google Search:
1. Focus on practitioner content — engineering blogs, conference talks, source code, papers. Not tutorials.
2. Look for unexpected connections and adjacent domains. The cross-domain hit is often the most valuable.
3. Use the Gemini API directly (grounded search) rather than the batch pipeline.

### Step 3: Synthesize with Resonance

Load `resonance-profile.yaml` if it exists. This is the user's epistemological fingerprint — what they're drawn to, what creates gravitational pull toward depth. Read it as a self-portrait. Understand who is doing the digging before you dig.

When synthesizing:
- Weight findings that connect to the user's aesthetic anchors
- Surface unexpected cross-domain connections prominently
- Name connections explicitly: "this echoes [anchor] because..."
- Distinguish resonance (connects to something real in you) from familiarity (you've seen this before)
- Identify 3-5 pull threads — specific enough to `/dig` on directly

If there's no resonance profile, the research is still valid — but it's generic depth, not personal depth. Note this once, don't nag.

### Step 4: Present Results

```markdown
## Dig: <query>

### Findings
<synthesized results, weighted by resonance>

### Pull Threads
These threads showed signal worth exploring deeper:
1. **<thread>** — <why it has pull, what connection it reveals>
2. **<thread>** — ...
3. **<thread>** — ...

### Sources
- <source list with URLs>
```

Keep the synthesis focused and warm. This is a dialogue, not a report. If something is genuinely interesting, say so. If a thread has unusual pull — a cross-domain echo, an unexpected structural parallel — name it explicitly. The agent has permission to say "that's worth pulling on."

### Step 5: Chain

The user reads results and picks a thread:
```
/dig "World Tendency collective consequence"
```

Each subsequent dig carries forward the full trail context. The deeper you go, the more the agent can pattern-match across your descent.

## Session Trail

Maintain a running context of all previous digs in the session. Store in `scripts/research-output/dig-session-<timestamp>.md`. Each new dig appends to this file, creating a readable exploration log — the trail of descent.

The synthesis prompt for each dig should include summaries of previous digs so the agent can:
- Avoid re-covering ground
- Build on prior findings
- Identify patterns emerging across the trail
- Notice when you keep returning to the same structural pattern (this is a resonance signal)

## Quality Standards

- Each dig should return quickly — speed matters for conversational flow
- Findings must trace to real sources. Even beautiful connections need grounding.
- Pull threads should be specific enough to dig on directly — not vague topic headers
- The trail document should be readable as a standalone exploration log
- If the bottom is shallow, say so. Don't invent depth that isn't there.

## The Emergence

After several digs, there's a moment where the agent (or the user) notices: the threads are converging on something. A structural pattern. A lens. This is the emergence — the insight that wasn't in any single dig but appeared from the trail.

When you notice this, name it. Not as a conclusion — as an observation: "across these digs, you keep finding [pattern]. that might be the thing worth writing about."

The emergence is not a deliverable. It's a perspective that changes how you see everything after.
