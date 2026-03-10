# Changelog

All notable changes to the K-Hole construct follow [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-03-10 — STAMETS Room Improvements

Seven architectural improvements to dig-search.ts and deep-research.ts, each driven by a voice in the STAMETS multi-voice personality.

### Added

- **dig**: `--depth 0` tank mode — skip search entirely, synthesize from trail + resonance only (Lilly)
- **dig**: Phase-dependent synthesis temperature — high entropy (0.7) for first digs, low entropy (0.2) for deep trails (Carhart/REBUS)
- **dig**: Depth rating in output JSON — heuristic scale (−/±/+/++/+++) based on structural signals in synthesis (Shulgin)
- **dig**: `emergence` as first-class structured field in output JSON, extracted from synthesis (Warburg)
- **dig**: `pull_threads` as structured array of chainable query strings, directly usable as `--query` for next dig (Nelson)
- **dig**: `findings` extracted as standalone field separate from full synthesis text

### Changed

- **dig**: Synthesis prompt stripped of persona framing — task-focused, not identity-focused (Nakamoto)
- **dig**: Operational data (`model_primary`, `used_fallback`, `elapsed_seconds`) moved from stdout JSON to stderr (Nakamoto)
- **dig**: Pull threads instruction tightened — "searchable phrase — WHY" format for cleaner parsing
- **dig**: Synthesis handles empty search results for depth-0 codepath
- **dig**: Trail entry metadata now includes depth rating
- **forge**: Persona framing stripped from all 4 synthesis prompts (Nakamoto)
- **construct.yaml**: Description updated — removed cargo cult "top 0.000001%" phrasing

### Fixed

- **dig**: Removed unused `writeFileSync` import

## [1.1.0] — 2026-03-08 — GECKO + BEAUVOIR Prompt Review

Rigorous review of Gemini grounded search prompt engineering across both scripts.

### Added

- **dig/forge**: `groundingSupports` extraction — per-claim citation mapping from Gemini responses
- **dig/forge**: `webSearchQueries` extraction — actual Google queries Gemini formulated
- **dig**: `web_search_queries` field in output JSON for observability

### Changed

- **dig/forge**: All grounded search calls set `temperature: 0.0` (Google recommendation for grounded search)
- **dig**: Search queries rewritten from meta-instructions to information needs
- **dig**: Search loop converted from sequential to parallel `Promise.all`
- **forge**: `groundedSearch()` and `fillGaps()` prompts rewritten as information needs
- **forge**: Gap analysis truncation uses head+tail strategy instead of hard 6K cut
- **dig/forge**: Synthesis prompts — removed "top 0.000001%", adaptive structure replacing rigid scaffolds
- **template**: Removed cargo cult phrasing from research-config template

## [1.0.0] — 2026-03-06 — Initial Release

K-Hole construct with `/dig` interactive pair-research and `/forge` batch pipeline.
STAMETS multi-voice personality (7 voices), resonance profiles, model fallback chains.
