---
phase: 06-particle-runtime-fire-sparks-trails
plan: 05
subsystem: rendering
tags: [webgl1, particles, additive-premult, fxdb, fire, blade-lag, data-first]

# Dependency graph
requires:
  - phase: 06-02
    provides: FxDb decoders (buildFxDb, parseFxc/parsePtc), db.meta.colorSource, parseLight
  - phase: 06-04
    provides: shared billboard particle pool (fxPool/drawPool) + additivePremult MAT mode
  - phase: 06-01
    provides: pure Particles sim (spawnAnchor/fireBindings/makePool + blade-lag divergence known-answer)
provides:
  - Runtime FxDb constructed once in app.js (db = FxParse.buildFxDb(wadRecords, wadBuf)) + KratosLab.fxdb() accessor
  - Level-1 blade fire (flame3 + flame6) emitted world-space per attacking tick, spawn-decoupled (SC1 blade-lag)
  - Real MAT_pticleMat.blendColor fire color via additive-premult (alpha-over-1.0) + resolvable fire sprite
affects: [06-06, 06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime FxDb built once at init beside matDb (no 3rd arg — in-WAD only, D-09a); render slices read db.fxc/db.ptc/db.meta.colorSource"
    - "Pool draw batched by particle family via drawPool(mvp,view,tex,{kinds,tint,name}) — one additive-premult pass per family (D-02)"
    - "Real decoded effect color applied as per-vertex rgb tint at draw; INFERRED overbright alpha128 kept per-particle (alpha-over-1.0)"

key-files:
  created: []
  modified:
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "Runtime FxDb built with NO 3rd standaloneRecs arg — the fire family + colorSource are all in-WAD (D-09a); no async assets/kratos/fx/*.bin fetch added"
  - "Fire particle rgb identity (1,1,1) at spawn; the REAL color from db.meta.colorSource applied as a tint at the fire draw (chainglow identity-passthrough pattern)"
  - "Fire sprite = fxTexFromMat(MAT_pticleMat) attempted first, documented trailTex fallback (MAT_pticleMat has empty texName) — INFERRED sprite reuse; the decoded part is the COLOR"
  - "index.html ?v bumped 25 -> 26 (lockstep next integer); the plan's verify literal said ?v=23 but the file had advanced to 25 during waves 1-3"

patterns-established:
  - "drawPool kind-filter + tint override: batch fire vs spark by texture, real color at draw"
  - "spawnAnchor(bladeSim[key].mat, sys.matrix) sampled once at spawn -> world decouple = SC1 blade-lag"

requirements-completed: [FIRE-01]

# Metrics
duration: 20min
completed: 2026-07-26
---

# Phase 6 Plan 05: World-Space Blade Fire (flame3 + flame6) Summary

**Runtime FxDb stood up in app.js (the render `db` that did not exist before), then both level-1 flame systems emit world-space per attacking tick — spawn-decoupled for SC1 blade-lag, colored by the real MAT_pticleMat.blendColor via additive-premult (alpha-over-1.0) on a resolvable fire sprite.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-26T08:22Z
- **Completed:** 2026-07-26T08:41:49Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- **BLOCKER fix:** built and exposed the runtime FxDb (`const db = FxParse.buildFxDb(wadRecords, wadBuf)`) beside matDb + a JSON-safe `KratosLab.fxdb()` accessor; a node harness proves the no-3rd-arg in-WAD build synchronously populates `db.meta.colorSource`, `db.fxc['FXC_BDEsparkemit']`, and `db.ptc['PTC_flame6']`. Every downstream fire/spark slice now reads a real `db`, not undefined.
- Resolved the two level-1 flame emitters from `db` by shapeRef NAME (`Particles.fireBindings(db)`): FXC_BDEsparkemit→PTC_flame6 (flame6Shape) + FXC_BDEsparkemit.0→PTC_flame3 (flame3Shape); rejected flame5Shape (god/other tier, Pitfall 7).
- Both flame systems spawn each attacking tick at `Particles.spawnAnchor(bladeSim[key].mat, sys.matrix)` — sampled ONCE, then decouple and advect on their own vel+gravity via `fxPool.integrate`, so a whipping blade outruns its fire (SC1 blade-lag / D-03).
- Fire renders as its own pool batch: real `db.meta.colorSource` ([2,2,2] overbright) rgb × per-particle INFERRED overbright alpha128 (1.9) → additive-premult recovers GS brightness of 3.8 per channel, above the 1.0 clamp (CLAUDE.md Part 1). Blend/depth only via `Fx.applyMaterial(additivePremult)`; a non-null fire sprite is bound (fxTexFromMat(MAT_pticleMat) → trailTex fallback).

## Task Commits

Each task was committed atomically:

1. **Task 1: Build + expose runtime FxDb at init (BLOCKER)** - `6a84bda` (feat)
2. **Task 2: Resolve fire bindings + world-space spawn-decouple (SC1)** - `728406f` (feat)
3. **Task 3: Real-color fire draw + resolvable sprite + ?v bump** - `247f27b` (feat)

## Files Created/Modified
- `tools/kratos-lab/app.js` - `db = FxParse.buildFxDb(...)` + `KratosLab.fxdb()` at init; fire-binding resolution (fireSystems/FIRE_KINDS/TRAIL_SPARK_KINDS) at load; blade-fire emission in simStep (spawnAnchor + INFERRED emission); `fireTex` resolution; `drawPool` `{kinds,tint,name}` batching; two-batch fire/spark pool draw in drawFx.
- `tools/kratos-lab/index.html` - lockstep `?v=25` → `?v=26` on all 9 script tags.

## Decisions Made
- **No 3rd arg to buildFxDb (D-09a):** the fire/spark family and `db.meta.colorSource` are all in-WAD (verified this session), so the render db is built WITHOUT the standalone `.bin` fetch path — BFT/BGT/CNG/FXCF are standalone-only and not needed by the fire slices.
- **Real color at draw, identity at spawn:** fire particles carry identity rgb (1,1,1) + INFERRED overbright alpha; the real MAT_pticleMat.blendColor is applied as a per-vertex tint in the fire draw batch (mirrors the chainglow identity-passthrough). Single source of truth, no fabricated crimson (Pitfall 4).
- **Sprite fallback:** MAT_pticleMat exposes no layer texName (probed empty), so `fxTexFromMat` is expected to throw; caught and fell back to the already-loaded `trailTex` (GFX_swordtrail) — an INFERRED sprite reuse. The decoded/real part of the fire is the COLOR, not the sprite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] index.html ?v bump target was stale in the plan**
- **Found during:** Task 3 (?v bump)
- **Issue:** The plan's Task-3 verify literal referenced `?v=23`, but waves 1-3 had already advanced the lockstep tags to `?v=25`. Bumping to 24 (the plan's implied next) would have DOWNGRADED and de-synced from the actually-loaded modules.
- **Fix:** Bumped all 9 tags `?v=25` → `?v=26` (the correct next integer over the real current version); verified `! grep -q '?v=25'` (no old version remains) in addition to the plan's `! grep -q '?v=23'`.
- **Files modified:** tools/kratos-lab/index.html
- **Verification:** `! grep -q '?v=25' index.html && ! grep -q '?v=23' index.html && grep -q 'particles.js?v=26' index.html` all pass.
- **Committed in:** `247f27b` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — version-lockstep correction)
**Impact on plan:** Followed the plan's INTENT (lockstep bump to next integer, no old version remains); the literal `?v=23` was stale metadata from plan-authoring time. No scope creep.

## Issues Encountered
- **FXC placement magnitude (observation, not a defect):** the decoded blade-local FXC emitter translations are large in z (FXC_BDEsparkemit ≈ (0, 0.23, -9.17), FXC_BDEsparkemit.0 ≈ (0, 0.12, -8.38)). These are REAL byte-decoded placements transformed to world via `spawnAnchor` per the pinned contract — used as-is (second-guessing decoded placement would be fabrication). Whether the on-screen spawn point reads correctly against footage is Phase-7 tuning territory, and the blade motion it rides is a Phase-4-owned approximation (threat model: fire rides it as-is). No change made here.

## Known Stubs
None that block the plan goal. Fire emission rates/velocities/sizes/lifetimes are INFERRED and labeled (no decoded fire emission-param record exists — Pitfall 1 / A1), with an Open-Q1 upgrade-path TODO in simStep to promote them to REAL if an FXC/PTC param-semantics top-up decodes those fields. The fire COLOR and the emitter→particle bindings and placement matrices are REAL/decoded.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The runtime FxDb (`db` + `KratosLab.fxdb()`) is now constructed in the browser — sparks (06-06), glow (06-07), and blade-light (06-08) can read `db` directly instead of undefined.
- `drawPool` now batches by particle family (`{kinds, tint, name}`) — the sparks slice can add its own kind/sprite batch the same way.
- Manual visual verification (fire lags a fast swing; magenta-bg additive add; `fxState()` clean between frames) is deferred to the Phase-7 comparison harness per plan.

## Self-Check: PASSED

- FOUND: `.planning/phases/06-particle-runtime-fire-sparks-trails/06-05-SUMMARY.md`
- FOUND: `tools/kratos-lab/app.js`, `tools/kratos-lab/index.html`
- FOUND commits: `6a84bda` (Task 1), `728406f` (Task 2), `247f27b` (Task 3)
- All 8 test suites green (wad, chain, loop, fx, fxdb, light, particles, anm); node db-data-path harness exits 0.

---
*Phase: 06-particle-runtime-fire-sparks-trails*
*Completed: 2026-07-26*
