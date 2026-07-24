# Roadmap: Chains of Chaos — Visual Fidelity

## Overview

The journey runs from uncontaminated ground truth to a side-by-side verdict. First, establish a verified-clean reference capture library and written acceptance criteria — every later visual judgment depends on it. Second, lock the PS2-authentic rendering foundation: raw WAD loading, full MAT decode, the single GS→WebGL blend mapping, the 0x80=1.0 convention, fixed 60Hz timestep, and native-res toggle — the conventions that are catastrophic to retrofit. From there the work splits into two parallel-capable tracks: the chain track (link ribbon + glow pass, then catenary/whip motion) needs no new decoding, while the decode track takes on the project's core original reverse engineering — FXC emitter configs, PTC particle defs, MSH shapes, and the type-5 blade-state descriptor, each with per-field evidence tables. The decoded values then drive the particle runtime: layered blade fire, impact sparks, dual swing trails, state-dependent chain glow, and decoded blade lights. Finally, the side-by-side harness judges the whole against Phase-1 captures at the 80–90%-in-motion bar, tuning only quantities labeled INFERRED.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Reference Pipeline & Validation Criteria** - Uncontaminated capture library, freeze-frame measurements, and written acceptance criteria
- [ ] **Phase 2: WAD/MAT Decode & Render-Pass Foundation** - Raw WAD loading, full MAT decode, single GS→GL blend table, 0x80 convention, 60Hz timestep, native-res toggle
- [ ] **Phase 3: Chain Link Ribbon & Glow** - Correctly pitched, per-link-twisted chainlink ribbon plus chainglow additive overlay
- [ ] **Phase 4: Chain Motion** - Catenary drape at rest, whip-lag C-curves in flight, settle behavior on the 60Hz tick
- [ ] **Phase 5: FX Record Decode** - MSH/PTC/FXC differential decode with evidence tables, type-5 blade-state descriptor, GS-dump blend confirmation
- [ ] **Phase 6: Particle Runtime — Fire, Sparks & Trails** - World-space particle pool rendering flames, sparks, dual trails, state glow, and blade lights from decoded values
- [ ] **Phase 7: Side-by-Side Validation & Inferred Tuning** - In-tool comparison harness vs reference captures; 80–90% in-motion verdict

## Phase Details

### Phase 1: Reference Pipeline & Validation Criteria

**Goal**: Uncontaminated ground truth exists — every later visual judgment compares against verified-clean captures with measured, written criteria
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: VAL-01
**Success Criteria** (what must be TRUE):

  1. A PCSX2 software-renderer, native-res capture setup exists with documented settings, and Level-1 blade combat clips are captured (or existing footage verified clean); YouTube footage is demoted to motion/timing reference only
  2. A freeze-frame library catalogs chain at rest, mid-swing, and fire close-ups at three framings, annotated for link pitch, glow hues, flame shapes, and trail geometry
  3. A written target definition exists ("GS output as captured, not CRT") plus measured on-screen link counts and flame flicker cadence from footage
  4. The 80–90% acceptance checklist that Phase 7 will judge against is written down

**Plans:** 4 plans

Plans:
**Wave 1**

- [ ] 01-01-PLAN.md — Capture-safe repo: gitignore media dirs, TARGET-DEFINITION.md, shot-list.md
- [ ] 01-02-PLAN.md — PCSX2 software-renderer pipeline: official FFmpeg DLLs, SETTINGS.md, ini snapshot (human GUI checkpoint)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-03-PLAN.md — Human capture session, library ingest/rename, dimension calibration, git-safety gate

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-04-PLAN.md — Measurements (link pitch, glow hues, trail geometry, flicker cadence) + zero-TBD ACCEPTANCE.md

### Phase 2: WAD/MAT Decode & Render-Pass Foundation

**Goal**: Every FX draw uses its material's real decoded blend/depth state, and the PS2-authentic rendering conventions are locked before any visual tuning happens
**Mode:** mvp
**Depends on**: Nothing (independent of Phase 1; ordered after it so no visual judgment precedes ground truth)
**Requirements**: DEC-01, REND-01, REND-03
**Success Criteria** (what must be TRUE):

  1. kratos-lab loads the weapon WAD raw in-browser with nearest-preceding-name resolution — level-1 and god-tier records with identical names never cross-wire
  2. Every distinct blend tuple across all weapon MATs is enumerated in one pass; existing chain/trail draws use their MAT's real blend/depth state via the single MAT→GL mapping table, and unknown tuples assert instead of silently defaulting
  3. Stacked additive layers saturate to flat white in clamped LDR gamma space — 0x80=1.0 conversion applied at texture/CLUT/modulate/blend stages, canvas `alpha: false`, no bloom/tonemap/soft-particles anywhere
  4. Simulation runs on a fixed 60Hz accumulator decoupled from rAF, and a native-res (512×448-class) render-target toggle works

**Plans**: TBD

### Phase 3: Chain Link Ribbon & Glow

**Goal**: The chain reads as the game's segmented links with the real heat glow — a correctly pitched ribbon, not a flat strip and not 3D meshes
**Mode:** mvp
**Depends on**: Phase 1 (freeze-frame link-count measurements), Phase 2 (pass architecture, MAT blend states)
**Requirements**: CHAIN-01, CHAIN-02
**Success Criteria** (what must be TRUE):

  1. The chain shows individual links at correct pitch (32px/link, 16 links/tile) with visible alpha gaps and alternating per-link ~90° twist for the 3D read; on-screen link count matches Phase-1 measurements
  2. The link pass renders with "usual" alpha blending and depth-write ON, so later fire/glow passes occlude correctly against the chain
  3. A chainglow additive overlay (depth-write off) shares the ribbon UVs and shows the decoded texture's real heat-ramp colors — no hand-picked glow color anywhere

**Plans**: TBD

### Phase 4: Chain Motion

**Goal**: The chain moves like the game's — drapes at rest, whips taut in flight, settles after the move
**Mode:** mvp
**Depends on**: Phase 3 (motion renders through the link ribbon), Phase 2 (60Hz timestep)
**Requirements**: MOT-01, MOT-02
**Success Criteria** (what must be TRUE):

  1. At rest the chain hangs in a catenary between forearm anchor and pommel and sways with body motion
  2. During attacks the chain pulls taut with lag C-curvature trailing the blade arc, driven primarily by the already-decoded type-10 blade tracks with a minimal restrained solver
  3. After a move the chain settles back to drape without popping; the solver runs on the fixed 60Hz tick, and whip shapes stay discrete per-link (no liquid-smooth splines)

**Plans**: TBD

Note: Research flag — motion mechanism is footage-inferred, not data-backed; planning should include a short footage-measurement study (segment counts, lag timing) from Phase-1 captures.

### Phase 5: FX Record Decode

**Goal**: The game's particle and emitter data is decoded with per-field evidence, so the runtime can be driven by real values instead of approximations
**Mode:** mvp
**Depends on**: Phase 2 (parseWad record access), Phase 1 (freeze-frame color anchors for corroboration)
**Requirements**: DEC-02, DEC-03
**Success Criteria** (what must be TRUE):

  1. MSH_BDepoly shapes, PTC particle defs, and FXC emitter configs (decode order: MSH → PTC → FXC subtype 0x2 first) have documented per-field evidence tables — offset, raw bytes, interpretation, corroboration — with every field tagged real vs INFERRED
  2. Colors, rates, sizes, and lifetimes for flame3/flame6, BDEsparkemit, and BFT/BGT resolve from decoded records into a queryable FxDb with cross-record references, JSON-dumpable without a renderer
  3. The type-5 ANM descriptor is decoded and drives blade presentation — blades appear on Kratos's back out of combat and in hands during combat
  4. A PCSX2 GS dump of a blade swing confirms actual per-effect blend configs, and the disc region (NTSC vs PAL) is confirmed before interpreting any rate/lifetime as tick units

**Plans**: TBD

Note: Research flag — this is original reverse engineering with no public decode anywhere; planning must include the differential-decode protocol (15+ record instances, stage1 vs god pairs), the GS-dump capture procedure, and the ELF-disassembly escalation path.

### Phase 6: Particle Runtime — Fire, Sparks & Trails

**Goal**: Blade fire, impact sparks, swing trails, state-dependent chain glow, and blade lights all render from decoded values on the locked pass architecture
**Mode:** mvp
**Depends on**: Phase 5 (decoded FxDb, type-5 gating), Phase 2 (pass renderer, 60Hz tick)
**Requirements**: FIRE-01, FIRE-02, TRL-01, TRL-02, CHAIN-03, REND-02
**Success Criteria** (what must be TRUE):

  1. Both layered flame systems (flame3 + flame6 chains) burn on each blade in every combat frame with the game's textures and decoded runtime colors, simulated in world space so fire lags a whipping blade instead of sticking to it
  2. Impact sparks (BDEsparkemit) fire on hit events from the combat state machine with decoded rate/velocity/color
  3. Swing trails use the real swordtrail texture with runtime crimson tint and white-hot core, additive, fast fade, stepped 60Hz extrusion with no spline smoothing — and both trail variants (crimson fire BFT + neutral swoosh BGT) render on the correct moves
  4. Chain glow is state-dependent — dark links at rest, hot streak during attacks/throws — via the decoded mechanism if Phase 5 found one (FXC_CNGemit candidate), else a footage-calibrated rule labeled INFERRED
  5. Per-blade warm point lights use the decoded LeftBladeLight/RightBladeLight values (color 1.0/0.622/0.288, intensity 2.5, range 160), vertex-lit, no shadows

**Plans**: TBD

### Phase 7: Side-by-Side Validation & Inferred Tuning

**Goal**: The full weapon presentation is judged against uncontaminated reference and passes the 80–90%-in-motion bar
**Mode:** mvp
**Depends on**: Phases 1–6 (all prior work feeds the verdict)
**Requirements**: VAL-02
**Success Criteria** (what must be TRUE):

  1. An in-tool side-by-side / A-B flicker harness plays kratos-lab next to Phase-1 reference captures of the same moves at three framings, with the native-res toggle active
  2. Only runtime-computed quantities labeled INFERRED are tuned during comparison; decoded real values remain untouched
  3. The "Looks Done But Isn't" checklist passes — magenta-background test, particle density at high refresh rates, flame flicker cadence count
  4. The final result is judged 80–90% accurate in motion against the Phase-1 acceptance checklist

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

Parallelism note: after Phase 2, the chain track (Phases 3–4) and the decode track (Phase 5) are parallel-capable; Phase 6 requires Phase 5; Phase 7 requires everything.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Reference Pipeline & Validation Criteria | 0/4 | Planned | - |
| 2. WAD/MAT Decode & Render-Pass Foundation | 0/TBD | Not started | - |
| 3. Chain Link Ribbon & Glow | 0/TBD | Not started | - |
| 4. Chain Motion | 0/TBD | Not started | - |
| 5. FX Record Decode | 0/TBD | Not started | - |
| 6. Particle Runtime — Fire, Sparks & Trails | 0/TBD | Not started | - |
| 7. Side-by-Side Validation & Inferred Tuning | 0/TBD | Not started | - |

---
*Created: 2026-07-24 — 7 phases, 17/17 v1 requirements mapped*
*Phase 1 planned: 2026-07-24 — 4 plans, 3 waves*
