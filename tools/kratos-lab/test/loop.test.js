// loop.test.js — known-answer tests for the pure fixed-timestep accumulator
// (REND-03 timestep half). Run: node tools/kratos-lab/test/loop.test.js
//
// Feeds synthetic wall-clock deltas (60Hz, 144Hz, stall, 1ms dribble) and
// asserts exact step counts — 60Hz sim semantics provable without a browser.
// Node built-ins only; exit code is the pass/fail signal.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Loop = require("../loop.js");

// --- API shape -------------------------------------------------------------
assert.strictEqual(Loop.STEP, 1 / 60, "Loop.STEP must be 1/60");
assert.strictEqual(typeof Loop.makeAccumulator, "function", "Loop.makeAccumulator must be a function");

// --- 60Hz display: 600 frames of exactly 1/60 -> 600 ± 1 steps -------------
{
  const acc = Loop.makeAccumulator();
  let steps = 0;
  for (let i = 0; i < 600; i++) steps += acc.advance(1 / 60);
  assert.ok(Math.abs(steps - 600) <= 1, `60Hz: expected 600±1 steps, got ${steps}`);
}

// --- 144Hz display: 144 frames of 1/144 (1s of wall time) -> 60 ± 1 steps --
{
  const acc = Loop.makeAccumulator();
  let steps = 0;
  for (let i = 0; i < 144; i++) steps += acc.advance(1 / 144);
  assert.ok(Math.abs(steps - 60) <= 1, `144Hz: expected 60±1 steps over 1s, got ${steps}`);
}

// --- 2s stall: clamped to maxFrame 0.25 -> exactly 15 catch-up steps -------
// floor(0.25 / (1/60)) = 15 — the spiral-of-death cap (T-2-08).
{
  const acc = Loop.makeAccumulator();
  assert.strictEqual(acc.advance(2.0), 15, "2s stall must clamp to exactly 15 steps");
}

// --- remainder carry: 1ms dribbles accumulate into a step ------------------
// 17 × 0.001s = 0.017s ≥ 1/60 (≈0.016667s); 16 × 0.001s = 0.016s is not.
{
  const acc = Loop.makeAccumulator();
  assert.strictEqual(acc.advance(0.001), 0, "a single 1ms delta must not step");
  let calls = 1, got = 0;
  while (got === 0 && calls < 1000) { got = acc.advance(0.001); calls++; }
  assert.strictEqual(got, 1, "dribbled 1ms deltas must eventually yield exactly 1 step");
  assert.strictEqual(calls, 17, `remainder carry: step must land on the 17th 1ms call, landed on ${calls}`);
}

// --- never negative; zero dt -> zero steps ---------------------------------
{
  const acc = Loop.makeAccumulator();
  assert.strictEqual(acc.advance(0), 0, "advance(0) must return 0");
  const n = acc.advance(-1);
  assert.ok(n >= 0, "advance must never return a negative count");
  assert.strictEqual(n, 0, "negative dt must clamp to 0 (no steps)");
  // ...and must not have poisoned the accumulator with negative time:
  assert.strictEqual(acc.advance(1 / 60), 1, "advance(1/60) after a negative dt still yields 1 step");
}

// --- custom step / maxFrame options are honored ----------------------------
{
  const acc = Loop.makeAccumulator({ step: 0.1, maxFrame: 0.3 });
  assert.strictEqual(acc.advance(1.0), 3, "step 0.1, maxFrame 0.3: advance(1.0) must be 3 (clamped to 0.3)");
}

// --- CR-01 regression guard: simStep must SNAPSHOT the pose, never alias it -
// rig.computePose fills and returns ONE internal buffer reused across calls
// (anim.js makeRig closure); `skin.lastWorld = world` aliased it, and the
// blend-window prev-pose call in uploadSkinnedVerts clobbered it (frozen pose
// + stale chain anchors for every blend window). app.js is a browser-only
// IIFE, so this is a static source check on the REND-03 sim-side consumer.
{
  const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.ok(
    !/skin\.lastWorld\s*=\s*world\b/.test(appSrc),
    "CR-01: app.js must not alias computePose's shared buffer (skin.lastWorld = world)"
  );
  assert.ok(
    /skin\.lastWorld\.set\(world\)/.test(appSrc),
    "CR-01: app.js simStep must copy the pose via skin.lastWorld.set(world)"
  );
}

console.log("loop.test.js: all accumulator known-answer tests passed");
