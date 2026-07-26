---
phase: 06-particle-runtime-fire-sparks-trails
plan: 04
subsystem: rendering
tags: [webgl1, particles, billboard, additive-blend, alpha-over-1.0, trail-sparks, gs-blend]

# Dependency graph
requires:
  - phase: 06-01
    provides: Particles pure sim module (makePool/spawn/integrate/burst, variantFor, rampColor)
  - phase: 06-03
    provides: runtime trail age→color ramp + BFT/BGT variant tint in drawFx, particles.js browser <script> tag
provides:
  - additivePremult MATGL mode (ONE,ONE) — the alpha-over-1.0 brightness path in fx.js
  - shared world-space billboard particle pool in app.js (GL program + DYNAMIC_DRAW buffer + static indices + drawPool)
  - trail-spark riders spawned on the swing tip arc during attacks (the user's #1 richness lever)
  - fxPool integrated at fixed 60Hz on simStep (Loop.STEP)
  - KratosLab.fxPoolCount observability getter
affects: [06-05, 06-06, 06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared world-space billboard pool: 1 GL program (view-matrix-column billboard VS + premult fragment), 1 interleaved DYNAMIC_DRAW buffer rewritten per frame via bufferSubData, 1 static index buffer built once, 4 verts/particle"
    - "alpha-over-1.0 premultiply pass: shader outputs rgb·alpha128 (unclamped) blended ONE,ONE via the additivePremult MAT mode"
    - "Batch texture bound PER pool draw (not one global pool texture) so later families bind their own decoded sprite"

key-files:
  created:
    - .planning/phases/06-particle-runtime-fire-sparks-trails/06-04-SUMMARY.md
  modified:
    - tools/kratos-lab/fx.js
    - tools/kratos-lab/test/fx.test.js
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "additivePremult (ONE,ONE) added to the fx.js MATGL table, never inlined in app.js — every pool draw's blend/depth comes only through Fx.applyMaterial (DEC-01)"
  - "One shared billboard pool (D-02): CPU quad expansion + VS billboarding, no ANGLE_instanced_arrays, no gl.POINTS, no depth sort (additive commutes)"
  - "Pool integrates once per sim tick at exactly Loop.STEP (D-03/Pitfall 5), never a wall delta — beside the trailHist recording"
  - "Trail-spark sprite = the already-loaded in-WAD GFX_swordtrail texel (trailTex) — real texture bytes, INFERRED sprite assignment (D-04c has no dedicated decoded sprite record)"
  - "POOL_CAP=512 INFERRED few-hundred bound (V5); Particles.makePool enforces reject-when-full; runtime fade/size non-finite-guarded before bufferSubData"

patterns-established:
  - "View-matrix-column billboarding: uCamRight/uCamUp = normalize(view row0/row1); world = center + camRight·corner.x + camUp·corner.y — no per-particle CPU matrices"
  - "Pool centers ride mesh-local coords (same space as trail/chain verts); poolMVP = mvp·modelMat, camRight/camUp valid because modelMat is uniform-scale+translate"

requirements-completed: [TRL-01, TRL-02]

# Metrics
duration: 18min
completed: 2026-07-26
---

# Phase 6 Plan 04: Billboard Particle Pool + Trail-Spark Riders Summary

**A shared world-space billboard particle pool (view-matrix-column VS + alpha-over-1.0 premult fragment, one DYNAMIC_DRAW buffer rebuilt per frame) that spawns hot trail-spark riders along the blade swing arc — the user's #1 "thick, particle-dense trail" richness lever, live end-to-end.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-26T08:10Z
- **Completed:** 2026-07-26T08:28Z
- **Tasks:** 2 (Task 1 TDD → test+feat commits)
- **Files modified:** 4

## Accomplishments
- `additivePremult` (ONE,ONE + FUNC_ADD) added to the fx.js MATGL table — the alpha-over-1.0 brightness path the file header had anticipated (CLAUDE.md Part 1), proven by a mock-gl known-answer in fx.test.js
- Shared world-space billboard particle pool in app.js: one GL program (billboard VS from the view matrix's camRight/camUp columns + a premultiply fragment), one interleaved DYNAMIC_DRAW buffer rewritten per frame via `bufferSubData`, one static index buffer built once, 4 verts/particle, POOL_CAP 512 (D-02)
- `drawPool` binds its batch sprite per call and routes blend/depth ONLY through `Fx.applyMaterial(additivePremult)` — no hardcoded `blendFunc`/`depthMask`; an empty pool no-ops so `fxState()` stays clean
- Pool integrates once per sim tick at `Loop.STEP` (Pitfall 5) beside the `trailHist` recording; trail-spark riders spawn on the tip arc under the `!machine.isIdle()` attacking gate, tinted per BFT/BGT variant, decoupled after spawn (blade-lag)
- `index.html` bumped ?v=24 → ?v=25 across all 9 script tags in lockstep; `KratosLab.fxPoolCount` getter added for the 60Hz-vs-144Hz parity check

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): additivePremult known-answer** - `d3f21a5` (test)
2. **Task 1 (GREEN): additivePremult mode + billboard pool** - `db09820` (feat)
3. **Task 2: simStep integrate + trail-spark riders + ?v bump** - `d41bd4d` (feat)

**Plan metadata:** _(final docs commit)_

_Note: Task 1 is a TDD pair (test → feat)._

## Files Created/Modified
- `tools/kratos-lab/fx.js` - Added the `additivePremult` MATGL entry (enable BLEND, FUNC_ADD, blendFunc ONE,ONE); assert-on-unknown and restoreFxState unchanged
- `tools/kratos-lab/test/fx.test.js` - New mock-gl known-answer: additivePremult records enable→FUNC_ADD→blendFunc(ONE,ONE)→depthMask(false)
- `tools/kratos-lab/app.js` - Billboard pool GL program (VS + premult FS), DYNAMIC_DRAW vertex buffer + static index buffer, `Particles.makePool`, `drawPool` (empty-safe, per-batch texture), drawFx now takes the view matrix + calls drawPool before restoreFxState, simStep integrate + trail-spark spawn, `KratosLab.fxPoolCount`
- `tools/kratos-lab/index.html` - Lockstep ?v=24 → ?v=25 on all 9 script tags

## Decisions Made
- **Billboard center space:** pool centers live in mesh-local coords (same as trail/chain verts); `poolMVP = mvp·modelMat` and camRight/camUp are extracted from the view matrix. Because `modelMat` is a uniform scale + translate (no rotation), the world-space camera axes are also valid in mesh-local space, so the billboard is geometrically exact with world size = mesh.scale · particle size.
- **Per-particle fade at pack time:** color stores a peak alpha128 (INFERRED overbright 1.6); `drawPool` multiplies by `max(0, 1 - age/life)` so sparks fade over their lifetime without mutating the pooled particle. Non-finite pos/size/fade are skipped before `bufferSubData` (defense-in-depth over Particles' spawn guard).
- **Reachability of the pool pass:** the drawFx early-return now also checks `fxPool.count === 0`, so the pool draws even when chain/trail are both empty (idle → empty pool → clean no-op).

## Deviations from Plan

None - plan executed exactly as written. The particles.js `<script>` tag already existed (added as a Rule-3 deviation in 06-03, per that summary), so Task 2's tag-add reduced to the lockstep ?v bump, exactly as the plan's "bump ALL ?v= tags" instruction requires.

## Issues Encountered
- The plan asserts `grep -c 'additivePremult' fx.js === 1`. `grep -c` counts matching *lines*, so an explanatory comment containing the token would have made it 2 and failed the check. Reworded the fx.js comment to keep `additivePremult` on exactly the one key line. Verified: `grep -c 'additivePremult' fx.js` = 1.

## Known Stubs
None. Trail-sparks spawn from live `Particles` sim state on the real recorded tip arc and render through the real decoded `GFX_swordtrail` texel; the pool is empty (draws nothing) only at idle, which is correct behavior. Emission constants (count/velocity/size/life/alpha) are labeled INFERRED per the data-first rule — that is provenance labeling, not a stub, and is Phase-7 footage-tunable.

## Verification
- `node tools/kratos-lab/test/fx.test.js` — green (additivePremult ONE,ONE + FUNC_ADD + depthMask false; unknown mode still throws)
- `node tools/kratos-lab/test/particles.test.js` — green (spawn/integrate/burst contracts the wiring calls)
- Full suite (fxdb/wad/fx/loop/chain/anm/particles/light) — all 8 exit 0, no regression
- `node --check tools/kratos-lab/app.js` — syntax OK
- Acceptance greps: `additivePremult` in fx.js = 1; app.js has `uCamRight`/`uCamUp`, `vColor.rgb * vColor.a`, `Particles.makePool(` + `DYNAMIC_DRAW` + `drawElements`, `fxPool.integrate(STEP)`, `fxPool.spawn` under the attacking gate; no hardcoded `gl.blendFunc`/`gl.depthMask` in app.js; index.html all 9 tags at ?v=25, none at ?v=24
- Manual (deferred to the Phase-7 harness): magenta-bg additive add + `KratosLab.fxState()` clean between frames + 60Hz-vs-144Hz `fxPoolCount` parity — not automatable here (WebGL runtime).

## Next Phase Readiness
- The shared pool is the reusable substrate for 06-05 (blade fire flame3/flame6), 06-06 (impact sparks), and later slices — each binds its own batch sprite and spawns through the same `Particles` pool + `drawPool`. Do NOT build the FxDb `db` binding here; that is 06-05.
- The trail-spark emission constants and the additivePremult brightness are the two levers to calibrate against footage in Phase 7 (both labeled INFERRED).

## Self-Check: PASSED
- Files: fx.js, test/fx.test.js, app.js, index.html — all FOUND
- Commits: d3f21a5, db09820, d41bd4d — all FOUND

---
*Phase: 06-particle-runtime-fire-sparks-trails*
*Completed: 2026-07-26*
