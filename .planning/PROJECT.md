# Chains of Chaos — Visual Fidelity

## What This Is

An upgrade to the existing **kratos-lab** browser tool that makes the Blades of Chaos'
chains visually indistinguishable from God of War 1 (PS2, 2005) — real segmented
chain links, the burning-hot additive glow, authentic chain motion, and the blades'
fire and spark effects. Everything is driven by data decoded from the actual game
disc wherever such data exists.

## Core Value

A GoW1 attack in kratos-lab reads 80–90% identical to real gameplay footage —
because the chains, glow, and fire use the game's own textures, particle
definitions, colors, and values, not approximations.

## Requirements

### Validated

<!-- Already working in kratos-lab (built prior to this project) -->

- ✓ Kratos mesh parsed spec-exact (7,418 verts, 100% real two-bone skin weights) — existing
- ✓ Skin textures decoded (PSMT8 unswizzle + csm1 CLUT, 3 pages) — existing
- ✓ Skeleton (111 joints) + full keyframe animation decode (Q.14 quats/eulers, additive streams) — existing
- ✓ Combo state machine driven by real clip names/durations/blend-ins — existing
- ✓ Blade meshes attached and driven by the game's authored type-10 blade position tracks — existing
- ✓ Basic chain ribbon (flat quad strip, chainlink texture) + basic additive swing trail — existing
- ✓ Auto-framing camera that keeps blade whips in view — existing
- ✓ Material/blend modes decoded from MAT records (u16-tag WAD walk, marker-safe nearest-preceding resolution, 2-tuple blend inventory) and applied to every FX draw via the single MAT→GL table; PS2 compositing invariants locked (alpha:false, 0x80=1.0 MODULATE, saturation-to-white) plus fixed 60Hz sim accumulator and native 512×448 render-target toggle — *Validated in Phase 2: WAD/MAT Decode & Render-Pass Foundation*

### Active

- [ ] Chains render as segmented 3D-reading links along the chain curve (per-link orientation, correct scale/taper) instead of a flat ribbon
- [ ] Chain glow/heat pass matches the game (chainglow texture, additive blend, correct color and intensity)
- [ ] Chain motion matches the game: catenary drape at rest, whip-lag curvature in flight, plausible forearm wrap
- [ ] Blade fire and spark emission decoded from the weapon WAD's FXC/PTC records (flame6/flame3, BDEsparkemit) and rendered with the game's textures, colors, emission values
- [ ] Side-by-side comparison against reference gameplay footage judged 80–90% accurate in motion

### Out of Scope

- God-tier / stage5 / godchain variants — user chose Level 1 blades only; revisit after L1 fidelity lands
- Environment, enemies, HUD fidelity — this project is scoped to the weapon presentation only
- Audio — visual fidelity project
- Pixel-exact matching — emission is stochastic; the bar is 80–90% in-motion accuracy vs footage
- New viewer app — work lands in kratos-lab in place

## Context

- **Codebase**: `tools/kratos-lab/` — dependency-free WebGL1 app (parsers.js, anim.js,
  combat.js, app.js) served by a tiny Node static server; loads raw extracted game
  files from `extracted/`. Formats documented in `tools/kratos-lab/README.md` and
  `extracted/README.md`.
- **Reverse-engineering base**: WAD container, TOC/PAK, mesh (VIF/DMA), skeleton,
  ANM streams, TWK trees, GFX/PAL textures (8bpp swizzled + 4bpp linear) are all
  decoded. Format knowledge cross-checked against mogaika/god_of_war_browser.
- **Known FX data not yet decoded** (primary targets): weapon WAD records
  `FXC_BDepoly3/6` (emitter configs), `PTC_flame3/flame6` (particle defs),
  `FXC_BDEsparkemit` (sparks), `MSH_BDepoly3Shape/6Shape` (ribbon/poly shapes),
  `MAT_*` blend/flags fields beyond the texture reference, hero WAD `FXC_BFT/BGT`
  (blade fire trail?) records, and the type-5 ANM descriptor (blade state track).
- **Reference method** (user-specified): read the ISO/code to break down how it
  works — particle generation, textures, values, colors — use those values, then
  compare with gameplay video for 80–90% accuracy (emission is random).
- **Reference footage**: https://www.youtube.com/watch?v=FMGwS-bvNiU plus user
  screenshots; user can supply more captures for comparison.

## Constraints

- **Budget**: Explicitly unconstrained — "spend as many hours and credits as needed";
  favor decoding real data over quick approximations every time
- **Tech stack**: Vanilla WebGL1 + JS in kratos-lab — no build step, no external
  libraries; all assets loaded from `extracted/` raw game files
- **Data-first**: Where the game stores a value (color, rate, size, blend mode),
  the renderer must use it; hand-tuning only where the game computes at runtime,
  and such cases must be labeled inferred
- **Target**: Level 1 blades (stage1 textures, chainlink/chainglow/swordtrail)
- **Performance**: Must stay interactive (60fps-ish) in the browser pane

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fidelity measured vs footage at 80–90%, not pixel-exact | Particle emission is stochastic; in-motion authenticity is the real bar | — Pending |
| Decode FXC/PTC/MAT records before touching visuals | User: use the game's values and colors, not approximations | — Pending |
| Land in kratos-lab in place | Existing tool already has the full data pipeline | — Pending |
| Level 1 blade tier only | Matches the reference video; god-tier deferred | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-25 after Phase 2 completion*
