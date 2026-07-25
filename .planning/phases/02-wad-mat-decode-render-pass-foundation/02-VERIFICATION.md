---
phase: 02-wad-mat-decode-render-pass-foundation
verified: 2026-07-25T08:35:38Z
status: passed
score: 21/21 must-haves verified (4 roadmap success criteria + 17 plan-level truths)
overrides_applied: 0
re_verification: false
---

# Phase 2: WAD/MAT Decode & Render-Pass Foundation — Verification Report

**Phase Goal:** Every FX draw uses its material's real decoded blend/depth state, and the PS2-authentic rendering conventions are locked before any visual tuning happens
**Verified:** 2026-07-25T08:35:38Z
**Status:** passed
**Re-verification:** No — initial verification

Verification stance: adversarial. SUMMARY.md claims were not trusted; every truth below was re-established against the actual codebase, the shipping WAD bytes (independent Node re-decode in this session), the three test suites (run in this session), and git history (all 15 claimed commits confirmed to exist).

## User Flow Coverage (MVP mode)

Phase mode is `mvp`. The ROADMAP `Goal` field is NOT in user-story format (`user-story.validate` → `false`), but all four PLANs carry a 1:1 user-story restatement that DOES validate (`valid: true`):

«As a solo developer building kratos-lab toward footage-grade fidelity, I want to drive every FX draw from its material's real decoded blend/depth state with the PS2-authentic rendering conventions locked, so that no visual tuning ever happens on top of approximated render state.»

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Open the lab | WAD fetched from tracked assets/, decoded live, status reaches "ready" | app.js:67-79 (load stage, fail-loud, required-MAT assert); checkpoint evidence "ready — 7,418 verts, 252 clips" | ✓ |
| See the inventory | Stats card shows the live 2-tuple blend inventory | app.js:112-114 built from `matTuples.map(...)` (no hardcoded "×18"); checkpoint: "blend tuples: 2 (usual/dw-on ×18, additive/dw-off ×6)" | ✓ |
| Swing (J) | Chain draws with decoded MAT_chainlink state, trail with MAT_swordtrail state | app.js:590-617 (both passes via `Fx.applyMaterial`); checkpoint fxLog: `[{MAT_chainlink usual dw:true},{MAT_swordtrail additive dw:false}]` | ✓ |
| Outcome: "no visual tuning on approximated render state" | Zero hardcoded blend/depth state remains; every FX draw is data-driven; conventions locked | grep: 0× `uAdd`, 0× `gl.blendFunc/gl.depthMask/gl.enable(gl.BLEND)` in app.js; fx.js is the ONLY file issuing blend calls; alpha:false, 60Hz tick, native-res toggle all in code | ✓ |

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WAD loads raw in-browser with nearest-preceding-name resolution; level-1/god records with identical names never cross-wire | ✓ VERIFIED | `Parsers.parseWad` (parsers.js:288-311, u16 tag/u16 flags/u32 size/name[24], align16, named overrun throw) + `Parsers.resolve` backward scan (parsers.js:318-324, size>0 && tag 0x1E/0x70 only). wad.test.js:62-90 asserts MSH_BDepoly6Shape resolves to 0x6BC0/768B from the level-1 FXC and 0x13C80/1008B from the god FXC, and TXR/MAT resolution skips 0-byte GroupEnd markers — suite ran green this session. app.js:71-72 fetches/parses at load time in-browser. |
| 2 | Every distinct blend tuple enumerated in one pass; chain/trail draws use real MAT blend/depth state via the single MAT→GL table; unknown tuples assert, never default | ✓ VERIFIED | `FxParse.enumTuples` one-pass inventory (fxparse.js:152-166); independent re-decode this session: 24 MATs → exactly 2 tuples (usual/dw-on ×18, additive/dw-off ×6). fx.js MATGL is the single table; `applyMaterial` throws `Unmapped blend mode '<mode>' in <name>` before touching any GL state (fx.test.js:77-91 asserts calls array empty after throw). drawFx chain pass uses `matDb.byName.MAT_chainlink`, trail uses `MAT_swordtrail` (app.js:594-612); zero hardcoded blendFunc/depthMask/enable(BLEND) anywhere in app.js (grep-confirmed). |
| 3 | Stacked additive layers saturate flat white in clamped LDR gamma; 0x80=1.0 at texture/CLUT/modulate/blend stages; canvas alpha:false; no bloom/tonemap/soft-particles | ✓ VERIFIED | `alpha: false` at the single webgl getContext site (app.js:122); opaque `clearColor(0,0,0,1)` (app.js:356); CLUT `a >= 0x80 ? 255 : a * 2` invariant intact (parsers.js:269); MAT colors 1.0-based pass-through with overbright 2.0 surviving (fxparse.js + wad.test.js:133); TFX-MODULATE shader multiplies tex × uLayerColor × uMaterialColor before blending (app.js:320-333); FBO is 8-bit RGBA/UNSIGNED_BYTE (no float formats, app.js:371); grep for bloom/tonemap/sRGB/soft-particle finds only the gamma-stance comment. Perceptual halves (magenta test no-tint, additive stacking clips to flat white) human-verified and APPROVED at the 02-02 blocking checkpoint. |
| 4 | Simulation runs on a fixed 60Hz accumulator decoupled from rAF; native-res 512×448 render-target toggle works | ✓ VERIFIED | `Loop.makeAccumulator` pure module (loop.js), loop.test.js green this session (600@60Hz, 60@144Hz, 2s stall → exactly 15, 1ms carry lands on call 17); main loop pays 0..n fixed `simStep()` per rAF, render every frame (app.js:963-985); `machine.tick` ×1, inside simStep with fixed STEP. Native-res: 512×448 RGBA FBO + DEPTH_COMPONENT16 + completeness assert (app.js:369-385), dedicated blit program (app.js:388-406), 4:3 letterbox blit (app.js:673-693), N keybind (app.js:896) + setNativeRes/isNativeRes hooks (app.js:1017-1018), default OFF (app.js:364). 60±1 steps/s on real hardware + visible bilinear softening human-verified and APPROVED at the 02-04 phase-closing checkpoint. |

**Score:** 4/4 roadmap success criteria verified

### Plan-Level Truths

| # | Plan | Truth | Status | Evidence |
|---|------|-------|--------|----------|
| 1 | 02-01 | Node known-answer suite proves WAD walk + MAT decode against first-party values | ✓ VERIFIED (with documented deviation) | wad.test.js green: 283 records, 24 MATs, 2 tuples. Deviation: plan pinned "70 tag-0x1E server instances" from 02-RESEARCH; suite asserts the byte-correct 158 total / 120 data-carrying / 88 nonzero-flags — the "70" figure is exactly what the Pitfall-1 u32-tag bug would match, so asserting it would reward the buggy parser. Deviation documented in 02-01-SUMMARY and in the test comments; intent of the truth (known-answer proof) holds. |
| 2 | 02-01 | Level-1/god same-name records resolve to different offsets | ✓ VERIFIED | wad.test.js:67-75 (0x6BC0 vs 0x13C80), passing |
| 3 | 02-01 | Lab shows live blend-tuple inventory in stats card + console.table | ✓ VERIFIED | app.js:78 (console.table), 112-114 (dynamic from enumTuples); checkpoint evidence |
| 4 | 02-01 | All fetches/tests use tracked assets/; public-build error still fires | ✓ VERIFIED | 0× `../../extracted/` in app.js; catch regex `/fetch .*(extracted|assets)/` (app.js:1023); wad.test.js reads assets/ only; `assets/wads/R_WPN0_0.WAD` is git-tracked |
| 5 | 02-02 | Chain state from MAT_chainlink (usual/dw-ON), trail from MAT_swordtrail (additive/dw-OFF); no hardcoded blend in drawFx | ✓ VERIFIED | app.js:594-612; independent decode confirms chainlink usual/dw-on, swordtrail additive/dw-off; grep: zero hardcoded state calls in app.js |
| 6 | 02-02 | Unmapped blend mode throws named error | ✓ VERIFIED | fx.js:50; runtime check this session: `Unmapped blend mode 'strange' in MAT_z` |
| 7 | 02-02 | Page background cannot alter the render (alpha:false) | ✓ VERIFIED | app.js:122; magenta test human-approved at checkpoint |
| 8 | 02-02 | GL state restored after FX block every frame | ✓ VERIFIED | `Fx.restoreFxState(gl)` at app.js:617; fx.test.js:112-120 asserts restore sequence; checkpoint fxState(): blendEnabled false, depthMask true, FUNC_ADD |
| 9 | 02-02 | Additive stacks saturate flat white; no bloom/tonemap/sRGB | ✓ VERIFIED | Human-approved at checkpoint; grep confirms no bloom/tonemap/sRGB code |
| 10 | 02-03 | Sim advances in exact 1/60s steps at any refresh rate | ✓ VERIFIED | loop.test.js 60Hz/144Hz cases green |
| 11 | 02-03 | 2s stall → at most 15 catch-up steps | ✓ VERIFIED | loop.test.js `advance(2.0) === 15`; re-confirmed in-session via direct require |
| 12 | 02-03 | Camera autospin/easing remain wall-clock | ✓ VERIFIED | app.js:635 (`autoSpin) yaw += wallDt`), 647 (dist easing on wallDt), both inside renderFrame |
| 13 | 02-03 | KratosLab.step() deterministic: one fixed sim step + one render | ✓ VERIFIED | app.js:995 |
| 14 | 02-04 | N toggles 512×448 → 4:3 bilinear letterbox; default OFF | ✓ VERIFIED | app.js:364 (`nativeRes = false`), 896 (keybind + exact status strings), 627-693 (FBO wrap + blit); softness/letterbox human-approved |
| 15 | 02-04 | FBO completeness asserted at startup | ✓ VERIFIED | app.js:384 throws "native-res FBO incomplete" |
| 16 | 02-04 | Sim counter 60±1 steps/s with toggle on or off | ✓ VERIFIED | Human-approved at phase-closing checkpoint (5s wall-clock sample on real display) |
| 17 | 02-04 | Blit uses its own trivial program | ✓ VERIFIED | app.js:388-406 dedicated blitProg + static quad; DEPTH_TEST bracketed; viewport restored |

### Required Artifacts

| Artifact | Expected | L1 Exists | L2 Substantive | L3 Wired | Status |
|----------|----------|-----------|----------------|----------|--------|
| `tools/kratos-lab/parsers.js` | parseWad + resolve + export guard | ✓ (330 lines) | ✓ (real walker with bounds checks; CLUT/vertex invariants untouched) | ✓ (required by wad.test.js:15; global used by app.js:71-72) | ✓ VERIFIED |
| `tools/kratos-lab/fxparse.js` | buildMats/decodeFlags/enumTuples, pure decode | ✓ (173 lines) | ✓ (full mat.go layout, WR-01/WR-02 hardening throws, zero DOM/GL refs) | ✓ (app.js:73-74; wad.test.js:16) | ✓ VERIFIED |
| `tools/kratos-lab/fx.js` | applyMaterial mapping table + restoreFxState, throw-on-unknown | ✓ (70 lines) | ✓ (MATGL usual/additive/subtract; strange has no path by design) | ✓ (app.js:595,608,617; fx.test.js:19) | ✓ VERIFIED |
| `tools/kratos-lab/loop.js` | Loop.STEP + makeAccumulator, pure | ✓ (52 lines) | ✓ (stall clamp, negative-dt clamp, epsilon-guarded payout) | ✓ (app.js:963; loop.test.js:11) | ✓ VERIFIED |
| `tools/kratos-lab/test/wad.test.js` | Known-answer suite | ✓ (193 lines) | ✓ (genuine byte-verified assertions incl. u16/u32 guard, marker guard, synthetic throw cases) | ✓ (exits 0 this session) | ✓ VERIFIED |
| `tools/kratos-lab/test/fx.test.js` | Mock-gl exact call sequences + throw | ✓ (123 lines) | ✓ (deepStrictEqual on full call arrays; asserts throw-before-any-GL-call; depthMask-from-flag-only) | ✓ (exits 0 this session) | ✓ VERIFIED |
| `tools/kratos-lab/test/loop.test.js` | Accumulator known answers + CR-01 static guard | ✓ (87 lines) | ✓ (60/144/stall/carry/negative/custom + CR-01 source regression guard) | ✓ (exits 0 this session) | ✓ VERIFIED |
| `tools/kratos-lab/app.js` | WAD stage, MatDb-driven drawFx, sim/render split, FBO toggle, hooks | ✓ (1039 lines) | ✓ (all sections present and non-stub) | ✓ (everything reachable from the load IIFE and rAF loop) | ✓ VERIFIED |
| `tools/kratos-lab/index.html` | Script order parsers→fxparse→fx→loop→anim→combat→app; footer hint | ✓ | ✓ (all tags at ?v=20; footer "press N — native-res 512×448 toggle") | ✓ | ✓ VERIFIED |

### Key Link Verification

Note: `gsd-sdk query verify.key-links` reported false negatives on 8 of 11 links due to tool artifacts (regex patterns double-escaped from YAML; `from` fields like "keydown handler" that are not file paths). Every link below was verified directly in source.

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| app.js | assets/wads/R_WPN0_0.WAD | Parsers.fetchBuf at load | ✓ WIRED | app.js:71 (SDK-confirmed) |
| wad.test.js | parsers.js | Node require | ✓ WIRED | wad.test.js:15 `require("../parsers.js")` |
| app.js | fxparse.js | FxParse.buildMats at load | ✓ WIRED | app.js:73 |
| app.js | fx.js | Fx.applyMaterial per FX pass | ✓ WIRED | app.js:595, 608; restore at 617 |
| app.js | MatDb | byName.MAT_chainlink / MAT_swordtrail → applyMaterial | ✓ WIRED | app.js:594, 607 |
| fx.test.js | fx.js | Node require | ✓ WIRED | fx.test.js:19 |
| app.js | loop.js | Loop.makeAccumulator in main loop | ✓ WIRED | app.js:963 |
| loop.test.js | loop.js | Node require | ✓ WIRED | loop.test.js:11 |
| app.js simStep | combat machine | machine.tick(STEP) inside simStep only | ✓ WIRED | app.js:927; grep -c "machine.tick" app.js → 1 |
| app.js renderFrame | native-res FBO | bindFramebuffer + viewport(512,448) → blit | ✓ WIRED | app.js:629-630 (bind+viewport), 678-690 (blit) |
| keydown handler | native-res toggle | key 'n' | ✓ WIRED | app.js:896 toggles `nativeRes` directly (per plan action text); `setNativeRes` hook at 1017 performs the identical operation for scripts |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| Stats-card tuple line | `matTuples` | `FxParse.enumTuples(matDb.list)` ← `buildMats(parseWad(fetched WAD bytes))` | Yes — independent re-decode of the tracked WAD reproduces 2 tuples ×18/×6 | ✓ FLOWING |
| drawFx chain/trail uniforms | `mat.materialColor` / `mat.blendColor` | Decoded MAT floats from WAD bytes (fxparse.js:93-122) | Yes — e.g. overbright [2,2,2,1] asserted from real bytes | ✓ FLOWING |
| drawFx blend/depth state | `mat.mode` / `mat.disableDepthWrite` | Flags[0] bits 24-27 / bit 19 from WAD bytes | Yes — 0x44010080→usual/dw-on, 0x48090080→additive/dw-off | ✓ FLOWING |
| Rendered pose / chain anchors | `skin.lastWorld` | `rig.computePose` snapshot via `.set(world)` (CR-01 fix, app.js:937-938) | Yes — snapshot, not alias; loop.test.js carries a static-source regression guard | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| WAD known-answer suite | `node tools/kratos-lab/test/wad.test.js` | exit 0; "records=283 serverInstances=120 mats=24 tuples=2" | ✓ PASS |
| MAT→GL table suite | `node tools/kratos-lab/test/fx.test.js` | exit 0; all assertions passed | ✓ PASS |
| Accumulator suite | `node tools/kratos-lab/test/loop.test.js` | exit 0; all known-answer tests passed | ✓ PASS |
| Independent end-to-end decode | Direct `require` of parsers/fxparse/loop/fx against WAD bytes | 283 records / 24 MATs / 2 tuples; chainlink usual dw-on; swordtrail additive dw-off; `advance(2.0)`=15; strange mode throws named error | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist in this repository, and no PLAN/SUMMARY for this phase declares probes. N/A.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| DEC-01 | 02-01, 02-02 | MAT records fully decoded (blend mode bits, depth-write, filtering) and every FX draw uses its material's real blend/depth state via the GS→WebGL blend mapping | ✓ SATISFIED | Full decode incl. filter bit (fxparse.js:41-57, tested); both FX draws take blend/depth state solely from decoded MATs through the single fx.js table; throw-on-unknown enforced. Note: decoded `filter`/`texName` not yet consumed by texture setup (REVIEW IN-01, deferred by design — coincidentally correct today, all FX MATs decode linear) |
| REND-01 | 02-02 | PS2-authentic compositing: clamped LDR gamma additive saturation, 0x80=1.0 conventions, no bloom/tonemap/soft-particles (locked invariant) | ✓ SATISFIED | alpha:false, opaque clear, MODULATE shader, 8-bit FBO, CLUT ×2 rule intact, zero bloom/tonemap/sRGB code; saturation + magenta human-approved |
| REND-03 | 02-03, 02-04 | Fixed 60Hz simulation timestep and native-res (512×448-class) render-target toggle before formal footage comparison | ✓ SATISFIED | Pure tested accumulator wired into the main loop; 512×448 FBO toggle with completeness assert, dedicated blit, N key + hooks; 60±1 human-confirmed |

Orphan check: REQUIREMENTS.md maps exactly DEC-01, REND-01, REND-03 to Phase 2; all three are claimed by plan frontmatter. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers in any phase-modified file | — | — |

Review-sourced residual observations (all ℹ️ Info, dispositioned in 02-REVIEW.md, none blocking phase SCs): IN-01 (decoded filter/texName not yet driving texture state), IN-02 (subtract alpha-channel equation), IN-04 (NaN dt would poison accumulator — unguarded), IN-08 (wad.test.js raw ENOENT without assets/). CR-01 (critical) and WR-01..WR-04 all verified FIXED in code this session: pose snapshot at app.js:937-938 with loop.test.js guard; size throws at fxparse.js:84-85,100-102; layerCount!==1 throw at fxparse.js:109-111; shadowing removed (drawFx destructured `key` used directly, simStep loop uses `trackOff`); rAF loop try/catch routing errors to #status at app.js:971-982.

### Human Verification Required

None outstanding. All perceptual/wall-clock criteria were verified by a human at the two blocking `checkpoint:human-verify` gates during phase execution, with evidence recorded:

- 02-02 checkpoint (APPROVED): stats-card inventory, alpha:false, fxState restore discipline, per-pass fxLog, magenta test (no tint change), additive saturation to flat white, chain occlusion.
- 02-04 checkpoint (APPROVED): 60±1 sim steps/s over 5s on real hardware, bilinear softening + 4:3 letterbox, exact status-line text, toggle-off crispness, all earlier invariants re-confirmed.
- Post-review CR-01 fix: runtime behavior re-verified in-browser (buffer independence + continuous pose through blend window) per orchestrator record.

No `<verify><human-check>` blocks exist on auto tasks in any of the four plans (nothing deferred to end-of-phase UAT).

### Gaps Summary

No gaps. All four roadmap success criteria are observably true in the codebase; all 17 plan-level truths verified; all artifacts pass existence/substance/wiring/data-flow; all key links wired; all three requirements satisfied with no orphans; the review's critical and warning findings are fixed in code with a regression guard.

**Disconfirmation pass (reported per discipline even though verification passed):**
1. *Partially-met item:* DEC-01's decoded `filter`/`texName` are not yet consumed by the render path (makeTex hardcodes LINEAR; textures load from hardcoded GFX/PAL paths) — coincidentally correct today since every FX MAT decodes linear (test-asserted). Tracked as REVIEW IN-01 for a later phase.
2. *Test-vs-stated-behavior:* wad.test.js asserts 158/120/88 for tag-0x1E where plan 02-01's truth said "70" — a documented known-answer correction (the 70 is precisely what the Pitfall-1 u32-tag bug would count; asserting it would reward the buggy parser). Intent of the truth holds; 02-RESEARCH's figure stands corrected.
3. *Uncovered error path:* a NaN `dt` fed to `Loop.advance` would permanently poison the accumulator (REVIEW IN-04, unguarded); unreachable from rAF timestamps in practice.

### Process Notes

- **MVP-mode goal-format discrepancy (ℹ️):** ROADMAP Phase 2 has `Mode: mvp` but its `Goal` field is not in user-story format (validator returns false). All four PLANs carry a valid 1:1 user-story restatement, which this report verified against (User Flow Coverage above). Recommend either reformatting the ROADMAP goal field via `/gsd mvp-phase 2` or clearing the mode flag for this technical-foundation phase, so future tooling doesn't trip on the same mismatch.
- **SDK key-link tool artifacts (ℹ️):** `verify.key-links` double-escapes regex patterns from PLAN YAML (e.g. `require\\(.*parsers` → invalid) and treats prose `from` fields as file paths. All affected links were verified manually; none were actually broken.

---

_Verified: 2026-07-25T08:35:38Z_
_Verifier: Claude (gsd-verifier)_
