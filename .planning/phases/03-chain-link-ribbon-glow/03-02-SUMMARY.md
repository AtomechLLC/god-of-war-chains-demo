---
phase: 03-chain-link-ribbon-glow
plan: 02
subsystem: rendering
tags: [webgl1, gow1, chainglow, additive, txr-decode, wad-sourcing, lequal, tdd, kratos-lab]

# Dependency graph
requires:
  - phase: 02-wad-mat-decode-render-pass-foundation
    provides: "Parsers.resolve (nearest-preceding), Parsers.decodeTexture (PSMT4/8 + CLUT + 0x80 alpha), Fx.applyMaterial + MAT decode (MAT_chainglow additive/depth-write-OFF state), fxLog/fxState restore discipline"
  - phase: 03-chain-link-ribbon-glow
    provides: "03-01 chain.js buildRibbon + drawFx PASS 1 (link ribbon Float32Array upload) whose exact vertex bytes PASS 2 re-draws"
provides:
  - "FxParse.parseTxr — TXR record decode (magic-7 assert + size bound + gfx/pal name reads + verbatim tail flags)"
  - "WAD-sourced chainlinkTex/chainglowTex via the decoded texName -> TXR -> GFX/PAL resolve chain (off hardcoded assets/weapon/GFX_*.bin fetches)"
  - "Parameterized makeTex(src, {wrapS, wrapT, filter}) driven by decoded MAT filter + inferred wrap"
  - "drawFx PASS 2 — chainglow additive/depth-write-OFF overlay sharing PASS 1's exact vertex upload (no re-upload)"
  - "gl.depthFunc(gl.LEQUAL) coplanar-overlay depth (GS ZTST=2 GEQUAL analog)"
affects: [04-chain-motion, 05-fx-record-decode, 06-particle-runtime, 07-side-by-side-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TXR decode inside the FxParse IIFE reusing readName + the buildMats size-bound-then-magic fail-loud pattern"
    - "WAD-sourced FX texture: mat.texName -> record idx (find by off) -> Parsers.resolve TXR -> parseTxr gfx/pal names -> Parsers.resolve -> decodeTexture -> makeTex; no new fetch (reads already-loaded wadBuf)"
    - "Two-pass coplanar draw: one Float32Array uploaded once (PASS 1), re-drawn additively (PASS 2) under depthFunc(LEQUAL) with depth-write OFF — bit-identical depth, no re-upload"
    - "Identity MAT colors (materialColor [1,1,1], blendColor [1,1,1,1]) pass texels through the MODULATE shader — no hand-picked glow color constant"

key-files:
  created: []
  modified:
    - "tools/kratos-lab/fxparse.js"
    - "tools/kratos-lab/test/wad.test.js"
    - "tools/kratos-lab/app.js"
    - "tools/kratos-lab/index.html"

key-decisions:
  - "CHAIN-02 functionally delivered + automated-verified; footage-fidelity of the FX (glow intensity, trail richness) INTENTIONALLY DEFERRED to the fast-tracked particle/fire work (roadmap Phases 5 decode + 6 render) by explicit user decision — NOT claimed as visually matching footage"
  - "chainglow wrap = CLAMP_TO_EDGE both axes labeled INFERRED (A2): single hot blob at strip start; REPEAT would re-tile it every 16 links"
  - "gl.depthFunc(gl.LEQUAL) — GS ZTST=2 GEQUAL passes equal depths [CITED: ps2tek]; that GoW1 uses ZTST=2 for these draws is [ASSUMED] until the Phase-5 GS dump (A1); LEQUAL is the GL-convention analog the coplanar glow overlay requires regardless"

patterns-established:
  - "Pattern: WAD-sourced FX texture load via decoded texName -> TXR -> GFX/PAL, reading only wadBuf slices (no widened fetch)"
  - "Pattern: coplanar additive overlay sharing an already-uploaded vertex buffer under depthFunc(LEQUAL) with depth-write OFF"

requirements-completed: [CHAIN-01, CHAIN-02]  # CHAIN-01 was already complete in 03-01; this plan re-pins its pixel ground truth via the chainlink texture known-answer. CHAIN-02 completed here.

# Metrics
duration: ~9min (Tasks 1-2 implementation); combined chain+glow checkpoint reviewed live with user
completed: 2026-07-25
---

# Phase 3 Plan 02: Chainglow Additive Overlay + WAD-Sourced Chain Textures Summary

**Added FxParse.parseTxr (TXR decode) and moved both chain textures onto the decoded texName -> TXR -> GFX/PAL WAD resolve chain, then wired a chainglow additive/depth-write-OFF overlay (drawFx PASS 2) that re-draws PASS 1's exact vertex bytes made visible over the depth-writing links by depthFunc(LEQUAL) — CHAIN-02's heat-ramp overlay renders the decoded hot-yellow core straight from the texture (identity MAT colors); functionally verified by automation, with FX footage-fidelity (glow intensity, trail richness) intentionally deferred to the fast-tracked particle/fire work.**

## Performance

- **Duration:** ~9 min implementation (Tasks 1-2); combined chain+glow checkpoint reviewed live with the user
- **Started:** 2026-07-25 (Wave 2 execution)
- **Completed:** 2026-07-25 (continuation — SUMMARY + tracking past the blocking human-verify checkpoint)
- **Tasks:** 2 of 3 executed (Task 3 is a blocking human-verify checkpoint — resolved, see Checkpoint Resolution)
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments

- **FxParse.parseTxr** — TXR record decode inside the FxParse IIFE: `rec.size >= 0x58` bound then u32 magic `=== 7` (both throwing a named error, copying the buildMats fail-loud pattern), `gfxName`/`palName` NUL-terminated reads (via the existing `readName`) at +0x04 / +0x1c, and the u16 tail flags at +0x56 recorded VERBATIM with a comment marking them UNKNOWN and never acted on (Open Q2). Added to the FxParse export object.
- **WAD-sourced chain textures** — new load-stage helper `fxTexFromMat(mat, {wrapS, wrapT})`: finds the MAT record idx (`wadRecords.find(r => r.off === mat.off).idx`), `Parsers.resolve` the `mat.texName` TXR (named throw on null), `parseTxr` the gfx/pal names, `Parsers.resolve` + `Parsers.decodeTexture` on size-bounded `wadBuf.subarray` slices, returns `makeTex(img, {wrapS, wrapT, filter: mat.filter})`. `chainlinkTex` (REPEAT-S / CLAMP-T) and `chainglowTex` (CLAMP / CLAMP, INFERRED) replace the old hardcoded `assets/weapon/GFX_*.bin` fetch + `chainTex`. No new fetch path — reads only the already-loaded `wadBuf`; public-build fail-safe regex left intact.
- **Parameterized makeTex** — `makeTex(src, {wrapS, wrapT, filter})` with LINEAR/REPEAT-S/CLAMP-T defaults preserved so `bladeTex`/`trailTex` are byte-for-byte unchanged; `filter` maps `"linear"` -> LINEAR else NEAREST; no mipmaps ever (CLAUDE.md).
- **drawFx PASS 2 (chainglow overlay)** — the chain verts convert to a `Float32Array` ONCE before PASS 1; PASS 1 uploads it (bufferData), PASS 2 re-`drawArrays` the SAME array with NO re-upload. PASS 2 = `Fx.applyMaterial(matDb.byName.MAT_chainglow)` (additive, depth-write OFF from decoded MAT), identity `uMaterialColor`/`uLayerColor`, `uCutoff 0.0` (glow alpha ≡ 1; additive needs no cutout), binds `chainglowTex`, pushes the glow `fxLog` entry. Draw order links -> glow -> trail; `Fx.restoreFxState(gl)` still closes the FX block.
- **depthFunc(LEQUAL)** — set once at GL init (exactly one occurrence) so the coplanar glow overlay is not rejected by the default `LESS` wherever links wrote depth.
- **RED-first TDD** — wad.test.js TXR + chain-texture known-answers written first (RED: `parseTxr is not a function`), then Task 2 made them GREEN; all four Node suites (wad, fx, loop, chain) exit 0.
- **index.html lockstep** — Task 2 bumped all cache-busters ?v=21 -> ?v=22; the subsequent tooling commit (672e5de) bumped them again to ?v=23 (current: 8 tags at v23, 0 at v22).

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — parseTxr + TXR & chain-texture known-answers in wad.test.js** — `9f25b60` (test)
2. **Task 2: GREEN + wire — parseTxr, WAD-sourced textures, chainglow PASS 2, LEQUAL** — `355ff13` (feat)
3. **Task 3: Human-verify checkpoint (blocking)** — NOT a commit; resolved (see Checkpoint Resolution)

**Interim STATE marker (not a plan task):** `e4ab96f` — `docs(03-02): note pause at Task 3 blocking human-verify checkpoint`.

**Related tooling (committed during the combined checkpoint review, NOT plan tasks):** `05fbb8d` — autoplay + FX-isolation inspection toggles (`KratosLab.autoplay`, `window.__fxOnly`, `window.__fxBright`); `672e5de` — on-screen Autoplay + FX-only buttons (?v bumped to 23).

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

_TDD note: Task 1 = RED (test), Task 2 = GREEN (feat). No separate refactor commit was needed._

## Files Created/Modified

- `tools/kratos-lab/fxparse.js` — **modified.** Added `parseTxr(buf, rec)` (magic-7 assert + size bound + gfx/pal reads + verbatim tail flags) inside the FxParse IIFE; added `parseTxr` to the export object.
- `tools/kratos-lab/test/wad.test.js` — **modified.** ImageData shim (`Uint8ClampedArray(w*h*4)`) + parseTxr round-trip known-answers for all three TXRs (chainlink tailFlags 0x0001; chainglow/swordtrail 0x0051), bad-magic + size-bound named throws, MAT_chainglow identity color known-answer, and chainlink (512×32, binary alpha, U-autocorrelation peak at lag 32) + chainglow (512×32, hottest texel (254,229,0)) texture ground truth.
- `tools/kratos-lab/app.js` — **modified.** Parameterized `makeTex`; `fxTexFromMat` load helper; WAD-sourced `chainlinkTex`/`chainglowTex` (old hardcoded `GFX_chainlink.bin` fetch + `chainTex` removed); `gl.depthFunc(gl.LEQUAL)` at GL init; drawFx PASS 2 chainglow additive/depth-write-OFF overlay sharing PASS 1's Float32Array; public-build fail-safe regex intact.
- `tools/kratos-lab/index.html` — **modified.** Cache-busters bumped ?v=21 -> ?v=22 (Task 2); later bumped to ?v=23 by the tooling-button commit.

## Decisions Made

- **CHAIN-02 functionally delivered; footage-fidelity of the FX DEFERRED (user decision).** The automated proof and the CHAIN-02 functional must_haves are MET. But perceptual footage-match of the FX — glow intensity and trail richness — is explicitly deferred to the fast-tracked particle/fire work (roadmap Phases 5 decode + 6 render). This is NOT a claim that the FX visually matches reference footage. See Checkpoint Resolution.
- **chainglow wrap = CLAMP_TO_EDGE both axes is INFERRED (A2).** The decoded glow is a single hot blob near the strip start; REPEAT would re-tile it every 16 links (Pitfall 5). Labeled INFERRED in the source comment.
- **depthFunc(LEQUAL) split citation/assumption.** GS ZTST=2 GEQUAL passing equal depths is [CITED: ps2tek]; that GoW1 uses ZTST=2 for these specific draws is [ASSUMED] until the Phase-5 GS dump (A1). LEQUAL is the GL-convention analog the coplanar overlay requires regardless of that confirmation.

## Checkpoint Resolution (Task 3 — human-verify, blocking)

The Task 3 blocking human-verify checkpoint (the COMBINED chain+glow perceptual check, which also re-confirms the 03-01 links) was worked through **with the user** via a live browser session. Recorded accurately, not overstated:

**Automated proof PASSED:**
- Three-pass FX order confirmed via `KratosLab.fxLog`: MAT_chainlink (usual, depth-write ON) -> MAT_chainglow (additive, depth-write OFF) -> MAT_swordtrail (additive, depth-write OFF).
- The glow renders the decoded hot-yellow core: readback maxRGB ≈ (255, 255, 64), consistent with the decoded hottest texel (254, 229, 0).
- Restore discipline intact (`KratosLab.fxState()`: blendEnabled false, depthMask true between frames).
- `gl.depthFunc(gl.LEQUAL)` present; all four Node suites green; ?v lockstep; public-build fail-safe intact; glow uses identity MAT colors (no hand-picked color).

**CHAIN-02 functional must_haves MET:** additive overlay over the links via LEQUAL, decoded heat-ramp colors, shared vertex bytes (no re-upload), WAD-sourced textures, single CLAMP'd hot spot.

**User feedback (perceptual, vs reference footage):**
- (a) The glow is "VERY subtle — not enough relative to the footage." (It IS visible up close — 245 hot-glow px at idle — but reads faint at gameplay scale.)
- (b) The sword trails "should be thick, rich and full of particles, but we are way off."

**Decision (user, explicit):** Do NOT push Phase 3 further now. FAST-TRACK the particle/fire system (roadmap Phases 5 decode + 6 render) as the real path to the footage look. Phase 3's chain + glow are accepted as the **functional foundation**.

**Bottom line: CHAIN-02 is functionally delivered and automated-verified. Footage-fidelity of the FX (glow intensity, trail richness) is INTENTIONALLY DEFERRED to the fast-tracked particle/fire work — it is NOT claimed as visually matching footage.**

## Verification Status

- **Automated (PASS):** `node tools/kratos-lab/test/wad.test.js && fx.test.js && loop.test.js && chain.test.js` — all four exit 0.
- **TXR + texture known-answers (PASS):** parseTxr round-trips all three TXRs (tail flags 0x0001 / 0x0051); bad-magic + size-bound named throws; chainlink 512×32 binary-alpha with U-autocorrelation peak at lag 32; chainglow 512×32 hottest texel (254,229,0); MAT_chainglow identity materialColor/blendColor.
- **FX order + restore (PASS):** `KratosLab.fxLog` shows the three ordered entries; `KratosLab.fxState()` shows restore discipline intact.
- **Glow color source (PASS):** readback hot core matches decoded texel; identity MAT colors pinned by wad.test.js — no hand-picked glow color.
- **Perceptual footage-fidelity of the FX (DEFERRED — NOT claimed):** glow intensity and trail richness read faint/thin vs footage; by user decision this is deferred to the fast-tracked particle/fire work, not resolved here.

## Deviations from Plan

Plan executed as written for Tasks 1-2 (RED test -> GREEN feat, no code deviations). Task 3 (blocking checkpoint) resolved as "functional PASS + footage-fidelity deferred" rather than a full perceptual approval. The following are real findings carried forward (not lost):

### Carried-Forward Items (fold into the fast-tracked particle/fire work)

**1. [Carried to particle/fire phases] GLOW INTENSITY — GS alpha-over-1.0 is the authentic lever**
- **Found during:** Task 3 combined checkpoint.
- **Issue:** The glow reads ~half as bright as footage. The data-grounded (not hand-tuning) recovery: GS fire effects legally use source alpha up to ~1.99 (0x80 = 1.0). If the decode/blend clamps glow alpha at 1.0 we render at ~half the intended brightness. Shader-premultiply with the raw alpha128 and blend `ONE, ONE` (CLAUDE.md Part 1) is mathematically identical to `Cs·As + Cd` with no 1.0 clamp.
- **Disposition:** Fold into the fire/particle phase. This is a data-grounded intensity recovery, not a hand-picked color/brightness.

**2. [Carried to particle/fire phases] TRAIL RICHNESS — needs the particle system, not the ribbon**
- **Found during:** Task 3 combined checkpoint.
- **Issue:** The current sword trail is a thin ribbon; 03-01's `TRAIL_INNER_T=0.6` tip-bias narrowed it further. GoW1 trails are thick + particle-dense — billboard sparks/embers/flame puffs (CLAUDE.md Part 3), not achievable with the ribbon alone.
- **Disposition:** Owned by the particle runtime. Interim option: widen the ribbon. Not a 03-02 defect.

**3. [Carried to Phase 4] Chain-span spike during fast combos**
- **Found during:** carried from 03-01; still open.
- **Issue:** During fast combos the chain span spikes to ~121u. ROOT CAUSE is the PRE-EXISTING blade-sim (`driveBlade` / `rig.bladePos`) — Phase 4 owns the real chain-motion solver.
- **Disposition:** Carried concern for Phase 4, not a Phase-3 defect.

**4. [Data correction from Task 1] 03-RESEARCH chainglow byte narrative was inaccurate**
- **Found during:** Task 1 (writing the RED texture known-answers).
- **Issue:** The actual decoded chainglow bytes differ from 03-RESEARCH's narrative: the background is additive-black CLUT (1,1,1) not (0,0,0), and the hot blob extends to x=134, not x<80.
- **Fix:** The RED test pins the true byte-exact values. No implementation change — only the RESEARCH doc numbers were inaccurate.
- **Disposition:** Recorded so the true byte values (test-pinned) are authoritative over the RESEARCH prose.

**5. [Tooling added — not plan tasks] Inspection/QA toggles + on-screen buttons**
- **Added:** commits `05fbb8d` (`KratosLab.autoplay` + `window.__fxOnly` + `window.__fxBright`) and `672e5de` (on-screen Autoplay/FX-only buttons; ?v bumped to 23).
- **Disposition:** dev/QA capture aids for the combined visual check and useful for the particle work. Committed separately as `chore`. Recorded here so they are not lost.

---

**Total deviations:** 0 code deviations to Tasks 1-2 (executed as written). 5 findings/carried items recorded (2 fold into the fast-tracked particle/fire work, 1 to Phase 4, 1 data correction, 1 tooling note).
**Impact on plan:** No scope creep. CHAIN-02 functionally delivered + automated-verified as specified; footage-fidelity of the FX deferred by user decision to the fast-tracked particle/fire work.

## Issues Encountered

- **Glow reads subtle / trails read thin at gameplay scale** — surfaced at the combined checkpoint; resolved as a scoping decision (fast-track the particle/fire system) rather than a code fix, with the authentic levers (GS alpha-over-1.0 for glow; billboard particles for trails) recorded for that work. See Checkpoint Resolution + Carried-Forward Items.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **CHAIN-02 functional foundation delivered:** the chainglow additive overlay + WAD-sourced textures + LEQUAL coplanar depth are in place; the pass architecture is ready for state-dependent glow (CHAIN-03) in the particle runtime.
- **Fast-track pivot (user decision):** the next real work is the particle/fire system (roadmap Phases 5 decode + 6 render) — the path to the footage look for glow intensity (GS alpha-over-1.0) and trail richness (billboard particles).
- **Carried to Phase 4:** the fast-combo chain-span spike (pre-existing blade-sim, not a Phase-3 defect).
- **Authoritative data note:** the wad.test.js chainglow known-answers (background CLUT (1,1,1), hot blob to x=134, hottest texel (254,229,0)) supersede the 03-RESEARCH prose.

## Self-Check: PASSED

- Modified files exist and are committed: `tools/kratos-lab/fxparse.js`, `tools/kratos-lab/test/wad.test.js`, `tools/kratos-lab/app.js`, `tools/kratos-lab/index.html`; `03-02-SUMMARY.md` created.
- Task commits exist: `9f25b60` (RED test), `355ff13` (GREEN feat).
- All four Node suites (wad, fx, loop, chain) exit 0; `depthFunc(gl.LEQUAL)` present (1×); `parseTxr` in fxparse.js (3×); old `GFX_chainlink.bin` fetch removed (0×); cache-busters lockstep at ?v=23 (8×).

---
*Phase: 03-chain-link-ribbon-glow*
*Completed: 2026-07-25*
