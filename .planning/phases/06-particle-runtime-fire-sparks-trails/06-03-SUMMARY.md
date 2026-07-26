---
phase: 06-particle-runtime-fire-sparks-trails
plan: 03
subsystem: ui
tags: [webgl1, swordtrail, ribbon, age-color-ramp, bft-bgt, fragment-shader, drawFx, inferred-tint]

# Dependency graph
requires:
  - phase: 06-particle-runtime-fire-sparks-trails (06-01)
    provides: "Particles.rampColor (INFERRED white-hot->ember stops) + Particles.variantFor (BFT/BGT move table) pure helpers"
  - phase: 05-fx-record-decode (05-04)
    provides: "proof that GFX_swordtrail carries NO painted length-wise ramp -> the age->color ramp MUST be runtime/INFERRED"
provides:
  - "drawFx swordtrail pass: runtime age->color ramp (white-hot core -> ember) applied per-row-age in the fxProg fragment, gated by uTrailRamp"
  - "fxProg fragment: uTrailRamp/uRampHot/uRampCool uniforms + MODULATE-toward-ramp mix (isolated from chain/glow passes)"
  - "per-move BFT (crimson fire) vs BGT (neutral swoosh) trail-variant selection via Particles.variantFor(machine.st.current)"
  - "index.html: particles.js browser <script> tag + lockstep ?v=24 bump (module is browser-consumed as of this wave)"
affects: [06-04 spark riders on the trail arc, 06-05 FxDb-driven passes, Phase-7 footage tuning of the INFERRED ramp/variant tints]

# Tech tracking
tech-stack:
  added: []  # zero deps — vanilla WebGL1 + JS (CLAUDE.md ban), reuses fxProg + MAT_swordtrail
  patterns:
    - "Runtime INFERRED age->color ramp as a gated fragment uniform (uTrailRamp) — no painted-ramp data exists (05-04)"
    - "Per-variant tint traces to the tested-pure Particles.rampColor stops — never a fabricated real color (Pitfall 4)"
    - "Ramp gate isolation: swordtrail-only tint, chain/glow passes upload uTrailRamp=0 (T-06-03-01 no-bleed)"
    - "Decoded-blend-only (DEC-01): zero hardcoded blendFunc/depthMask in app.js; drawFx ends with Fx.restoreFxState"

key-files:
  created: []
  modified:
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "age proxy is the existing per-row vertex alpha (vT.z, 0.85 young/hot -> 0 old/ember); t = clamp(1 - vT.z/0.85, 0, 1) drives mix(uRampHot, uRampCool, t)"
  - "ramp MODULATES the texel (rgb *= mix(...)) — consistent with the existing MODULATE fxProg shader; texel keeps the shape, ramp supplies the tint"
  - "BFT/BGT differ ONLY in an INFERRED per-variant ramp tint (BFT crimson-biased; BGT pulled toward white); both reuse the ONE decoded GFX_swordtrail texture + MAT_swordtrail blend"
  - "Rule-3 deviation: added the particles.js <script> tag now — drawFx consumes Particles.* in the browser this wave, so the module is browser-consumed (contra the plan's 'defer to 06-04' note, which assumed no browser use)"

patterns-established:
  - "Pattern: gated runtime tint uniform (uTrailRamp) that a single fxProg serves across multiple FX passes without state bleed"
  - "Pattern: combat-state -> per-move FX variant selection in drawFx via a pure Particles helper (variantFor)"

requirements-completed: [TRL-01, TRL-02]

# Metrics
duration: 9min
completed: 2026-07-26
---

# Phase 6 Plan 03: Runtime Trail Ramp + BFT/BGT Variant Summary

**The existing swordtrail ribbon now renders a RUNTIME white-hot-core -> ember age->color ramp (INFERRED, driven by the tested-pure Particles.rampColor) and selects a crimson BFT vs neutral BGT tint per move via Particles.variantFor(machine.st.current) — additive + depth-off still sourced only from MAT_swordtrail through Fx.applyMaterial, stepped-60Hz extrusion + TRAIL_INNER_T tip bias untouched, no spline, no hardcoded blendFunc.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-26T08:10:00Z
- **Completed:** 2026-07-26T08:19:00Z
- **Tasks:** 2
- **Files modified:** 2 (app.js, index.html)

## Accomplishments
- **TRL-01 runtime ramp:** the fxProg fragment gained `uTrailRamp`/`uRampHot`/`uRampCool` uniforms; when gated on it mixes the MODULATE texel toward the INFERRED white-hot->ember ramp by per-row age (`vT.z`, the existing alpha proxy). Endpoints come from `Particles.rampColor(0)`/`(1)` — the tested pure function — so no ramp color is fabricated (05-04 proved the texture has no painted ramp).
- **TRL-02 dual variant:** `drawFx` selects `Particles.variantFor(machine.st.current)` -> BFT (crimson fire, red-biased tint) or BGT (neutral swoosh, ramp pulled toward white). Both variants reuse the SAME decoded `GFX_swordtrail` texture + `MAT_swordtrail` blend; only the INFERRED runtime tint differs.
- **Ramp isolation:** the chain (links) and chainglow passes upload `uTrailRamp=0` before drawing, so the swordtrail tint never bleeds into decoded chain/glow texels (T-06-03-01). `drawFx` still ends with `Fx.restoreFxState`.
- **Discipline preserved:** stepped-60Hz `trailHist` extrusion and `TRAIL_INNER_T=0.6` tip-arc bias unchanged (no spline, SC3); zero `gl.blendFunc`/`gl.depthMask` in app.js — every trail draw's blend/depth is decoded via `Fx.applyMaterial` (DEC-01).
- **Browser lockstep:** all `index.html` script `?v=` tags bumped 23->24 and a `particles.js?v=24` tag added (the module is now browser-consumed).

## Task Commits

Each task was committed atomically:

1. **Task 1: Runtime age->color ramp on the swordtrail ribbon (TRL-01)** - `047e870` (feat)
2. **Task 2: Per-move BFT/BGT trail-variant selection (TRL-02) + ?v bump + particles.js tag** - `514f709` (feat)

**Plan metadata:** committed with this SUMMARY + STATE.md + ROADMAP.md + REQUIREMENTS.md.

## Files Created/Modified
- `tools/kratos-lab/app.js` - fxProg fragment: `uTrailRamp`/`uRampHot`/`uRampCool` uniforms + gated MODULATE-toward-ramp mix; fxLocs wired for the 3 uniforms; chain/glow passes set `uTrailRamp=0`; trail pass sets `uTrailRamp=1`, computes the per-move BFT/BGT variant via `Particles.variantFor(machine.st.current)`, and uploads the INFERRED per-variant-tinted `Particles.rampColor(0)/(1)` endpoints.
- `tools/kratos-lab/index.html` - all script `?v=` bumped 23->24 in lockstep; new `<script src="particles.js?v=24">` (after chain.js, before anim/combat/app).

## Decisions Made
- **Age proxy = existing per-row alpha (`vT.z`).** The ribbon already carries `alpha = max(0, 1 - age/TRAIL_AGE) * 0.85` per vertex; `t = clamp(1 - vT.z/0.85, 0, 1)` reuses it as the ramp parameter (young/high-alpha -> hot t=0; old/low-alpha -> ember t=1) with no new attribute.
- **Ramp MODULATES the texel** (`rgb *= mix(uRampHot, uRampCool, t)`) rather than replacing it — consistent with the existing MODULATE fxProg fragment; the decoded texel keeps the ribbon shape/intensity, the runtime ramp only tints it.
- **Variant = tint only, not texture/blend.** BFT keeps red and damps green/blue (crimson); BGT lerps the ramp stops toward white (near-hueless swoosh). Both derive from `Particles.rampColor` — the crimson/neutral distinction never introduces a `real`-tagged effect color (Pitfall 4). Tints are INFERRED, Phase-7 footage-tunable.
- **Single variant per frame** (not per side): the combat state (`machine.st.current`) is global, and the trail pass draws both sides' ribbon verts in one batch, so one variant/ramp upload per frame is consistent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added the `particles.js` browser `<script>` tag**
- **Found during:** Task 2 (variant selection + `?v` bump)
- **Issue:** The plan's Task-2 note said "Do NOT add a particles.js script tag yet (06-04 adds it when the browser first consumes the pool)." But THIS plan's `drawFx` calls `Particles.rampColor(...)` (Task 1) and `Particles.variantFor(machine.st.current)` (Task 2) — both run in the browser every frame. Without a `particles.js` tag, `Particles` is `undefined` in the browser and `drawFx` throws a `ReferenceError` on every frame, rendering the lab (and the whole point of the trail slice) broken. The plan's defer-instruction rested on the assumption that this wave would not consume `Particles` in the browser, which its own action text contradicts. The 06-01 SUMMARY (Next Phase Readiness) also flagged this exact prerequisite: "index.html needs a particles.js?v= script tag added in lockstep when it becomes browser-consumed."
- **Fix:** Added `<script src="particles.js?v=24"></script>` after `chain.js` (particles.js is a dependency-free pure module) and before `app.js`, in lockstep with the `?v=24` bump.
- **Files modified:** tools/kratos-lab/index.html
- **Verification:** `grep -Eq 'app\.js\?v=2[4-9]'` green; no residual `?v=23`; `node --check tools/kratos-lab/app.js` OK; particles.js load order precedes app.js.
- **Committed in:** `514f709` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** The fix is required for the trail to render in the browser at all — without it the phase goal ("a real viewer sees a materially richer, correctly-tinted trail") cannot be met. No scope creep: one `<script>` line, in the same file the plan already bumps. No other plan instruction changed.

## Issues Encountered
None beyond the deviation above. Full node suite (fxdb/wad/fx/loop/chain/anm/particles/light) green before and after; `node --check` on app.js clean; the ramp/variant contracts are exercised by the 06-01 `particles.test.js` (the pure source functions).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The trail substrate now exposes a working, gated runtime ramp + per-move variant; **06-04** adds the D-02 particle pool and spark riders on the same arc (the user's #1 richness lever) — it can layer additive spark billboards over this ribbon and share the already-loaded `particles.js` browser module.
- INFERRED surfaces for Phase-7 footage calibration: the ramp stops (`Particles.RAMP`), the `vT.z/0.85` age-normalization constant, the BFT crimson factors `[1, 0.50, 0.45]`, and the BGT toward-white amounts `(0.15 hot, 0.70 cool)`. All are labeled INFERRED in code.
- `db` (FxDb) is still NOT built in app.js init (06-05 owns that); this slice deliberately uses only the in-WAD `GFX_swordtrail` texture + pure `Particles.*` helpers, so nothing here blocks on it.

## Self-Check: PASSED
- FOUND: .planning/phases/06-particle-runtime-fire-sparks-trails/06-03-SUMMARY.md
- FOUND: tools/kratos-lab/app.js
- FOUND: tools/kratos-lab/index.html
- FOUND commit: 047e870 (Task 1 feat — TRL-01 ramp)
- FOUND commit: 514f709 (Task 2 feat — TRL-02 variant + ?v bump + particles.js tag)
- `node tools/kratos-lab/test/particles.test.js` exits 0; full node suite (fxdb/wad/fx/loop/chain/anm/particles/light) green; `node --check app.js` OK; zero `gl.blendFunc`/`gl.depthMask` in app.js.

---
*Phase: 06-particle-runtime-fire-sparks-trails*
*Completed: 2026-07-26*
