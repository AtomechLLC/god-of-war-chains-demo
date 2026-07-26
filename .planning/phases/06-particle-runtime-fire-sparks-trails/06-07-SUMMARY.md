---
phase: 06-particle-runtime-fire-sparks-trails
plan: 07
subsystem: rendering
tags: [webgl1, chainglow, additive-premult, alpha-over-1.0, combat-gate, glsl]

# Dependency graph
requires:
  - phase: 06-01
    provides: Particles.glowGain(isIdle,{rest,hot}) pure INFERRED dark<->hot rule
  - phase: 06-04
    provides: additivePremult MAT mode (blendFunc ONE,ONE) + the pool premult fragment path
  - phase: 06-06
    provides: the current drawFx pass ordering (chain -> trail -> pool spark/fire/impact)
  - phase: 03-02
    provides: the coplanar-LEQUAL chainglow overlay + the two open glow/trail intensity levers
provides:
  - State-dependent chain glow: dark links at rest, hot streak during attack/throw active windows
  - alpha-over-1.0 glow brightness recovery on the chainglow pass (shader-premultiply raw alpha128 x combat gain, blendFunc ONE,ONE)
  - uGlowGain uniform + premult branch in the fxProg fragment, gated so only the chainglow pass uses it
affects: [phase-07, footage-fidelity-verification, glow-intensity-calibration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-effect fxProg fragment flag (uGlowGain, alongside uTrailRamp): each pass resets its own flag; explicit resets over a uFxMode enum (WARNING-6 DEFERRED)"
    - "Synthesized mat-like {name,mode:'additivePremult',disableDepthWrite} routes a decoded MAT's texels through a different blend mode while keeping Fx.applyMaterial's assert-on-unknown contract (DEC-01)"

key-files:
  created: []
  modified:
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "Chain glow is combat-gated via Particles.glowGain(machine.isIdle(),{rest:GLOW_REST,hot:GLOW_HOT}) — dark at rest, hot on attack; the dark<->hot rule is INFERRED (no decoded state-gate field, verified Phase 5), labeled (D-05, A2, CHAIN-03)"
  - "Brightness recovered via alpha-over-1.0 premult: the fxProg fragment outputs the decoded glow texel rgb * (alpha128 * uGlowGain) with alpha 0, blended ONE,ONE (additivePremult) — data-grounded (CLAUDE.md Part 1), NOT a hand-tuned multiplier"
  - "Glow color stays the in-WAD decoded chainglowTex (identity material/blend, texels pass through) — no hand-picked glow RGB (Pitfall 4); GLOW_REST=0.3 / GLOW_HOT=1.8 are the only INFERRED constants"
  - "additivePremult reached via a synthesized mat-like so the blend switch lives ONLY in fx.js (no hardcoded blendFunc in app.js, DEC-01/D-07); FXC_CNGemit is standalone-only and NOT a runtime input (D-08 corroboration in-test only)"

patterns-established:
  - "Optional INFERRED smooth flare: during an attack, ease the hot streak in over the active window (st.t/st.dur vs windows.branch) and back toward rest, bounded [GLOW_REST, glowBase] and finite"
  - "Leak-guard reset discipline: reset the premult flag at drawFx top + off in the trail pass so the fxProg flag is deterministic per frame (T-06-07-01); drawFx still ends with Fx.restoreFxState"

requirements-completed: [CHAIN-03]

# Metrics
duration: 4min
completed: 2026-07-26
---

# Phase 6 Plan 7: State-Dependent Chain Glow (CHAIN-03) Summary

**Combat-gated chain glow — dark links at rest, hot streak during attack/throw windows — brightened above the 1.0 clamp via the alpha-over-1.0 premult path (shader-premultiply raw alpha128 x combat gain, blendFunc ONE,ONE) using the decoded chainglow texel color.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-26T09:04:32Z
- **Completed:** 2026-07-26T09:08:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Chain glow now responds to combat state: `Particles.glowGain(machine.isIdle(), {rest:GLOW_REST, hot:GLOW_HOT})` drives a dim glow at rest and a hot streak on attack (INFERRED rule, labeled D-05/A2 — no decoded state gate exists).
- Closed the 03-02 "glow VERY subtle" lever data-grounded: the chainglow pass switched to `additivePremult` and the fxProg fragment premultiplies the decoded texel by `(alpha128 * uGlowGain)`, so `GLOW_HOT=1.8 > 1.0` exceeds the 1.0 clamp (CLAUDE.md Part 1 alpha-over-1.0). No hand-tuned color — the glow color stays the in-WAD decoded chainglow texel.
- Added an optional smooth active-window flare (sin envelope over `st.t/st.dur` vs `windows.branch`) so the glow pulses with the swing instead of hard-switching; bounded in `[GLOW_REST, glowBase]` and finite (T-06-07-01).
- Leak-safe: `uGlowGain` reset at drawFx top + off in the trail pass; the coplanar LEQUAL overlay + bit-identical chain vertex bytes preserved; drawFx still ends with `Fx.restoreFxState`.
- Lockstep `?v=27 -> ?v=28` bump across all 9 script tags; full 8-suite regression green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Combat-gated glow gain + alpha-over-1.0 premult brightness on the chainglow pass (CHAIN-03)** - `94d8279` (feat)
2. **Task 2: State-leak guard verification + ?v bump** - `08de0f6` (chore)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `tools/kratos-lab/app.js` - Added `uGlowGain` uniform + premult branch to the fxProg fragment; wired `uGlowGain` into fxLocs; added `GLOW_REST`/`GLOW_HOT` INFERRED constants; gated the chainglow PASS 2 by combat state via `Particles.glowGain`, switched it to `additivePremult` (synthesized mat-like), added the smooth flare, and reset the glow flag at drawFx top + off in the trail pass.
- `tools/kratos-lab/index.html` - Lockstep `?v=27 -> ?v=28` bump across all 9 `<script>` tags.

## Decisions Made
- **Gate value = tested-pure `Particles.glowGain` base, modulated by an INFERRED flare.** The primary gate is `Particles.glowGain(machine.isIdle(), {rest,hot})` (satisfies the 06-01 contract). During an attack an optional `sin` envelope over the active window eases the hot streak in/out; it only ever interpolates between `GLOW_REST` and the tested `glowGain` result, so the value the fragment scales by stays finite and bounded (T-06-07-01).
- **`GLOW_REST=0.3` / `GLOW_HOT=1.8`** chosen to match the tested `particles.test.js` glow-gate example values (`rest:0.3, hot:1.8`) and satisfy `GLOW_HOT > 1.0`; both labeled INFERRED, footage-calibrated in Phase 7.
- **additivePremult via a synthesized mat-like** `{name:'MAT_chainglow', mode:'additivePremult', disableDepthWrite:true}` — keeps the DEC-01 assert-on-unknown contract, keeps the blend switch in fx.js only (no hardcoded blendFunc in app.js), and keeps depth-write OFF as the decoded additive glow always was.
- **`uGlowGain > 0.0` is the premult-branch flag** (not a separate boolean uniform) — mirrors the existing `uTrailRamp > 0.5` pattern; each pass resets its own flag (the uFxMode-enum consolidation stays DEFERRED per WARNING-6).

## Deviations from Plan

None - plan executed exactly as written.

The plan's Task 2 verify literally greps `! grep -q '?v=23'`; the live version was already `?v=27` (bumped in 06-06), so the bump was `27 -> 28` and the verification additionally confirmed no `?v=27` remains (the prior_work "grep the OLD version" intent). This is a stale literal in the plan's grep, not a behavior change.

## Issues Encountered
- The plan's line anchors (e.g. chainglow "PASS 2 (app.js:671-685)", fragment "357-370") were stale relative to the current `master` tip — the file has grown from prior waves. Located the real chainglow PASS 2, the fxProg fragment, and `fxLocs` by grep before editing. No functional impact.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both 03-02 carry-forward levers now addressed data-grounded: glow intensity (this plan, alpha-over-1.0) and trail richness (06-03 ramp/variant + 06-04/06/06 particle passes). Phase 7 owns the footage cross-check + calibration of the INFERRED constants (`GLOW_REST`/`GLOW_HOT`, emission rate/vel/life, `TRAIL_INNER_T`, `LINK_PITCH`).
- Manual Phase-7 harness check remaining: glow dark at idle, hot streak during attacks/throws, visibly brighter than the 03-02 clamped result; `KratosLab.fxState()` clean between frames; magenta-bg additive add.
- One plan remains in Phase 6 (8 of 8) before the phase closes.

## Self-Check: PASSED

- Files verified present: `tools/kratos-lab/app.js`, `tools/kratos-lab/index.html`, `06-07-SUMMARY.md`.
- Commits verified in git log: `94d8279` (Task 1, feat), `08de0f6` (Task 2, chore).
- All 8 test suites (anm, chain, fx, fxdb, light, loop, particles, wad) exit 0.

---
*Phase: 06-particle-runtime-fire-sparks-trails*
*Completed: 2026-07-26*
