---
phase: 06-particle-runtime-fire-sparks-trails
plan: 06
subsystem: rendering
tags: [webgl1, particles, impact-sparks, stretched-billboard, additive-premult, edge-trigger, data-first]

# Dependency graph
requires:
  - phase: 06-04
    provides: shared billboard particle pool (fxPool/drawPool) + additivePremult MAT mode
  - phase: 06-05
    provides: runtime FxDb (db) + db.meta.colorSource + FXC_BDEsparkemit family + fire-batch draw pattern
  - phase: 06-01
    provides: pure Particles sim (makePool/burst/spawnAnchor/stretchAxis + burst-count & stretchAxis known-answers)
provides:
  - Hit-edge impact-spark burst in simStep (prevHits edge-detect on machine.st.hits → fxPool.burst off the blade)
  - Velocity-aligned STRETCHED-billboard render path in the shared pool (aVel attribute + uStretch VS branch)
  - Impact sparks colored by the real MAT_pticleMat.blendColor (db.meta.colorSource), additive-premult, depth off
affects: [06-07, 06-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Edge-triggered combat event → particle burst: prevHits edge-detect once per SIM TICK (not per frame), advanced after both blades burst"
    - "Per-batch VS mode via uStretch uniform: uStretch>0 builds the quad long axis from per-particle aVel (velocity-aligned streak); uStretch=0 keeps the plain camRight/camUp billboard"
    - "Impact sparks reuse the SAME already-real FXC_BDEsparkemit family as blade fire (A6) — differing only by trigger (edge-on-hit) and the stretched look; consume db, never rebuild"

key-files:
  created:
    - .planning/phases/06-particle-runtime-fire-sparks-trails/06-06-SUMMARY.md
  modified:
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "Impact-spark emitter = the existing FXC_BDEsparkemit db.fxc key (A6/D-09a) — no new emitter decode; the same spawnAnchor(bladeSim[key].mat, sparkFxc.matrix) placement as fire"
  - "Burst is edge-triggered on machine.st.hits (Pitfall 5), fired per blade side once per hit; prevHits advances AFTER the per-blade loop so both blades see one edge"
  - "Velocity stretch done in the pool VS (uStretch branch reading aVel), NOT per-particle CPU — one pool program, one draw batch; non-spark families pass uStretch=0"
  - "Spark rgb identity (1,1,1) at spawn; REAL db.meta.colorSource applied as a per-vertex tint at the spark DRAW (mirrors the fire batch, Pitfall 4 — no fabricated spark color)"
  - "index.html ?v bumped 26 -> 27 (lockstep next integer over the real current version; the plan's ?v=23 verify literal was stale from plan-authoring)"

patterns-established:
  - "Combat-state edge-trigger → discrete particle burst (prevHits) — reusable for any hit/impact FX"
  - "uStretch per-batch billboard-mode switch: velocity-aligned streak vs camera-facing quad in one pool program"

requirements-completed: [FIRE-02]

# Metrics
duration: 16min
completed: 2026-07-26
---

# Phase 6 Plan 06: Impact Sparks on Hit Events (Velocity-Aligned Stretched Billboards) Summary

**Impact sparks now burst off the blade on each landed hit — the combat state machine's `st.hits` counter is edge-detected once per sim tick and fires a shower of velocity-aligned STRETCHED sparks from the same already-real FXC_BDEsparkemit family as blade fire, colored by the real MAT_pticleMat.blendColor, additive-premult on the shared pool.**

## Performance

- **Duration:** ~16 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- **Hit-edge trigger (FIRE-02):** `simStep` keeps a module-scoped `prevHits` and, each tick, detects `machine.st.hits !== prevHits` — a new landed (non-idle) move just started (combat.js `start()` increments `st.hits`), i.e. a hit. On the edge it bursts sparks off each blade and advances `prevHits` after the per-blade loop, so one hit = exactly one burst per blade (Pitfall 5: discrete event on the sim tick, never a per-frame rate).
- **Same-family emitter (A6 / D-09a):** the burst reuses the already-real `db.fxc['FXC_BDEsparkemit']` placement matrix — no new emitter decode. The world spawn anchor is `Particles.spawnAnchor(bladeSim[key].mat, sparkFxc.matrix)`, sampled ONCE, then the sparks decouple and advect on their own velocity via `fxPool.integrate` (SC1 blade-lag / D-03 / Pitfall 4). Every emission constant (count 14, life ~0.33s, size, alpha, base rise, fan spread) is INFERRED (A1) and labeled; velocity is fanned by a runtime `Math.random` sampler (D-07 — RNG stays out of the pure tested paths).
- **Velocity-aligned stretched render (CLAUDE.md Part 3):** the pool vertex shader gained a per-particle `aVel` attribute and a `uStretch` uniform. For the spark batch (`uStretch > 0`) the quad's long axis rides `normalize(aVel)` (with a `uCamUp` fallback when |vel|~0 — the GLSL mirror of the pure `Particles.stretchAxis` contract) and the short axis is the perpendicular; every fanned spark reads as its own streak. Non-spark batches (fire/trail-spark) pass `uStretch=0` and keep the plain camRight/camUp billboard.
- **Real color, decoded-blend-only:** sparks carry identity rgb at spawn; the REAL `db.meta.colorSource` (MAT_pticleMat.blendColor) is applied as the per-vertex tint at the impact-spark draw (no fabricated spark RGB, Pitfall 4). Blend/depth come ONLY through `Fx.applyMaterial(additivePremult, depth off)` in `drawPool` — no hardcoded `gl.blendFunc`/`depthMask`; the pass logs to `fxLog` and sits before `restoreFxState` (Pitfall 3 leak guard).

## Task Commits

Each task was committed atomically:

1. **Task 1: Hit-edge spark burst in simStep (FIRE-02 trigger)** - `ea7bfc2` (feat)
2. **Task 2: Velocity-aligned stretched-spark render + real color + ?v bump** - `58c44f8` (feat)

## Files Created/Modified
- `tools/kratos-lab/app.js` - `SPARK_KINDS`/`sparkFxc` binding at load; `prevHits` edge state; hit-edge burst (`fxPool.burst` from the FXC_BDEsparkemit anchor) in `simStep`; `prevHits` advance after the per-blade loop; pool VS `aVel` attribute + `uStretch` velocity-stretch branch; `SPARK_STRETCH` const; `drawPool` `stretch` opt + `aVel` pack/pointer/enable + non-finite vel guard; impact-spark draw pass in `drawFx`.
- `tools/kratos-lab/index.html` - lockstep `?v=26` → `?v=27` on all 9 script tags.

## Decisions Made
- **Reuse FXC_BDEsparkemit (A6):** FIRE-01 (blade fire) and FIRE-02 (impact sparks) are one emitter family distinguished only by trigger — the plan and RESEARCH resolved D-09a to "no top-up". The spark burst consumes the runtime `db` built in 06-05; it does not rebuild it.
- **Burst per blade side:** a landed hit fires the burst off both blades (contact side is unknown; INFERRED). Edge state advances once (after the loop) so the second blade does not re-trigger.
- **Stretch in the VS, not the CPU:** a single `uStretch` uniform switches billboard mode per batch, so the one pool program serves both camera-facing (fire/trail) and velocity-aligned (spark) families with no per-particle CPU matrices (CLAUDE.md — no instancing, no gl.POINTS).
- **Real color at draw, identity at spawn:** matches the 06-05 fire batch exactly (single source of truth, Pitfall 4).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] index.html ?v bump target was stale in the plan**
- **Found during:** Task 2 (?v bump)
- **Issue:** Task 2's verify literal referenced `?v=23`, but waves 1-4 had already advanced the lockstep tags to `?v=26`. Bumping toward the plan's implied `?v=24` would have DOWNGRADED and de-synced from the actually-loaded modules (same stale-metadata situation the 06-05 summary documented).
- **Fix:** Bumped all 9 tags `?v=26` → `?v=27` (the correct next integer over the real current version); verified `! grep -q '?v=26'` and `! grep -q '?v=23'` both hold and all 9 tags are at `?v=27`.
- **Files modified:** tools/kratos-lab/index.html
- **Committed in:** `58c44f8` (Task 2 commit)

**Total deviations:** 1 auto-fixed (1 blocking — version-lockstep correction). Followed the plan's INTENT (lockstep bump to next integer, no old version remains). No scope creep.

## Issues Encountered
- **burst() applies one jitter magnitude to both pos and vel:** the pure `Particles.burst(n, template, sampler)` contract (mandated by the plan) adds `sampler()` to every pos AND vel component from the same distribution, so the spawn-cluster radius and velocity-fan half-range are coupled (`SPARK_BURST_SPREAD`). A single moderate spread (5.0) was chosen — sparks erupting from a small region on the blade is authentic for impact, and the VS `SPARK_STRETCH` factor supplies the visual "fast spark" length independent of travel distance. All of these are INFERRED (A1) and are Phase-7 footage-tuning territory; correctness is unaffected (the deterministic burst-count contract is jitter-independent).

## Known Stubs
None that block the plan goal. Impact-spark count/velocity/size/life/alpha/spread and the `SPARK_STRETCH` factor are INFERRED and labeled (no decoded spark emission-param record exists — Pitfall 1 / A1), Phase-7 footage-tunable. The emitter family (FXC_BDEsparkemit), its placement matrix, the spawn-anchor transform, and the spark COLOR (MAT_pticleMat.blendColor) are REAL/decoded.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The shared pool now serves three families (fire, trail-spark, impact-spark) with a per-batch `uStretch` mode; glow (06-07) and blade-light (06-08) can add their own batches the same way.
- The `prevHits` combat-edge-trigger pattern is available for any future hit/impact FX.
- Manual visual verification (sparks burst on each landed hit, stretched along motion, magenta-bg additive add, `fxState()` clean) is deferred to the Phase-7 comparison harness per plan.

## Self-Check: PASSED

- FOUND: `.planning/phases/06-particle-runtime-fire-sparks-trails/06-06-SUMMARY.md`
- FOUND: `tools/kratos-lab/app.js`, `tools/kratos-lab/index.html`
- FOUND commits: `ea7bfc2` (Task 1), `58c44f8` (Task 2)
- All 8 test suites green (anm, chain, fx, fxdb, light, loop, particles, wad); `node --check app.js` OK; all 9 index.html tags at `?v=27` (no `?v=26`/`?v=23`).

---
*Phase: 06-particle-runtime-fire-sparks-trails*
*Completed: 2026-07-26*
