---
phase: 6
slug: particle-runtime-fire-sparks-trails
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-26
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 06-RESEARCH.md § "Validation Architecture". The renderer's pure sim/decode
> math is Node-testable now; the perceptual 80–90%-vs-footage judgment is Phase-7 (VAL-02).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:assert` (zero-dependency — project constraint) |
| **Config file** | none — each `test/*.test.js` is a standalone runnable |
| **Quick run command** | `node tools/kratos-lab/test/particles.test.js` (per-slice pure sim) |
| **Full suite command** | `node tools/kratos-lab/test/fxdb.test.js && node tools/kratos-lab/test/wad.test.js && node tools/kratos-lab/test/fx.test.js && node tools/kratos-lab/test/loop.test.js && node tools/kratos-lab/test/chain.test.js && node tools/kratos-lab/test/anm.test.js && node tools/kratos-lab/test/particles.test.js && node tools/kratos-lab/test/light.test.js` |
| **Estimated runtime** | ~2 seconds (pure Node asserts, no framework) |

*(Baseline confirmed green this session: all six existing suites exit 0.)*

---

## Sampling Rate

- **After every task commit:** Run `node tools/kratos-lab/test/particles.test.js` (or `light.test.js` for the REND-02 slice) — < 1s
- **After every plan wave:** Run the full suite command above — all suites must exit 0
- **Before `/gsd:verify-work`:** Full suite green + the manual magenta / Spector / cadence checks
- **Max feedback latency:** ~2 seconds

---

## Per-Task Verification Map

*(Requirement-level map from 06-RESEARCH.md; the planner refines these into task IDs. Every SC half that can be pure-tested has an automated command; runtime-visual halves are deferred to the Phase-7 harness.)*

| Requirement | Behavior | Test Type | Automated Command | File | Status |
|-------------|----------|-----------|-------------------|------|--------|
| FIRE-01 | flame3/flame6 bind to real PTC by shapeRef; spawn anchor = FXC matrix × blade matrix | unit (pure) | `particles.test.js` (spawn-anchor known-answer) + `fxdb.test.js` | ❌ W0 | ⬜ pending |
| FIRE-01 | Fire lags a moving blade (spawn-decouple divergence after N ticks) | unit (pure) | `particles.test.js` (blade-lag divergence) | ❌ W0 | ⬜ pending |
| FIRE-02 | `st.hits` edge triggers a spark burst; count/velocity from decoded/INFERRED | unit (pure) | `particles.test.js` (hit-edge → burst count) | ❌ W0 | ⬜ pending |
| FIRE-02 | `FXC_BDEsparkemit` is a real `db.fxc` key (subtype 0x3, shapeRef flameNShape) | unit | `fxdb.test.js` (extend) | ⚠️ extend | ⬜ pending |
| TRL-01 | Ribbon extrusion stepped at 60Hz (no spline); age fade monotonic | unit (pure) | `particles.test.js` (row age→alpha ramp) | ❌ W0 | ⬜ pending |
| TRL-01 | Trail material decodes additive + depth-off (`MAT_swordtrail` 0x48090080) | unit | `fx.test.js` / `wad.test.js` (existing) | ✅ | ⬜ pending |
| TRL-02 | Move name → BFT vs BGT selection is deterministic | unit (pure) | `particles.test.js` (variant-select table) | ❌ W0 | ⬜ pending |
| CHAIN-03 | `isIdle()` false ⇒ glow gain HOT, true ⇒ REST (INFERRED rule) | unit (pure) | `particles.test.js` (combat-gate) | ❌ W0 | ⬜ pending |
| CHAIN-03 | `FXC_CNGemit`→`PTC_CNGpart` name-confirmed pair present | unit | `fxdb.test.js` (extend) | ⚠️ extend | ⬜ pending |
| REND-02 | `Left/RightBladeLight` decode to color(1.0,0.622,0.288), intensity 2.5, range 160, anchor(-0.32,-8.0,1.0) | unit | `light.test.js` (byte-exact known-answer) | ❌ W0 | ⬜ pending |
| REND-02 | Range attenuation math: `atten(range)=0`, `atten(0)=1` | unit (pure) | `light.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/kratos-lab/particles.js` — new pure, Node-testable sim module (GL submission stays in `app.js`) so spawn/advect/cull/variant/gate math is testable
- [ ] `tools/kratos-lab/test/particles.test.js` — pure sim known-answers: spawn-anchor transform, Euler advect, cull, blade-lag divergence, hit-edge burst, ramp monotonicity, variant-select, glow-gate (FIRE-01/02, TRL-01/02, CHAIN-03 sim halves)
- [ ] `tools/kratos-lab/test/light.test.js` — `parseLight` byte-exact known-answers for `Left/RightBladeLight` + attenuation math (REND-02) — *or* fold into `fxdb.test.js`
- [ ] Extend `tools/kratos-lab/test/fxdb.test.js` — assert `FXC_BDEsparkemit` key/subtype/shapeRef, `FXC_CNGemit`→`PTC_CNGpart` name-confirmed ref, fire shapeRef-name binding
- [ ] Framework install: none needed (`node:assert` only)

*Existing infra covers MAT/blend decode, WAD access, the 60Hz accumulator, and the ribbon-walker; the gaps above are the new particle/light surface.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Additive passes add over a magenta clear (no wash); no GL state leak | All (visual) | Requires a live GL context + human/Spector inspection | Set magenta clear, run `window.KratosLab.fxState()` clean-check + Spector.js frame capture; confirm no unreset blendEquation/depthMask |
| Same particle count at 60Hz vs 144Hz refresh | All (cadence) | Refresh-rate dependence only visible in a live render loop | `KratosLab.step()` N times at each rate; compare `simStepCount` witness + particle count |
| Perceptual 80–90% match vs reference footage | FIRE/TRL/CHAIN/REND | Subjective, footage-relative — this is Phase-7's job | Deferred to the Phase-7 side-by-side / A-B flicker harness (VAL-02) |

*This phase asserts the automatable invariants (binding, spawn math, decode values, blend/depth state, cadence witness); the full footage judgment is Phase-7.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (particles.js + particles.test.js + light.test.js + fxdb.test.js extension)
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
