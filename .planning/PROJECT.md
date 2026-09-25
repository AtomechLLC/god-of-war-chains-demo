# Chains of Chaos — Visual Fidelity

## What This Is

An upgrade to the existing **kratos-lab** browser tool that makes the Blades of Chaos'
chains visually indistinguishable from God of War 1 (PS2, 2005) — real segmented
chain links, the burning-hot additive glow, authentic chain motion, and the blades'
fire and spark effects. Everything is driven by data decoded from the actual game
disc wherever such data exists.

Beyond the weapon presentation, the lab now also includes (all shipped ad-hoc,
Aug 2026, pre-GSD — see REQUIREMENTS.md § Ad-hoc delivered (pre-GSD, Aug 2026)): the enemy target
dummy (the REAL R_SKS undead legionnaire with its decoded three-layer hit-response
VFX chain), a hit-frame-anchored combat model with launchers and air juggles, the
guard suite (block / guard-evade / airBlock / parry), root motion from the decoded
controller channel tweened through branches, the full TWK tweak-tree decode
published at design/data-archaeology.html, and — as of 2026-09-25 — a second,
independent reverse-engineering track on God of War III (PS3, big-endian; Phase 8).

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
- ✓ FX records decoded byte-exact into a queryable, JSON-dumpable `FxDb` (no renderer needed): `MSH_BDepoly*Shape` vertices, `PTC_*` particle defs (flame3/flame6 in-WAD + BFT/BGT standalone), `FXC_*` emitters (subtype-branched 0x2/0x3/0xd), plus the type-5 `gomaiblade` blade-state descriptor — every field tagged real/INFERRED with per-field evidence; effect color honestly traced to `MAT_pticleMat.blendColor` (ramp INFERRED); cross-record refs resolve shapes and mark slot corroboration vs authoritative bindings. NTSC-U/60Hz confirmed (GS-dump corroboration deferred by decision). — *Validated in Phase 5: FX Record Decode (DEC-02, DEC-03)*
- ✓ World-space particle runtime renders the decoded FxDb values on the locked pass architecture: layered blade fire (flame3+flame6, spawn-decoupled so it lags a whipping blade), impact sparks (BDEsparkemit on combat hit-edges, velocity-aligned stretched billboards), dual swing trails (BFT crimson fire + BGT swoosh with runtime age→color ramp on the real GFX_swordtrail texture), state-dependent chain glow (dark at rest → hot on attacks, alpha-over-1.0 brightness recovery), and per-blade point lights (decoded LeftBladeLight/RightBladeLight, Lambert + range attenuation). One shared billboard pool (CLAUDE.md Part 3), every blend via Fx.applyMaterial (DEC-01), decoded values real / runtime rates·ramp·glow-rule INFERRED. Runtime-verified (pool emits 356–384 particles during combos, additive brightness >clamp, no GL errors). — *Validated in Phase 6: Particle Runtime (FIRE-01/02, TRL-01/02, CHAIN-03, REND-02) — perceptual 80–90%-vs-footage judgment is Phase 7*
- ✓ TWK tweak tree decoded end-to-end (part1.pak magic 0xFEDCBA98, hash h = h·127 + c, 680/1,408 keys cracked by suffix-extension modular inversion + pair-delta " Tween"/" Cycle"; all 78 decoded instances at design/twk/decoded/, published at design/data-archaeology.html), REAL attack hit volumes (/TweakTemplates/Concussion/ — radii, durations, impulse vectors, Angle 0 = 360° hero / 30–45° enemy cones), REAL root motion (ANM type-5 comp-422 controller channel, 30 Hz), plus Rage of the Gods wired to the real god-mode FX set, the Weapon Level 5 stage-5 skin with the decoded red Rage trail, and a costume selector from the real /Player/ table (L1 stays the fidelity target — RAGE-01). REAL: every decoded value (Trail Tint 1,1,1,0.8; Segment Length 0.25; Link Ø 0.13; Glow Ø 0.18; concussion values; costume 0–5 table; " Tween"/" Cycle" pair values 0.025–0.3 s; god-mode FX set + stage-5 skins); INFERRED: units bridge 1 m ≈ 14 u, the tween family's individual base names (semantically identified, unrecoverable); DEAD END: joint-based root motion, per-frame hit-window data in the ANM (60 Hz tracks = exporter boilerplate). — *Delivered ad-hoc (pre-GSD, Aug 2026); see REQUIREMENTS.md § Ad-hoc delivered*
- ✓ REAL controller channels (ANM type-5 trio 420 lateral / 421 vertical / 422 forward, 30 Hz — comp-421 jump rise 0 → 9.37 u (0.67 m), jumpUp timing 0.65 s), gamepad support + GoW1 stick controls, a ballistic jump on the authored jumpUp → jumpAir → fallV → land chain from the Navigation bank, and rage ≠ berserk re-identified via the ber* clips' type-10 blade tracks (bare-handed brawling; Rage keeps the blades). REAL: the channels, /GlobGame/ Gravity 50, act names / durations, blade tracks; INFERRED: jump apex = Kratos' model height (USER SPEC — named hero jump v0/gravity parameters proven absent in the ELF, DEAD END), engine hover model for air combos, the brawl set's context. — *Delivered ad-hoc (pre-GSD, Aug 2026); see REQUIREMENTS.md § Ad-hoc delivered*
- ✓ Enemy target dummy = the REAL R_SKS undead legionnaire (SKS_0 mesh 3,265 verts, 29-joint sks skeleton, ANM_sks 93 acts; TWK_Sold_020 cracked — Max HP 100, Run 8 m/s, Walk 3 m/s) with the decoded impact-VFX arc (goSklBlood, goCombo3fExplode, goFXfirePath, goMAISWeffect, explosion shell + real particle materials), a difficulty slider from the real /GlobGame/Easy|Normal|Hard|Impossible trees (player Damage Mult 2/1/0.75/0.5), "Fight back" soldier attacks (off by default), and launchers + air juggles with launch apex = the attack's OWN authored comp-421 leap (blockLauncher 6.2 m). REAL: all bindings, PlayFX joint anchors ("SKS Blood Top" @ neck, "SKS Blood Mid" @ pelvis), MFX material templates ("Zombie Flesh" → goSklBlood + SND_BLOODSPURT), MAT blend bits, TWK_Sold_020 stat values, difficulty multipliers; INFERRED: Sold field names, hit-flash tint + curve (user-calibrated), spray fan, blood puff runtime tint, dummy scale 0.76, particle counts / velocity fans, KB_SCALE launch impulse scale. — *Delivered ad-hoc (pre-GSD, Aug 2026); see REQUIREMENTS.md § Ad-hoc delivered*
- ✓ Combat model: hit-frame-anchored cancel model (Derek Daniels' "Combat Cancelled": normals cancel pre-hit, L1 specials post-hit only, block instant), true block STATE on authored guard clips, guard-evade flips (user-identified), airBlock on the authored air-guard clip, PARRY (timed block), the Navigation ACTION INDEX (design/twk/decoded/ActionIndex.twk — 2×100 slots in TWK_goHero aligned in order to the ELF ANI* vocabulary; Bank 1 = the bare-handed set), and root-motion TWEEN through branches (confirmed by GoW's combat designer Eric Williams). REAL: the action index table, guard / air-guard clips, root channel comp-422; INFERRED: cancel-window span values, parry 9-tick window; DEAD END: combat has no action slots (exhaustive negative search), queue/branch/cancel windows live in engine code only (modeled). — *Delivered ad-hoc (pre-GSD, Aug 2026); see REQUIREMENTS.md § Ad-hoc delivered*

### Active

- [ ] Chains render as segmented 3D-reading links along the chain curve (per-link orientation, correct scale/taper) instead of a flat ribbon
- [ ] Chain glow/heat pass matches the game (chainglow texture, additive blend, correct color and intensity)
- [ ] Chain motion matches the game: catenary drape at rest, whip-lag curvature in flight, plausible forearm wrap (Phase 4 — deferred by the fast-track pivot)
- [ ] Side-by-side comparison against reference gameplay footage judged 80–90% accurate in motion (Phase 7)

### Out of Scope

- God-tier / stage5 / godchain variants — user chose Level 1 blades only; revisit after L1 fidelity lands: L1 remains the fidelity target; the stage-5 skin + god-mode FX set shipped ad-hoc as a Weapon-Level/Rage selector (decoded real assets, RAGE-01), not a tuning target
- Environment, HUD fidelity — this project is scoped to the weapon presentation only
- ~~Enemies~~ — SCOPE EXPANDED (user-driven, 2026-08-13): the REAL R_SKS undead legionnaire is now the lab's target dummy with its decoded hit-response chain; see ENM-01/ENM-02
- Audio — visual fidelity project
- Pixel-exact matching — emission is stochastic; the bar is 80–90% in-motion accuracy vs footage
- New viewer app — work lands in kratos-lab in place

## Context

- **Codebase**: `tools/kratos-lab/` — dependency-free WebGL1 app (parsers.js, anim.js,
  combat.js, app.js, fx.js, fxparse.js, chain.js, loop.js, particles.js) served by a
  tiny Node static server; loads from the git-tracked `assets/` curated study set
  (Level-1 weapon records, raw R_WPN0_0.WAD, Kratos set, plus `assets/enemy/` R_SKS
  legionnaire and `assets/perm/` shared attack FX carved 2026-08-13/14) — the same raw
  game bytes — while the full `extracted/` set is local-only/gitignored (see
  assets/README.md). Formats documented in `tools/kratos-lab/README.md` and
  `extracted/README.md`.
- **Reverse-engineering base**: WAD container, TOC/PAK, mesh (VIF/DMA), skeleton,
  ANM streams, TWK trees, GFX/PAL textures (8bpp swizzled + 4bpp linear) are all
  decoded. Format knowledge cross-checked against mogaika/god_of_war_browser.
- **FX data — DECODED in Phase 5** (`FxDb`, `tools/kratos-lab/fxparse.js`): weapon WAD
  `FXC_BDepoly3/6` + `MSH_BDepoly3Shape/6Shape`, `PTC_flame3/flame6`, hero WAD
  `FXC_BFT/BGT` + `PTC_BFT/BGT` (standalone), fire/chain-glow families (FXCF/flame5/EG/CNG),
  and the type-5 `gomaiblade` blade-state descriptor are all decoded byte-exact with
  evidence tables. `MAT_*` blend/flags were decoded in Phase 2. Remaining: the Phase-6
  runtime that renders these decoded values (fire, sparks, dual trails, state glow).
- **TWK tweak tree — DECODED (ad-hoc, Aug 2026)**: part1.pak magic 0xFEDCBA98, hash
  h = h·127 + c, 680/1,408 keys cracked (suffix-extension modular inversion + pair-delta
  " Tween"/" Cycle"); sheets at design/twk/decoded/ (all 78 decoded instances per the
  archaeology page); page at design/data-archaeology.html, whose status column is the
  REAL / INFERRED / DEAD END register for every shipped value.
- **GoW3 track (Phase 8, opened 2026-09-25)**: PSARC reader + PS3_BE 64-byte WAD record
  walk byte-exact on R_HERO00.WAD; extractions land in `extracted-gow3/` (default-ignored,
  tracked deliberately).
- **Reference method** (user-specified): read the ISO/code to break down how it
  works — particle generation, textures, values, colors — use those values, then
  compare with gameplay video for 80–90% accuracy (emission is random).
- **Reference footage**: https://www.youtube.com/watch?v=FMGwS-bvNiU plus user
  screenshots; user can supply more captures for comparison.

## Constraints

- **Budget**: Explicitly unconstrained — "spend as many hours and credits as needed";
  favor decoding real data over quick approximations every time
- **Tech stack**: Vanilla WebGL1 + JS in kratos-lab — no build step, no external
  libraries; all assets loaded from the git-tracked `assets/` curated subset (same raw
  game bytes; the full `extracted/` set is local-only/gitignored — see assets/README.md)
- **Distribution policy (user ruling 2026-09-25)**: source media (ISOs, disc folder
  trees, BIOS) is never committed; carved-out extracted records are distributable and
  tracked deliberately (git add -f) — the extracted/** ignore rule is a bulk-extraction
  guard only
- **Data-first**: Where the game stores a value (color, rate, size, blend mode),
  the renderer must use it; hand-tuning only where the game computes at runtime,
  and such cases must be labeled inferred
- **Target**: Level 1 blades (stage1 textures, chainlink/chainglow/swordtrail)
- **Performance**: Must stay interactive (60fps-ish) in the browser pane

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fidelity measured vs footage at 80–90%, not pixel-exact | Particle emission is stochastic; in-motion authenticity is the real bar | Bar unchanged; 03-02 user judged chain+glow too subtle and fast-tracked particles (Phases 5–6 done); Phase 7 verdict still open |
| Decode FXC/PTC/MAT records before touching visuals | User: use the game's values and colors, not approximations | Done — MAT (Phase 2), FXC/PTC/MSH + type-5 (Phase 5), TWK tweak tree + Concussion + controller channels (ad-hoc Aug 2026) |
| Land in kratos-lab in place | Existing tool already has the full data pipeline | Done — all work landed in place; site + Pages deploy run on assets/ |
| Level 1 blade tier only | Matches the reference video; god-tier deferred | Held as the fidelity target; stage-5 skin + god-mode FX shipped ad-hoc as a selector (RAGE-01) |
| Data-first labeling: every value is tagged REAL (decoded bytes) / INFERRED (model or user-calibrated) / DEAD END (proven absent) | CLAUDE.md data-first rule — hand-tuning only where the game computes at runtime, and such cases must be labeled inferred | Register kept on design/data-archaeology.html (status column) and in REQUIREMENTS.md § Ad-hoc delivered |
| rage ≠ berserk | The ber* clips' type-10 blade tracks pin both tips at the dorsal sheath — a bare-handed brawl set, not Rage | Rage of the Gods keeps the blades and wires the real god-mode FX set; the brawl context (Ares duel) is INFERRED; corroborated by ACTION INDEX Bank 1 |
| Jump = ballistic: REAL Gravity 50 + comp-421 channel timing (0.65 s), apex = Kratos' model height (USER SPEC) | Named hero jump v0/gravity parameters proven absent in the ELF (DEAD END) | Shipped 3bf499a; no free parameters beyond the user-spec apex |
| Launch apex = the attack's OWN authored comp-421 leap (e.g. blockLauncher 6.2 m) | User-corrected (fc271d2): the launcher's own channel, not a shared constant | Shipped; KB_SCALE launch impulse scale INFERRED |
| Root motion tweens through branches | Pair-delta " Tween" family in the TWK tree + Eric Williams' confirmation ("all animation branching uses a tween value to blend the animations / root motion") | Shipped d1a6a8e |
| Distribution policy 2026-09-25: source media never / extracted records OK | User ruling: "never distribute source files, only extracted ones" | .gitignore comments encode it; 123 tracked extracted/ files ratified; no history rewrite |
| Phase 8 GoW3 track opened as an independent parallel track | User added the PS3 disc data | Containers cracked the same day (PSARC + PS3_BE WAD record walk); phase unplanned |

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
*Last updated: 2026-09-25 — reconciled with the ad-hoc Aug-2026 work and the Phase 8 GoW3 track (quick 260924-vax)*
