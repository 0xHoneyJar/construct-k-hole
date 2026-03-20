# Visual Dig — K-Hole Creative Director Loop

Three-stage pipeline that sees, researches, and synthesizes. Feed it a render and
a creative brief, and it returns actionable shader/code recommendations grounded
in real web research.

## What It Does

1. **SEE** — Gemini multimodal vision analyzes the image as a technical art director.
   Scores material quality, noise, Fresnel/rim, color richness, illustrative style.
   Identifies specific gaps with GLSL technique names.

2. **RESEARCH** — Gemini grounded web search finds relevant shader techniques, Three.js/R3F
   implementations, and code examples that address the gaps identified in step 1.

3. **SYNTHESIZE** — Merges the visual analysis with web research into 3-5 specific
   shader modifications, each with working GLSL code.

## How It Differs From Visual Review

| | Visual Review | Visual Dig |
|---|---|---|
| **Purpose** | Score and critique a render | Get from critique to working code |
| **Output** | Scored dimensions + recommendations | GLSL code snippets + technique breakdown |
| **Web research** | None | Grounded Google Search via Gemini |
| **Best for** | "How good is this?" | "How do I make this better?" |

Visual Review is a camera. Visual Dig is a creative director with a browser open.

## Usage

```bash
# Basic — analyze a render with a brief
npx tsx scripts/visual-dig.ts --image render.png --brief "make this look like UE5 stylized water"

# With reference — "match this look"
npx tsx scripts/visual-dig.ts --image render.png --reference ref.png --brief "match this reference"

# General analysis (no brief)
npx tsx scripts/visual-dig.ts --image render.png

# Model override
npx tsx scripts/visual-dig.ts --image render.png --brief "cel-shading bands" --model gemini-2.5-pro
```

## In a Dig Session

During `/dig`, when you're iterating on shader work:

1. Render your current state
2. Run `visual-dig` with the render and a brief describing what you want
3. Read the synthesis — it gives you GLSL code to try
4. Apply the code, re-render, re-dig. The loop tightens.

The `--reference` flag is the power move. When studying a reference piece (Arcane,
Hearthstone, UE5 stylized demo), point visual-dig at both your render and the
reference. The research phase specifically searches for techniques to close the gap.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Gemini API key (or `GOOGLE_API_KEY`) |
| `VISUAL_DIG_MODEL` | No | Override default model (default: `gemini-2.5-flash`) |

Keys are resolved via construct-runtime credential cascade:
`.env` -> `~/.loa/credentials.json` -> `process.env`

## Output

Structured JSON via stdout (Nakamoto protocol). Key fields:

- `analysis` — prose visual critique with scored dimensions
- `research` — grounded web findings (truncated to 3000 chars)
- `synthesis` — 3-5 shader modifications with working GLSL code
- `brief` — the creative brief that drove the analysis
- `model` — actual model used (may differ if fallback occurred)
- `duration_s` — total pipeline time

Reports are also saved to `grimoires/k-hole/research-output/visual-dig-{timestamp}.json`.

## Connection to STAMETS

This is Warburg's atlas plus Ulbricht's bazaar. The image analysis places your work
in productive tension with professional standards. The grounded search reaches into
the bazaar of techniques and implementations. The synthesis brings it back — not as
abstract knowledge, but as code you can paste into your shader.
