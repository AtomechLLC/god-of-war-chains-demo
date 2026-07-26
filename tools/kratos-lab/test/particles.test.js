// particles.test.js — pure-sim known-answer tests for the world-space billboard
// particle pool (FIRE-01/02, TRL-01/02, CHAIN-03). Run:
//   node tools/kratos-lab/test/particles.test.js
//
// RED note: require("../particles.js") throws MODULE_NOT_FOUND ("Cannot find
// module") until particles.js lands (Task 2). That failing state is the intended
// RED signal — the same TDD pair discipline as chain.test.js / loop.test.js.
//
// Feeds FIXED inputs (jitter sampler = ()=>0, known FXC/blade matrices, exact
// Loop.STEP dt) and asserts exact known answers: the SC1 blade-lag divergence,
// fixed-step Euler advect + gravity, age>life cull, deterministic burst count,
// the INFERRED ramp/variant/glow rules, and the pool-cap + non-finite Security
// guards. Node built-ins only; exit code is the pass/fail signal.

"use strict";
const assert = require("node:assert");
const Loop = require("../loop.js");             // STEP = 1/60 — the sim dt
const Particles = require("../particles.js");   // RED: MODULE_NOT_FOUND until it lands

// --- test-local vec helpers ------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => len3(sub(a, b));
const lum = (c) => c[0] + c[1] + c[2];   // additive luminance for ramp monotonicity
const STEP = Loop.STEP;                   // particles integrate at exactly this dt

// --- API shape -------------------------------------------------------------
{
  assert.strictEqual(typeof Particles.makePool, "function", "Particles.makePool must be a function");
  assert.strictEqual(typeof Particles.spawnAnchor, "function", "Particles.spawnAnchor must be a function");
  assert.strictEqual(typeof Particles.stretchAxis, "function", "Particles.stretchAxis must be a function");
  assert.strictEqual(typeof Particles.variantFor, "function", "Particles.variantFor must be a function");
  assert.strictEqual(typeof Particles.glowGain, "function", "Particles.glowGain must be a function");
  assert.strictEqual(typeof Particles.rampColor, "function", "Particles.rampColor must be a function");
  assert.strictEqual(typeof Particles.fireBindings, "function", "Particles.fireBindings must be a function");
}

// --- (a) spawn-anchor: FXC placement translation composed by the live blade ---
// matrix (SC1 world anchor). Identity+translation → pure translation compose; a
// 90° rotated blade proves the FULL 3×4 transform (not mere addition).
{
  // column-major 4×4: identity rotation, translation T=(10,0,0) at [12,13,14]
  const bladeMat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1];
  // FXC_BDEsparkemit blade-local translation (0, 0.226, -9.172) at [12,13,14]
  const fxcMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.226, -9.172, 1];
  const w = Particles.spawnAnchor(bladeMat, fxcMatrix);
  assert.ok(Math.abs(w[0] - 10) < 1e-6, `spawn-anchor identity: x must be 10 (blade T.x), got ${w[0]}`);
  assert.ok(Math.abs(w[1] - 0.226) < 1e-6, `spawn-anchor identity: y must be 0.226 (FXC T.y), got ${w[1]}`);
  assert.ok(Math.abs(w[2] - -9.172) < 1e-6, `spawn-anchor identity: z must be -9.172 (FXC T.z), got ${w[2]}`);

  // 90°-about-Z blade (local (x,y,z) → (-y, x, z)) + translation T=(5,0,0):
  // proves the rotation composes with the translation — not just additive offset.
  const rotMat = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1];
  const fxcRot = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 0, 1];   // local translation (2,3,0)
  const wr = Particles.spawnAnchor(rotMat, fxcRot);
  assert.ok(Math.abs(wr[0] - 2) < 1e-6, `spawn-anchor rotated: x must be 2 (-localY + Tx), got ${wr[0]}`);
  assert.ok(Math.abs(wr[1] - 2) < 1e-6, `spawn-anchor rotated: y must be 2 (localX + Ty), got ${wr[1]}`);
  assert.ok(Math.abs(wr[2] - 0) < 1e-6, `spawn-anchor rotated: z must be 0 (localZ + Tz), got ${wr[2]}`);
}

// --- (b) euler advect: fixed-step Euler at exactly Loop.STEP (dt = 1/60). pos is
// updated with the pre-gravity velocity, THEN gravity is applied (semi-implicit).
{
  const pool = Particles.makePool({ maxParticles: 16 });
  pool.spawn({ pos: [0, 0, 0], vel: [6, 0, 0], size: 1, life: 1.0, color: [1, 1, 1, 1], kind: "fire" });
  pool.integrate(STEP);
  let p = pool.particles[0];
  assert.ok(Math.abs(p.pos[0] - 0.1) < 1e-9, `euler advect: after 1 step pos.x must be 6·(1/60)=0.1, got ${p.pos[0]}`);
  assert.ok(Math.abs(p.pos[1] - 0) < 1e-12, `euler advect: pos.y still 0 after 1 step (pos uses pre-gravity vel), got ${p.pos[1]}`);
  pool.integrate(STEP);
  p = pool.particles[0];
  assert.ok(Math.abs(p.pos[0] - 0.2) < 1e-9, `euler advect: after 2 steps pos.x must be 0.2, got ${p.pos[0]}`);
  assert.ok(p.vel[1] < 0, `euler advect: gravity must decrease vel.y below 0, got ${p.vel[1]}`);
  assert.ok(p.pos[1] < 0, `euler advect: gravity g·dt² term must pull pos.y below 0, got ${p.pos[1]}`);
}

// --- (c) cull age>life: a particle with life = 2·STEP ages out by the 3rd step --
{
  const pool = Particles.makePool({ maxParticles: 16 });
  pool.spawn({ pos: [0, 0, 0], vel: [0, 0, 0], size: 1, life: 2 * STEP, color: [1, 1, 1, 1], kind: "spark" });
  assert.strictEqual(pool.count, 1, "cull: particle present before aging");
  pool.integrate(STEP);   // age = STEP    (<= life)
  pool.integrate(STEP);   // age = 2·STEP  (== life; still alive — cull is strict age>life)
  assert.strictEqual(pool.count, 1, "cull: age == life is still alive (strict age>life cull)");
  pool.integrate(STEP);   // age = 3·STEP  (> life) → culled
  assert.strictEqual(pool.count, 0, "cull: particle removed once age exceeds life");
}

// --- (d) blade-lag divergence (SC1, anti-Pitfall-4) -------------------------
// A particle spawned at bladeMat0 and integrated with ZERO velocity stays at its
// spawn origin; the blade meanwhile whips far away (bladeMat1). The particle must
// NOT track the blade — its distance to the NEW blade anchor is ≥ 49 (decoupled).
{
  const pool = Particles.makePool({ maxParticles: 16 });
  const fxcMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];   // local translation (0,0,0)
  const bladeMat0 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];    // T=(0,0,0)
  const spawn0 = Particles.spawnAnchor(bladeMat0, fxcMatrix);
  pool.spawn({ pos: spawn0, vel: [0, 0, 0], size: 1, life: 100, color: [1, 1, 1, 1], kind: "fire" });
  for (let i = 0; i < 10; i++) pool.integrate(STEP);                      // advect 10 ticks in world space
  const bladeMat1 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 0, 0, 1];    // blade whipped to T=(50,0,0)
  const newAnchor = Particles.spawnAnchor(bladeMat1, fxcMatrix);
  const p = pool.particles[0];
  assert.ok(len3(p.pos) < 1e-6, `blade-lag: zero-velocity particle stays at its spawn origin, got ${p.pos}`);
  const divergence = dist(p.pos, newAnchor);
  assert.ok(divergence >= 49, `blade-lag: particle must DECOUPLE from the moved blade (dist ≥ 49), got ${divergence}`);
}

// --- (e) hit-edge burst: deterministic count + shared position (jitter = 0) ----
{
  const pool = Particles.makePool({ maxParticles: 64 });
  const before = pool.count;
  const template = { pos: [1, 2, 3], vel: [0, 5, 0], size: 1, life: 1, color: [1, 1, 1, 1], kind: "spark" };
  pool.burst(8, template, () => 0);
  assert.strictEqual(pool.count - before, 8, "hit-edge burst: burst(8, …) must add exactly 8 particles");
  for (let i = 0; i < 8; i++) {
    const p = pool.particles[before + i];
    assert.ok(dist(p.pos, [1, 2, 3]) < 1e-9, `hit-edge burst: jitter=0 particle ${i} shares the template pos, got ${p.pos}`);
  }
}

// --- (f) ramp monotonicity: white-hot(0) → orange → ember(1) -----------------
// INFERRED runtime tint (05-04 proved no painted length-wise ramp). Luminance
// strictly decreases across t; the hot end reads whiter, the cold end redder.
{
  const c0 = Particles.rampColor(0);
  const c5 = Particles.rampColor(0.5);
  const c1 = Particles.rampColor(1);
  assert.ok(lum(c0) > lum(c5), `ramp monotonicity: lum(rampColor(0)) > lum(rampColor(0.5)), got ${lum(c0)} vs ${lum(c5)}`);
  assert.ok(lum(c5) > lum(c1), `ramp monotonicity: lum(rampColor(0.5)) > lum(rampColor(1)), got ${lum(c5)} vs ${lum(c1)}`);
  assert.ok(c0[2] > c1[2], `ramp shape: white-hot end (t=0) is whiter/bluer than the ember end (t=1), got b0=${c0[2]} b1=${c1[2]}`);
  assert.ok(c1[0] > c1[1] && c1[0] > c1[2], `ramp shape: ember end (t=1) is red-dominant, got ${c1}`);
}

// --- (g) variant-select (TRL-02, INFERRED table) ----------------------------
// combat.js GRAPH states: combo3A = light □-chain → crimson BFT fire trail;
// combo4A = heavy △-chain → neutral BGT swoosh. Mapping INFERRED (refine Phase 7).
{
  assert.strictEqual(Particles.variantFor("combo3A"), "BFT", "variant-select: light chain (combo3A) → BFT crimson fire trail");
  assert.strictEqual(Particles.variantFor("combo4A"), "BGT", "variant-select: heavy chain (combo4A) → BGT neutral swoosh");
}

// --- (h) glow-gate (CHAIN-03, INFERRED rule): dark at rest, hot on attack -----
{
  assert.strictEqual(Particles.glowGain(true, { rest: 0.3, hot: 1.8 }), 0.3, "glow-gate: idle → rest gain 0.3");
  assert.strictEqual(Particles.glowGain(false, { rest: 0.3, hot: 1.8 }), 1.8, "glow-gate: attacking → hot gain 1.8");
}

// --- (i) pool cap (Security T-06-01-02): hard maxParticles cap, no unbounded growth
{
  const pool = Particles.makePool({ maxParticles: 4 });
  for (let i = 0; i < 6; i++) pool.spawn({ pos: [i, 0, 0], vel: [0, 0, 0], size: 1, life: 1, color: [1, 1, 1, 1], kind: "x" });
  assert.ok(pool.count <= 4, `pool cap: count must never exceed maxParticles 4, got ${pool.count}`);
  assert.strictEqual(pool.count, 4, "pool cap: exactly 4 particles retained (reject-when-full)");
}

// --- (j) NaN/Infinity skip (Security T-06-01-01) ----------------------------
// Non-finite pos/vel/size are rejected before entering the pool — they must never
// reach a GL uniform (render corruption / DoS).
{
  const pool = Particles.makePool({ maxParticles: 16 });
  pool.spawn({ pos: [NaN, 0, 0], vel: [0, 0, 0], size: 1, life: 1, color: [1, 1, 1, 1], kind: "x" });
  assert.strictEqual(pool.count, 0, "NaN-skip: pos with NaN is rejected (count unchanged)");
  pool.spawn({ pos: [0, 0, 0], vel: [Infinity, 0, 0], size: 1, life: 1, color: [1, 1, 1, 1], kind: "x" });
  assert.strictEqual(pool.count, 0, "NaN-skip: vel with Infinity is rejected (count unchanged)");
  pool.spawn({ pos: [0, 0, 0], vel: [0, 0, 0], size: NaN, life: 1, color: [1, 1, 1, 1], kind: "x" });
  assert.strictEqual(pool.count, 0, "NaN-skip: size NaN is rejected (count unchanged)");
  // a fully-finite particle IS accepted (the guard is not over-tight)
  const ok = pool.spawn({ pos: [0, 0, 0], vel: [0, 0, 0], size: 1, life: 1, color: [1, 1, 1, 1], kind: "x" });
  assert.strictEqual(pool.count, 1, "NaN-skip: a fully-finite particle is accepted");
  assert.strictEqual(ok, true, "spawn returns true on accept");
}

// --- (k) stretchAxis: velocity-aligned spark axis + camUp fallback ----------
{
  const camUp = [0, 1, 0];
  const a = Particles.stretchAxis([3, 0, 0], camUp);
  assert.ok(Math.abs(len3(a) - 1) < 1e-9, `stretchAxis: returns a unit axis, |a|=${len3(a)}`);
  assert.ok(Math.abs(a[0] - 1) < 1e-9, `stretchAxis: aligns with the velocity direction (+X), got ${a}`);
  const z = Particles.stretchAxis([0, 0, 0], camUp);
  assert.deepStrictEqual(z, camUp, "stretchAxis: ~zero velocity falls back to camUp");
}

// --- (l) fireBindings (D-08 / Pitfall 6): join db.fxc→db.ptc by shapeRef NAME --
// The WAD-native fire family uses placeholder slot 0x0 (buildFxDb does NOT pair
// it); the real discriminator is the shapeRef string, not a db.refs slot pair.
{
  const db = {
    fxc: { FXC_BDEsparkemit: { shapeRef: "flame6Shape" } },
    ptc: { PTC_flame6: { shapeRef: "flame6Shape" }, PTC_flame3: { shapeRef: "flame3Shape" } },
    refs: [],
  };
  const bindings = Particles.fireBindings(db);
  assert.strictEqual(bindings.length, 1, "fireBindings: exactly one emitter→particle name match");
  assert.strictEqual(bindings[0].emitter, "FXC_BDEsparkemit", "fireBindings: emitter is FXC_BDEsparkemit");
  assert.strictEqual(bindings[0].particle, "PTC_flame6", "fireBindings: particle matched by shapeRef name (flame6Shape)");
  assert.strictEqual(bindings[0].shapeRef, "flame6Shape", "fireBindings: shapeRef carried through");
}

console.log("particles.test.js: all pure-sim known-answer tests passed");
