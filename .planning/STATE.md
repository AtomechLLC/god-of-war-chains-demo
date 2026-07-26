---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 05 complete (5/5) — ready to discuss Phase 6
last_updated: 2026-07-26T04:34:08.005Z
last_activity: 2026-07-26
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 15
  completed_plans: 13
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-24)

**Core value:** A GoW1 attack in kratos-lab reads 80–90% identical to real gameplay footage — chains, glow, and fire use the game's own decoded textures, particle definitions, colors, and values, not approximations.
**Current focus:** Phase 6 — particle runtime — fire, sparks & trails

## Current Position

Phase: 6
Plan: Not started
Status: Ready to plan
Last activity: 2026-07-26

Progress: [█████████░] 87%

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

Last session: 2026-07-26T00:38:29.386Z
Stopped at: Completed 05-05-PLAN.md (DEC-03: parseAnmType5 type-5 ANM blade-state descriptor decoded; escalation disposition recorded; Phase 5 ready for verification)
Resume file: None
