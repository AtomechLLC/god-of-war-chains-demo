// fx.js — the single MAT→GL mapping table: the ONLY place PS2 blend semantics
// touch WebGL calls (DEC-01). Mode strings come from FxParse.decodeFlags
// (mat.go Flags[0] bits 24-27); mapping cross-checked against CLAUDE.md's
// ABCD→WebGL table and god_of_war_browser RenderChain.js (usual →
// blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE) + depthMask
// true; additive → blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE) + depthMask
// false; both re-issue blendEquation(FUNC_ADD) per batch — state-reset
// discipline, 02-RESEARCH Pattern 3).
//
// No top-level gl/DOM access — gl arrives as a parameter, so this file is
// Node-requireable with a mock gl (test/fx.test.js).
//
// Future FIX/alpha>0x80 cases (GS ALPHA register C=FIX, or As up to 0xFF ≈
// 1.99, seen in fire effects): the exact WebGL1 equivalent is premultiply in
// the shader — gl_FragColor.rgb = color.rgb * (alpha128 / 128.0) — blended
// with blendFunc(ONE, ONE). Mathematically identical to Cs·As + Cd with no
// clamp on As. The table below must gain a premultiplied entry rather than
// scaling factors when Phase 5's GS dump surfaces such data; nothing here
// precludes it.

const Fx = (() => {
  // key: `${mode}` — depthWrite is carried separately from bit 19, it is NOT
  // implied by the blend mode (they merely correlate in this WAD)
  const MATGL = {
    usual: (gl) => {
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
    },
    additive: (gl) => {
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
    },
    // subtract: untested-but-present — no weapon-WAD MAT uses it, but
    // hero-side MATs (MAT_Csmoke, MAT_firesploch1) may (02-RESEARCH Pitfall 7)
    subtract: (gl) => {
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    },
    // "strange" (bit 24): no GL path — must assert if ever hit
  };

  // Sets FULL state for one FX pass (never assumes prior state): BLEND enable
  // + blendEquation + blend factors from the mode, then depthMask from the
  // separate bit-19 flag. Unknown modes throw — the assert is the DEC-01
  // contract; silent defaulting is how mistranslations ship. Never remove it:
  // a later phase hitting this throw is the designed behavior (add the
  // mapping, keep the assert).
  function applyMaterial(gl, mat) {
    const fn = MATGL[mat.mode];
    if (!fn) throw new Error(`Unmapped blend mode '${mat.mode}' in ${mat.name}`); // assert, never default
    fn(gl);
    gl.depthMask(!mat.disableDepthWrite);
    // blendColor/materialColor -> shader uniforms (floats, already 1.0-based;
    // values up to 2.0 observed — multiply in-shader BEFORE blending so >1 survives)
  }

  // Restore after the FX block, every frame: gl.clear respects depthMask, so
  // a leaked false mask breaks next frame's depth clear (02-RESEARCH Pitfall 4).
  function restoreFxState(gl) {
    gl.blendEquation(gl.FUNC_ADD);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  return { applyMaterial, restoreFxState };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Fx;
