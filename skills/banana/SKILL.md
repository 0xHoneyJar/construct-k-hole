---
name: banana
description: "Generate imagery via Google Nano Banana (Gemini 3.1 Flash Image / Gemini 3 Pro Image preview models)."
capabilities:
  schema_version: 1
  read_files: true
  search_code: false
  write_files: true
  execute_commands: true
  web_access: true
  user_interaction: false
  agent_spawn: false
  task_management: false
---

# Banana — Nano Banana Image Generation

Close the k-hole research-to-render loop. /dig produces synthesis + pull threads; /banana turns a brief into actual image assets via Google's Nano Banana family.

## What It Does

Wraps `gemini-3.1-flash-image-preview` (default), `gemini-3-pro-image-preview`, and `gemini-2.5-flash-image` behind a single REST invocation. Accepts text prompts and optional reference images (for editing / multi-image composition). Writes PNG files to `grimoires/k-hole/research-output/banana/`.

## How It Differs From Visual Dig / Visual Review

| | Visual Review | Visual Dig | Banana |
|---|---|---|---|
| **Direction** | image → analysis | image + brief → GLSL code | text + (optional refs) → image |
| **Auth** | REST API key | REST API key | REST API key |
| **Output** | JSON scoring | JSON + grounded sources | PNG + JSON manifest |

Visual Review and Visual Dig consume imagery. Banana produces it.

## Usage

```bash
# Text-to-image (Nano Banana 2 default)
npx tsx scripts/banana.ts --prompt "A weathered honey-pot ceramic on cracked obsidian, late-afternoon golden hour, macro lens, shallow depth of field"

# With reference image (editing/composition)
npx tsx scripts/banana.ts --prompt "Recolor this jar to deep crimson with bone-white rim" --image jar.png

# Multi-image composition (up to 14 refs for Nano Banana 2)
npx tsx scripts/banana.ts --prompt "Place the ceramic from image 1 onto the obsidian texture from image 2 under the lighting of image 3" --image jar.png --image obsidian.png --image lighting-ref.png

# Pro-tier (slower, professional quality)
npx tsx scripts/banana.ts --prompt "..." --model gemini-3-pro-image --aspect 21:9 --size 4K

# Batch candidates
npx tsx scripts/banana.ts --prompt "..." --n 4
```

## Prompting Convention (per Google docs)

> "Describe the scene, don't just list keywords."

- **Photography:** mention camera angles, lens types, lighting, fine details
- **Stylized assets:** be explicit about the style and request a white background
- **Text rendering:** be clear about the literal text, the font (descriptively), and the design
- **Composition:** use photographic / cinematic language (wide-angle, macro, low-angle)

### Multi-image fusion: the A/B/C pattern

When passing multiple `--image` references, explicitly label each in the prompt to disambiguate roles. The model handles this far better than positional inference alone:

```bash
npx tsx scripts/banana.ts --prompt "Use the subject from Image A, the palette and lighting of Image B, and the camera angle and composition of Image C. Render in 16:9, late-afternoon golden hour." \
  --image subject.png \
  --image palette-ref.png \
  --image angle-ref.png
```

The first `--image` is Image A, the second is Image B, and so on — matching the order of `inline_data` parts in the request body.

## Constraints

- Requires `GEMINI_API_KEY` or `GOOGLE_API_KEY` — the gemini CLI subscription does not yet expose image-output modalities, so image generation goes through REST with API-key auth.
- All generated images carry an invisible **SynthID watermark** (Google policy)
- Reference inputs: PNG, JPG, WEBP, or GIF
- Up to 14 references for Nano Banana 2; 11 for Pro; ~3 ideal for original Nano Banana
- Output JSON contains absolute paths so downstream agents can read the files back

## Output Schema

```json
{
  "prompt": "...",
  "model": "gemini-3.1-flash-image-preview",
  "model_requested": "gemini-3-flash-image",
  "aspect_ratio": "1:1",
  "image_size": "1K",
  "requested_count": 1,
  "returned_count": 1,
  "images": [
    { "path": "/abs/path/to/banana/2026-05-13T01-23-45_a-weathered-honey-pot_1.png", "mime_type": "image/png", "bytes": 612345 }
  ],
  "response_text": "Here is the requested composition...",
  "input_references": [],
  "elapsed_seconds": 8.4,
  "watermark": "SynthID (Google embeds an invisible watermark in every generated image)"
}
```

## Notes

- The gemini CLI (subscription path) does NOT currently expose `responseModalities: ["IMAGE"]`. Image generation requires REST with API-key auth. This is the only k-hole skill where the CLI subscription path doesn't apply.
- When OpenRouter eventually carries Nano Banana, the routing layer can extend to support it; for now, REST direct is the only viable path.
