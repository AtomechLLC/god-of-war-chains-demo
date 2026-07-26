# Phase 6: Particle Runtime — Fire, Sparks & Trails - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-26
**Phase:** 6-particle-runtime-fire-sparks-trails
**Areas discussed:** Effect priority/slice order, Particle architecture, World-space blade-lag, Trail approach, Chain-glow state gating, Blade lights, Decode top-ups
**Mode:** auto-selected (operator away — "do what you can with 4 hours"; invoked `/gsd-discuss-phase 6`). No AskUserQuestion turns; Claude picked the recommended, data-grounded option for each area per the Phase-5 precedent ("no preference" → decide on the user's behalf).

---

## Effect priority / MVP slice order

| Option | Description | Selected |
|--------|-------------|----------|
| Trails + trail-sparks first | Front-load the user's #1 complaint (thin trails, no particles) | ✓ |
| Fire first | Lead with flame3/flame6 prominence | |
| Roadmap SC order (fire→sparks→trails→glow→lights) | Follow SC numbering | |

**Choice:** Trails + trail-sparks first, then fire, sparks, chain-glow, blade lights.
**Notes:** Carries Phase-5 D-01 payoff-first framing; footage analysis names the trail spark specks "the largest less-basic lever." Each slice is a vertical MVP judged against footage.

---

## Particle system architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Single shared billboard pool (CPU quad-expand + VS billboard) | One DYNAMIC_DRAW buffer, bufferSubData/frame, blend-batched | ✓ |
| Per-effect separate pools | Isolated buffers per family | |
| ANGLE_instanced_arrays | Instanced quads | |

**Choice:** Single shared world-space billboard pool, no instancing.
**Notes:** Straight from CLAUDE.md Part 3; budget is hundreds of particles (GoW1-era). Additive commutes → no depth sort. Velocity-aligned stretch for sparks.

---

## World-space simulation & blade-lag

| Option | Description | Selected |
|--------|-------------|----------|
| World-space spawn + own-velocity advection | Fire decouples from blade after spawn → lags a whipping blade | ✓ |
| Blade-locked particles | Cheaper, but fire sticks to the blade (known failure mode) | |

**Choice:** World-space spawn from the FXC emitter matrix, fixed 60Hz Euler integration, no spline smoothing.
**Notes:** SC1 explicitly requires fire to lag the blade. Rates/lifetimes = NTSC 60Hz tick units (Phase-5 D-05).

---

## Trail approach

| Option | Description | Selected |
|--------|-------------|----------|
| Extend the existing ribbon + add trail-spark particles | Fix color ramp/tip-bias, keep the textured strip, add sparks | ✓ |
| Full particle-strip trail (replace ribbon) | Rebuild trail entirely from particles | |

**Choice:** Extend the `app.js` swordtrail ribbon (runtime crimson→white-hot ramp = INFERRED per 05-04 no-painted-ramp finding; inner edge biased to tip arc ~0.6) and add trail-spark particles; dual BFT/BGT variant per move.
**Notes:** The ribbon IS the game's trail mechanism; folds the `trail-fidelity-from-footage` todo.

---

## Chain-glow state gating

| Option | Description | Selected |
|--------|-------------|----------|
| Combat-state-gated CNG glow (INFERRED rule) + alpha-over-1.0 fix | Dark at rest → hot on attack/throw windows | ✓ |
| Static glow | Always-on, no state | |

**Choice:** Gate CNG glow intensity on combat state (attack/throw active windows); state rule INFERRED/footage-calibrated unless the CNG decode exposed a real gate. Apply the alpha-over-1.0 brightness recovery (03-02 carry-forward).
**Notes:** Current chainglow reads too subtle — the premultiply-raw-alpha128 fix is data-grounded, not hand-tuning.

---

## Blade lights & decode top-ups

| Option | Description | Selected |
|--------|-------------|----------|
| Vertex-lit point-light term in mesh shader, no shadows | Decoded color/intensity/range | ✓ |
| Additive light-sprite pass | Fake the light as a sprite | |

**Choice:** Vertex-lit per-blade point light (color 1.0/0.622/0.288, intensity 2.5, range 160), no shadows. Plus two scope-honesty top-ups (D-09): confirm/ingest `FXC_BDEsparkemit` (in-WAD only) as a real FxDb key for sparks; source the blade-light values from a decoded LIGHT record if present, else adopt the roadmap-documented values with honest provenance.
**Notes:** Neither the spark emitter key nor the blade-light values are currently present in the codebase — flagged for the planner.

---

## Claude's Discretion

All areas — operator was away and had not expressed preferences for Phase 6. Decisions grounded in CLAUDE.md Part 1/Part 3, the Phase-5 FxDb contract + 05-04/05-05 findings, the 03-02 carry-forward levers, and the user's stated fidelity bar. Operator to confirm/adjust before planning (highest-value review: trail approach, glow-state INFERRED rule, slice order).

## Deferred Ideas

- Phase 4 chain motion (still deferred by the fast-track pivot).
- Phase 7 side-by-side validation + inferred tuning (judges this phase's output).
- Advanced fire simulation (turbulence/inter-particle forces) — beyond GoW1-era budget.
- `hitbox-visualization` todo — reviewed, not folded (debug strike-volume viz, separate capability).
