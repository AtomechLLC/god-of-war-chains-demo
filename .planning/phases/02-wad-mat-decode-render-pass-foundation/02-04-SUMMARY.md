---
phase: 02-wad-mat-decode-render-pass-foundation
plan: 04
subsystem: rendering
tags: [webgl1, fbo, framebuffer, bilinear-upscale, letterbox, ps2-native-res, blit, 4-3-aspect]

# Dependency graph
requires:
  - phase: 02-wad-mat-decode-render-pass-foundation
    provides: "02-03: renderFrame(wallDt) as the single render entry point (FBO wrap site), KratosLab.simStepCount 60Hz witness for the checkpoint"
  - phase: 02-wad-mat-decode-render-pass-foundation
    provides: "02-01/02-02: MatDb-driven FX passes (MAT_chainlink usual/dw-on, MAT_swordtrail additive/dw-off) verified inside the native target"
provides:
  - Native-res toggle — all passes render into a 512×448 RGBA/UNSIGNED_BYTE FBO (+ DEPTH_COMPONENT16 renderbuffer) blitted to the canvas at 4:3 with bilinear upscale, letterboxed/pillarboxed on black
  - Startup FBO completeness assert — throws "native-res FBO incomplete" instead of silently rendering black (T-2-10)
  - Dedicated trivial blit program + static fullscreen quad; zero coupling to fxProg/hero state, DEPTH_TEST bracketed, viewport restored (T-2-11)
  - "N" keybind + window.KratosLab.setNativeRes(on)/isNativeRes() hooks with status-line feedback; default OFF (full-res inspect)
  - "const NATIVE = { w: 512, h: 448, displayAspect: 4 / 3 }" — the one-constant 4:3 vs 8:7 decision point (RESEARCH Open Q1)
  - Phase-closing human verification — 60±1 sim steps/s on real hardware, native softness/letterbox, all earlier phase invariants re-confirmed
affects: [phase-3 chain geometry, phase-5 GS reconciliation, phase-6 particles, phase-7 comparison harness (consumes setNativeRes)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Presentation pass isolation: the upscale blit has its OWN program/buffer; FX/hero GL state never leaks into it and vice versa"
    - "Display-intent projection: native pass builds persp with NATIVE.displayAspect (4/3 NTSC non-square pixels), never the 512/448 storage aspect"
    - "Fail-loud GL resources: checkFramebufferStatus asserted at startup so a broken target throws a named error, never boots black"

key-files:
  created: []
  modified:
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "4:3 displayAspect as the default presentation of the 512×448 target (RESEARCH A2/Open Q1); 8:7 raw is a one-constant change, revisit when Phase 1 capture stills land"
  - "Toggle defaults OFF — full-res inspect mode stays the daily driver until Phase 7 footage comparisons"

patterns-established:
  - "With native res ON, the canvas (and preserveDrawingBuffer screenshots) contain ONLY the blit result — readPixels-based verification must read after the blit (RESEARCH Pitfall 6)"

requirements-completed: [REND-03]  # second half (native-res toggle); timestep half landed in 02-03

# Metrics
duration: ~8min implementation + human checkpoint session
completed: 2026-07-25
---

# Phase 2 Plan 04: Native-Res Render Target Summary

**Pressing N now renders every pass into a 512×448 GS-storage-resolution FBO and blits it to the canvas at 4:3 with bilinear upscale — the authentic PS2 soft look behind one keybind and one hook — and the phase-closing human checkpoint confirmed it live along with the 60±1 sim rate and every earlier Phase 2 invariant**

## Performance

- **Duration:** ~8 min implementation (Task 1), plus the human verification session (Task 2)
- **Started:** 2026-07-25T07:07:12Z (after 02-03 close)
- **Completed:** 2026-07-25 (checkpoint approved)
- **Tasks:** 2 (1 auto, 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- 512×448 offscreen target lifted verbatim from RESEARCH Pattern 7: `gl.RGBA`/`gl.UNSIGNED_BYTE` color texture (8-bit clamped like the canvas — REND-01 saturation semantics survive; no float formats), LINEAR min+mag for the authentic bilinear softness, CLAMP_TO_EDGE both axes (448 NPOT-on-T is safe with clamp + no mips), DEPTH_COMPONENT16 renderbuffer
- Completeness asserted at startup — `checkFramebufferStatus !== FRAMEBUFFER_COMPLETE` throws `"native-res FBO incomplete"` (T-2-10 mitigated: the lab can never silently boot into a black target; default-OFF adds a second layer)
- Dedicated blit program (own vertex/fragment pair via the existing `shader()` helper, static -1..1 two-triangle quad buffer) — no fxProg reuse, DEPTH_TEST disabled/re-enabled around the quad, viewport restored to canvas size after the blit (T-2-11 mitigated)
- renderFrame wraps all passes when toggled on: FBO bind + `viewport(0,0,512,448)` + clear, projection built with `NATIVE.displayAspect` (4/3 display intent — NOT the 512/448 storage aspect), then null-framebuffer rebind, opaque-black clear (the letterbox bars), and the uScale letterbox/pillarbox blit (`[4/3 ÷ canvasAspect, 1]` or `[1, canvasAspect ÷ 4/3]`)
- Toggle surface: `N` keybind with exact status lines (`native res ON — 512×448 → 4:3 (bilinear)` / `native res OFF — full canvas res`), plus `KratosLab.setNativeRes(on)` and `KratosLab.isNativeRes()` — the contract Phase 7's comparison harness consumes
- The toggled-off path is the pre-existing full-res render, byte-for-byte untouched
- index.html: footer hint `press N — native-res 512×448 toggle`; all cache-busters bumped ?v=19 → ?v=20
- Phase 2 execution closed by human verification of all four phase success criteria (details below)

## Task Commits

1. **Task 1: 512×448 FBO, blit program, N-key toggle** - `2db9a41` (feat)
2. **Task 2: Phase close-out human-verify checkpoint** - no commit (verification only) — **APPROVED** by user

## Files Created/Modified

- `tools/kratos-lab/app.js` - NATIVE const + nativeRes flag (default false), FBO/renderbuffer setup with completeness assert, blit program + quad buffer, renderFrame native-pass wrap + letterbox blit, N keybind, setNativeRes/isNativeRes hooks
- `tools/kratos-lab/index.html` - footer N-keybind hint; script tags ?v=19 → ?v=20

## Checkpoint Evidence (Task 2 — approved)

Programmatic (orchestrator, merged master, live browser):

- Loads clean at v20 with zero console errors — the FBO completeness assert passed at startup
- `setNativeRes(true)` → `isNativeRes() === true`; status reads exactly `native res ON — 512×448 → 4:3 (bilinear)`
- `readPixels` center-row non-black with native ON — the blit path renders, not a black FBO
- Full combo swing inside the native target keeps both data-driven FX passes: MAT_chainlink usual/depth-write-on + MAT_swordtrail additive/depth-write-off
- Toggle off restores `native res OFF — full canvas res` and the crisp full-res path
- Regressions hold: `gl.getContextAttributes().alpha` still false; `simStepCount` exposed; all three Node suites green post-merge

Human (perceptual + wall-clock):

- Visible bilinear softening and 4:3 letterbox/pillarbox framing confirmed
- 60±1 sim steps/sec over 5s wall-clock confirmed on the user's actual display
- User typed "approved" — Phase 2 execution closed

**User note recorded at approval:** trails/particles still lack VFX elements vs real footage — expected at this stage of the roadmap; tracked in `.planning/todos/pending/trail-fidelity-from-footage.md` for Phases 3/5/6.

## Decisions Made

None - followed plan as specified (the 4:3-default and default-OFF choices were plan-specified with RESEARCH provenance, restated in frontmatter for future context).

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — no placeholder values, empty data sources, or unwired components introduced by this plan.

## Threat Flags

None — no new security surface beyond the plan's threat model. T-2-10 (silent black render) and T-2-11 (blit state coupling) mitigated as registered; T-2-12 (server.js) untouched as accepted; zero package installs.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 2 complete:** all four phase success criteria human-verified — (1-2) WAD-decoded MAT state drives every FX draw with the locked blend table, (3) opaque canvas + 0x80 saturation conventions re-confirmed, (4) fixed 60Hz accumulator proven in-browser + working native-res toggle
- Phase 2's locked conventions (blend table, 0x80 rules, alpha:false canvas, 60Hz tick, native-res toggle) are all in code before any Phase 3+ visual work begins
- Phase 7's side-by-side comparison harness has its contract: `KratosLab.setNativeRes(true)` + the 4:3 blit output in the canvas/screenshot buffer
- Open item for Phase 3/5/6 visual passes: trail/particle VFX gap vs footage (user-observed, expected) — `.planning/todos/pending/trail-fidelity-from-footage.md`
- Aspect revisit hook: 4:3 vs 8:7 is one constant (`NATIVE.displayAspect`) — re-evaluate when Phase 1 capture stills land

## Self-Check: PASSED

- Both modified files exist with claimed content: app.js (NATIVE/DEPTH_COMPONENT16/FRAMEBUFFER_COMPLETE assert/setNativeRes/displayAspect-in-persp all grep-confirmed), index.html (footer "native" hint, all script tags at ?v=20)
- Task commit `2db9a41` present in git log (merged to master via 1bae15b)
- All three Node suites green in this worktree: wad (283 records / 24 MATs / 2 tuples), fx, loop
- Checkpoint approval recorded verbatim from orchestrator ("approved")

---
*Phase: 02-wad-mat-decode-render-pass-foundation*
*Completed: 2026-07-25*
