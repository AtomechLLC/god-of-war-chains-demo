---
phase: 03-chain-link-ribbon-glow
plan: 01
subsystem: rendering
tags: [webgl1, gow1, chain, ribbon, geometry, twist, arc-length, tdd, kratos-lab]

# Dependency graph
requires:
  - phase: 02-wad-mat-decode-render-pass-foundation
    provides: "Fx.applyMaterial + MAT decode (MAT_chainlink blend/depth state), FX vertex layout (aP+aT stride-24), fxLog/fxState restore discipline"
provides:
  - "chain.js — pure, Node-testable arc-length link-walker (buildRibbon, LINK_PITCH, LINKS_PER_TILE)"
  - "drawFx PASS 1 rebuilt to consume Chain.buildRibbon (segmented, per-link-twisted ribbon) instead of the squashed flat strip"
  - "KratosLab.chainInfo() world-scale proof hook (per-side link counts / arcLen / pitch)"
  - "Trail tip-arc bias (TRAIL_INNER_T=0.6, INFERRED) at trail row emission"
  - "chain.test.js geometry known-answer suite (pitch, twist perpendicularity, per-link constant axis, u-invariant, square-texel, vertical-curve degenerate guard)"
affects: [03-02-chainglow, 04-chain-motion, 06-particle-runtime]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure IIFE module + dual-env export guard + node:assert known-answer suite (matches loop.js/fx.js pattern)"
    - "Arc-length walker: cumulative s[] over curve points, one link cell per LINK_PITCH, per-link rigid cross-axis (no inter-link bridge)"
    - "Alternating per-link ~90 twist via C = (k%2===0) ? S : N with epsilon degenerate-frame hysteresis"
    - "Single scale constant (LINK_PITCH) drives both pitch and half-width (square-texel invariant RIBBON_WIDTH === LINK_PITCH)"

key-files:
  created:
    - "tools/kratos-lab/chain.js"
    - "tools/kratos-lab/test/chain.test.js"
  modified:
    - "tools/kratos-lab/app.js"
    - "tools/kratos-lab/index.html"

key-decisions:
  - "Perceptual segmented-link verification (Task 3 human-verify) DEFERRED to the post-03-02 combined visual check by explicit user decision — geometry accepted as verified by automated + FX-isolation means"
  - "LINK_PITCH = 0.9 world units labeled INFERRED (A4); on-screen link-count calibration DEFERRED to Phase-1 polish (01-04)"
  - "TRAIL_INNER_T = 0.6 labeled INFERRED (A9, footage analysis) — a footage-fidelity overlap, not a decoded value"

patterns-established:
  - "Pattern: arc-length link-walker with rigid per-link frames, unit-tested via straight + vertical known-answer curves"
  - "Pattern: world-scale proof hook (KratosLab.chainInfo) returning numeric primitives for checkpoint sanity"

requirements-completed: [CHAIN-01]

# Metrics
duration: ~11min (Tasks 1-2 implementation); checkpoint investigation ~40min
completed: 2026-07-25
---

# Phase 3 Plan 01: Chain Link Ribbon Walker Summary

**Replaced the squashed flat-strip chain with a pure, Node-tested arc-length link-walker (chain.js) that places one 32px link per LINK_PITCH with alternating ~90 per-link twist, wired into drawFx PASS 1 with usual/depth-write-ON MAT_chainlink state, plus a KratosLab.chainInfo() proof hook and a tip-arc-biased trail — geometry verified by automation; perceptual read deferred to the 03-02 combined check.**

## Performance

- **Duration:** ~11 min implementation (Tasks 1-2); ~40 min checkpoint investigation with the user
- **Started:** 2026-07-25T17:01:52Z (phase execution begin)
- **Completed:** 2026-07-25 (continuation — SUMMARY + tracking)
- **Tasks:** 2 of 3 executed (Task 3 is a human-verify checkpoint — resolved as DEFERRED, see below)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **chain.js pure link-walker** — arc-length placement at `LINK_PITCH` (0.9u), `nLinks = ceil(arcLen/LINK_PITCH)`, per-link rigid cross-axis with alternating ~90 twist (`C = (k%2===0) ? S : N`), per-link U kept in [0,1] with fractional-tail truncation, epsilon degenerate-frame hysteresis for near-vertical curves, and NO inter-link bridge (2 tris/sub-quad × SUBROWS). Emits the FX aP+aT stride-24 interleave directly. No GL, no DOM, no clock reads.
- **drawFx PASS 1 rewrite** — samples the existing sag curve into `curvePts`, calls `Chain.buildRibbon(curvePts, Chain.LINK_PITCH)`, stashes the result on `bladeSim[key].chain`, and feeds `.verts` into the PASS 1 upload. Dead flat-strip constants removed (`hw=0.14`, `segs`, `reps=len/0.9`, `u: t*reps`). PASS 1 keeps its exact decoded-MAT shape (`Fx.applyMaterial(MAT_chainlink)`, `uCutoff 0.35`, `chainTex`) — zero hardcoded blend/depth.
- **KratosLab.chainInfo() hook** — returns per-side `{linkCount, arcLen, linkPitch, ribbonWidth}` from the stashed buildRibbon results; the checkpoint's world-scale proof surface.
- **Trail tip-arc bias** — inner edge `a` changed from `e.hilt` to `lerp3(e.hilt, e.tip, TRAIL_INNER_T=0.6)`; no color/particle/uv changes, trail history untouched.
- **RED-first TDD** — chain.test.js written first (fails MODULE_NOT_FOUND), then chain.js made it green; all four Node suites (chain, wad, fx, loop) exit 0.
- **index.html lockstep** — added `chain.js?v=21`, bumped all script tags ?v=20 → ?v=21 (8 tags at v21, 0 at v20).

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — chain.test.js geometry known-answer suite** — `3e86495` (test)
2. **Task 2: GREEN + wire — chain.js walker, drawFx PASS 1, chainInfo, trail tip-arc bias** — `7ad2c08` (feat)
3. **Task 3: Human-verify checkpoint** — NOT a commit; resolved as DEFERRED (see Checkpoint Resolution)

**Related tooling (committed during checkpoint diagnosis, not part of the plan's tasks):** `05fbb8d` — `chore(kratos-lab): add autoplay + FX-isolation inspection toggles` (`KratosLab.autoplay(name, gap)`, `window.__fxOnly`, `window.__fxBright`).

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

_TDD note: Task 1 = RED (test), Task 2 = GREEN (feat). No separate refactor commit was needed._

## Files Created/Modified

- `tools/kratos-lab/chain.js` — **created.** Pure IIFE link-walker; exports `buildRibbon`, `LINK_PITCH`, `LINKS_PER_TILE`; dual-env export guard; INFERRED (A4) + "DEFERRED to Phase-1 polish (01-04)" labels present.
- `tools/kratos-lab/test/chain.test.js` — **created.** node:assert known-answer suite: API shape, square-texel invariant, pitch spacing, per-link constant axis, alternating perpendicular twist, u ∈ [0,1], vertical-curve no-NaN degenerate guard, no inter-link bridge.
- `tools/kratos-lab/app.js` — **modified.** drawFx PASS 1 now built from `Chain.buildRibbon`; dead flat-strip constants removed; `TRAIL_INNER_T=0.6` trail tip-arc bias; `KratosLab.chainInfo()` hook.
- `tools/kratos-lab/index.html` — **modified.** `chain.js?v=21` script tag added after loop.js; all cache-busters bumped to ?v=21.

## Decisions Made

- **Perceptual verification DEFERRED (user decision).** The Task 3 human-verify checkpoint's perceptual "segmented-link read" acceptance was deferred to the combined visual check after 03-02 adds the chainglow — 03-02's own Task 3 checkpoint re-confirms the 03-01 links against the glow. Geometry itself was accepted as verified via automated + FX-isolation means (see below). This is a deferral, NOT an independent perceptual approval.
- **LINK_PITCH = 0.9u is INFERRED (A4).** Square-texel derivation (`RIBBON_WIDTH === LINK_PITCH`, both span 32px; ≈4.6 cm/link at ≈5.1 cm/unit). On-screen link-count calibration against Phase-1 measurements is DEFERRED to 01-04 (reference/MEASUREMENTS.md does not exist yet); expected future change is one constant in chain.js.
- **TRAIL_INNER_T = 0.6 is INFERRED (A9).** Footage-analysis overlap from the trail-fidelity todo, not a decoded value — to be re-judged against footage in the combined check.

## Checkpoint Resolution (Task 3 — human-verify, blocking)

The Task 3 human-verify checkpoint was worked through **with the user** (orchestrator + live browser session). Recorded accurately, not overstated:

- The user initially reported "no chain, no golden trail."
- Investigation using `fxLog` + `KratosLab.chainInfo()` + `readPixels` FX-isolation **proved the chain link-walker AND the sword trail render correctly every frame.** Geometry is correct: **4 links at idle (~3u arc); up to ~14 links during a full swing (~12u arc);** the square-texel invariant holds; all four Node suites are green.
- **Root cause of "invisible":** the base chainlink/swordtrail textures decode DARK (brightest FX-only pixel ≈ (110, 80, 33); chain texels ≈ (44, 32, 3)). The heat GLOW that makes the GoW chain visually legible is **Plan 03-02 (chainglow), which is not yet built.** During swings the auto-frame camera also pulls back, shrinking the FX on screen.
- **Decision (user, explicit):** accept 03-01's geometry as verified by automation + FX-isolation inspection, and **DEFER** the perceptual "segmented-link read" verification to the COMBINED check after 03-02 adds the glow.

**Bottom line: geometry verified by automated + FX-isolation means; perceptual human-verify is DEFERRED to the post-03-02 combined visual check by user decision — it was NOT independently approved.**

## Verification Status

- **Automated (PASS):** `node tools/kratos-lab/test/chain.test.js && wad.test.js && fx.test.js && loop.test.js` — all four exit 0.
- **World-scale sanity (PASS):** `KratosLab.chainInfo()` reports sane per-side link counts (≈4 at idle over the short idle arc; up to ~14 during a full swing) consistent with LINK_PITCH 0.9 over CHAIN_LEN 14.
- **FX-isolation readback (PASS):** `readPixels` FX-only capture confirms the chain link-walker and the sword trail both render every frame — the "invisible" report was a brightness/glow issue, not a render/geometry failure.
- **Restore discipline (PASS):** `KratosLab.fxState()` shows blend/depthMask restore intact (carried over from Phase 2 discipline).
- **DEFERRED:** perceptual segmented/twisted read (post-03-02 combined check); on-screen link count vs footage measurement (Phase-1 01-04, one-constant recalibration expected).

## Deviations from Plan

Plan executed as written for Tasks 1-2; Task 3 (checkpoint) resolved as deferred rather than approved. The following are real findings surfaced during the checkpoint investigation and are carried forward (not lost):

### Findings / Carried Concerns

**1. [Carried to Phase 4] Chain-span spike during fast combos**
- **Found during:** Task 3 checkpoint investigation.
- **Issue:** During fast combos the chain span reaches ~121 units / ~135 links, well beyond the expected cap near CHAIN_LEN 14 (~15-16 links).
- **Root cause:** PRE-EXISTING blade-sim (`driveBlade` / `rig.bladePos`) — **UNCHANGED by 03-01.** The real chain-motion solver is owned by Phase 4.
- **Disposition:** Flagged as a carried concern for Phase 4, NOT a 03-01 defect. The walker faithfully renders whatever curve the (pre-existing) blade-sim hands it.

**2. [INFERRED — re-judge vs footage] Trail tip-bias narrows the trail sheet**
- **Found during:** Task 3 checkpoint investigation.
- **Issue:** `TRAIL_INNER_T = 0.6` (INFERRED, A9) narrows the trail sheet, reducing its on-screen footprint; combined with the dark base textures the trail reads subtle until the glow lands.
- **Disposition:** INFERRED value to re-judge against footage in the post-03-02 combined check. Not a defect.

**3. [Dependency, not a bug] Bare chain is dark by design**
- **Found during:** Task 3 checkpoint investigation.
- **Issue:** The chain reads very dark with no glow. The base chainlink texture decodes dark by design; visible legibility depends on the chainglow additive overlay.
- **Disposition:** This is a 03-02 dependency, not a 03-01 bug. The links render correctly.

**4. [Tooling added] Inspection toggles (commit `05fbb8d`)**
- **Found during:** Task 3 checkpoint investigation.
- **Added:** `KratosLab.autoplay(name, gap)` + `window.__fxOnly` + `window.__fxBright` — dev/QA capture aids used to diagnose the above. Useful for the 03-02 combined visual check.
- **Disposition:** Committed separately as `chore` (not a plan task). Recorded here so it is not lost.

---

**Total deviations:** 0 code deviations to Tasks 1-2 (executed as written). 4 findings/carried concerns recorded from the checkpoint investigation.
**Impact on plan:** No scope creep. Geometry delivered and automated-verified as specified; perceptual acceptance deferred to the 03-02 combined check by user decision.

## Issues Encountered

- **"No chain, no golden trail" report** — resolved by investigation (fxLog + chainInfo + FX-isolation readback), which proved correct render/geometry and localized the visibility gap to the not-yet-built glow (03-02) plus dark base textures. See Checkpoint Resolution above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready for 03-02 (chainglow, Wave 2):** chain.js provides the ribbon UVs and per-side buildRibbon results (stashed on `bladeSim[key].chain`) for the additive glow overlay to share; PASS 1 writes depth so the coplanar glow overlay (depthFunc LEQUAL, depth-write off) can layer correctly.
- **Deferred to 03-02 combined check:** the perceptual segmented-link read (03-02 Task 3 re-confirms the 03-01 links against the glow).
- **Carried to Phase 4:** the fast-combo chain-span spike (pre-existing blade-sim, not a walker defect).
- **Carried to Phase 1 (01-04):** LINK_PITCH on-screen link-count calibration vs reference/MEASUREMENTS.md — one-constant recalibration expected.

## Self-Check: PASSED

- Created files exist: `tools/kratos-lab/chain.js`, `tools/kratos-lab/test/chain.test.js`, `03-01-SUMMARY.md`.
- Task commits exist: `3e86495` (RED test), `7ad2c08` (GREEN feat), `05fbb8d` (tooling chore).
- All four Node suites (chain, wad, fx, loop) exit 0.

---
*Phase: 03-chain-link-ribbon-glow*
*Completed: 2026-07-25*
