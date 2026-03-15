# Visual Review — K-Hole Gets Eyes

Visual analysis capability for creative pair-research. When you're deep in a dig
and need to evaluate visual work — renders, compositions, palettes, references —
this is Warburg's atlas made literal.

## What It Does

Sends images to Gemini's multimodal API and returns structured analysis:
scored dimensions, specific recommendations, palette extraction.

## Modes

| Mode | What It Does | When to Use |
|------|-------------|-------------|
| `review` | General visual quality assessment with scored dimensions | First look at a render |
| `compare` | Side-by-side against a reference image | "How close are we to this?" |
| `audit` | Detailed technical production-readiness check | Pre-export quality gate |
| `palette` | Extract and analyze color palette | Color decisions |

## Usage

```bash
# General review
npx tsx scripts/visual-review.ts --image render.png

# Compare against reference
npx tsx scripts/visual-review.ts --image render.png --reference target.png

# Focused analysis
npx tsx scripts/visual-review.ts --image render.png --focus "palette warmth"

# Palette extraction
npx tsx scripts/visual-review.ts --image render.png --mode palette

# Production audit
npx tsx scripts/visual-review.ts --image render.png --mode audit
```

## In a Dig Session

During `/dig`, when visual work is on the table:

1. Take a screenshot or render
2. Run `visual-review` with the image
3. Use the scored dimensions to identify the biggest gap
4. Pull that thread — dig into the specific technique that closes the gap
5. Apply, re-render, re-review. The loop tightens.

The `--reference` flag is particularly powerful during dig sessions. When you're
studying a reference piece, compare your work against it iteratively. The gap
analysis tells you exactly what to work on next.

## Output

All modes return structured JSON via stdout (Nakamoto protocol). Key fields:

- `analysis` — prose assessment
- `scores` — rated dimensions (0-10)
- `recommendations` — prioritized action items
- `strengths` / `gaps` — what works, what doesn't (compare mode)
- `dominant_colors` — extracted palette (palette mode)

## Connection to STAMETS

This is Warburg's voice made operational. The Mnemosyne Atlas wasn't just about
collecting images — it was about placing them in productive tension, seeing what
emerged from juxtaposition. Visual review does the same: your render next to your
reference, scored and decomposed, revealing where the resonance lives and where
the gaps demand attention.
