// loop.js — pure fixed-timestep accumulator for kratos-lab (REND-03).
//
// The classic "Fix Your Timestep" pattern: wall-clock deltas are fed in from
// outside, accumulated, and paid out as exact fixed-size sim steps; the
// fractional remainder carries to the next call. The simulation therefore
// advances at exactly 60 steps per wall-clock second on ANY display refresh
// rate (60Hz, 144Hz, or an uneven rAF cadence) — GoW1 sims at 60Hz, and all
// Phase 4-6 rates/lifetimes are authored per-tick against that cadence.
//
// Stall clamp: each incoming delta is capped at maxFrame (0.25s default).
// Without the cap, a long stall (hidden tab, debugger pause) would queue
// thousands of catch-up steps whose own cost stalls the NEXT frame — the
// "spiral of death". With it, a 2s stall pays out at most
// floor(0.25 / (1/60)) = 15 steps and the rest of the stalled wall time is
// dropped (sim time slips; interactivity survives — the right trade here).
//
// Pure module: no DOM, no GL, no clock reads — wall time arrives as a
// parameter, so the whole 60Hz contract is Node-testable (test/loop.test.js).

const Loop = (() => {
  const STEP = 1 / 60;

  // Comparison epsilon (seconds). Repeated float subtraction leaves residues
  // like 0.09999999999999998 against a step of 0.1; a bare `acc >= step`
  // would then under-pay a whole step (e.g. maxFrame 0.3 / step 0.1 yields 2
  // instead of 3). 1e-9s sits ~7 orders of magnitude below STEP, so it can
  // absorb float residue but can never mint a step from missing time.
  const EPS = 1e-9;

  function makeAccumulator({ step = STEP, maxFrame = 0.25 } = {}) {
    let acc = 0;
    return {
      // advance(dtSeconds) -> integer count of fixed steps owed this frame.
      // Negative dt (clock weirdness) clamps to 0; stalls clamp to maxFrame.
      advance(dt) {
        acc += Math.min(Math.max(dt, 0), maxFrame);
        let n = 0;
        while (acc >= step - EPS) {
          acc -= step;
          n++;
        }
        return n;
      },
    };
  }

  return { STEP, makeAccumulator };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Loop;
