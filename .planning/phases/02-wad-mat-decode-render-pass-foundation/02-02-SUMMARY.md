---
phase: 02-wad-mat-decode-render-pass-foundation
plan: 02
subsystem: render
tags: [webgl1, ps2-gs, blend-state, tfx-modulate, mock-gl, tdd, gow1]

# Dependency graph
requires:
  - phase: 02-wad-mat-decode-render-pass-foundation
    provides: "02-01: FxParse MAT decode + matDb.byName (mode/disableDepthWrite/blendColor/materialColor per MAT)"
provides:
  - Fx.applyMaterial(gl, mat) — the single MAT→GL mapping table (usual/additive/subtract), throw-on-unknown, depthMask from bit-19 flag only
  - Fx.restoreFxState(gl) — per-frame FUNC_ADD + depthMask(true) + disable(BLEND) restore
  - tools/kratos-lab/test/fx.test.js mock-gl Node suite pinning the exact GL calls per mode and the unknown-mode throw
  - app.js alpha:false opaque context, opaque clear, TFX-MODULATE FX shader (uMaterialColor/uLayerColor/uCutoff)
  - drawFx driven by matDb.byName.MAT_chainlink / MAT_swordtrail — zero hardcoded blendFunc/depthMask
  - window.KratosLab.{gl, fxLog, fxState} verification hooks
affects: [02-03, 02-04, phase-3 chain ribbon + chainglow pass, phase-5 GS-dump reconciliation, phase-6 particles]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single MAT→GL table as the ONLY place PS2 blend semantics touch WebGL calls; unknown modes throw (assert-never-default)
    - applyMaterial sets FULL state per pass (never assumes prior state); restoreFxState after the FX block every frame
    - Runtime-computed values labeled INFERRED in-code (uCutoff 0.35) per the data-first rule
    - fxLog/fxState hooks: per-pass state proof without mid-frame GL reads

key-files:
  created:
    - tools/kratos-lab/fx.js
    - tools/kratos-lab/test/fx.test.js
  modified:
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "subtract stays present-but-untested in MATGL (no weapon-WAD MAT uses it; hero-side MATs may) while 'strange' has no GL path by design — hitting the throw later is the designed behavior"
  - "depthMask derives ONLY from disableDepthWrite (bit 19), never from the blend mode — they merely correlate in this WAD"
  - "alpha>0x80 / FIX cases documented as a future premultiplied table entry (shader premultiply + ONE,ONE); architecture does not preclude it"
  - "Chain pass visual change is intentional: real decoded state is usual alpha blend + depth-write ON (it previously had no blending at all)"

patterns-established:
  - "FX GL-state purity: fx.js has no top-level gl/DOM references, Node-requireable with a hand-rolled mock gl (zero dependencies)"
  - "Mock gl carries the real WebGL enum values as properties; tests assert against the mock's own constants (numbers never hardcoded twice)"

requirements-completed: [DEC-01, REND-01]

# Metrics
duration: 3min implementation + human checkpoint
completed: 2026-07-25
---

# Phase 2 Plan 02: MAT-Driven Render Pass + PS2 Compositing Invariants Summary

**Every FX draw now takes its full blend/depth state from its decoded MAT through the single Fx.applyMaterial table (chain = usual/depth-write-ON from MAT_chainlink, trail = additive/depth-write-OFF from MAT_swordtrail), on an alpha:false opaque canvas with TFX-MODULATE shader math and per-frame state restore — human-verified live, including the magenta test and additive saturation to flat white**

## Performance

- **Duration:** ~3 min implementation (Tasks 1-2), plus the blocking human-verify checkpoint (Task 3)
- **Started:** 2026-07-25T06:36:53Z
- **Implementation complete:** 2026-07-25T06:39:20Z
- **Tasks:** 3 (1 TDD, 1 auto, 1 checkpoint:human-verify)
- **Files modified:** 4

## Accomplishments

- `Fx.applyMaterial` is the ONLY place PS2 blend semantics touch WebGL calls: usual → FUNC_ADD + blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE); additive → FUNC_ADD + blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE); subtract → FUNC_REVERSE_SUBTRACT + blendFunc(SRC_ALPHA, ONE); anything else throws `Unmapped blend mode '<mode>' in <name>` (T-2-05, DEC-01 contract) — all machine-verified by the mock-gl suite
- `Fx.restoreFxState` restores FUNC_ADD / depthMask(true) / disable(BLEND) after the FX block every frame; a leaked false depthMask would break the next frame's depth clear (T-2-06)
- Context is now `{ alpha: false, antialias: true, preserveDrawingBuffer: true }` at the single webgl getContext site, with the gamma stance locked in a comment (naive 8-bit gamma-space math IS the target — no sRGB, no tonemap); clear is opaque `clearColor(0, 0, 0, 1)`
- FX fragment shader replaced the `uAdd` guess with TFX-MODULATE shape: `tex × uLayerColor × uMaterialColor` multiplied in-shader BEFORE blending so decoded overbright values (2.0) survive; `uCutoff` discard labeled INFERRED (GS TEST-register alpha test is not in MAT records — Phase 5's GS dump reads the real value)
- drawFx passes are fully data-driven: chain uses `matDb.byName.MAT_chainlink` (0x44010080 → usual, depth-write ON — an intentional visual correction; the chain previously had no blending), trail uses `matDb.byName.MAT_swordtrail` (0x48090080 → additive, depth-write OFF — the former hardcoded guess now data-confirmed); zero hardcoded blendFunc/depthMask/uAdd remain
- `window.KratosLab` gained `gl`, `fxLog` (per-pass `{name, mode, depthWrite}` rewritten each drawFx), and `fxState()` (context alpha + blend/depth state sampled between frames) — the checkpoint's console-assertable proof surface

## Task Commits

Each task was committed atomically (TDD RED precedes GREEN for Task 1):

1. **Task 1 (RED): failing mock-gl suite** - `fdf1a85` (test)
2. **Task 1 (GREEN): fx.js MATGL table + index.html ?v=18** - `a352fa8` (feat)
3. **Task 2: alpha:false, MODULATE shader, MatDb-driven drawFx, restore + hooks** - `9c878f1` (feat)
4. **Task 3: human-verify checkpoint** - no commit (verification only); user typed "approved"

## Files Created/Modified

- `tools/kratos-lab/fx.js` - NEW: IIFE + dual-env export guard; internal MATGL table keyed by mode; applyMaterial (full state per pass, depthMask from `!mat.disableDepthWrite`, throw-on-unknown) and restoreFxState; premultiply/ONE,ONE path for future alpha>0x80 FIX cases documented in comments; no top-level gl/DOM access
- `tools/kratos-lab/test/fx.test.js` - NEW: node:assert-only mock gl carrying real WebGL enum values plus recording stubs; asserts exact call sequences per mode, the /Unmapped blend mode/ throw for "strange" and "garbage" (message contains the material name), restoreFxState's calls, and that depthMask derives only from disableDepthWrite
- `tools/kratos-lab/app.js` - alpha:false context + gamma-stance comment; opaque clear; FX shader rewritten to uMaterialColor/uLayerColor/uCutoff (uAdd fully removed incl. comments); drawFx passes wired through Fx.applyMaterial with per-MAT uniforms (chain uCutoff 0.35 INFERRED, trail 0.0); Fx.restoreFxState after the FX block; KratosLab gl/fxLog/fxState hooks
- `tools/kratos-lab/index.html` - fx.js script tag inserted between fxparse.js and app.js; all tags bumped ?v=17 → ?v=18

## Decisions Made

- Kept `subtract` in the table untested-but-present (hero-side MATs like MAT_Csmoke may need it) while `strange` deliberately has no GL path — the throw is the contract, never to be removed
- uCutoff values are per-pass (0.35 chain cutout, 0.0 trail) and the 0.35 is labeled INFERRED in-code per the data-first rule; Phase 5's GS dump supersedes it
- fxLog is rewritten (length = 0) at the top of each drawFx rather than accumulating — gives the checkpoint a clean per-frame snapshot without mid-frame GL reads

## Deviations from Plan

None - plan executed exactly as written.

## Checkpoint Evidence (Task 3 — approved)

Programmatic verification (orchestrator, on merged master via the browser pane):

- Lab loads clean: "ready — 7,418 verts, 252 clips", zero console errors; blade decoded (996 verts, axis 2)
- Stats card shows `blend tuples: 2 (usual/dw-on ×18, additive/dw-off ×6)`; console.table emitted
- `gl.getContextAttributes().alpha === false`; between-frames `fxState()`: blendEnabled false, depthMask true, blendEquation 32774 (FUNC_ADD) — restore discipline proven both idle AND post-swing
- Mid-combo3A `fxLog`: `[{name:"MAT_chainlink", mode:"usual", depthWrite:true}, {name:"MAT_swordtrail", mode:"additive", depthWrite:false}]` — both passes data-driven
- Both Node suites green post-merge (fx.test.js; wad.test.js: 283 records / 24 MATs / 2 tuples)

Perceptual steps (magenta background test — no tint change; additive stacking saturates toward flat white with no gray haze or halo; chain shows alpha-blended link edges and correct occlusion vs the hero): verified live and APPROVED by the user.

## Issues Encountered

- **Hidden browser tabs receive zero rAF ticks:** a non-displayed tab renders nothing until visible, so checkpoint verification pumped frames deterministically via the `KratosLab.step()` hook instead of waiting on requestAnimationFrame. Wave 3's fixed-timestep accumulator formalizes this pattern. No code impact this plan; worth remembering for any future headless/hidden-pane verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The Fx contract is ready for reuse: Phase 3's chainglow pass and Phase 6's particles call `Fx.applyMaterial` with their own MATs — no new blend plumbing needed
- REND-01 invariants (opaque canvas, MODULATE math, clamped-LDR saturation, per-frame restore) are locked before any visual tuning begins
- A later phase hitting the `Unmapped blend mode` throw (e.g. a subtract or strange hero-side MAT) is designed behavior: add the mapping/table entry, keep the assert
- Phase 5's GS dump replaces the INFERRED uCutoff 0.35 with the real TEST-register value

## Self-Check: PASSED

- All 5 claimed files exist (4 code + this SUMMARY)
- All 3 task commits present in git log (fdf1a85, a352fa8, 9c878f1)
- TDD gate sequence verified in git log: test(02-02) `fdf1a85` precedes feat(02-02) `a352fa8`
- `node tools/kratos-lab/test/fx.test.js && node tools/kratos-lab/test/wad.test.js` exits 0

---
*Phase: 02-wad-mat-decode-render-pass-foundation*
*Completed: 2026-07-25*
