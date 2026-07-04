# The Ground K-HOLE Stands On

> Shared ground: https://github.com/0xHoneyJar/loa-constructs/blob/main/docs/the-ground.md
> — this file carries ONLY the k-hole-specific layer. Tiers, forks, agent
> types, frontmatter contracts, and gate design live THERE, not here.
> Probed from the live harness at construct-k-hole @ a22cb57, 2026-07-03.

## 1. Runtime contract (probed)

| Axis | Value | Source |
|---|---|---|
| model_tier | **opus** (pinned) | construct.yaml:78 |
| danger_level | moderate | construct.yaml:79 |
| effort_hint | large | construct.yaml:80 |
| downgrade_allowed | **false** (hard pin — routing may NOT go cheaper) | construct.yaml:81 |
| execution_hint | sequential | construct.yaml:82 |
| requires | tool_calling: true · thinking_traces: true · vision: **false** | construct.yaml:84,85,86 |
| workflow.gates | **none** — k-hole owns no pipeline; its writes ride the caller's gates | construct.yaml (absent) |
| agent dispatch | no skill sets `agent:` — all inherit the caller (the safe default) | skills/*/SKILL.md frontmatter |
| dig / domain-discovery / deep-research tools | Read, Write, Glob, Grep, Edit, Bash | skills/dig/SKILL.md:5 (+ domain-discovery, deep-research) |
| orchestrator tools | Read, Write, Glob, Grep, Edit, Bash, **Agent** (fan-out for batch mapping) | skills/orchestrator/SKILL.md:5 |
| config-generator tools | Read, Write, Glob, Grep, Edit (no Bash — pure config authoring) | skills/config-generator/SKILL.md:5 |
| writes | grimoires/resonance/ · grimoires/k-hole/ | construct.yaml:89-91 |

opus + downgrade:false + effort:large is a coherent HARD pin, not an
over-declaration: the work is deep synthesis across many sources into cited
research, and the manifest says so on every axis. This is the honest opposite
of a light construct that pins opus out of habit.

## 2. Capability-reality edges

- **#553 class: CLEAN.** No skill sets `agent:` anywhere — every skill inherits
  the caller. Even orchestrator, which declares `Agent` in `allowed-tools` to
  fan out batch mapping, does not pin an agent *type*, so the write-tool /
  read-only-agent-type silent-drop cannot occur here.
- **Undeclared-toolset edge (real, surfaced):** `visual-dig` and `visual-review`
  are declared skills in the manifest (construct.yaml:29-32) but their SKILL.md
  files carry **zero frontmatter** — no `name`, no `user-invocable`, no
  `allowed-tools`, no `capabilities` block (probed: 0 `---` fences in each).
  Under the shared ground's deny-all default, a skill with no `allowed-tools`
  declares no tools — yet both shell out to `npx tsx scripts/visual-*.ts`
  against the Gemini API (visual-dig/SKILL.md:43, visual-review body). A runtime
  that enforces the frontmatter contract strictly would grant these skills
  nothing while they need Bash + network. A SMELL from the declaration layer,
  not a provable conflict from within one file.
- **vision: false, yet two skills do vision — and it's coherent.**
  `requires.vision: false` (construct.yaml:86) sits alongside visual-dig and
  visual-review, which analyze images. No contradiction: the vision is
  *delegated out-of-process* to Gemini multimodal via Bash-invoked scripts, so
  the host model needs no vision capability. `requires.vision` describes what
  the CLAUDE runtime must supply, not what the construct's toolchain reaches.
- **Web capability: real via Bash, undeclared in the capabilities block.**
  k-hole IS the web-research engine — the four dig primitives are flags on
  `scripts/dig-search.ts` (construct.yaml:14), and the visual skills use Gemini
  grounded web search. Reachability and toolset AGREE: web access rides `Bash`,
  which every research skill declares. There is simply no `web_access:` axis in
  the capabilities block to declare — a manifest-shape gap, not a tools/reality
  disagreement. SMELL, not conflict.

## 3. What K-HOLE does with the ground

k-hole descends. give it one thread worth pulling and `/dig` goes deep;
give it a whole field and `/forge` maps the landscape at scale. the ground it
asks for is the heaviest an honest construct can ask — pinned opus, large
effort, thinking traces, sequential — because the product is *cited research,
not a summary*, and shallow reasoning would forge citations it never earned.
it delegates its eyes: vision and grounded web search go out to Gemini through
Bash, so the host model stays a reasoner while the toolchain does the seeing.
it owns no gates; the resonance and research it writes to `grimoires/` ride
whatever pipeline called it down. the pin is not vanity — it is the floor below
which the citations stop being true.
