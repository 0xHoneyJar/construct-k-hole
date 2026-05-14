# K-hole Schemas

Schemas produced/consumed by the K-hole construct. **These live in our domain
(`construct-k-hole`).** They are *styled* to be native to the Loa ecosystem and
*compatible* with adjacent substrates — but they are not committed into, and do
not depend on, any upstream repo.

> **Canonical source.** `creative-resonance-envelope.schema.json` carries
> `"x-canonical-source": "0xHoneyJar/construct-k-hole"`. This repo is the source of
> truth. A vendored copy exists at `~/.loa/constructs/packs/k-hole/schemas/` — that
> copy is **derived**; changes flow `construct-k-hole → .loa`, never the reverse. CI
> (`.github/workflows/validate.yml`) warns on divergence when the `.loa` copy is
> locally reachable. The schema originally landed in the `.loa` copy first
> (2026-05-13) and was promoted here 2026-05-14 (issue #21, Phase 1, FR-6); the
> long-term sync direction is flagged for the cycle retro.

## creative-resonance-envelope.schema.json

Structured reasoning for design-reference resonance. Where a `/dig` produces
synthesis prose, an **envelope** produces queryable REASONING:

- **WHY** a creative reference grounds a chosen direction (three lenses:
  philosophical / aesthetic / design)
- **HOW** it composes with or contradicts other references (`composes_with`,
  `contradicts_with` — typed edges by `envelope_id`)
- **WHAT** adjacent threads it extrapolates toward (`extrapolates_to`,
  `threads_to_pull`)
- **WHICH** bounds it sets (`bounds_set.locks_in` / `locks_out` — the "fences")

Envelopes link to each other by `envelope_id`, forming a navigable **web of
cited creative reasoning** — the substrate that lets an agent extrapolate a
direction deeper without re-deriving the why.

### Domain boundary (read this before touching anything upstream)

This schema is **native-styled, not upstream-owned**:

| Repo | Relationship | What we do | What we DON'T do |
|------|-------------|------------|------------------|
| `loa-hounfour` | Referenced **convention** | Match its JSON-Schema-2020-12 style, strict `additionalProperties: false`, semver discipline | Commit files · modify barrels · open PRs — **not our domain** |
| `construct-rooms-substrate` | Referenced **philosophy** + compatibility target | Align with its WHY-envelope model (required WHY + cross-validation signals + three-tier fields) so an envelope CAN ride as a handoff `verdict` payload | Commit files · change its schemas — **not our domain** |
| `construct-k-hole` (this pack) | **Home** | Author, version, evolve the schema here | — |

If either upstream team chooses to adopt this schema natively, the promotion
path is: (1) re-express as a TypeBox source in `loa-hounfour/src/schemas/`,
(2) barrel-export it, (3) version-bump per their `SCHEMA-EVOLUTION.md`. **That
is their call to make, not ours.** Until then the schema is ours and lives here.

### Rooms-substrate compatibility (by design, zero upstream change)

An envelope is shaped so it can ride as the `verdict` payload of a
`construct-rooms-substrate` **construct-handoff packet** with
`output_type: "Artifact"` — no change to rooms-substrate required:

```
K-hole runs in a Room
  → produces a CreativeResonanceEnvelope
  → emitted as construct-handoff { output_type: "Artifact", verdict: <envelope> }
  → surfaced via rooms-substrate scripts/surface-envelope.sh
```

The schema deliberately mirrors rooms-substrate's WHY-first discipline:

| rooms-substrate handoff `why.*` | creative-resonance-envelope analog |
|---------------------------------|-----------------------------------|
| `why.rationale` (≥32 chars, required) | `why.{philosophical,aesthetic,design}` (≥32 chars, ≥1 required) |
| `why.confidence` (calibratable) | `resonance.strength` (0–1, calibratable) |
| `why.alternative_verdicts` (counterfactuals) | `contradicts_with` (counterfactual references) |
| `why.decisions_considered` | `composes_with` + `bounds_set` (the weighed alternatives) |
| three-tier required/recommended/optional | same tiering, annotated in field descriptions |

### Field tiers

- **Required**: `schema_version`, `envelope_id`, `ref`, `direction`,
  `resonance`, `why`, `provenance`
- **Recommended**: `composes_with`, `contradicts_with`, `bounds_set`
- **Optional**: `extrapolates_to`, `threads_to_pull`, `tags`

### Where envelopes are stored

Per-project, under `grimoires/k-hole/envelopes/<envelope_id>.yaml`. The set of
envelopes sharing a `direction.name` IS the grounded definition of that
direction. Template: `../templates/creative-resonance-envelope.yaml`.

### Kaironic versioning

v0.1.0 is intentionally minimal. Fields are added when a real envelope needs
them — not speculatively. "Setting up the fences when direction resonates."
