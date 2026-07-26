---
phase: 06-particle-runtime-fire-sparks-trails
plan: 08
subsystem: ui
tags: [webgl1, glsl, point-light, lambert, attenuation, parseLight, blade-fire]

# Dependency graph
requires:
  - phase: 06-02
    provides: FxParse.parseLight (byte-exact LeftBladeLight/RightBladeLight decode) + tested attenuation math in light.test.js
  - phase: 06-07
    provides: the completed mesh/FX render stack in app.js (drawFx, bladeSim, chain glow) this plan lights
provides:
  - Two per-blade warm point lights in the mesh shader from the REAL decoded LeftBladeLight/RightBladeLight values (parseLight)
  - Mesh vertex shader `vWorld` world-space varying + fragment Lambert + linear range-attenuation term (no shadows)
  - Per-frame light world-position update (anchor × live blade matrix × modelMat) so each light rides its blade
affects: [phase-07-side-by-side-validation, inferred-tuning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Point light in the mesh shader: extend the existing directional Lambert term with a per-fragment world-space light vector + linear range attenuation (atten = max(0, 1 - d/range)); no shadow maps (D-06)"
    - "Decoded-value uniforms: color/range set once at init, position/intensity refreshed per frame with a missing-blade NaN guard"

key-files:
  created:
    - .planning/phases/06-particle-runtime-fire-sparks-trails/06-08-SUMMARY.md
  modified:
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "Blade-light values sourced from FxParse.parseLight (REAL byte-exact), never hardcoded roadmap constants (D-06/D-09b)"
  - "Light computed in world space (matching vWorld = uModel*aPos); decoded range converted mesh->world by ×s0 so d/range is dimensionally consistent"
  - "Lambert dots the existing camera-relative normal (vNrm) per the established directional-light term; the dominant blade-rides-geometry read comes from the world-space distance attenuation"

patterns-established:
  - "Pattern 6 (point light): vWorld varying + bladeLight() helper (Lambert + linear atten), summed for L/R, added on top of the lit color (naive gamma-space add, REND-01)"
  - "Missing-blade guard: zero a light's intensity uniform when bladeSim[key].pos is null so no NaN reaches the GPU (T-06-08-01)"

requirements-completed: [REND-02]

# Metrics
duration: 14min
completed: 2026-07-26
---

# Phase 6 Plan 8: Per-Blade Warm Point Lights Summary

**Two per-blade warm point lights (Lambert + linear range attenuation, no shadows) driven by the REAL decoded LeftBladeLight/RightBladeLight values via FxParse.parseLight, each riding its blade in world space — the final slice of Phase 6.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-07-26
- **Completed:** 2026-07-26
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Decoded LeftBladeLight/RightBladeLight at init via `FxParse.parseLight` (REAL values: color 1.0/0.622/0.288, intensity 2.5, range 160, anchor -0.32/-8.0/1.0) — not hardcoded constants
- Extended the mesh shader with a `vWorld` world-space varying and a fragment `bladeLight()` term (Lambert diffuse + linear range attenuation, `atten = max(0, 1 - d/range)`) summed for both blades, added on top of the lit color — no shadow maps
- Wired each light's world position per rendered frame from `anchor × live blade matrix × modelMat` so the light follows its swinging blade, with a missing-blade guard that zeroes intensity (no NaN reaches the uniform)
- Bumped all 9 `index.html` script `?v` tags 28→29 in lockstep (the phase's final browser change)

## Task Commits

Each task was committed atomically:

1. **Task 1: Load decoded blade lights + add the point-light term to the mesh shader** - `9caff78` (feat)
2. **Task 2: Per-frame light-position update wiring + ?v bump** - `0842c49` (feat)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified
- `tools/kratos-lab/app.js` - parseLight decode of Left/RightBladeLight at init; mesh vertex shader `vWorld` varying; fragment `bladeLight()` Lambert + linear-atten term for two lights; light uniform locations + constant color/range set once (range ×s0 → world units); per-frame light position/intensity update in renderFrame with a missing-blade NaN guard
- `tools/kratos-lab/index.html` - all 9 script `?v` tags bumped 28→29 in lockstep

## Decisions Made
- **Real decode over constants:** light values come from `FxParse.parseLight` (byte-exact, 06-02), preserving provenance in the decoder — the roadmap constants (2.5/160/0.622) are never assigned directly (D-06/D-09b, T-06-08-02).
- **World-space lighting + range scaling:** `vWorld = uModel*aPos` is world space for both hero (uModel=modelMat) and blade (uModel=modelMat·bladeSim.mat) draws, so the light is transformed all the way to world space (`xformM(modelMat, xformM(bladeSim[key].mat, anchor))`) and the decoded range is scaled by `s0` (mesh→world) so the linear falloff mirrors light.test.js's `atten` in consistent units.
- **Normal handling matches the existing term:** the Lambert dot uses the shader's existing camera-relative `vNrm` (the directional term's normal); the blade-rides-geometry read is carried by the world-space distance attenuation, which is spatially exact.

## Deviations from Plan

None - plan executed exactly as written.

The plan's stale "no `?v=23` remains" acceptance note reflected a pre-bump version; the live tags were at `?v=28` (bumped by prior waves), so the lockstep bump targeted 28→29. This is the intended lockstep-to-next-integer behavior, not a deviation.

## Issues Encountered
None. The attenuation math was already proven in `light.test.js` (06-02); the shader mirrors it exactly. A `Lp / max(d, 1e-4)` guard replaces a bare `normalize(Lp)` to keep the direction NaN-safe at zero distance (defense-in-depth alongside the JS missing-blade intensity guard).

## Known Stubs
None - all light values are REAL/decoded and wired; no placeholder or empty data paths introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 6 (particle runtime — fire, sparks, dual trails, state glow, blade lights) is now feature-complete; all five effect families render from decoded values.
- REND-02 satisfied. Manual visual confirmation (each blade visibly lights nearby geometry; light follows the blade; no shadows; REND-01 magenta-bg compositing intact) is deferred to the Phase 7 side-by-side validation harness.
- No new blockers. Existing carried concerns (Phase-4 chain-motion approximation; INFERRED FX tuning to re-judge vs footage) remain owned by later phases.

## Self-Check: PASSED

- Files verified present: `tools/kratos-lab/app.js`, `tools/kratos-lab/index.html`, `06-08-SUMMARY.md`
- Commits verified in git log: `9caff78` (Task 1), `0842c49` (Task 2)
- Full eight-suite regression (fxdb/wad/fx/loop/chain/anm/particles/light) exits 0

---
*Phase: 06-particle-runtime-fire-sparks-trails*
*Completed: 2026-07-26*
