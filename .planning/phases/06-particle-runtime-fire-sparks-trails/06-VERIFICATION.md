---
phase: 06-particle-runtime-fire-sparks-trails
verified: 2026-07-26T09:54:27Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
mvp_mode: true
mvp_note: >
  ROADMAP phase goal is in technical form, not "As a…, I want…, so that…" User Story
  format, so gsd-sdk user-story.validate returns false. However plan 06-01 <phase_goal>
  DOES carry a well-formed MVP User Story, so a high-quality User Flow Coverage section
  was produced from it rather than refusing to verify. Recommend reconciling the ROADMAP
  goal text via /gsd mvp-phase 6 (or accept the technical-goal form via override). This is
  a documentation-format nit — it does NOT affect goal achievement (5/5 verified).
deferred:
  - truth: "The lab reads 80–90% identical to GoW1 footage in motion (the MVP user-story OUTCOME clause / perceptual fidelity bar)"
    addressed_in: "Phase 7"
    evidence: "ROADMAP Phase 7 'Side-by-Side Validation & Inferred Tuning' — '80–90% in-motion verdict'; REQUIREMENTS VAL-02 → Phase 7. 06-VALIDATION.md Manual-Only row explicitly defers the perceptual judgment to the Phase-7 A-B harness."
human_verification: []
---

# Phase 6: Particle Runtime — Fire, Sparks & Trails — Verification Report

**Phase Goal:** Blade fire, impact sparks, swing trails, state-dependent chain glow, and blade lights all render from decoded values on the locked Phase-2 pass architecture
**Verified:** 2026-07-26T09:54:27Z
**Status:** passed
**Re-verification:** No — initial verification

## User Flow Coverage (MVP mode)

User story (plan 06-01 `<phase_goal>`): «As a viewer watching a Level-1 Blades-of-Chaos attack in kratos-lab, I want to see fire, sparks, and trails that behave like the real game's world-space particles (fire lagging a whipping blade, trails riding the tip arc, glow flaring on attacks), so that the lab reads 80–90% identical to GoW1 footage.»

| Step | Expected (user-visible) | Evidence in codebase | Status |
|------|-------------------------|----------------------|--------|
| Watch a light combo | Both flame layers (flame3+flame6) burn on each blade, hugging then LAGGING a whipping blade | `app.js:1696-1717` spawn per attacking tick via `Particles.spawnAnchor(bladeSim[key].mat, sys.matrix)` sampled ONCE, then `fxPool.integrate` advects in world space; blade-lag pinned by `particles.test.js` (d) divergence≥49 | ✓ |
| Land a hit | Sparks erupt off the blade as stretched streaks | `app.js:1614-1636` hit-edge burst on `machine.st.hits !== prevHits`; `uStretch>0` velocity-aligned quad in `poolProg` VS (`app.js:566-575`) | ✓ |
| Swing | A crimson/white-hot trail rides the tip arc and fades fast | `app.js:1120-1157` swordtrail sheet, runtime `Particles.rampColor` ramp + `variantFor` BFT/BGT tint, additive+depth-off via `Fx.applyMaterial` | ✓ |
| Attack vs rest | Chain glow is dark at rest, flares hot during the swing | `app.js:1095-1113` `Particles.glowGain(isIdle,{rest,hot})` + alpha-over-1.0 premult branch (`fxProg` fragment `app.js:497-501`) | ✓ |
| Any lit frame | Warm amber light pools on the blades from the game's own values | `app.js:646-657,1239-1249` decoded `parseLight` values → uniforms, Lambert+range atten in mesh FS (`app.js:217-240`) | ✓ |
| **Outcome** | "80–90% identical to GoW1 footage" — perceptual verdict | **Deferred to Phase 7 (VAL-02)** — machinery present & functional (runtime smoke: pool 356–384 in combos, maxBrightness>255, 0 GL errors); the subjective bar is Phase-7's harness | ⏭ Deferred |

## Goal Achievement

### Observable Truths (5 ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | **FIRE-01** flame3+flame6 layered per blade, world-space (fire LAGS a whipping blade), real decoded color | ✓ VERIFIED | `fireBindings` join by shapeRef NAME resolves 2 level-1 systems (independent WAD spot-check: `FXC_BDEsparkemit→PTC_flame6/flame6Shape`, `FXC_BDEsparkemit.0→PTC_flame3/flame3Shape`); spawn samples `spawnAnchor` ONCE then decouples (`app.js:1696-1717`); blade-lag divergence known-answer (`particles.test.js` (d)); color = decoded `MAT_pticleMat.blendColor` `[2,2,2,1]` tag=real |
| 2 | **FIRE-02** impact sparks on hit edge (`st.hits`), decoded rate/velocity/color, velocity-aligned stretched billboards | ✓ VERIFIED | Hit-edge `machine.st.hits !== prevHits` gates burst (`app.js:1586,1614`); `sparkFxc` placement matrix real (translation `(0,0.226,-9.172)` spot-check); `uStretch=SPARK_STRETCH` stretch path in `poolProg` VS; `st.hits` is monotonic (`combat.js`, confirmed by review) so `!==` edge is safe |
| 3 | **TRL-01/02** swordtrail tex + runtime crimson tint + white-hot core (INFERRED ramp), additive, fast fade, stepped 60Hz (no spline), dual BFT/BGT on correct moves | ✓ VERIFIED | `MAT_swordtrail` additive via `Fx.applyMaterial` (`app.js:1123-1124`); `Particles.rampColor` INFERRED ramp + `variantFor` BFT/BGT (`app.js:1142-1150`); trail history pushed per SIM tick at `Loop.STEP` (no spline) (`app.js:1638-1642`); BFT/BGT slot pair name-confirmed in `fxdb.test.js:704-753` |
| 4 | **CHAIN-03** glow dark-at-rest / hot-on-attack — INFERRED footage-calibrated rule (no decoded state-gate) + alpha-over-1.0 brightness recovery | ✓ VERIFIED | No decoded state-gate exists (CNG emitter/particle bind present but carries no gate field — `particles.js:162-167`, `fxdb.test.js:746-753`); `Particles.glowGain` INFERRED rule wired (`app.js:1095`); premult brightness>1.0 branch (`fxProg` `app.js:497-501`); `GLOW_REST=0.3`/`GLOW_HOT=1.8` labeled INFERRED |
| 5 | **REND-02** per-blade lights from DECODED Left/RightBladeLight (color 1.0/0.622/0.288, intensity 2.5, range 160), vertex-lit Lambert + range atten, no shadows | ✓ VERIFIED | Independent WAD spot-check: color `[1,0.622,0.288]`, intensity `2.5`, range `160`, anchor `[-0.32,-8,1]`, L≡R true; `parseLight` core values tagged real (`light.test.js` (a)); Lambert+linear atten in mesh FS (`app.js:217-240`), no shadow maps |

**Score:** 5/5 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Perceptual "80–90% identical to footage" verdict (the MVP outcome clause) | Phase 7 | ROADMAP Phase 7 "Side-by-Side Validation & Inferred Tuning — 80–90% in-motion verdict"; REQUIREMENTS VAL-02 → Phase 7; 06-VALIDATION.md defers the subjective judgment to the Phase-7 A-B harness |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tools/kratos-lab/particles.js` | Pure sim: makePool/spawn/integrate/cull, spawnAnchor, stretchAxis, variantFor, glowGain, rampColor, fireBindings | ✓ VERIFIED | 211 lines, zero gl/DOM (pure), dual-env export, consumed by app.js at 8 call sites |
| `tools/kratos-lab/fxparse.js` (`parseLight`) | Decode Left/RightBladeLight real values + size-gate + finite validation | ✓ VERIFIED | Lines 194-240; byte-exact core values, WR-03 finite guard present |
| `tools/kratos-lab/fx.js` (`additivePremult`) | ONE,ONE blend mode + assert-on-unknown; restoreFxState | ✓ VERIFIED | 80 lines; additivePremult maps to `blendFunc(ONE,ONE)`; unmapped modes throw (DEC-01) |
| `tools/kratos-lab/app.js` (drawFx/drawPool/simStep) | Wire fire/spark/trail/glow/light passes on the pass architecture | ✓ VERIFIED | 1838 lines; all FX via `Fx.applyMaterial`, no hardcoded blend/depth; `restoreFxState` at drawFx tail |
| `tools/kratos-lab/test/particles.test.js` | Pure-sim known answers | ✓ VERIFIED | 201 lines, 12 scenario blocks, exits 0 |
| `tools/kratos-lab/test/light.test.js` | parseLight byte-exact known answers | ✓ VERIFIED | 165 lines, asserts real values + real/INFERRED tags, exits 0 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `particles.test.js` | `particles.js` | `require('../particles.js')` | ✓ WIRED | Module resolves; suite green |
| `particles.js spawnAnchor` | decoded FXC matrix translation (12..14) | `xformM(bladeMat, [m12,m13,m14])` | ✓ WIRED | `particles.js:142-144`; fed real `db.fxc[...].matrix` in `app.js:1699,1623` |
| `app.js simStep` | `fxPool` (fire/spark spawn) | `Particles.spawnAnchor` + `fxPool.spawn/burst` | ✓ WIRED | Sampled once at spawn; `fxPool.integrate(STEP)` advects (blade-lag decouple) |
| `app.js drawFx` | `Fx.applyMaterial` | every FX pass (link/glow/trail/pool) | ✓ WIRED | 4+ applyMaterial calls; grep confirms ZERO direct `gl.blendFunc*`/`gl.depthMask` in app.js |
| `app.js` | decoded blade lights | `FxParse.parseLight` → `uLight*` uniforms | ✓ WIRED | Color/range set once, pos/intensity per frame with missing-blade guard |
| `db.meta.colorSource` | fire/spark tint | `drawPool(... tint: db.meta.colorSource.value)` | ✓ WIRED | Real `MAT_pticleMat.blendColor`; load-time fail-loud assert (WR-01) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| Blade point lights | `uLightColorL/R`, `uLightRange*`, `uInt` | `FxParse.parseLight(wadBuf, Left/RightBladeLight)` | Yes — byte-decoded `(1.0,0.622,0.288)/2.5/160`, spot-check confirmed | ✓ FLOWING |
| Fire/spark tint | `tint` → `poolVerts` aColor | `db.meta.colorSource.value` = `MAT_pticleMat.blendColor` `[2,2,2,1]` | Yes — real MAT field, tag=real | ✓ FLOWING |
| Fire particle positions | `fxPool.particles[].pos` | `Particles.spawnAnchor(bladeSim.mat, db.fxc[...].matrix)` | Yes — real decoded FXC translation × live blade matrix | ✓ FLOWING |
| Chain glow gain | `uGlowGain` | `Particles.glowGain(isIdle, {rest,hot})` | INFERRED-by-design (no decoded state-gate exists; labeled) | ✓ FLOWING (INFERRED, correctly labeled) |
| Trail ramp tint | `uRampHot/uRampCool` | `Particles.rampColor` + `variantTint` | INFERRED-by-design (05-04 proved no painted ramp; labeled) | ✓ FLOWING (INFERRED, correctly labeled) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 8 suites green | `node test/{particles,light,fxdb,fx,wad,chain,loop,anm}.test.js` | 8/8 exit 0 | ✓ PASS |
| app.js syntax | `node --check tools/kratos-lab/app.js` | OK | ✓ PASS |
| Fire bindings vs real WAD | node harness `Particles.fireBindings(db)` | 2 level-1 systems (flame6+flame3) | ✓ PASS |
| Blade lights vs real WAD | node harness `parseLight` | color `[1,0.622,0.288]` int 2.5 range 160, L≡R | ✓ PASS |
| Spark FXC placement | node harness `db.fxc.FXC_BDEsparkemit.matrix` | translation `(0,0.226,-9.172)`, present | ✓ PASS |
| Color source provenance | node harness `db.meta.colorSource` | `MAT_pticleMat.blendColor=[2,2,2,1]` tag=real, rampTag=INFERRED | ✓ PASS |
| No hardcoded blend/depth in app.js | grep `gl.(blendFunc\|blendFuncSeparate\|blendEquation\|depthMask)` | NONE (all via fx.js) | ✓ PASS |
| Runtime smoke (orchestrator) | live lab, autoplay + step | 0 console errors; pool 356–384 in combos → 30 idle; maxBrightness>255; fxState clean (no leak) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| FIRE-01 | 06-01, 06-02, 06-05 | Both layered flame systems, decoded color, world-space blade-hug | ✓ SATISFIED | Truth 1 |
| FIRE-02 | 06-01, 06-02, 06-06 | Impact sparks on hit events, decoded rate/velocity/color | ✓ SATISFIED | Truth 2 |
| TRL-01 | 06-01, 06-03, 06-04 | swordtrail tex + runtime tint + white-hot core, additive, 60Hz stepped | ✓ SATISFIED | Truth 3 |
| TRL-02 | 06-01, 06-03, 06-04 | Dual BFT/BGT variants on correct moves | ✓ SATISFIED | Truth 3 |
| CHAIN-03 | 06-01, 06-02, 06-07 | State-dependent glow, INFERRED rule + alpha-over-1.0 | ✓ SATISFIED | Truth 4 |
| REND-02 | 06-02, 06-08 | Decoded per-blade lights, Lambert + range atten, no shadows | ✓ SATISFIED | Truth 5 |

No orphaned requirements — all 6 phase IDs are claimed by plans and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app.js` | 1686 | `TODO(Open Q1)` — promote INFERRED rates to REAL if a future FXC/PTC param decode lands | ℹ️ Info | TODO (not TBD/FIXME/XXX → not a blocker); references tracked Open Q1 data-first upgrade path; correctly labels INFERRED constants |
| `app.js` | 101 | comment "…uses PLACEHOLDER slot 0x0" | ℹ️ Info | Describes decoded data (fire family placeholder slot), not a code stub |

No BLOCKER debt markers (zero TBD/FIXME/XXX across all four modified files). No stubs, no orphaned artifacts, no hardcoded empty data reaching render.

### Disconfirmation Pass (Confirmation Bias Counter)

- **Partially-met requirement?** None among the 5 SCs. The only unmet element is the perceptual "80–90% footage" outcome, which is out of Phase-6 scope (Phase-7 / VAL-02) — recorded as Deferred, not a gap.
- **Test that passes but doesn't test the behavior?** `particles.test.js` (d) proves the pure spawnAnchor/integrate decouple but cannot see whether app.js re-reads the blade during advection. Mitigated by direct code read: `app.js` simStep samples `spawnAnchor` once at spawn and only `fxPool.integrate` advects — the blade is never re-read in the integrate/draw path. Wiring matches the tested contract.
- **Uncovered error path?** `drawPool`'s tint non-finite guard (WR-02) is render-side (needs a GL context) so it has no Node unit test; the shipping WAD tint is finite `[2,2,2,1]` (verified) and the guard degrades gracefully. Acceptable — not a gap.

### Human Verification Required

None as a Phase-6 gate. Rationale:
- The automatable invariants (bindings, spawn/anchor math, decoded values, blend/depth discipline, no state-leak, cadence) are all discharged — by the 8 green suites, my independent WAD spot-check, and the orchestrator's live browser smoke test (0 GL errors, `fxState()` clean, state-gated pool counts, alpha-over-1.0 brightness >255).
- The one genuinely human/perceptual item — "does it read 80–90% like footage?" — is explicitly **Phase-7 (VAL-02)** and is recorded under Deferred, per the phase's own 06-VALIDATION.md Nyquist strategy.

### Gaps Summary

No goal-level gaps. All 5 ROADMAP Success Criteria are verified in the actual code, backed by green test suites, an independent decode of the real weapon WAD, and the orchestrator's runtime smoke test. Data-first labeling is correct throughout: decoded values (blade-light color/intensity/range/anchor, `MAT_pticleMat.blendColor`, FXC placement matrices, shape/emitter bindings, MAT blend modes) are tagged **real**; runtime rates/velocities/lifetimes, the age→color ramp, the glow rule, and the BFT/BGT variant table are labeled **INFERRED** — no fabricated "real" effect color exists (guarded by the `fxdb.test.js` provenance walk, T-05-04). Every FX blend flows through `Fx.applyMaterial` (DEC-01); grep confirms zero hardcoded `gl.blendFunc*`/`gl.depthMask` in app.js, and `drawFx` restores state via `Fx.restoreFxState`. The 06-REVIEW warnings (WR-01/02/03) and info items (IN-01/02) are all resolved and independently confirmed present in the code — none were goal-level; they hardened latent paths on malformed/absent-data inputs the shipping WAD never hits.

### Note (non-blocking): MVP goal-format inconsistency

The ROADMAP Phase-6 goal is written in technical form, so `gsd-sdk user-story.validate` returns `false`, yet the phase is `mode: mvp`. Plan 06-01 `<phase_goal>` does carry a well-formed User Story, which is what the User Flow Coverage section above was built from — so verification quality is unaffected. Recommend reconciling the ROADMAP goal text to the User Story wording via `/gsd mvp-phase 6`, OR accepting the technical-goal form (reasonable for a rendering-engine phase where register/click/see-dashboard framing does not apply) with an override:

```yaml
overrides:
  - must_have: "mode:mvp phase goal in User Story format"
    reason: "Rendering-engine phase; ROADMAP goal is technical, but plan 06-01 carries a proper MVP User Story used for coverage. Traditional user-flow framing does not apply to a WebGL FX pass."
    accepted_by: "{your name}"
    accepted_at: "{ISO timestamp}"
```

---

_Verified: 2026-07-26T09:54:27Z_
_Verifier: Claude (gsd-verifier)_
