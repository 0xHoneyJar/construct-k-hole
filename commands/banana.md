---
name: "banana"
version: "1.0.0"
description: |
  Image generation via Google's Nano Banana family (Gemini Flash/Pro Image).
  Routes to banana skill for execution.

arguments:
  - name: "prompt"
    description: "A descriptive narrative — describe the scene, don't list keywords"
    required: false

agent: "banana"
agent_path: "skills/banana"

context_files:
  - path: "CLAUDE.md"
    required: true
  - path: "identity/STAMETS.md"
    required: false
---

# /banana

You are the **K-Hole** agent rendering imagery via **Nano Banana** (Google's Gemini Flash/Pro Image family). The /dig loop ends in synthesis; /banana closes the loop into visual reference.

## Instructions

**CRITICAL: You MUST run the banana script via Bash tool. Do NOT fabricate image paths or substitute a different generator. The script calls Gemini Nano Banana via REST and writes real PNG files to disk.**

1. **Accept the visual brief** — take the user's prompt as a scene description, not a keyword list
2. **MUST: Run the banana script** via Bash tool:
   ```bash
   npx tsx scripts/banana.ts --prompt "<descriptive narrative>"
   ```
   Add flags as needed:
   - `--image PATH` for input references (repeatable; up to 14 for Nano Banana 2)
   - `--model gemini-3-pro-image` for professional-quality output (slower, costlier)
   - `--aspect 16:9` / `--aspect 9:16` / etc. for non-square
   - `--size 2K` / `--size 4K` for higher resolution
   - `--n 4` for batch candidates
3. **Parse the JSON output** — read `images[].path` from stdout for the rendered file paths
4. **Apply the documented prompting style**:
   - Describe the scene as a narrative paragraph
   - Use photographic / cinematic language (lens, lighting, angle, mood)
   - For stylized assets: be explicit about the style and request a white background
   - For text rendering: be clear about the text, font descriptively, and the overall design
5. **Surface the artifacts** — share the absolute paths so the user can open them

**Fallback (ONLY if script exits with error):** If the script returns an error JSON (missing API key, blocked content, all retries failed), surface the structured error verbatim. Do NOT silently invent a fallback generator.

## Models

| Alias | Backing slug | When |
|-------|--------------|------|
| `gemini-3-flash-image` (default) | `gemini-3.1-flash-image-preview` | Nano Banana 2 — recommended default, fast |
| `gemini-3-pro-image` | `gemini-3-pro-image-preview` | Nano Banana Pro — professional asset production |
| `gemini-2.5-flash-image` | `gemini-2.5-flash-image` | Original Nano Banana — speed-tier, smaller payloads |

## Output

JSON to stdout. Files written to `grimoires/k-hole/research-output/banana/<timestamp>_<slug>_N.png` (or `--out DIR`).

## Constraints

- Auth requires `GEMINI_API_KEY` or `GOOGLE_API_KEY` — the gemini CLI subscription does not yet expose image-output modalities, so image generation goes through REST with API-key auth
- All generated images carry an invisible **SynthID watermark** (Google policy)
- Reference images: PNG, JPG, WEBP, or GIF; passed as base64 inline_data parts
- Up to 14 references for Nano Banana 2 (10 objects + 4 characters); 11 for Pro; 3 best for original Nano Banana
- Aspect ratios: 1:1, 16:9, 9:16, 4:3, 3:4, 21:9, 4:5, 5:4, 3:2, 2:3, and friends
- Resolution: 512, 1K, 2K, 4K
