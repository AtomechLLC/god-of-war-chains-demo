---
phase: 06-particle-runtime-fire-sparks-trails
plan: 01
subsystem: testing
tags: [particles, webgl-sim, billboard-pool, euler, blade-lag, pure-module, tdd, node-assert]

# Dependency graph
requires:
  - phase: 05-fx-record-decode
    provides: FxDb (db.fxc/db.ptc shapeRef graph, MAT_pticleMat.blendColor) that fireBindings + spawnAnchor consume
provides:
  - "tools/kratos-lab/particles.js — pure world-space billboard particle sim (no gl/DOM, JSON-dumpable, dual-env)"
  - "makePool: spawn/integrate/burst with reject-when-full cap + non-finite guards; fixed-step semi-implicit Euler + age>life cull"
  - "spawnAnchor: REAL decoded FXC translation (idx 12..14) x live blade matrix = SC1 blade-lag world anchor"
  - "stretchAxis (velocity-aligned + camUp fallback); fireBindings (db.fxc->db.ptc by shapeRef NAME, D-08)"
  - "INFERRED gating helpers: variantFor (BFT/BGT), glowGain (rest/hot), rampColor (white-hot->orange->ember)"
  - "tools/kratos-lab/test/particles.test.js — pure-sim known-answer suite (12 scenario blocks)"
affects: [06-02, 06-03, 06-04, 06-05, app.js drawFx particle pool, app.js simStep spawn/integrate, trail ramp/variant/spark wiring]

# Tech tracking
tech-stack:
  added: []  # zero deps — node:assert + built-ins only (CLAUDE.md ban)
  patterns:
    - "Pure IIFE sim module + dual-env export guard (chain.js/loop.js scaffold)"
    - "Determinism boundary (D-07): RNG injected by caller via sampler; tests feed sampler=()=>0"
    - "Fixed-step integrate at exactly Loop.STEP (never a wall delta) — Pitfall 5"
    - "real/INFERRED labeling on every runtime-computed quantity (data-first)"

key-files:
  created:
    - tools/kratos-lab/particles.js
    - tools/kratos-lab/test/particles.test.js
  modified: []

key-decisions:
  - "particles.js is a PURE Node-testable sim module (no gl/DOM); GL submission stays in app.js (D-02)"
  - "spawnAnchor reads the REAL decoded FXC translation (idx 12..14) x live blade matrix; particle decouples after spawn (SC1 blade-lag, D-03)"
  - "gravity/jitter/variantFor/glowGain/rampColor labeled INFERRED; spawn-anchor transform is REAL (rampColor never a fabricated real color — 05-04)"
  - "Security V5: reject-when-full pool cap + non-finite pos/vel/size/life/color guards before any value reaches a GL uniform"

patterns-established:
  - "Pattern: shared world-space pool primitives (spawn/integrate/cull) as a pure module every render wave imports"
  - "Pattern: blade-local->world spawn-then-decouple proven by a >=49u divergence known-answer (anti-Pitfall-4)"

requirements-completed: []  # Wave-0 sim halves delivered; FIRE-01/02, TRL-01/02, CHAIN-03 complete only once rendered (later waves) — see Requirements note

# Metrics
duration: 5min
completed: 2026-07-26
---

# Phase 6 Plan 01: Pure Particle-Pool Sim Module Summary

**Node-testable world-space billboard particle sim (particles.js): spawn/integrate/burst pool with reject-when-full cap + non-finite guards, the REAL FXC-translation x blade-matrix spawn anchor that proves SC1 blade-lag decouple, and the INFERRED variant/glow/age-ramp helpers — 12 known-answer blocks GREEN, zero gl/DOM.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-26T07:48:46Z
- **Completed:** 2026-07-26T07:57:00Z
- **Tasks:** 2 (RED test, GREEN impl)
- **Files modified:** 2 (both created)

## Accomplishments
- `particles.js` — a pure IIFE sim module (dual-env export, no gl/DOM, JSON-dumpable) that every later render wave (trails/fire/sparks/glow) will import; GL submission stays in app.js per D-02.
- SC1 blade-lag locked by a known-answer: `spawnAnchor` transforms the REAL decoded FXC placement translation (indices 12..14) by the live blade world matrix once at spawn; a zero-velocity particle then advects in world space and diverges ≥49u from a blade whipped to T=(50,0,0) — it decouples (anti-Pitfall-4).
- Fixed-step semi-implicit Euler (`pos+=vel·dt; vel+=g·dt; age+=dt`) at exactly `Loop.STEP`, with a strict `age>life` cull each integrate.
- Security V5 DoS mitigations: hard `maxParticles` cap (reject-when-full) + `Number.isFinite` guards on every pos/vel/size/life/color component before a particle can enter the pool (T-06-01-01/02).
- INFERRED gating helpers all labeled: `variantFor` (BFT crimson vs BGT swoosh), `glowGain` (dark↔hot), `rampColor` (white-hot→orange→ember, monotone luminance), plus `stretchAxis` (velocity-aligned + camUp fallback) and `fireBindings` (db.fxc→db.ptc by shapeRef NAME, D-08/Pitfall 6).

## Task Commits

1. **Task 1: RED — pure-sim known-answers** - `9c83fea` (test)
2. **Task 1 deviation fix: gravity-tolerant blade-lag assertion** - `731575c` (fix, Rule 1)
3. **Task 2: GREEN — implement particles.js** - `0e7ba3e` (feat)

**Plan metadata:** committed with this SUMMARY + STATE.md + ROADMAP.md.

_TDD pair: `test(9c83fea)` RED → `feat(0e7ba3e)` GREEN (with an interposed Rule-1 test fix)._

## Files Created/Modified
- `tools/kratos-lab/particles.js` - Pure particle-pool sim: makePool (spawn/integrate/burst), spawnAnchor, stretchAxis, variantFor, glowGain, rampColor, fireBindings; INFERRED gravity/ramp/variant/glow; REAL spawn-anchor transform.
- `tools/kratos-lab/test/particles.test.js` - node:assert known-answer suite: API shape, spawn-anchor (identity + 90° rotated), euler advect + gravity, age>life cull, blade-lag divergence (≥49), deterministic burst, ramp monotonicity, variant-select, glow-gate, pool cap, NaN/Infinity skip, stretchAxis, fireBindings.

## Decisions Made
- **Reject-when-full (not drop-oldest) cap:** emission rate is INFERRED, so silently dropping the newest spawn is the least-surprising bound and keeps existing particle arcs intact (commented in code).
- **Semi-implicit Euler order (pos before gravity):** pos advances with the pre-gravity velocity, so a fresh particle's first-step vertical displacement is exactly 0 and the g·dt² term appears from the second step — a clean, testable known-answer.
- **INFERRED gravity constant G=[0,-9.8,0]:** sign is what the sim needs (embers settle after emission); magnitude is footage-tunable in Phase 7. No decoded gravity field exists.
- **Did NOT mark requirements complete:** this is the Wave-0 sim foundation with no GL — see Requirements note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gravity-tolerant blade-lag test assertion**
- **Found during:** Task 2 (GREEN) — the Task-1 RED test asserted the zero-velocity blade-lag particle stays *exactly* at origin (`len3(pos) < 1e-6`).
- **Issue:** With the INFERRED gravity constant, a free particle falls ~0.1225u over 10 ticks, so the exact-origin assertion was too strict (the impl is correct — gravity must act).
- **Fix:** Loosened the corroborating check to `dist(pos, spawn0) < 1.0` (still ≪ the 50u blade move); the divergence ≥49 from the moved blade remains the primary decouple known-answer.
- **Files modified:** tools/kratos-lab/test/particles.test.js
- **Verification:** `node tools/kratos-lab/test/particles.test.js` exits 0 (all 12 blocks green).
- **Committed in:** `731575c`

---

**Total deviations:** 1 auto-fixed (1 bug — a too-strict assertion in the executor-authored RED test).
**Impact on plan:** Corrected a test over-constraint that ignored the module's own INFERRED gravity; no scope creep, no impact on the module contract.

## Known Stubs
None. `particles.js` is fully implemented — every exported function has real behavior and passing known-answers. The INFERRED constants (gravity, ramp stops, variant table, glow rest/hot, life/size defaults) are labeled placeholders-for-tuning, not stubs: they return correct-shaped values today and are flagged for Phase-7 footage calibration.

## Requirements Note
This plan is **Wave-0 foundation** (per the plan's own `<phase_goal>`: "No GL yet — this is the RED→GREEN scaffold that later waves build on"). It delivers the *sim halves* of FIRE-01, FIRE-02, TRL-01, TRL-02, CHAIN-03 (the automatable spawn/advect/cull/anchor/variant/glow/ramp math), but none of those requirements' acceptance text (on-screen rendering from decoded values) is satisfied until the render waves (06-02..06-05) wire this module into `drawFx`/`simStep`. Marking them complete now would be inaccurate, so `requirements-completed` is empty and `requirements.mark-complete` was intentionally NOT run.

## Issues Encountered
- `gsd-sdk query state.record-metric` / `state.add-decision` reject positional args on this SDK build; they require named flags (`--phase/--plan/--duration`, `--summary`). Re-ran with flags — both recorded successfully.

## Threat Flags
None. `particles.js` introduces no new network/auth/file/schema surface — it is a pure in-memory sim consuming already-decoded values. The two threat-register DoS items (non-finite params, unbounded growth) are mitigated in-plan (guards + cap) and covered by tests (j) and (i).

## Self-Check: PASSED
- FOUND: tools/kratos-lab/particles.js
- FOUND: tools/kratos-lab/test/particles.test.js
- FOUND commit: 9c83fea (test RED)
- FOUND commit: 731575c (fix Rule 1)
- FOUND commit: 0e7ba3e (feat GREEN)
- `node tools/kratos-lab/test/particles.test.js` exits 0; `chain.test.js` + `loop.test.js` regression green; purity grep (gl./document/window) = 0.

## Next Phase Readiness
- The pure sim contract is locked and Node-tested — waves 06-02..06-05 can import `Particles` and wire it into `drawFx` (GL pool draw, VS billboard, additive-premult) and `simStep` (spawn at `bladeSim[key].mat` × FXC anchor, integrate at `Loop.STEP`) without re-deriving the math.
- Open for later waves: `index.html` needs a `particles.js?v=` script tag added in lockstep when it becomes browser-consumed (this plan is Node-only, so no tag bump yet).
- INFERRED constants (gravity, ramp, variant table, glow rest/hot, life/size) are the Phase-7 footage-tuning surface — do not treat them as final.

---
*Phase: 06-particle-runtime-fire-sparks-trails*
*Completed: 2026-07-26*
