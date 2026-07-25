---
phase: 02-wad-mat-decode-render-pass-foundation
plan: 03
subsystem: sim-loop
tags: [fixed-timestep, accumulator, gaffer-fix-your-timestep, rAF, tdd, webgl1]

# Dependency graph
requires:
  - phase: 02-wad-mat-decode-render-pass-foundation
    provides: "02-02: drawFx/MatDb-driven render pass, KratosLab.step hook shape, fxLog/fxState verification surface"
provides:
  - Loop.STEP (1/60) + Loop.makeAccumulator({step, maxFrame}) — pure, Node-tested fixed-timestep accumulator (remainder carry, 0.25s stall clamp, negative-dt clamp)
  - tools/kratos-lab/test/loop.test.js — known-answer suite (60Hz, 144Hz, 2s-stall=15, 1ms carry, custom options)
  - app.js simStep()/uploadSkinnedVerts()/renderFrame(wallDt) split on the accumulator; sim at exactly 60 steps/s on any display
  - Trail history recorded per sim tick (TRL-01 prerequisite)
  - KratosLab.step = one deterministic fixed sim step + one render; KratosLab.simStepCount (60Hz witness) + KratosLab.STEP
affects: [02-04, phase-4 attack authoring, phase-5 GS reconciliation, phase-6 particles, TRL-01 stepped-60Hz trail extrusion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Fixed-timestep accumulator as a PURE module (wall time arrives as a parameter — no clock/DOM/GL reads), so 60Hz semantics are provable in Node
    - sim/presentation split — sim state advances only in simStep (fixed STEP); camera autospin/easing consume wall dt in renderFrame
    - Epsilon-guarded accumulator comparison (acc >= step - 1e-9) to stop float residue under-paying steps

key-files:
  created:
    - tools/kratos-lab/loop.js
    - tools/kratos-lab/test/loop.test.js
  modified:
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "1e-9s comparison epsilon added to the accumulator pay-out loop: bare `acc >= step` under-counts on float residue (0.3 - 0.1 - 0.1 = 0.09999999999999998 < 0.1), which contradicted the plan's own behavior spec (custom step 0.1/maxFrame 0.3 must pay 3 steps)"
  - "blendLeft decrement guarded (`if (skin.blendLeft > 0)`) in simStep so it cannot drift unboundedly negative; uploadSkinnedVerts only reads it"
  - "renderFrame runs every rAF unconditionally (plan spec) — no viewDirty render-skip from the RESEARCH sketch; camera/autospin smoothness wins"

patterns-established:
  - "Sim time is owned exclusively by simStep; render-side code may read sim state but never advances it"
  - "Per-tick trail sampling: trailHist entries age by exactly STEP and are pushed once per sim tick — the 60Hz cadence later phases extrude against"

requirements-completed: []  # REND-03 is half-done here (timestep); native-res toggle lands in 02-04

# Metrics
duration: ~6min
completed: 2026-07-25
---

# Phase 2 Plan 03: Fixed 60Hz Timestep Summary

**Simulation now advances in exact 1/60s steps through a pure Node-tested accumulator (60Hz/144Hz/stall-proven), with app.js split into simStep (machine/pose/blades/trail/heat/blend — fixed STEP) and renderFrame (autospin/camera easing — wall clock), so every rate authored in Phases 4-6 lands on a stable 60Hz cadence**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-25T07:01:09Z
- **Completed:** 2026-07-25T07:07:12Z
- **Tasks:** 2 (1 TDD, 1 auto)
- **Files modified:** 4

## Accomplishments

- `Loop.makeAccumulator({step, maxFrame})` is a pure "Fix Your Timestep" accumulator: clamps each incoming delta to `maxFrame` (0.25s → at most 15 catch-up steps after any stall, T-2-08), clamps negative dt to 0, pays out whole fixed steps, and carries the fractional remainder — proven by known-answer tests at 60Hz (600 calls → 600 steps), 144Hz (144×1/144 → 60 steps), 2s stall (exactly 15), 1ms dribble (step lands on the 17th call), and custom step/maxFrame options
- loop.js contains zero `document.`/`window.`/`performance.` references (grep-verified pure) and exports through the codebase's dual-environment guard — the whole 60Hz contract runs in Node without a browser
- app.js sim consumers (`machine.tick`, heat decay, `rig.computePose` → `skin.lastWorld`, blade track sampling + `driveBlade`, trail age/shift/push, `skin.blendLeft` bookkeeping) all moved into `simStep()` running at exactly `Loop.STEP`; `machine.tick` appears exactly once in app.js
- Trail history now advances per sim tick, not per rendered frame — the load-bearing prerequisite for TRL-01's stepped-60Hz trail extrusion
- CPU skinning (the expensive 7.4k-vert half) stays render-side in `uploadSkinnedVerts()`, running once per rendered frame; it reads `skin.blendLeft` but never decrements it
- Camera autospin yaw and auto-frame distance easing consume the wall-clock dt inside `renderFrame(wallDt)` — camera feel is identical on a 60Hz and a 144Hz display while the sim still runs exactly 60 steps/s
- `KratosLab.step()` redefined as one deterministic fixed sim step + one render + timeline (the hidden-tab/verification pump formalized from 02-02's checkpoint experience, T-2-09); added `KratosLab.simStepCount` (independent 60Hz witness) and `KratosLab.STEP`

## Task Commits

Each task was committed atomically (TDD RED precedes GREEN for Task 1):

1. **Task 1 (RED): failing accumulator known-answer tests** - `ba691d1` (test)
2. **Task 1 (GREEN): loop.js pure accumulator + index.html ?v=19** - `dca3bf0` (feat)
3. **Task 2: app.js simStep/renderFrame split on the accumulator** - `49bbb8f` (feat)

## Files Created/Modified

- `tools/kratos-lab/loop.js` - NEW: IIFE + dual-env export guard; `STEP = 1/60`, `makeAccumulator` with maxFrame stall clamp, negative-dt clamp, remainder carry, and the 1e-9s epsilon comparison; commented as the Fix Your Timestep pattern with the spiral-of-death rationale
- `tools/kratos-lab/test/loop.test.js` - NEW: node:assert known-answer suite covering every plan behavior (60Hz, 144Hz, stall=15, 17×1ms carry, never-negative, custom options)
- `tools/kratos-lab/app.js` - `updateSkinning(dt)` dissolved into `simStep()` (sim half) + `uploadSkinnedVerts()` (derived render state); `render(dt)` → `renderFrame(wallDt)`; main loop drives 0..n fixed steps per rAF via `Loop.makeAccumulator`; old `Math.min(0.05, dt)` variable-step clamp deleted; hooks extended (step/simStepCount/STEP)
- `tools/kratos-lab/index.html` - `loop.js` script tag inserted after fx.js, before app.js; all cache-busters bumped ?v=18 → ?v=19

## Decisions Made

- Epsilon-guarded comparison in the accumulator (see Deviations) — behavior spec took precedence over the plan's inline code sketch
- `skin.blendLeft` decrement guarded by `> 0` in simStep (prevents unbounded negative drift; original code only decremented while blending)
- Render runs every rAF with no dirty-check skip, per the plan's main-loop spec (RESEARCH's `viewDirty` sketch not adopted — smooth camera on high-refresh displays)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's inline accumulator body under-counts steps on float residue**
- **Found during:** Task 1 (GREEN)
- **Issue:** The plan's verbatim implementation (`while (acc >= step)`) fails the plan's own behavior spec: with `step: 0.1, maxFrame: 0.3`, `advance(1.0)` must return 3, but IEEE-double subtraction leaves `0.3 - 0.1 - 0.1 = 0.09999999999999998 < 0.1`, paying out only 2 steps (verified in Node before fixing)
- **Fix:** Comparison epsilon `acc >= step - 1e-9` — 1e-9s is ~7 orders of magnitude below STEP, so it absorbs float residue but cannot mint a step from genuinely missing time; all other behaviors (600@60Hz, 60@144Hz, stall=15, carry@17) unchanged and green
- **Files modified:** tools/kratos-lab/loop.js
- **Commit:** dca3bf0

## Verification

- All three Node suites green: `node tools/kratos-lab/test/loop.test.js && node tools/kratos-lab/test/wad.test.js && node tools/kratos-lab/test/fx.test.js` (wad: 283 records / 24 MATs / 2 tuples)
- Grep gates: `machine.tick` ×1 (inside simStep, fixed STEP); `updateSkinning` ×0; `Math.min(0.05` gone; `Loop.makeAccumulator`, `function simStep`, `uploadSkinnedVerts`, `simStepCount` present; trailHist aging/push under simStep; autospin + easing consume `wallDt` in renderFrame; blendLeft decremented only in simStep
- loop.js purity: `grep -E "document\.|window\.|performance\." tools/kratos-lab/loop.js` exits 1
- `node --check` clean on app.js and loop.js
- `git status --porcelain` clean; only the four files_modified touched
- Browser-side 60±1 steps/s confirmation deliberately deferred to plan 02-04's checkpoint (per plan Task 2 done-criteria); the running preview server serves the main checkout, not this worktree branch, so live smoke here would exercise stale code

## TDD Gate Compliance

- RED gate: `ba691d1` test(02-03) — suite failed with MODULE_NOT_FOUND (loop.js absent) before implementation
- GREEN gate: `dca3bf0` feat(02-03) — suite passes; commits in correct order in git log
- REFACTOR: not needed (implementation landed clean)

## Deviations Note on Semantics

One inherent semantic shift from the split (explicitly specified by the plan, not a deviation): the blend mix factor is now computed AFTER the sim tick decrements `blendLeft`, so the first rendered frame of a move blends at `f = STEP/blendDur` instead of exactly 0. Sub-frame difference, invisible at 60Hz.

## Issues Encountered

None beyond the float-residue fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-04 wraps `renderFrame` for the native-res FBO toggle — the split gives it a single render entry point; its checkpoint performs the browser-side 60±1 steps/s confirmation via `KratosLab.simStepCount`
- Phases 4-6 can author rates/lifetimes per-tick against a guaranteed 60Hz cadence (PITFALLS P5 retrofit cost avoided)
- TRL-01's stepped-60Hz trail extrusion has its per-tick history in place

## Self-Check: PASSED

- All 4 claimed code files exist (loop.js, test/loop.test.js, app.js, index.html) plus this SUMMARY
- All 3 task commits present in git log (ba691d1, dca3bf0, 49bbb8f)
- TDD gate sequence verified: test `ba691d1` precedes feat `dca3bf0`
- `node tools/kratos-lab/test/loop.test.js && node tools/kratos-lab/test/wad.test.js && node tools/kratos-lab/test/fx.test.js` exits 0

---
*Phase: 02-wad-mat-decode-render-pass-foundation*
*Completed: 2026-07-25*
