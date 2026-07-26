// fx.test.js — mock-gl known-answer test for the single MAT→GL mapping table
// (tools/kratos-lab/fx.js). Node built-ins only (node:assert), zero deps.
//
// Contract under test (02-02-PLAN interfaces / 02-RESEARCH Pattern 3):
//   Fx.applyMaterial(gl, mat) sets FULL blend state per pass:
//     usual:    enable(BLEND) + blendEquation(FUNC_ADD)
//               + blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE)
//     additive: enable(BLEND) + blendEquation(FUNC_ADD)
//               + blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE)
//     subtract: enable(BLEND) + blendEquation(FUNC_REVERSE_SUBTRACT)
//               + blendFunc(SRC_ALPHA, ONE)
//     additivePremult: enable(BLEND) + blendEquation(FUNC_ADD)
//               + blendFunc(ONE, ONE)  — the alpha-over-1.0 brightness path
//               (premultiplied source Cs·As + Cd, no clamp on As; CLAUDE.md Part 1)
//     then depthMask(!mat.disableDepthWrite) — from bit 19 ONLY, never the mode
//     "strange" / anything unmapped: throw /Unmapped blend mode/ with the
//     material name — the assert is the DEC-01 contract, never a default.
//   Fx.restoreFxState(gl): blendEquation(FUNC_ADD) + depthMask(true) + disable(BLEND)

"use strict";
const assert = require("node:assert");
const Fx = require("../fx.js");

// Mock gl: carries the REAL WebGL enum values as properties; every state call
// records [methodName, ...args] onto `calls`. Assertions reference the mock's
// own constants so the numeric values are never hardcoded twice.
function makeMockGl() {
  const calls = [];
  const gl = {
    BLEND: 0x0be2,
    FUNC_ADD: 0x8006,
    FUNC_REVERSE_SUBTRACT: 0x800b,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE: 1,
    calls,
  };
  for (const m of ["enable", "disable", "blendEquation", "blendFunc", "blendFuncSeparate", "depthMask"]) {
    gl[m] = (...args) => calls.push([m, ...args]);
  }
  return gl;
}

// -- usual (MAT_chainlink): exact call sequence ------------------------------
{
  const gl = makeMockGl();
  Fx.applyMaterial(gl, { name: "MAT_chainlink", mode: "usual", disableDepthWrite: false });
  assert.deepStrictEqual(gl.calls, [
    ["enable", gl.BLEND],
    ["blendEquation", gl.FUNC_ADD],
    ["blendFuncSeparate", gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE],
    ["depthMask", true],
  ], "usual: enable → FUNC_ADD → (SRC_ALPHA, 1-SRC_ALPHA, 1, 1) → depthMask(true)");
}

// -- additive (MAT_swordtrail) -----------------------------------------------
{
  const gl = makeMockGl();
  Fx.applyMaterial(gl, { name: "MAT_swordtrail", mode: "additive", disableDepthWrite: true });
  assert.deepStrictEqual(gl.calls, [
    ["enable", gl.BLEND],
    ["blendEquation", gl.FUNC_ADD],
    ["blendFuncSeparate", gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE],
    ["depthMask", false],
  ], "additive: enable → FUNC_ADD → (SRC_ALPHA, 1, 1, 1) → depthMask(false)");
}

// -- additivePremult (fire/glow alpha-over-1.0 pool pass — CLAUDE.md Part 1) ---
// The premultiplied-source additive path: the fragment outputs rgb·alpha128
// (alpha may exceed 1.0), so the GS Cs·As + Cd is reproduced with blendFunc(ONE,
// ONE). Distinct from `additive` (SRC_ALPHA, ONE), which clamps As at 1.0.
{
  const gl = makeMockGl();
  Fx.applyMaterial(gl, { name: "fxPool", mode: "additivePremult", disableDepthWrite: true });
  assert.deepStrictEqual(gl.calls, [
    ["enable", gl.BLEND],
    ["blendEquation", gl.FUNC_ADD],
    ["blendFunc", gl.ONE, gl.ONE],
    ["depthMask", false],
  ], "additivePremult: enable → FUNC_ADD → (ONE, ONE) → depthMask(false)");
}

// -- subtract (hero-side MAT_Csmoke — untested-in-WAD but present by contract)
{
  const gl = makeMockGl();
  Fx.applyMaterial(gl, { name: "MAT_Csmoke", mode: "subtract", disableDepthWrite: true });
  assert.deepStrictEqual(gl.calls, [
    ["enable", gl.BLEND],
    ["blendEquation", gl.FUNC_REVERSE_SUBTRACT],
    ["blendFunc", gl.SRC_ALPHA, gl.ONE],
    ["depthMask", false],
  ], "subtract: enable → FUNC_REVERSE_SUBTRACT → (SRC_ALPHA, 1) → depthMask(false)");
}

// -- unmapped modes throw with the material name; NO GL state is touched -----
{
  const gl = makeMockGl();
  assert.throws(
    () => Fx.applyMaterial(gl, { name: "MAT_x", mode: "strange" }),
    (e) => /Unmapped blend mode/.test(e.message) && e.message.includes("MAT_x") && e.message.includes("strange"),
    "'strange' has no GL path by design — must throw with material name",
  );
  assert.throws(
    () => Fx.applyMaterial(gl, { name: "MAT_x", mode: "garbage" }),
    (e) => /Unmapped blend mode/.test(e.message) && e.message.includes("MAT_x") && e.message.includes("garbage"),
    "unknown mode string must throw, never silently default to alpha blend",
  );
  assert.deepStrictEqual(gl.calls, [], "throw happens before any GL call");
}

// -- depthMask derives ONLY from disableDepthWrite, never from the mode ------
// (02-RESEARCH anti-pattern: bit 19 is a separate flag; it merely correlates
// with additive in this WAD)
{
  const gl = makeMockGl();
  Fx.applyMaterial(gl, { name: "MAT_hypoUsualNoZ", mode: "usual", disableDepthWrite: true });
  assert.deepStrictEqual(gl.calls[gl.calls.length - 1], ["depthMask", false],
    "usual + disableDepthWrite:true → depthMask(false)");
}
{
  const gl = makeMockGl();
  Fx.applyMaterial(gl, { name: "MAT_hypoAddZ", mode: "additive", disableDepthWrite: false });
  assert.deepStrictEqual(gl.calls[gl.calls.length - 1], ["depthMask", true],
    "additive + disableDepthWrite:false → depthMask(true)");
}

// -- restoreFxState: the post-FX-block restore discipline --------------------
// (gl.clear respects depthMask — a leaked false mask breaks next frame's
// depth clear; 02-RESEARCH Pitfall 4)
{
  const gl = makeMockGl();
  Fx.restoreFxState(gl);
  assert.deepStrictEqual(gl.calls, [
    ["blendEquation", gl.FUNC_ADD],
    ["depthMask", true],
    ["disable", gl.BLEND],
  ], "restore: blendEquation(FUNC_ADD) → depthMask(true) → disable(BLEND)");
}

console.log("fx.test.js: all assertions passed");
