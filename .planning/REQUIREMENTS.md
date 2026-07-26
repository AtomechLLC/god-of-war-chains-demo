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
- [ ] **CHAIN-03**: Chain glow is state-dependent — dark links at rest, hot streak during attacks/throws — via decoded mechanism if found (FXC_CNGemit candidate), else a footage-calibrated rule labeled inferred

### Chain Motion

- [ ] **MOT-01**: At rest the chain drapes in a catenary between forearm anchor and pommel and sways with body motion
- [ ] **MOT-02**: In flight the chain pulls taut with lag C-curvature trailing the blade arc, and settles back to drape after the move

### Blade Fire & Sparks

- [x] **FIRE-01**: Both layered flame systems per blade (flame3 + flame6 chains) render with the game's textures and runtime particle colors from decoded PTC records, hugging the blade in every combat frame
- [ ] **FIRE-02**: Impact sparks (BDEsparkemit) fire on hit events from the combat state machine with decoded rate/velocity/color

### Swing Trails

- [x] **TRL-01**: Swing trails use the real swordtrail texture with runtime crimson tint and white-hot core, additive, fast fade, stepped 60Hz extrusion (no spline smoothing)
- [x] **TRL-02**: The dual trail system (crimson fire trail + neutral swoosh, BFT/BGT pairs) is decoded and both variants render on the correct moves

### Renderer Authenticity

- [x] **REND-01**: The renderer enforces PS2-authentic compositing: clamped LDR gamma-space additive blending saturating to flat white, 0x80=1.0 conventions applied at texture/CLUT/modulate/blend stages, no bloom/tonemap/soft-particles (locked invariant)
- [ ] **REND-02**: Per-blade warm point lights use the decoded LeftBladeLight/RightBladeLight values (color 1.0/0.622/0.288, intensity 2.5, range 160), vertex-lit, no shadows
- [x] **REND-03**: Fixed 60Hz simulation timestep and a native-res (512×448-class) render-target toggle exist before formal footage comparison begins

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
| God-tier variants (stage5, godchain, godswordtrail) | Level-1 blades only per project decision |
| Pixel-exact matching | Emission is stochastic; the bar is 80–90% in-motion accuracy |
| Audio, environment, enemy, HUD fidelity | Weapon presentation only |

## Traceability

Mapped by roadmap creation (2026-07-24). Every v1 requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| VAL-01 | Phase 1 | Pending |
| VAL-02 | Phase 7 | Pending |
| DEC-01 | Phase 2 | Complete |
| DEC-02 | Phase 5 | Complete |
| DEC-03 | Phase 5 | Complete |
| CHAIN-01 | Phase 3 | Complete |
| CHAIN-02 | Phase 3 | Complete |
| CHAIN-03 | Phase 6 | Pending |
| MOT-01 | Phase 4 | Pending |
| MOT-02 | Phase 4 | Pending |
| FIRE-01 | Phase 6 | Complete |
| FIRE-02 | Phase 6 | Pending |
| TRL-01 | Phase 6 | Complete |
| TRL-02 | Phase 6 | Complete |
| REND-01 | Phase 2 | Complete |
| REND-02 | Phase 6 | Pending |
| REND-03 | Phase 2 | Complete |

---
*Defined: 2026-07-24 — from research (.planning/research/) + user scoping*
*Traceability filled: 2026-07-24 by roadmap creation*
