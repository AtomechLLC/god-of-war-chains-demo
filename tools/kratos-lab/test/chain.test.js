// chain.test.js — geometry known-answer tests for the pure chain link-walker
// (CHAIN-01: 32px/link, 16 links/tile arc-length ribbon with alternating
// per-link ~90° twist). Run: node tools/kratos-lab/test/chain.test.js
//
// Feeds known straight / vertical curve-point arrays into Chain.buildRibbon and
// asserts exact geometry: square-texel pitch (RIBBON_WIDTH === LINK_PITCH),
// per-link constant cross-axis, perpendicular consecutive links (the segmented
// twist), u ∈ [0,1] with mod-16 tiling + fractional-tail truncation (Pitfall 6),
// and the vertical-chain degenerate guard (T∥UP → no NaN, no frame flip —
// Pitfall 2). Node built-ins only; exit code is the pass/fail signal.
//
// This suite is the RED half of the TDD pair: `require("../chain.js")` throws
// MODULE_NOT_FOUND until the walker lands (Task 2). That failing state is the
// intended RED signal.

"use strict";
const assert = require("node:assert");
const Chain = require("../chain.js");

// --- test-local vec helpers (the walker keeps its own) ---------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// interleaved layout the walker MUST emit: 6 floats/vert (pos xyz, u, v, alpha),
// stride 24 bytes — matches app.js fxProg aP(offset 0)/aT(offset 12).
const F = 6;
const SUBROWS = 2;                    // walker sub-quads per link (known answer)
const VERTS_PER_LINK = SUBROWS * 6;   // 2 sub-quads × 6 verts (2 tris each)
const pos = (v, i) => [v[i * F], v[i * F + 1], v[i * F + 2]];
const uOf = (v, i) => v[i * F + 3];
// each sub-quad emits p.a,p.b,q.a, q.a,p.b,q.b (pushRibbon order): vert+0 = a-edge
// (v=0), vert+1 = b-edge (v=1) of the leading row.
function firstRow(v, k) {
  const b0 = k * VERTS_PER_LINK;
  const a = pos(v, b0), b = pos(v, b0 + 1);
  return {
    a, b, u: uOf(v, b0),
    center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    dir: norm(sub(b, a)),
  };
}
// link k's trailing row (row SUBROWS): last sub-quad's q-edges (vert+2 = q.a,
// vert+5 = q.b).
function lastRow(v, k) {
  const b0 = k * VERTS_PER_LINK + (SUBROWS - 1) * 6;
  const a = pos(v, b0 + 2), b = pos(v, b0 + 5);
  return {
    a, b, u: uOf(v, b0 + 2),
    center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    dir: norm(sub(b, a)),
  };
}

// --- API shape -------------------------------------------------------------
{
  assert.strictEqual(Chain.LINKS_PER_TILE, 16, "Chain.LINKS_PER_TILE must be 16 (512px tile / 32px link)");
  assert.strictEqual(typeof Chain.LINK_PITCH, "number", "Chain.LINK_PITCH must be a number");
  assert.ok(Number.isFinite(Chain.LINK_PITCH) && Chain.LINK_PITCH > 0, "Chain.LINK_PITCH must be finite and > 0");
  assert.strictEqual(typeof Chain.buildRibbon, "function", "Chain.buildRibbon must be a function");
}

const P = Chain.LINK_PITCH;

// --- straight +X curve (uneven collinear pts, arcLen 5.0 → 6 links) --------
// 5.0 / 0.9 = 5.56 → ceil 6; the last link is a fractional tail (span 0.5).
const straight = [[0, 0, 0], [1.3, 0, 0], [2.6, 0, 0], [5.0, 0, 0]];
const r = Chain.buildRibbon(straight, P);

// --- metadata + return shape ----------------------------------------------
{
  assert.ok(Array.isArray(r.verts) || ArrayBuffer.isView(r.verts), "buildRibbon returns a verts array");
  assert.ok(Math.abs(r.arcLen - 5.0) < 1e-6, `arcLen: cumulative arc length must be 5.0, got ${r.arcLen}`);
  assert.strictEqual(r.nLinks, Math.ceil(5.0 / P), `nLinks: must be ceil(arcLen/LINK_PITCH), got ${r.nLinks}`);
  assert.strictEqual(r.linkPitch, P, "result.linkPitch echoes the input LINK_PITCH");
}

// --- square-texel invariant: RIBBON_WIDTH === LINK_PITCH -------------------
{
  assert.strictEqual(r.ribbonWidth, P, "square-texel invariant: result.ribbonWidth must equal LINK_PITCH");
  const fr = firstRow(r.verts, 0);
  const width = len3(sub(fr.b, fr.a));
  assert.ok(Math.abs(width - P) < 1e-6,
    `square-texel invariant: emitted ribbon full width (|b-a|) must equal LINK_PITCH, got ${width}`);
}

// --- LINK_PITCH pitch spacing: link k starts at k*LINK_PITCH along the arc -
{
  for (let k = 0; k < r.nLinks; k++) {
    const fr = firstRow(r.verts, k);
    assert.ok(Math.abs(fr.center[0] - k * P) < 1e-6,
      `LINK_PITCH pitch spacing: link ${k} start must sit at x=${k * P} along the arc, got ${fr.center[0]}`);
  }
}

// --- per-link constant cross-axis: every sub-row of a link shares one axis --
{
  for (let k = 0; k < r.nLinks; k++) {
    const b0 = k * VERTS_PER_LINK;
    const d0 = norm(sub(pos(r.verts, b0 + 1), pos(r.verts, b0)));      // sub-quad 0 leading row
    const d1 = norm(sub(pos(r.verts, b0 + 7), pos(r.verts, b0 + 6)));  // sub-quad 1 leading row
    assert.ok(dot(d0, d1) > 1 - 1e-6,
      `per-link constant axis: link ${k} sub-rows must share one cross-axis (dot≈1), got ${dot(d0, d1)}`);
  }
}

// --- alternating ~90° twist: consecutive links' cross-axes are perpendicular
{
  for (let k = 0; k + 1 < r.nLinks; k++) {
    const c0 = firstRow(r.verts, k).dir;
    const c1 = firstRow(r.verts, k + 1).dir;
    assert.ok(Math.abs(dot(c0, c1)) < 1e-6,
      `perpendicular consecutive cross-axes: links ${k}/${k + 1} must be ~90° (|dot|<1e-6), got ${dot(c0, c1)}`);
  }
}

// --- no inter-link bridge + duplicated boundary rows (Pitfall 4) -----------
{
  assert.strictEqual(r.verts.length, r.nLinks * VERTS_PER_LINK * F,
    `no inter-link bridge: vert float count must be nLinks*${VERTS_PER_LINK}*${F} — no bridge quads`);
  // link 1's trailing row and link 2's leading row are spatially coincident
  // (duplicated boundary) but carry perpendicular axes — a hard twist step,
  // never a smeared bridge quad.
  const kLast = lastRow(r.verts, 1);
  const kNext = firstRow(r.verts, 2);
  assert.ok(len3(sub(kLast.center, kNext.center)) < 1e-6,
    "duplicated boundary: link 1 end and link 2 start must share the arc position");
  assert.ok(Math.abs(dot(kLast.dir, kNext.dir)) < 1e-6,
    "duplicated boundary: coincident boundary rows carry perpendicular axes (hard twist step, no bridge)");
}

// --- u ∈ [0,1] with mod-16 tiling + fractional-tail truncation (Pitfall 6) --
{
  // long straight curve crosses the 16-link tile boundary: 19.4 pitches → 20
  // links (> LINKS_PER_TILE) regardless of the pitch constant's current value
  const longC = [[0, 0, 0], [P * 19.4, 0, 0]];
  const rl = Chain.buildRibbon(longC, P);
  assert.ok(rl.nLinks > Chain.LINKS_PER_TILE, "u tiling: long curve must exceed one 16-link tile to exercise wrap");

  for (let i = 0; i < rl.verts.length / F; i++) {
    const u = uOf(rl.verts, i);
    assert.ok(u >= -1e-9 && u <= 1 + 1e-9, `u ∈ [0,1]: vert ${i} u=${u} is out of [0,1]`);
  }
  for (let k = 0; k < rl.nLinks; k++) {
    const u0 = firstRow(rl.verts, k).u;
    const want = (k % Chain.LINKS_PER_TILE) / Chain.LINKS_PER_TILE;
    assert.ok(Math.abs(u0 - want) < 1e-6, `u tiling: link ${k} u0 must be (k mod 16)/16 = ${want}, got ${u0}`);
  }
  // fractional tail: the last partial link truncates its u-span below one 1/16 cell
  const last = rl.nLinks - 1;
  const uSpan = lastRow(rl.verts, last).u - firstRow(rl.verts, last).u;
  const fullSpan = 1 / Chain.LINKS_PER_TILE;
  assert.ok(uSpan > 0 && uSpan < fullSpan + 1e-9,
    `fractional tail: last partial link u-span must be ≤ one 1/16 cell, got ${uSpan}`);
  assert.ok(lastRow(rl.verts, last).u <= 1 + 1e-9, "fractional tail: truncated u never exceeds 1 (Pitfall 6)");
}

// --- vertical-curve degenerate guard: T∥UP → no NaN, stable frame (Pitfall 2)
{
  const vert = [[0, 0, 0], [0, -4, 0]];   // straight down: cross(T,UP)=0
  const rv = Chain.buildRibbon(vert, P);
  for (let i = 0; i < rv.verts.length; i++) {
    assert.ok(Number.isFinite(rv.verts[i]),
      `vertical-curve no-NaN: every emitted float must be finite (degenerate frame guard), float ${i} = ${rv.verts[i]}`);
  }
  // same-parity links keep an identical frame — no roll/flip at idle
  const c0 = firstRow(rv.verts, 0).dir;
  const c2 = firstRow(rv.verts, 2).dir;
  assert.ok(dot(c0, c2) > 1 - 1e-6,
    `vertical-curve stable axis: links 0 and 2 must share a frame (no flip), got dot ${dot(c0, c2)}`);
  // and the ~90° alternation still holds despite the degenerate cross(T,UP)
  const c1 = firstRow(rv.verts, 1).dir;
  assert.ok(Math.abs(dot(c0, c1)) < 1e-6,
    `vertical-curve: consecutive links still ~90° despite the degenerate frame, got dot ${dot(c0, c1)}`);
}

console.log("chain.test.js: all chain-walker geometry known-answer tests passed");
