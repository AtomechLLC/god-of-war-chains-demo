// chain.js — pure link-walker geometry for the Blades-of-Chaos chain (CHAIN-01).
//
// Replaces the old flat-strip tiling (`u = t·reps`, whole 16-link texture per
// 0.9 units — links squashed ~16× vs square texels) with an arc-length walk
// that places ONE 32px link cell per LINK_PITCH along the chain curve, with an
// alternating ~90° per-link twist for the 3D segmented-chain read.
//
// VERIFIED texture facts (first-party decode of GFX_chainlink, 2026-07-25):
//   • 512×32 PSMT4, exactly 32px-periodic → 16 identical link cells per tile
//   • binary alpha (0 or 255) → the "visible gaps" are in the pixels
//   • painted content in rows 6–25 → the link art is centered in the strip
// Because every 32px cell is identical, the alternating-link look MUST come
// from geometry (this walker's twist), not from painted variation.
//
// Square-texel rule (03-RESEARCH Pattern 2): 32px of U (one link cell) and 32px
// of V (full strip height) map to the SAME world length, so RIBBON_WIDTH ===
// LINK_PITCH — one scale constant instead of two independent guesses; the
// artist's link art renders undistorted.
//
// LINK_PITCH = 0.9 world units is INFERRED (Assumption A4): ≈4.6 cm/link at the
// ≈5.1 cm/unit hero scale, ≈15–16 links over CHAIN_LEN 14.
// DEFERRED to Phase-1 polish (01-04): calibrate LINK_PITCH against measured
// on-screen link counts; expected change: one constant in chain.js.
//
// Pure module: no GL, no DOM, no clock reads — curve points arrive as a
// parameter, so the whole geometry contract is Node-testable (test/chain.test.js).

const Chain = (() => {
  const LINKS_PER_TILE = 16;     // 512px tile / 32px link — VERIFIED in texture
  const LINK_PITCH = 0.9;        // world units per 32px link cell — INFERRED (A4)
  // REAL decoded chain geometry (part1.pak /Player/ uid 273; key names cracked
  // against SCUS_973.99 strings — see design/twk/decoded/Player.twk):
  //   Segment Length = 0.25, Link Diameter = 0.13, Glow Diameter = 0.18,
  //   Shadow Diameter = 0.13.
  // These are in the game's PHYSICS units; the physics↔mesh unit bridge is NOT
  // decoded, so the absolute values can't scale LINK_PITCH directly — but their
  // RATIOS are unit-free and REAL. GLOW_OVER_LINK drives the glow pass's wider
  // halo ribbon (0.18/0.13 ≈ 1.385× the link width).
  const SEGMENT_LENGTH = 0.25;   // REAL (physics units)
  const LINK_DIAMETER = 0.13;    // REAL (physics units)
  const GLOW_DIAMETER = 0.18;    // REAL (physics units)
  const GLOW_OVER_LINK = GLOW_DIAMETER / LINK_DIAMETER; // REAL unit-free ratio
  const SUBROWS = 2;             // sub-quads per link so sag doesn't facet —
                                 // a smoothness parameter, NOT a decoded value
  const UP = [0, 1, 0];
  const WORLD_X = [1, 0, 0];     // degenerate-frame fallback axis (Pitfall 2)

  // --- tiny vec helpers ---
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // Interpolate a world position at cumulative arc-length `target` along the
  // sampled curve (s[] = cumulative lengths matching curvePts[]).
  function sampleAt(pts, s, target) {
    const last = s[s.length - 1];
    if (target <= 0) return pts[0].slice();
    if (target >= last) return pts[pts.length - 1].slice();
    let i = 1;
    while (i < s.length && s[i] < target) i++;
    const segLen = s[i] - s[i - 1] || 1;
    const f = (target - s[i - 1]) / segLen;
    const p0 = pts[i - 1], p1 = pts[i];
    return [
      p0[0] + (p1[0] - p0[0]) * f,
      p0[1] + (p1[1] - p0[1]) * f,
      p0[2] + (p1[2] - p0[2]) * f,
    ];
  }

  // buildRibbon(curvePts, linkPitch, opts) → interleaved verts + metadata.
  // curvePts: array of [x,y,z] sampled along the chain (Phase 4 swaps the sag
  // sampler for a solver — the walker stays curve-agnostic by design).
  // Emits its OWN per-link triangles (2 tris/sub-quad × SUBROWS), stride-24
  // aP(xyz)+aT(u,v,alpha) interleave; NO bridge quad between links (Pitfall 4).
  function buildRibbon(curvePts, linkPitch, opts) {
    linkPitch = linkPitch || LINK_PITCH;
    // widthScale (opts): cross-width multiplier. 1 = square-texel link ribbon;
    // the glow pass passes GLOW_OVER_LINK (REAL 0.18/0.13) for its wider halo.
    const widthScale = (opts && opts.widthScale) || 1;
    const hw = (linkPitch / 2) * widthScale;  // half-width; square-texel at scale 1: 2·hw === linkPitch

    // 1) cumulative arc length over the sampled curve
    const s = [0];
    for (let i = 1; i < curvePts.length; i++) s.push(s[i - 1] + dist(curvePts[i - 1], curvePts[i]));
    const arcLen = s[s.length - 1];

    // 2) link count. The -1e-9 keeps a curve whose length is an exact multiple
    // of linkPitch (float 10·0.9 → 10.0000002) from spawning a phantom
    // zero-length tail link (→ NaN tangent). Fractional tails are kept.
    const nLinks = Math.max(1, Math.ceil(arcLen / linkPitch - 1e-9));

    const verts = [];
    let prevS = null;                         // frame hysteresis (Pitfall 2)
    for (let k = 0; k < nLinks; k++) {
      const s0 = k * linkPitch;
      const s1 = Math.min((k + 1) * linkPitch, arcLen);
      const p0 = sampleAt(curvePts, s, s0);
      const p1 = sampleAt(curvePts, s, s1);

      // link tangent; guard a degenerate (zero-length) link span
      let T = sub(p1, p0);
      T = len3(T) < 1e-9 ? (prevS ? prevS : WORLD_X) : norm(T);

      // base side axis with the vertical-chain degenerate guard + hysteresis
      let S = cross(T, UP);
      if (len3(S) < 1e-4) S = prevS ? prevS : WORLD_X;   // Pitfall 2: T∥UP
      // re-orthonormalize S against T so |C| stays exactly 1 for BOTH the S and
      // the N (odd-link) axis → the square-texel width holds every link
      S = sub(S, scale(T, dot(S, T)));
      if (len3(S) < 1e-4) S = WORLD_X;
      S = norm(S);
      prevS = S;
      const N = norm(cross(T, S));

      // alternating ~90° per-link cross axis; link 0 face-on (S) per Open Q3
      const C = (k % 2 === 0) ? S : N;

      // per-link U ∈ [0,1] (Pattern 3): duplicated boundaries mean no quad ever
      // interpolates across a link seam, so U never grows unbounded (Pitfall 6)
      const u0 = (k % LINKS_PER_TILE) / LINKS_PER_TILE;
      const u1 = u0 + ((s1 - s0) / linkPitch) / LINKS_PER_TILE;   // fractional tail truncates

      // sample SUBROWS+1 rows along the link, ALL sharing C (rigid link)
      const rows = [];
      for (let j = 0; j <= SUBROWS; j++) {
        const t = j / SUBROWS;
        const pj = sampleAt(curvePts, s, s0 + (s1 - s0) * t);
        const uj = u0 + (u1 - u0) * t;
        rows.push({
          a: [pj[0] - C[0] * hw, pj[1] - C[1] * hw, pj[2] - C[2] * hw],
          b: [pj[0] + C[0] * hw, pj[1] + C[1] * hw, pj[2] + C[2] * hw],
          u: uj,
        });
      }
      // emit the link's own sub-quads (2 tris each), matching app.js pushRibbon
      // winding: p.a,p.b,q.a / q.a,p.b,q.b — v=0 at a-edge, v=1 at b-edge, alpha 1
      for (let j = 1; j <= SUBROWS; j++) {
        const p = rows[j - 1], q = rows[j];
        verts.push(
          p.a[0], p.a[1], p.a[2], p.u, 0, 1,
          p.b[0], p.b[1], p.b[2], p.u, 1, 1,
          q.a[0], q.a[1], q.a[2], q.u, 0, 1,
          q.a[0], q.a[1], q.a[2], q.u, 0, 1,
          p.b[0], p.b[1], p.b[2], p.u, 1, 1,
          q.b[0], q.b[1], q.b[2], q.u, 1, 1,
        );
      }
    }

    return { verts, nLinks, arcLen, linkPitch, ribbonWidth: linkPitch };
  }

  return { buildRibbon, LINK_PITCH, LINKS_PER_TILE, SEGMENT_LENGTH, LINK_DIAMETER, GLOW_DIAMETER, GLOW_OVER_LINK };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Chain;
