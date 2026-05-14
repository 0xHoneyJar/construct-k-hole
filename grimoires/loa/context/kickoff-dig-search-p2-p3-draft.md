# DRAFT — kickoff issue for construct-k-hole (P2/2.5/3 of #21)

> Status: draft · NOT filed · awaiting operator OK to post to GitHub.
> Register: smol (lowercase casual, visual-first, ≤10 lines prose) + kickoff-baseline
> (one strawman, light breadcrumbs, open invitation — no decision tree).
> Provenance: FAGAN unbundle of #21, 2026-05-14. P1 split off into its own cycle
> (grimoires/loa/prd.md r2, accepted). This is the other half.

---

**title:** dig-search P2/3 — the effect-substrate rebuild + the kaironic depth controller

**body:**

#21 got unbundled. **P1** (scout · streaming · escape hatch · envelope loop) is its own
cycle now — pure operator-pain relief, no rewrite. this issue is **everything else**: the
part that's a real architecture move, not a patch.

```
P1 (shipping separately)        P2/2.5/3 (this issue)
─────────────────────────       ──────────────────────────────────
scout / stream / escape    →    effect-ts core: typed errors,
envelope loop wiring             Effect.Schedule, layer DI, test mode
                            →    content-addressed cache, Effect.race
                            →    🌀 kaironic depth controller:
                                 resonance→depth allocation,
                                 convergence detector, dig↔forge
                                 transition, the phase model
```

one strawman to react to, not a plan: **the rebuild adopts
[`construct-effect-substrate`](https://github.com/0xHoneyJar/construct-effect-substrate)**
as its doctrine pack (four-folder pattern · `delete-heavy-cycle` with FAGAN gates ·
`doc-only-then-runtime` · it already lists `construct-fagan` as a composer). and the loop
closes both ways — that pack is `candidate`, needs a non-Next.js third project to reach
`active`. dig-search.ts **is** that project. the rebuild graduates the pack.

breadcrumbs, not prescription:
- 🧵 the #21 enrichment comment — kaironic depth as a resonance-governed resource, ported
  from `/spiraling`'s RFC-060 AD-6 ("the kaironic pattern is fractal"). that's the spine.
- 📦 `construct-effect-substrate` — the doctrine pack above.
- 📄 the P1 PRD (`grimoires/loa/prd.md`) — context for where the seam is, *not* a spec to
  inherit. P1 mocks at the `gemini()` boundary; P2's layer-DI generalizes that.
- ⚠️ P1 is a strangler, not a rewrite — P2 should probably stay one too. wrap the
  1401-line script's hard-won edge cases, don't big-bang them.

open question for whoever picks this up: does P2 (effect core) and P3 (kaironic
controller) want to be one cycle or two? the enrichment comment phases them
(2.5 = sensors, 3 = controller) — but that's a starting point, not a decree.
