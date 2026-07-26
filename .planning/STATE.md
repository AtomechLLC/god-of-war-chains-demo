---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 06-03-PLAN.md (runtime trail ramp + BFT/BGT variant)
last_updated: "2026-07-26T08:15:07.970Z"
last_activity: 2026-07-26
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 23
  completed_plans: 16
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-24)

**Core value:** A GoW1 attack in kratos-lab reads 80–90% identical to real gameplay footage — chains, glow, and fire use the game's own decoded textures, particle definitions, colors, and values, not approximations.
**Current focus:** Phase 06 — particle-runtime-fire-sparks-trails

## Current Position

Phase: 06 (particle-runtime-fire-sparks-trails) — EXECUTING
Plan: 4 of 8
Status: Ready to execute
Last activity: 2026-07-26

Progress: [███████░░░] 70%

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 2 | 4 | - | - |
| 03 | 2 | - | - |
| 05 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 05 P01 | 15min | 2 tasks | 2 files |
| Phase 05 P02 | 10min | 2 tasks | 2 files |
| Phase 05 P03 | 12min | 2 tasks | 2 files |
| Phase 05 P04 | 15min | 2 tasks | 2 files |
| Phase 05 P05 | 15min | 2 tasks | 2 files |
| Phase 06 P01 | 5min | 2 tasks | 2 files |
| Phase 06 P02 | 12min | - tasks | - files |
| Phase 06 P03 | 9min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- (init): Fidelity measured vs footage at 80–90% in motion, not pixel-exact (emission is stochastic)
- (init): Decode FXC/PTC/MAT records before touching visuals — game values, not approximations
- (roadmap): Chain delivered as authentic textured ribbon with per-link twist, not 3D link meshes — the game has no chain geometry; meshes would read less authentic
- (roadmap): Rendering conventions (0x80=1.0, blend table, 60Hz tick, native-res toggle) locked in Phase 2 because retrofit costs are highest
- (init): Level 1 blade tier only; god-tier deferred
- **(03-02, user, explicit): FAST-TRACK the particle/fire system (roadmap Phases 5 decode + 6 render) as the real path to the footage look.** At the combined chain+glow checkpoint the user judged the glow "VERY subtle" and the sword trails thin ("should be thick, rich and full of particles — we are way off") vs reference footage. Phase 3's chain + glow are ACCEPTED as the functional foundation (CHAIN-02 automated-verified); footage-fidelity of the FX is deferred to the particle work rather than pushing Phase 3 further. Do NOT claim Phase-3 FX visually match footage.
- [Phase 05]: (05-01) buildFxDb keeps the FIRST (level-1, 768-B) same-name MSH copy; god-tier 1008-B out of scope — deviation from the plan's last-copy-wins note, required by the RED size-768 known answer
- [Phase 05]: (05-02) PTC decoded (parsePtc + buildFxDb 3rd-arg standaloneRecs): BFT/BGT trail defs are real db.ptc keys at slot 0x1d; no color read from PTC (identity RGBA byte-identical fire-vs-swoosh, Pitfall 4); DEC-02 still Pending until FXC (05-03)
- [Phase ?]: (05-03) DEC-02 COMPLETE: FXC decoded (parseFxc subtype-branched 0x2/0x3/0xd, +0x58 poly branch after u32 count) — MSH+PTC+FXC all decoded with per-field evidence; buildFxDb emits the full JSON-dumpable emitter->particle->shape graph (standalone BFT/BGT emit1 as real db.fxc keys, MSH refs resolved:true, guarded 0x1d BFT/BGT slot pair, placeholder slot 0x00/0xffff skipped)
- [Phase 05]: (05-04) D-06 GS-dump corroboration = SKIP (user decision): per-effect blend confidence stays MEDIUM, corroborated by differential-decode + Phase-1 footage anchors + cross-record consistency; Phase 6 uses the MAT-decoded blend already pinned in DEC-01. DEC-02 color clause substantiated data-first: effect color traced to MAT_pticleMat.blendColor (real byte value) with the white-hot->orange->ember age->color ramp INFERRED (GFX_swordtrail carries no painted length-wise ramp; static PTC RGBA identity, byte-identical fire-vs-swoosh).
- [Phase ?]: (05-05) DEC-03 decoded: FxParse.parseAnmType5 decodes the type-5 ANM blade-state descriptor = the gomaiblade scene-binding node (class 1/variant 2, u32@0 0x00020001) into a queryable JSON-dumpable state->visibility result (in-combat->in-hand, out-of-combat->on-back). Escalation disposition (D-04): no class-5 record + no level-1 ANM_maiblade exist, so 'type-5' is a taxonomy label (INFERRED, ELF tiebreaker) not a magic; show/hide mapping is runtime (INFERRED); framing/binding/placement/tier are real. No byte seed fabricated.
- [Phase ?]: (06-01) particles.js is a PURE Node-testable sim module (no gl/DOM) mirroring chain.js/loop.js: makePool spawn/integrate/burst + spawnAnchor/stretchAxis/variantFor/glowGain/rampColor/fireBindings; GL submission stays in app.js (D-02)
- [Phase ?]: (06-01) SC1 blade-lag pinned by known-answer: spawnAnchor transforms the REAL decoded FXC translation (idx 12..14) by the live blade matrix ONCE at spawn; particle then advects in world space and DECOUPLES (>=49u divergence from a moved blade) (D-03)
- [Phase ?]: (06-01) data-first labeling: spawn-anchor transform is REAL; gravity/jitter/variantFor/glowGain/rampColor are INFERRED (rampColor never a fabricated real color, 05-04); Security: reject-when-full pool cap + non-finite pos/vel/size/life/color guards (V5)
- [Phase ?]: (06-02) FxParse.parseLight decodes LeftBladeLight/RightBladeLight (88-B tag-0x1e records) byte-exact: color(1.0,0.622,0.288)@+0x2c, intensity 2.5@+0x38, range 160@+0x44, anchor(-0.32,-8.0,1.0)@+0x10 — REND-02 values are REAL/decoded (D-09b resolved), not roadmap constants; fail-loud size-gate (<0x48) mirrors parseTxr; 4 core values tagged real, ancillary +0x24/+0x3c/+0x40 INFERRED (A5)
- [Phase ?]: (06-02) fxdb.test.js Phase-6 binding contracts pin already-real facts (no decode top-up): FXC_BDEsparkemit is a real db.fxc key (subtype 0x3, shapeRef flame6Shape; .0 variant→flame3Shape), fire binds emitter→particle by shapeRef NAME (Pitfall 6, placeholder slot 0x0), FXC_CNGemit→PTC_CNGpart is shapeNameMatch===true name-confirmed (CHAIN-03). REND-02/FIRE-01/FIRE-02/CHAIN-03 remain Pending (render lands in 06-05..06-08)
- [Phase ?]: (06-03) Swordtrail runtime age->color ramp (INFERRED white-hot->ember, 05-04 no painted ramp) applied per-row-age (vT.z proxy) in the fxProg fragment gated by uTrailRamp; endpoints from tested-pure Particles.rampColor; blend/depth still only from MAT_swordtrail via Fx.applyMaterial (DEC-01) (TRL-01)
- [Phase ?]: (06-03) Per-move BFT (crimson) vs BGT (neutral swoosh) trail variant via Particles.variantFor(machine.st.current); variant is INFERRED per-variant tint on the SAME Particles.rampColor stops + SAME decoded GFX_swordtrail texture/MAT_swordtrail blend — never a fabricated real color (Pitfall 4) (TRL-02)
- [Phase ?]: (06-03) Rule-3 deviation: added particles.js browser <script> tag now (lockstep ?v=24) — drawFx consumes Particles.* in the browser this wave, so the module IS browser-consumed; the plan's defer-to-06-04 note contradicted its own action text (06-01 flagged this exact prerequisite)

### Pending Todos

None yet.

### Blockers/Concerns

- **CHAIN-02 footage-fidelity DEFERRED to fast-tracked particle/fire work (user decision):** the chainglow additive overlay + WAD-sourced textures + LEQUAL coplanar depth are functionally delivered and automated-verified, but the FX read faint/thin vs footage. Two data-grounded levers recorded for the particle/fire phase: (1) GLOW INTENSITY — GS alpha-over-1.0 (0x80=1.0; fire legally uses As up to ~1.99). If the decode/blend clamps glow alpha at 1.0 we render at ~half intended brightness; recover via shader-premultiply with raw alpha128 + blend ONE,ONE (CLAUDE.md Part 1) — data-grounded, not hand-tuning. (2) TRAIL RICHNESS — current sword trail is a thin ribbon (03-01 TRAIL_INNER_T=0.6 narrowed it); GoW1 trails are thick + particle-dense (billboard sparks/embers/flame puffs, CLAUDE.md Part 3), not achievable with the ribbon alone; interim option is to widen the ribbon.
- **Data correction (03-02 Task 1):** the decoded chainglow bytes differ from 03-RESEARCH's narrative — background is additive-black CLUT (1,1,1) not (0,0,0); hot blob extends to x=134, not x<80. The wad.test.js RED test pins the true byte-exact values (authoritative over the RESEARCH prose). No implementation change.
- **03-01 perceptual verify RESOLVED via the combined check:** the segmented-link read was confirmed at the 03-02 combined chain+glow live check (links render correctly under the glow); 03-01 geometry was already verified by automation + FX-isolation readback.
- **Phase 4 chain-span spike (carried from 03-01):** during fast combos the chain span reaches ~121u / ~135 links (should cap near CHAIN_LEN 14 → ~15-16). ROOT CAUSE is the PRE-EXISTING blade-sim (`driveBlade` / `rig.bladePos`), UNCHANGED by 03-01 — Phase 4 owns the real chain-motion solver. NOT a 03-01 defect.
- **INFERRED values to re-judge vs footage (03-02 combined check):** LINK_PITCH=0.9 (A4; on-screen link-count calibration DEFERRED to Phase-1 01-04, one-constant recalibration) and TRAIL_INNER_T=0.6 trail tip-arc bias (A9).
- Phase 5 is original reverse engineering with no public decode anywhere (FXC/PTC/MSH) — flagged for deeper research during planning: differential-decode protocol, PCSX2 GS-dump procedure, ELF-disassembly escalation path
- Phase 4 chain-motion mechanism is footage-inferred, not data-backed — plan a short footage-measurement study from Phase-1 captures
- TRL-02 dual-trail theory (BFT fire + BGT swoosh) is MEDIUM confidence — Phase 5 PTC decode confirms; fallback is a single crimson trail
- **Tooling added (03-02 checkpoint, commits 05fbb8d + 672e5de):** KratosLab.autoplay + on-screen Autoplay/FX-only buttons + window.__fxOnly/__fxBright — dev/QA capture aids (?v now =23). Useful for the fast-tracked particle work's visual checks.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-26T08:14:52.546Z
Stopped at: Completed 06-03-PLAN.md (runtime trail ramp + BFT/BGT variant)
Resume file: None
