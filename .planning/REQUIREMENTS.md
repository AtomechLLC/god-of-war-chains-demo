# Requirements — Chains of Chaos Visual Fidelity

Requirements for v1. Each requirement is testable and traceable to a phase.

## v1 Requirements

### Reference & Validation

- [ ] **VAL-01**: An uncontaminated reference library exists — native-res, software-renderer (or verified-clean) captures of Level-1 blade combat with freeze-frames catalogued for link pitch, glow hues, flame shapes, trail geometry
- [ ] **VAL-02**: A side-by-side comparison harness plays kratos-lab next to reference footage of the same moves, and the final result is judged 80–90% accurate in motion

### Decode (data-first mandate)

- [x] **DEC-01**: MAT records fully decoded (blend mode bits, depth-write, filtering) and every FX draw uses its material's real blend/depth state via the GS→WebGL blend mapping
- [x] **DEC-02**: FXC emitter configs, PTC particle definitions, and MSH_BDepoly shapes decoded with a per-field evidence table (differential comparison across instances; ELF as tiebreaker); colors/rates/sizes/lifetimes come from these records
- [x] **DEC-03**: The type-5 ANM descriptor (blade show/hide state) decoded and driving in-hand vs on-back blade presentation

### Chain Visuals

- [x] **CHAIN-01**: The chain renders as a ribbon textured with the real chainlink strip at correct link pitch (32px/link, 16 links/tile) with visible alpha gaps and "usual" alpha blending, depth-write on
- [x] **CHAIN-02**: A chainglow additive overlay pass (depth-write off) shares the ribbon UVs and shows the real heat-ramp colors from the decoded texture
- [x] **CHAIN-03**: Chain glow is state-dependent — dark links at rest, hot streak during attacks/throws — via decoded mechanism if found (FXC_CNGemit candidate), else a footage-calibrated rule labeled inferred

### Chain Motion

- [ ] **MOT-01**: At rest the chain drapes in a catenary between forearm anchor and pommel and sways with body motion
- [ ] **MOT-02**: In flight the chain pulls taut with lag C-curvature trailing the blade arc, and settles back to drape after the move

### Blade Fire & Sparks

- [x] **FIRE-01**: Both layered flame systems per blade (flame3 + flame6 chains) render with the game's textures and runtime particle colors from decoded PTC records, hugging the blade in every combat frame
- [x] **FIRE-02**: Impact sparks (BDEsparkemit) fire on hit events from the combat state machine with decoded rate/velocity/color

### Swing Trails

- [x] **TRL-01**: Swing trails use the real swordtrail texture with runtime crimson tint and white-hot core, additive, fast fade, stepped 60Hz extrusion (no spline smoothing)
- [x] **TRL-02**: The dual trail system (crimson fire trail + neutral swoosh, BFT/BGT pairs) is decoded and both variants render on the correct moves

### Renderer Authenticity

- [x] **REND-01**: The renderer enforces PS2-authentic compositing: clamped LDR gamma-space additive blending saturating to flat white, 0x80=1.0 conventions applied at texture/CLUT/modulate/blend stages, no bloom/tonemap/soft-particles (locked invariant)
- [x] **REND-02**: Per-blade warm point lights use the decoded LeftBladeLight/RightBladeLight values (color 1.0/0.622/0.288, intensity 2.5, range 160), vertex-lit, no shadows
- [x] **REND-03**: Fixed 60Hz simulation timestep and a native-res (512×448-class) render-target toggle exist before formal footage comparison begins

## Ad-hoc delivered (pre-GSD, Aug 2026)

126 commits (2026-08-10 → 2026-09-24, 2ee193c…e670303) shipped outside any planned phase before GSD enforcement was added to CLAUDE.md. These IDs are retro-catalogued here so Phases 7–8 can reference them; none maps to a phase (Traceability lists them as "Ad-hoc (pre-GSD)"). Every value carries the CLAUDE.md data-first label — REAL = decoded bytes, INFERRED = model / interpretation / user-calibrated, DEAD END = proven absent — copied from the status column of design/data-archaeology.html.

### Combat model

- [x] **CMB-01**: Hit-frame-anchored cancel model (Derek Daniels' "Combat Cancelled": normals cancel pre-hit, L1 specials post-hit only, block instant) with launchers + air juggles — REAL: act names / durations, the attack's own comp-421 leap as launch apex (blockLauncher 6.2 m), engine /GlobGame/ Gravity 50; INFERRED: cancel-window span values (queue/branch/cancel windows are engine code only — DEAD END, modeled), KB_SCALE launch impulse scale
- [x] **CMB-02**: Guard suite — true block STATE on authored guard clips, guard-evade flips (user-identified), airBlock on the authored air-guard clip, PARRY timed block that deflects and staggers — REAL: guard / air-guard / parry clips; INFERRED: parry 9-tick window

### Enemy target

- [x] **ENM-01**: Target dummy = the REAL R_SKS undead legionnaire (SKS_0 3,265 verts, 29-joint sks skeleton, ANM_sks 93 acts, TWK_Sold_020 stats) with the decoded three-layer hit-response chain (MFX "Zombie Flesh" → goSklBlood + SND_BLOODSPURT; PlayFX anchors "SKS Blood Top" @ neck / "SKS Blood Mid" @ pelvis; FXC_BloodXemitT → PTC_BloodXpartT → MAT_blood → GFX_blood) plus the Kratos-side goCombo3fExplode / goFXfirePath / goMAISWeffect chains and the explosion shell from R_PERM.WAD; "Fight back" soldier attacks off by default — REAL: all bindings, joint anchors, MAT blend modes, Sold stat values (Max HP 100, Run 8 m/s, Walk 3 m/s); INFERRED: Sold field names, hit-flash tint + curve (user-calibrated), blood puff runtime tint, spray fan, dummy scale 0.76, particle counts / velocity fans
- [x] **ENM-02**: Difficulty slider from the real /GlobGame/Easy|Normal|Hard|Impossible trees applying the player Damage Mult ×2 / ×1 / ×0.75 / ×0.5 to the dummy — REAL: all four multipliers, the "Impossible" internal name; INFERRED: none

### Navigation & motion

- [x] **NAV-01**: Navigation ACTION INDEX — two banks of 100 slots in TWK_goHero aligned in order with the ELF ANI* action vocabulary (ANIVJump → jumpUp, ANIFall → fallv …), Bank 1 = the bare-handed (ber*) set; full table at design/twk/decoded/ActionIndex.twk — REAL: the table; INFERRED: none; DEAD END: combat has no action slots (exhaustive negative search)
- [x] **MOT-03**: Root motion + tween — the ANM type-5 controller trio (420 lateral / 421 vertical / 422 forward, 30 Hz) drives forward root motion, tweened through every branch — REAL: the channels and per-move distances (combo3F 5.26 m …), the " Tween"/" Cycle" pair values 0.025–0.3 s; INFERRED: the tween family's individual base names (semantically identified, unrecoverable; confirmed by Eric Williams); DEAD END: joint-based root motion
- [x] **MOT-04**: Ballistic jump + controls — jumpUp → jumpAir → fallV → land authored chain from the Navigation bank, gamepad + GoW1 stick controls (left-stick locomotion, right-stick evade, camera-planar mapping) — REAL: /GlobGame/ Gravity 50, comp-421 rise 0 → 9.37 u (0.67 m) / 0.65 s; INFERRED: apex = Kratos' model height (USER SPEC; named hero jump v0/gravity parameters proven absent — DEAD END), engine hover model for air combos

### Data archaeology

- [x] **DATA-01**: The TWK tweak tree decoded end-to-end — part1.pak magic 0xFEDCBA98, hash h = h·127 + c, 680/1,408 keys cracked (suffix-extension modular inversion + pair-delta), 78 sheets at design/twk/decoded/, /TweakTemplates/Concussion/ hit volumes decoded and visualized, published at design/data-archaeology.html — REAL: every listed value (Trail Tint 1,1,1,0.8; Segment Length 0.25; Link Ø 0.13; Glow Ø 0.18; concussion radii / durations / impulse vectors / Angle 0 = 360° hero, 30–45° enemy cones; costume 0–5 table); INFERRED: units bridge 1 m ≈ 14 u; DEAD END: per-frame hit-window data in the ANM (60 Hz tracks = exporter boilerplate)
- [x] **RAGE-01**: Rage of the Gods + Weapon Level 5 — the real god-mode FX set (chain, glow, trail) wired to the Rage toggle, stage-5 blade skin + decoded red Rage trail, costume selector from the real /Player/ table; rage ≠ berserk (ber* clips are bare-handed brawling per their type-10 blade tracks) — REAL: assets, trail tint values, blade tracks, costume 0–5 table; INFERRED: the brawl set's context (disarmed Ares duel). Note: Level 1 remains the fidelity target — this is a selector, not a tuning target

### God of War III Track (Phase 8)

- [ ] **GOW3-01**: Containers + PS3_BE record walk — a PSARC container reader and the PS3_BE WAD record walker (64-byte headers) walk R_HERO00.WAD byte-exact and are covered by a known-answer test (cracked ad-hoc 2026-09-25; formal verification lands in Phase 8)
- [ ] **GOW3-02**: Hero set decode — the R_HERO00–08 set is decoded with per-field evidence: ANM_hero act table and its readable att* combat vocabulary, MAT records (magic 8), DDS-named textures, the shipped dbg_ hash-dictionary records, and the string-keyed "Tween" property system; extractions curated into a tracked `extracted-gow3/` study set
- [ ] **GOW3-03**: A GoW3 data-archaeology page mirroring design/data-archaeology.html with the same real / inferred / dead-end tagging

## v2 Requirements (deferred)

- [ ] Plume of Prometheus / move-specific finisher FX (fire plume, ground ring, smoke)
- [ ] GS filtering-character emulation beyond bilinear
- [ ] Additional comparison clips (traversal, idle stow transitions)

## Out of Scope

| Exclusion | Reason |
|-----------|--------|
| True 3D chain link meshes | The game has no chain geometry — ribbon IS authentic; meshes read "too good" |
| HDR bloom, soft particles, motion blur, tonemapping, DoF | Not present on PS2; each one breaks the period look (locked anti-features) |
| Normal maps / specular on chain & blade | Flat textures + vertex color only, per the real assets |
| God-tier variants (stage5, godchain, godswordtrail) | Level-1 blades remain the fidelity target; stage-5 skin + god-mode FX set shipped ad-hoc as a selector (RAGE-01), not a tuning target |
| Pixel-exact matching | Emission is stochastic; the bar is 80–90% in-motion accuracy |
| Audio, environment, HUD fidelity | Weapon presentation only — enemies moved IN as a user-driven scope expansion (2026-08-13, ENM-01/02) |

## Traceability

Mapped by roadmap creation (2026-07-24). Every v1 requirement maps to exactly one phase; ad-hoc IDs (added 2026-09-25) map to no phase and GOW3-* map to Phase 8.

| Requirement | Phase | Status |
|-------------|-------|--------|
| VAL-01 | Phase 1 | Pending |
| VAL-02 | Phase 7 | Pending |
| DEC-01 | Phase 2 | Complete |
| DEC-02 | Phase 5 | Complete |
| DEC-03 | Phase 5 | Complete |
| CHAIN-01 | Phase 3 | Complete |
| CHAIN-02 | Phase 3 | Complete |
| CHAIN-03 | Phase 6 | Complete |
| MOT-01 | Phase 4 | Pending |
| MOT-02 | Phase 4 | Pending |
| FIRE-01 | Phase 6 | Complete |
| FIRE-02 | Phase 6 | Complete |
| TRL-01 | Phase 6 | Complete |
| TRL-02 | Phase 6 | Complete |
| REND-01 | Phase 2 | Complete |
| REND-02 | Phase 6 | Complete |
| REND-03 | Phase 2 | Complete |
| CMB-01 | Ad-hoc (pre-GSD) | Complete |
| CMB-02 | Ad-hoc (pre-GSD) | Complete |
| ENM-01 | Ad-hoc (pre-GSD) | Complete |
| ENM-02 | Ad-hoc (pre-GSD) | Complete |
| NAV-01 | Ad-hoc (pre-GSD) | Complete |
| MOT-03 | Ad-hoc (pre-GSD) | Complete |
| MOT-04 | Ad-hoc (pre-GSD) | Complete |
| DATA-01 | Ad-hoc (pre-GSD) | Complete |
| RAGE-01 | Ad-hoc (pre-GSD) | Complete |
| GOW3-01 | Phase 8 | Pending |
| GOW3-02 | Phase 8 | Pending |
| GOW3-03 | Phase 8 | Pending |

---
*Defined: 2026-07-24 — from research (.planning/research/) + user scoping*
*Traceability filled: 2026-07-24 by roadmap creation*
*Reconciled: 2026-09-25 (quick 260924-vax) — ad-hoc Aug-2026 deliveries catalogued, Phase 8 GOW3-01..03 added*
