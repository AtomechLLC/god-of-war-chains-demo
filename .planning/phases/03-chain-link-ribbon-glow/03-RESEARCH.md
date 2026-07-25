# Phase 3: Chain Link Ribbon & Glow - Research

**Researched:** 2026-07-25
**Domain:** WebGL1 ribbon geometry + PS2-authentic two-pass chain rendering, driven by first-party-decoded GoW1 textures/materials
**Confidence:** HIGH (core findings are first-party decodes of the shipping WAD bytes, run this session with the project's own Node-requireable parsers)

## Summary

Every data question this phase depends on was answered first-party this session by decoding the actual asset bytes with `parsers.js`/`fxparse.js` in Node. The chainlink strip is **512×32 PSMT4, exactly 32px-periodic (autocorrelation r=1.000 at lag 32), 16 identical link cells per tile, binary alpha (0 or 255, 45.2% opaque), painted content in rows 6–25** — the "32px/link, 16 links/tile" success criterion is now VERIFIED against pixels, not assumed. The chainglow strip is **512×32 PSMT4, fully opaque (relies on additive black), with a real 15-color black→red→orange→yellow heat ramp (zero blue in every CLUT entry)** — and, critically, it is **not a per-link tile: it is a single elliptical hot spot occupying only x≈2–78 (u ∈ [0, ~0.153]) with the remaining 84% of the strip black**. "No hand-picked glow color" is satisfiable purely by sampling: both MATs carry identity blendColor/materialColor (all 1.0), so texels pass through the locked MODULATE shader unchanged.

The render-state side is already done: Phase 2's `Fx.applyMaterial` covers both passes (MAT_chainlink `0x44010080` = usual + depth-write ON; MAT_chainglow `0x48090080` = additive + depth-write OFF), so this phase adds **zero new blend plumbing** — it is a geometry-and-texture-plumbing phase. The one genuine rendering trap: the glow overlay is coplanar with the link ribbon, and WebGL's default `depthFunc(LESS)` rejects equal-depth fragments — the glow would vanish exactly where links wrote depth. Fix: `gl.depthFunc(gl.LEQUAL)` (also the authentic GS analog — ZTST=2 GEQUAL passes equal depths per ps2tek).

The current flat strip is quantitatively wrong: `reps = len/0.9` tiles the full 16-link texture per 0.9 model units, squashing links ~16× versus square texels. The fix is the **square-texel rule**: 32px of U and 32px of V must map to the same world length, so `LINK_PITCH = RIBBON_WIDTH` — one INFERRED scale constant instead of two independent guesses. Phase-1 measurements (`reference/MEASUREMENTS.md`) do not exist yet, so the link-count-vs-footage check is explicitly DEFERRED (design below in "Interim Validation Design"); interim validation is against the texture's own geometry + world-scale math.

**Primary recommendation:** Build a pure Node-testable `chain.js` link-walker (arc-length placement at `LINK_PITCH`, alternating ~90° per-link cross axis with hard duplicated boundaries, per-link U in [0,1]), draw it twice through the existing `Fx.applyMaterial` (chainlink then chainglow reusing the same vertex buffer), set `depthFunc(LEQUAL)` once, and source both chain textures from the WAD via the decoded `texName` → TXR → GFX/PAL chain (bytes verified identical to the extracted files).

## User Constraints (from phase context & pending todos — no CONTEXT.md exists for this phase)

**Locked by roadmap/success criteria (do not relitigate):**
- Twisted single ribbon is the primary approach; per-link 3D mesh (two half-tori, alternating 90° roll) is ONLY a fallback if footage comparison shows the ribbon reads wrong (CLAUDE.md alternatives table)
- Links at 32px/link, 16 links/tile pitch with visible alpha gaps and alternating per-link ~90° twist
- Link pass = "usual" + depth-write ON; chainglow overlay = additive + depth-write OFF, sharing ribbon UVs
- No hand-picked glow color anywhere — heat-ramp colors come from the decoded texture

**Binding user preferences (from `.planning/todos/pending/trail-fidelity-from-footage.md` + Phase-2 approval note):**
- User verdict on current lab: "trails still look too thin, no particle emitters, seems relatively basic"
- Trail SHAPE changes are fair game in this phase where they overlap ribbon work: tip-arc bias (inner edge toward ~lerp(hilt, tip, 0.6)), age→color from the swordtrail texture if painted in (it is — see Decoded Asset Facts)
- Spark/ember particles along the trail stay Phase 5/6 — do NOT add emitters in this phase
- Educational readability matters (course repo): clear geometry math, named constants, comments citing where data dictates a value

**Deferred (out of this phase's scope):**
- State-dependent glow (dark at rest / hot streak in attacks) = CHAIN-03, Phase 6
- Chain motion (catenary, whip lag) = Phase 4 — this phase renders on the existing sag curve
- Footage link-count cross-check = deferred to Phase-1 polish pass (see Interim Validation Design)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAIN-01 | Chain renders as a ribbon textured with the real chainlink strip at correct link pitch (32px/link, 16 links/tile) with visible alpha gaps and "usual" alpha blending, depth-write on | Texture verified 512×32 with exact 32px periodicity and binary-alpha gaps (first-party decode); MAT_chainlink verified usual/depth-write-ON (0x44010080) and already wired via `Fx.applyMaterial`; square-texel pitch rule + arc-length link-walker + twist-frame pattern below; `chain.js` pure-module architecture with Node tests |
| CHAIN-02 | Chainglow additive overlay pass (depth-write off) shares the ribbon UVs and shows the real heat-ramp colors from the decoded texture | MAT_chainglow verified additive/depth-write-OFF (0x48090080) with identity colors → texels ARE the colors; heat-ramp CLUT documented (black→red→orange→yellow, zero blue); glow blob location (u ∈ [0, ~0.153]) drives the U-anchor-at-pommel + CLAMP recommendation; coplanar-overlay LEQUAL fix; shared-vertex-buffer two-pass draw pattern |
</phase_requirements>

## Project Constraints (from CLAUDE.md — binding)

- **WebGL1, vanilla JS, no build step, no external libraries, no npm runtime deps** — all patterns below are core WebGL1 + hand-rolled JS
- **Data-first**: where the game stores a value, use it; hand-tune only runtime-computed quantities and label them INFERRED in-code
- **Assets load from `extracted/`-derived local paths** (`assets/` after the Phase-2 migration); the WAD is loaded raw in-browser
- **Texture state guidance**: LINEAR when MAT bit 16 set (it is, for all three FX MATs), no mipmaps for FX textures, REPEAT wrap on U for the chainlink strip, CLAMP_TO_EDGE for glow sprites; canvas already `{alpha:false}`
- **Never emulate**: COLCLAMP=0 wrap, dithering, PABE; **never add**: bloom/tonemap/sRGB, mipmaps on FX textures, depth-sorted additive particles, hand-tuned glow colors
- **Performance**: stay ~60fps interactive (this phase adds ~200 quads — trivial)
- **GSD workflow enforcement**: file changes go through GSD commands
- Per-effect blend state comes from decoded MAT bits via the single mapping table — never hardcode blendFunc/depthMask (Phase 2 locked this; reuse `Fx.applyMaterial`)

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Link/ribbon geometry (arc walk, twist, UVs) | New pure module `chain.js` (Node-requireable, no GL/DOM) | app.js `drawFx` (consumes output) | Matches the established purity pattern (fx.js, fxparse.js, loop.js) — geometry math must be Node-testable |
| Blend/depth state per pass | `fx.js Fx.applyMaterial` (existing, unchanged) | — | DEC-01 contract: the ONLY place PS2 blend semantics touch GL |
| MAT/TXR decode | `fxparse.js` (add minimal `parseTxr`) | — | Pure decode layer; TXR layout verified first-party this session |
| Texture pixel decode | `parsers.js decodeTexture` (existing, unchanged) | — | Already handles PSMT4/PSMT8 + CSM1 CLUT + 0x80-alpha rule |
| Texture sourcing (WAD record → GL texture) | app.js load stage | `Parsers.resolve` (existing, tested, currently unused in app) | Starts consuming decoded `texName` per 02-REVIEW IN-01; WAD bytes verified identical to extracted files |
| Pass orchestration & GL state bracket | app.js `drawFx` + `Fx.restoreFxState` | — | Established per-frame restore discipline |
| Trail geometry (tip-arc bias, fair-game overlap) | app.js `drawFx` trail block | — | Small geometry change; no new module needed |
| Verification hooks | `window.KratosLab` (extend) | Node test suites | Established checkpoint proof surface |

## Standard Stack

No packages. The "stack" is the repo's own modules plus core WebGL1 — all verified working this session.

### Core
| Component | Version/State | Purpose | Why Standard |
|-----------|---------------|---------|--------------|
| `tools/kratos-lab/fx.js` | Phase 2, green tests | MAT→GL blend/depth application, per-frame restore | The locked DEC-01 single mapping table; chainglow pass calls it with its own MAT — designed reuse [VERIFIED: 02-02-SUMMARY + read this session] |
| `tools/kratos-lab/fxparse.js` | Phase 2, green tests | MAT decode (mode/depth/filter/texName/colors) | Already decodes everything the two passes need [VERIFIED: run this session] |
| `tools/kratos-lab/parsers.js` | Phase 2, green tests | `parseWad`/`resolve`/`decodeTexture` | `decodeTexture` correctly decoded all three FX textures in Node this session (with an `ImageData` shim) [VERIFIED: run this session] |
| New `tools/kratos-lab/chain.js` | to create | Pure link-walker geometry | Follows the established pure-module + node:assert pattern |
| WebGL1 core (`depthFunc`, `blendFuncSeparate`, DYNAMIC_DRAW buffers) | browser | Rendering | No extensions needed; 512×32 is POT on both axes so REPEAT is legal in WebGL1 |

### Supporting
| Component | State | Purpose | When to Use |
|-----------|-------|---------|-------------|
| `window.KratosLab` hooks | existing | Checkpoint proof surface | Extend with `chainInfo()`; `fxLog` gains the chainglow entry |
| Node test suites (`test/*.test.js`, node:assert, zero deps) | 3 suites green | Machine verification | Add `chain.test.js` + TXR/texture known-answer tests |
| Cache-buster `?v=20` in index.html | current | No-build-step cache control | Bump on every script change (established convention) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Twisted single ribbon (locked primary) | Per-link torus-pair meshes | Pre-authorized fallback ONLY if footage comparison shows the ribbon reads wrong — do not build speculatively |
| Per-link duplicated-row quads in one DYNAMIC_DRAW buffer | Instancing (`ANGLE_instanced_arrays`) | Banned complexity for ~30–60 quads; CLAUDE.md explicitly rejects instancing at this scale |
| Shared vertex buffer for both passes | Rebuilding identical floats for the glow pass | Sharing guarantees bit-identical depth (required for LEQUAL coplanar overlay) and is cheaper |
| WAD-sourced chain textures via texName→TXR→GFX/PAL | Keep hardcoded `assets/weapon/GFX_*.bin` fetches | Bytes are identical (verified), but WAD-sourcing consumes the decoded fields (02-REVIEW IN-01), exercises `resolve()` in production, and is the data-first teaching path |

**Installation:** none — zero-dependency constraint.

## Package Legitimacy Audit

Not applicable — this phase installs **zero external packages** (CLAUDE.md bans npm runtime dependencies; the test suites are node:assert only). No slopcheck run required.

## Decoded Asset Facts (first-party, this session)

All decoded from the shipping bytes with the project's own parsers (Node). These numbers are load-bearing for the plan — cite them in task actions.

### MAT records (from `assets/wads/R_WPN0_0.WAD` via `FxParse.buildMats`) [VERIFIED: first-party decode]

| Field | MAT_chainlink | MAT_chainglow | MAT_swordtrail |
|-------|---------------|---------------|----------------|
| rawFlags0 | `0x44010080` | `0x48090080` | `0x48090080` |
| mode | **usual** | **additive** | additive |
| depth-write | **ON** | **OFF** | OFF |
| filter | linear | linear | linear |
| texName | `TXR_chainlink` | `TXR_chainglow` | `TXR_swordtrail` |
| blendColor | [1,1,1,1] | [1,1,1,1] | [1,1,1,1] |
| materialColor | [1,1,1] | [1,1,1] | [1,1,1] |
| floatUnk | 1 | 1 | 1 |
| gameFlags | 0 (no UV anim, no color anim) | 0 | 0 |
| layerCount | 1 | 1 | 1 |

Implications: (a) both chain passes are already covered by `Fx.applyMaterial` — no new table entries; (b) **identity colors mean the MODULATE shader passes texels through unchanged — every rendered color is literally a texture sample**, which is how "no hand-picked glow color" is satisfied; (c) gameFlags 0 → the game does NOT UV-animate the glow via material animation (any hot-streak motion is CHAIN-03/Phase-5+ territory).

MAT_chainlink, MAT_chainglow, MAT_swordtrail are each unique names in the WAD (the duplicates flagged in 02-REVIEW IN-03 are other MATs; god-tier variants are separately named `MAT_godchainlink` etc.) — `matDb.byName` is safe for this phase. [VERIFIED: record listing this session]

### TXR record layout (first-party; 88 data bytes, 3/3 records consistent) [VERIFIED: hexdump this session]

```
+0x00  u32       = 7 (magic/type)
+0x04  char[24]  GFX record name, NUL-terminated   ("GFX_chainlink")
+0x1C  char[24]  PAL record name, NUL-terminated   ("PAL_chainlink")
+0x34..+0x55     zeros
+0x56  u16       tail flags: 0x0001 (chainlink) / 0x0051 (chainglow, swordtrail) — semantics unknown
```

The tail-flag difference (0x51 on exactly the two additive textures vs 0x01 on the strip) is documented-but-unexplained; do NOT act on it (Open Question Q2). A minimal `parseTxr` needs only the two name reads + the magic assert.

### GFX_chainlink + PAL_chainlink [VERIFIED: first-party decode]

- **512×32, PSMT4 (bpi=4, encoding=1), 16-color CLUT**; extracted `assets/weapon/*.bin` bytes are **byte-identical** to the WAD records (all 6 files checked)
- CLUT: index 0 fully transparent (a_raw=0); 15 opaque dark browns from (1,1,1) to (94,82,68) — the links are near-black metal; the heat comes entirely from the glow pass
- **Alpha is binary**: 0 (8,976 px) or 255 (7,408 px) — 45.2% opaque. The "visible alpha gaps" exist in the pixels
- **U periodicity is exactly 32px** (autocorrelation r=1.000 at lags 32/64/96/128) → **16 identical link cells per 512px tile: the "32px/link, 16 links/tile" criterion is verified against actual pixels**
- Every 32px cell is identical — the alternating-link look must come from geometry (the locked twist), not from painted variation
- V content occupies **rows 6–25 (20px of 32)**; rows 0–5 and 26–31 fully transparent (painted link ≈62.5% of ribbon width, centered)
- In-cell structure: two painted bands — outer bands (rows ~6–12 and ~20–25) with link-ring masses phased at cell edges, middle band (rows ~13–19) with wide link bodies offset by roughly half a pitch; thin full-length rails at rows 10–12 and 20–21 mean **no column is fully transparent** (min column alpha ≈96/255) — gaps are notches, not full breaks

### GFX_chainglow + PAL_chainglow [VERIFIED: first-party decode]

- **512×32, PSMT4, 16-color CLUT — every CLUT entry alpha = 0x80 (fully opaque)**: the glow "transparency" is additive black, not alpha
- **The real heat ramp** (all B=0 — pure fire hues): (1,1,1) → (10,2,0) → (54,6,0) → (90,6,0) → (148,35,0) → (74,39,0)/(112,56,0)/(161,70,0)/(228,76,0) → (159,126,0)/(216,129,0) → (254,123,0) → (255,143,0) → (252,190,0) → **(254,229,0)** hottest. These ARE the "decoded texture's real heat-ramp colors" of the success criterion
- **Structure: a single elliptical hot spot, not a per-link tile.** Luminance spans x≈2–78 (u ∈ [0.004, ~0.153]), full V height (rows 1–30, peak rows 11–18), core centered ≈(x=36, y=15); **everything from x≈80 to 511 (84.4% of the strip) is black** (invisible under additive blending). ~80% of texels are ≤(10,2,0)
- Consequence: with shared ribbon U and CLAMP on the glow sampler, the hot spot lands once, covering roughly the first 2.5 links at the u=0 end of the chain — see Pattern 4

### GFX_swordtrail + PAL_swordtrail (trail-overlap findings) [VERIFIED: first-party decode]

- **64×32, PSMT8 (bpi=8), 256-color CLUT, all alpha 255, 159 unique colors** — amber/gold ramp, max (243,176,18); additive, so black field is invisible
- Structure: near-black except a **sparkly ember edge along the bottom rows 27–31** (row mean RGB rises 2→65 over rows 22–31), **intensifying toward x=63** (column luminance ~1 at x=0 → ~10–15 near x=63)
- **The trail-fidelity todo's hypothesis is CONFIRMED: both the cross-falloff (bright at v=1, the tip edge) and an age ramp along U (brightest at u=1) are painted into the asset.** The lab's current mapping (u = path index, oldest→0 / newest→1; v = 0 hilt-edge → 1 tip-edge) is already the correct orientation — the thin bright tip-arc line IS the texture's content
- The white-hot core + crimson tint from footage are runtime quantities (TRL-01, Phase 6) — do not fake them here

### World-scale context [VERIFIED: first-party mesh decode; conversion ASSUMED]

- Hero mesh bounds: 27.7 × **37.3 (height)** × 8.6 model units; blade long axis **13.3 units**
- At Kratos ≈1.9 m [ASSUMED], 1 unit ≈ 5.1 cm → blade ≈ 68 cm (plausible for the prop — corroborates the conversion)
- Current constants: `CHAIN_LEN = 14` (ribbon slack reference), `hw = 0.14` (ribbon width 0.28), `reps = len/0.9` → **current pitch = 0.9/16 ≈ 0.056 units/link — links are squashed ~16× versus square texels** (each 32×32px cell rendered 0.056 long × 0.28 wide)
- Square-texel rule (Pattern 2) with recommended initial `LINK_PITCH = 0.9` units → ribbon width 0.9 (hw 0.45), **≈15–16 links over CHAIN_LEN 14**, ≈4.6 cm/link real-scale [INFERRED — the one scale constant pending Phase-1 measurement]

## Architecture Patterns

### System Architecture Diagram

```
                     ┌────────────────────────────────────────────────────┐
                     │ Load stage (app.js, once)                          │
 R_WPN0_0.WAD ──────►│ parseWad → buildMats ──► matDb.byName              │
                     │        │                    │ .texName             │
                     │        └── parseTxr ◄───────┘                      │
                     │              │ gfxName/palName                     │
                     │        resolve(records, name) ──► GFX/PAL bytes    │
                     │              │                                     │
                     │        decodeTexture ──► chainlinkTex (REPEAT U)   │
                     │                          chainglowTex (CLAMP U+V)  │
                     └────────────────────────────────────────────────────┘
                                          │
 per rendered frame                       ▼
 skin.lastWorld ──► anchors ──► Chain.buildRibbon(anchor, pommel, sagParams,
 bladeSim[key].mat              LINK_PITCH, twist) ──► {verts, linkCount}
                                          │  (pure chain.js — Node-tested)
                                          ▼
                     ┌────────────────────────────────────────────────────┐
                     │ drawFx (app.js)                                    │
                     │ upload verts once ──► fxBuf                        │
                     │ PASS 1: applyMaterial(MAT_chainlink)  usual, dw ON │
                     │         chainlinkTex, uCutoff 0.35 (INFERRED)      │
                     │ PASS 2: applyMaterial(MAT_chainglow)  add,  dw OFF │
                     │         SAME fxBuf bytes, chainglowTex, uCutoff 0  │
                     │ PASS 3: trail (existing, + tip-arc bias)           │
                     │ restoreFxState                                     │
                     └────────────────────────────────────────────────────┘
                                          │ (depthFunc LEQUAL set once at init)
                                          ▼
                                canvas / native-res FBO (unchanged)
```

Primary use case trace: WAD bytes → decoded MAT/TXR/texture → per-frame curve → link-walker vertices → two materials' passes → framebuffer.

### Recommended Project Structure

```
tools/kratos-lab/
├── chain.js          # NEW — pure link-walker: curve sampling, arc-length walk,
│                     #   twist frames, interleaved vert emission (no GL, no DOM)
├── fxparse.js        # + parseTxr (magic assert + two name reads)
├── app.js            # drawFx: two chain passes; load stage: WAD-sourced chain
│                     #   textures; depthFunc(LEQUAL) at init; KratosLab.chainInfo()
├── fx.js             # UNCHANGED (applyMaterial already covers both modes)
├── index.html        # chain.js script tag + ?v bump (currently v=20)
└── test/
    ├── chain.test.js # NEW — geometry known-answer suite
    └── wad.test.js   # + TXR known-answer + texture-decode known-answer
```

### Pattern 1: Pure link-walker module (`chain.js`)

**What:** All ribbon math in a Node-requireable IIFE with the dual-env export guard — input: two endpoints, sag parameters (or a pre-sampled curve), `LINK_PITCH`, half-width, links-per-tile; output: interleaved Float32Array in the existing fxProg layout (aP xyz + aT u,v,alpha = 6 floats/vert) plus metadata `{linkCount, arcLen}`.
**When to use:** All chain geometry. app.js only computes anchors and uploads.
**Why:** Matches the locked purity pattern (fx.js/loop.js/fxparse.js); makes pitch/twist machine-verifiable in Node — the phase's only automatable success-criterion checks live here. Phase 4 will swap the sag curve for a solver — keep the curve-sampling input generic (array of points) so motion drops in without touching the walker.

### Pattern 2: Square-texel pitch rule (the interim pitch validation)

**What:** 32px of U (one link cell) and 32px of V (full strip height) must map to the same world length: `LINK_PITCH === RIBBON_WIDTH` (= 2·halfWidth). One INFERRED constant controls absolute scale; the texture's own geometry fixes the aspect.
**Why:** It reduces two hand-tuned numbers to one and renders the artist's link art undistorted — verifiable *today* against the decoded texture (both spans are 32px), no footage needed.
**Recommended initial value:** `LINK_PITCH = 0.9` model units (≈4.6 cm/link at the ≈5.1 cm/unit scale; ≈15–16 links over CHAIN_LEN 14 — consistent with the current code's `len/0.9` *tile* term, which appears to have been intended as a per-link term). Label INFERRED in-code with the derivation comment.

### Pattern 3: Arc-length link walk with alternating twist frames

**What:** Sample the sag curve finely (e.g., 64 samples), accumulate cumulative arc length, then place link boundaries every `LINK_PITCH` along the arc. For link k:
- Tangent `T` from the curve; base side axis `S = normalize(cross(T, UP))` with a degenerate guard (Pitfall 2); binormal `N = cross(T, S)`
- Cross axis `C_k = (k % 2 === 0) ? S : N` — the alternating ~90° twist
- Emit each link as its OWN row pair (duplicated boundary rows: the row at arc position k·P appears once with C_{k-1} and once with C_k) — hard orientation steps, rigid links, no smeared interpolation
- Optionally 2 sub-rows within a link (sharing C_k) so the sag curvature doesn't facet
**U mapping:** link k spans `u ∈ [(k mod 16)/16, ((k mod 16)+1)/16]` — because boundary rows are duplicated, no quad ever interpolates across a link boundary, so **U stays in [0,1] forever** (no precision growth, exact REPEAT behavior for free). V: 0→1 across the width; alpha attribute 1.
**Fractional tail:** the last partial link gets proportionally truncated U — put the partial link at the forearm end (see Pattern 4's anchor choice).

### Pattern 4: U anchored at the pommel; glow sampled with CLAMP

**What:** Walk links starting from the **pommel (blade) end** — u=0 at the blade, growing toward the forearm; glow texture bound with `CLAMP_TO_EDGE` on both axes; link texture with `REPEAT` on U.
**Why (data-driven):** The glow texture's single hot spot lives at u ∈ [0, ~0.153]. With shared UVs + CLAMP, it lands exactly once, covering the ~2.5 links nearest the blade — matching footage (the chain is hottest at the burning blades) — and beyond u=1 CLAMP samples the black edge column (invisible additively). REPEAT on the glow would incorrectly repeat the hot spot every 16 links. Pommel-anchoring also keeps link phase stable at the end the eye tracks during swings; length changes shed/grow links at the forearm end. [INFERRED mapping — real colors regardless; Phase 5's GS dump/FXC decode confirms the game's actual glow placement. Label in-code.]

### Pattern 5: Two-pass draw sharing one vertex upload

**What:** Upload the chain vertex array once per frame; draw PASS 1 with `matDb.byName.MAT_chainlink` + chainlinkTex + uCutoff 0.35 (existing INFERRED value), then WITHOUT re-uploading draw PASS 2 with `matDb.byName.MAT_chainglow` + chainglowTex + uCutoff 0.0. `Fx.applyMaterial` handles all state each pass; `Fx.restoreFxState` after the FX block as today.
**Why:** Bit-identical positions → bit-identical depth → the LEQUAL overlay is exact (Pitfall 1). Draw order links → glow → trail (links must write depth before any additive pass; the two additive passes commute mathematically).
**Glow cutoff must be 0.0:** chainglow alpha is constant 1.0 — additive passes need no cutout, and reusing the link cutout would be a silent copy-paste hazard (harmless today since a=1>0.35, but wrong by construction).

### Pattern 6: WAD-sourced FX textures via decoded names (02-REVIEW IN-01)

**What:** At load: `mat.texName` → `Parsers.resolve(records, texName, mat record idx)` → `parseTxr` → gfx/pal names → `resolve` each → `decodeTexture(wadBuf.subarray(r.dataOff, r.dataOff + r.size), palBytes)`. Extend `makeTex(src, {wrapS, wrapT, filter})`; pass `mat.filter` (all three decode "linear").
**Why:** Starts consuming the decoded `filter`/`texName` fields flagged unused in 02-REVIEW; the WAD record bytes are verified byte-identical to the extracted files, so the visual risk is zero. Chainglow has no extracted-file load today anyway — it's a new load either way.

### Pattern 7: Trail tip-arc bias (fair-game overlap)

**What:** In the trail row emission, move the inner edge from the hilt toward the tip: `a = lerp(hilt, tip, TRAIL_INNER_T)` with `TRAIL_INNER_T = 0.6` [INFERRED — from footage analysis in the trail-fidelity todo]. Keep `u = path index` and `v` orientation exactly as-is — the decoded texture confirms the current mapping is correct (bright ember edge at v=1 = tip edge; brightness ramp toward u=1 = newest).
**What NOT to change:** no color code, no added tint (crimson/white-hot core are Phase-6 runtime values), no particles, TRAIL_AGE stays (its footage-measured value is a Phase-1-polish deliverable — at most name the constant and label INFERRED).

### Anti-Patterns to Avoid

- **Screen-space bloom / any post glow** — the glow IS the additive chainglow geometry pass (CLAUDE.md locked)
- **Hardcoding any blend/depth state in drawFx** — everything through `Fx.applyMaterial` (DEC-01)
- **Smooth twist interpolation between links** — links are rigid; shared rows between differently-oriented links produce a twisted-lasagna smear
- **A second "glow color" uniform or tint constant** — identity MAT colors + texture sampling already satisfy the criterion; any added color constant violates it
- **Per-link mesh generation in this phase** — the torus fallback is footage-gated, and footage comparison is deferred
- **Rebuilding the glow vertex array separately** — risks non-identical depth vs the link pass

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Blend/depth state for the new pass | A chainglow-specific GL state block | `Fx.applyMaterial(gl, matDb.byName.MAT_chainglow)` | Already tested; throw-on-unknown contract; zero new mappings needed |
| Texture pixel decoding | Any new GFX/PAL reader | `Parsers.decodeTexture` | Handles PSMT4 nibbles, CSM1 CLUT shuffle, 0x80-alpha doubling — all verified against these exact files this session |
| Record lookup in the WAD | Name→offset tables | `Parsers.resolve` (nearest-preceding, tested) | Implements the gow1 back-reference rule incl. GroupEnd-marker skip |
| Glow colors / heat ramp | Any color constants or gradients | Sample GFX_chainglow texels | The 15-color ramp is in the CLUT; identity MAT colors pass it through |
| Link art / gap shapes | Procedural link drawing | GFX_chainlink texels | The 32px cell with binary-alpha gaps is the game's own art |
| Trail age→color ramp | Vertex-color ramps | GFX_swordtrail's painted U-ramp + V-edge | Confirmed painted-in this session; mapping already correct |

**Key insight:** Phase 2 deliberately built this phase's machinery. Everything except the link-walker geometry (`chain.js`) and ~4 small wiring changes already exists and is tested.

## Common Pitfalls

### Pitfall 1: Coplanar glow overlay silently invisible (depthFunc LESS)
**What goes wrong:** The glow pass renders nothing over the links (only in the gaps), or flickers.
**Why it happens:** Identical geometry → identical depth values; WebGL's default `depthFunc(LESS)` rejects equal depths, and the link pass wrote depth (dw ON).
**How to avoid:** `gl.depthFunc(gl.LEQUAL)` once at init (comment: GS ZTST=2 GEQUAL passes equal depths — [CITED: psi-rockin.github.io/ps2tek] — LEQUAL is the GL-convention analog). Plus Pattern 5's shared-buffer guarantee of bit-identical depth. Hero/blade rendering is unaffected by LEQUAL.
**Warning signs:** Glow visible only between links / at silhouette edges; magenta-test shows glow halo but no on-link heat.

### Pitfall 2: Degenerate twist frame when the chain hangs vertical
**What goes wrong:** The ribbon spins/flips frame-to-frame at rest.
**Why it happens:** `S = cross(T, UP)` vanishes as T → UP (chain draping straight down). The current code's horizontal-perpendicular has the same hole (`cl || 1` guard just hides it).
**How to avoid:** If `|cross(T, UP)| < ε` (e.g., 1e-4), fall back to a fixed world axis (X) — or better, keep the previous frame's S (hysteresis). Unit-test the vertical case in `chain.test.js`.
**Warning signs:** Ribbon shimmer/roll at idle; NaNs in vertex data when anchor ≈ pommel.

### Pitfall 3: Link sliding/popping as chain length changes
**What goes wrong:** Links crawl along the chain or pop in mid-chain during swings.
**Why it happens:** Tiling U by `t × reps` re-distributes the whole texture whenever `len` changes; rounding `reps` changes all links at once.
**How to avoid:** Arc-length walk anchored at the pommel (Pattern 4): link k always sits k pitches from the blade; growth/shrink happens only at the forearm-end fractional link.
**Warning signs:** Texture "conveyor belt" motion visible during slow camera orbit at idle.

### Pitfall 4: Smeared twist (shared boundary rows)
**What goes wrong:** Links look like a continuously twisted lasagna noodle, not rigid alternating links.
**Why it happens:** Sharing one row between link k and k+1 makes GL interpolate the cross-axis 0°→90° across the quad.
**How to avoid:** Duplicate boundary rows per link (Pattern 3). Test: consecutive links' cross axes are perpendicular AND each quad's two rows use the same axis.
**Warning signs:** No thin edge-on links visible; width oscillates smoothly instead of stepping.

### Pitfall 5: Glow wrap mode REPEAT repeats the hot spot
**What goes wrong:** A hot blob appears every 16 links along the whole chain.
**Why it happens:** `makeTex` currently hardcodes REPEAT on S; the glow strip's blob is at u∈[0,~0.153] and the rest is black — REPEAT re-tiles it.
**How to avoid:** Parameterize `makeTex` wrap; glow gets CLAMP_TO_EDGE both axes (CLAUDE.md glow-sprite guidance + blob-at-strip-start data). [INFERRED mapping — flag in-code.]
**Warning signs:** Multiple glow spots on a long taut chain during throws.

### Pitfall 6: mediump precision if U is allowed to grow
**What goes wrong:** Link edges wobble on mediump-fragment GPUs when u reaches tens of tiles.
**Why it happens:** The fxProg fragment shader declares `precision mediump float`; fract() of large u loses sub-link precision.
**How to avoid:** Pattern 3's per-link U already keeps u ∈ [0,1] — preserve that invariant (assert in chain.test.js). No shader change needed.

### Pitfall 7: Forgetting the established bracket discipline
**What goes wrong:** State leaks — glow pass leaves depthMask off for the letterbox blit, or the ?v cache-buster is missed and the browser runs stale modules.
**How to avoid:** Keep the drawFx structure: passes → `Fx.restoreFxState`; bump ALL script tags to ?v=21; `fxLog.push` per pass so the checkpoint can assert three entries (chainlink, chainglow, swordtrail) mid-swing.

### Pitfall 8: Node tests using decodeTexture without an ImageData shim
**What goes wrong:** `ReferenceError: ImageData is not defined` in the new texture known-answer tests.
**How to avoid:** Shim before require (verified working this session):
```js
global.ImageData = class ImageData {
  constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
};
```

## Code Examples

All first-party (this codebase) or core WebGL1; no external sources needed.

### Arc-length link walk with alternating twist (chain.js core)
```js
// Source: designed against tools/kratos-lab/app.js drawFx conventions (aP+aT
// interleave, 6 floats/vert) + decoded GFX_chainlink geometry (32px/link,
// 16 links/tile, content rows 6-25).
const LINKS_PER_TILE = 16;            // 512px tile / 32px link — VERIFIED in texture
// LINK_PITCH: world units per 32px link cell. Square-texel rule ties ribbon
// width to it: RIBBON_WIDTH = LINK_PITCH (both spans are 32px in the asset).
// 0.9 units ≈ 4.6cm at the ≈5.1cm/unit hero scale — INFERRED (Phase-1
// MEASUREMENTS.md will calibrate; see 03-RESEARCH Interim Validation Design).
function buildRibbon(curvePts, linkPitch, out /* array */) {
  const hw = linkPitch / 2;
  // 1) cumulative arc length over the sampled curve
  const s = [0];
  for (let i = 1; i < curvePts.length; i++)
    s.push(s[i - 1] + dist(curvePts[i - 1], curvePts[i]));
  const arcLen = s[s.length - 1];
  const nLinks = Math.ceil(arcLen / linkPitch); // last link may be fractional
  let prevS = null; // frame hysteresis for the vertical-chain degenerate case
  for (let k = 0; k < nLinks; k++) {
    const s0 = k * linkPitch, s1 = Math.min((k + 1) * linkPitch, arcLen);
    const p0 = sampleAt(curvePts, s, s0), p1 = sampleAt(curvePts, s, s1);
    const T = normalize(sub(p1, p0));
    let S = cross(T, UP);
    S = len3(S) < 1e-4 ? (prevS || [1, 0, 0]) : normalize(S); // Pitfall 2
    prevS = S;
    const N = cross(T, S);
    const C = (k % 2 === 0) ? S : N;   // alternating ~90° per-link twist (locked)
    const u0 = (k % LINKS_PER_TILE) / LINKS_PER_TILE;                  // ∈ [0,1)
    const u1 = u0 + ((s1 - s0) / linkPitch) / LINKS_PER_TILE;          // frac tail
    // each link = its OWN row pair (duplicated boundaries — rigid links)
    emitRow(out, p0, C, hw, u0);  // a-edge v=0, b-edge v=1, alpha 1
    emitRow(out, p1, C, hw, u1);
  }
  return { nLinks, arcLen };
}
```

### Two-pass chain draw (app.js drawFx replacement for the chain block)
```js
// PASS 1 — links: real decoded state = usual + depth-write ON (0x44010080)
const matL = matDb.byName.MAT_chainlink;
Fx.applyMaterial(gl, matL);
fxLog.push({ name: matL.name, mode: matL.mode, depthWrite: !matL.disableDepthWrite });
gl.uniform3fv(fxLocs.uMaterialColor, matL.materialColor);
gl.uniform4fv(fxLocs.uLayerColor, matL.blendColor);
gl.uniform1f(fxLocs.uCutoff, 0.35);            // INFERRED (02-RESEARCH A3)
gl.bindTexture(gl.TEXTURE_2D, chainlinkTex);
gl.bufferData(gl.ARRAY_BUFFER, chainVerts, gl.DYNAMIC_DRAW);
gl.drawArrays(gl.TRIANGLES, 0, chainVertCount);

// PASS 2 — glow: SAME vertex bytes (bit-identical depth), additive + dw OFF
// (0x48090080). Requires depthFunc(LEQUAL) — set once at init: GS ZTST=2
// GEQUAL passes equal depths (ps2tek); default GL LESS would reject the
// coplanar overlay wherever pass 1 wrote depth.
const matG = matDb.byName.MAT_chainglow;
Fx.applyMaterial(gl, matG);
fxLog.push({ name: matG.name, mode: matG.mode, depthWrite: !matG.disableDepthWrite });
gl.uniform3fv(fxLocs.uMaterialColor, matG.materialColor);
gl.uniform4fv(fxLocs.uLayerColor, matG.blendColor);
gl.uniform1f(fxLocs.uCutoff, 0.0);             // additive: no cutout (alpha≡1)
gl.bindTexture(gl.TEXTURE_2D, chainglowTex);
gl.drawArrays(gl.TRIANGLES, 0, chainVertCount); // NO re-upload
```

### WAD-sourced texture load via decoded names (app.js load stage)
```js
// Consumes mat.texName + mat.filter (02-REVIEW IN-01). WAD record bytes are
// byte-identical to the extracted assets/weapon files (verified 2026-07-25).
function fxTexFromMat(mat, matRecIdx, { wrapS, wrapT }) {
  const txrRec = Parsers.resolve(wadRecords, mat.texName, matRecIdx);
  const txr = FxParse.parseTxr(wadBuf, txrRec);            // {gfxName, palName}
  const g = Parsers.resolve(wadRecords, txr.gfxName, txrRec.idx);
  const p = Parsers.resolve(wadRecords, txr.palName, txrRec.idx);
  const img = Parsers.decodeTexture(
    wadBuf.subarray(g.dataOff, g.dataOff + g.size),
    wadBuf.subarray(p.dataOff, p.dataOff + p.size));
  return makeTex(img, { wrapS, wrapT, filter: mat.filter }); // "linear" for all 3
}
// chainlink: REPEAT U / CLAMP V (strip);  chainglow: CLAMP both (single blob)
```

### parseTxr (fxparse.js addition)
```js
// TXR record (tag 0x1E, size 88) — layout verified first-party against all 3
// weapon TXRs (2026-07-25): u32 magic=7 @+0, gfx name[24] @+4, pal name[24]
// @+0x1C, zeros, u16 tail flags @+0x56 (0x01 strip / 0x51 additive — UNKNOWN,
// recorded verbatim, never acted on).
function parseTxr(buf, rec) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint32(rec.dataOff, true);
  if (magic !== 7) throw new Error(`TXR ${rec.name}: bad magic 0x${magic.toString(16)}`);
  return {
    gfxName: readName(buf, rec.dataOff + 0x04, 24),
    palName: readName(buf, rec.dataOff + 0x1c, 24),
    tailFlags: dv.getUint16(rec.dataOff + 0x56, true),
  };
}
```

## Interim Validation Design (resolves the Phase-1 dependency gap)

`reference/MEASUREMENTS.md` does not exist (01-04 unexecuted; Phase 1 paused mid-01-03 by user directive). The roadmap criterion "on-screen link count matches Phase-1 measurements" **cannot be checked this phase**. Plans MUST carry the deferred check explicitly — never silently drop it.

**Interim validation (checkable now):**
1. **Texture-geometry check (machine):** 32px/link and 16 links/tile asserted against the decoded texture in a Node known-answer test (dims 512×32; alpha autocorrelation peak at lag 32) — already verified this session, the test pins it
2. **Square-texel invariant (machine):** `chain.test.js` asserts `RIBBON_WIDTH === LINK_PITCH` and that each emitted link quad spans one 1/16-tile of U per `LINK_PITCH` of arc — the art renders undistorted by construction
3. **World-scale sanity (machine + documented):** `linkCount ≈ arcLen / LINK_PITCH` exposed via `KratosLab.chainInfo()`; with LINK_PITCH 0.9 → ≈15–16 links over CHAIN_LEN 14 (≈4.6 cm links at the ≈5.1 cm/unit scale derived from hero height 37.3 units ≈ 1.9 m [ASSUMED]) — recorded in-code as the INFERRED derivation
4. **Human checkpoint (perceptual):** links read as a segmented chain with visible gaps and alternating wide/narrow (edge-on) links; glow shows the texture's yellow-core/orange/red ramp near the blade; occlusion vs hero correct; magenta test unchanged

**Deferred check (labeled, carried to Phase-1 polish / Phase 7):**
- "On-screen link count matches measured footage" → requires 01-04 (MEASUREMENTS.md). Partial capture library exists NOW: 49 PNGs incl. a **12-frame chain-midswing burst at mid framing** (`.planning/phases/01-reference-pipeline-validation-criteria/01-03-SESSION-LOG.md`) — usable for an informal eyeball comparison at the checkpoint, but chain-at-rest stills ×3 framings (the pitch-measurement shots) are explicitly still uncaptured. Plans should reference the deferred item as: *"DEFERRED to Phase-1 polish (01-04): calibrate LINK_PITCH against measured on-screen link counts; expected change: one constant in chain.js."*

## Hitbox-Visualization Todo Assessment (candidate stretch scope)

**Recommendation: defer to Phase 4 — do not include in Phase 3.** Reasons: (a) it shares no code path with CHAIN-01/02 (new CDV_hero.bin decode + debug overlay vs. chain texturing); (b) its strike-volume component extrudes the swing ribbon, which this phase is reshaping (tip-arc bias) — building it after the trail geometry settles avoids rework; (c) Phase 4's solver/motion tuning is where an active-frames/strike-volume overlay pays off. Fit here is weak; forcing it dilutes a phase whose success criteria are purely visual-fidelity.

## State of the Art

| Old Approach (current lab) | Current Approach (this phase) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat strip, `u = t·reps` tiling whole 16-link texture per 0.9 units (links squashed ~16×) | Arc-length link walk, one 32px cell per LINK_PITCH, square texels | Phase 3 | Links render at the artist's aspect; countable |
| Camera-independent horizontal cross axis, no twist | Alternating ~90° per-link frames with hard boundaries | Phase 3 | The 3D segmented-chain read (locked decision) |
| No chainglow pass at all | Additive overlay sharing vertex bytes, LEQUAL, CLAMP sampler | Phase 3 | CHAIN-02; heat ramp from real texels |
| Hardcoded `assets/weapon/GFX_*.bin` fetch paths; `makeTex` hardcodes LINEAR/REPEAT | texName→TXR→GFX/PAL resolve chain from the WAD; wrap/filter parameterized from decoded data | Phase 3 | Consumes decoded fields (02-REVIEW IN-01); single source of truth |
| Trail = full hilt→tip sheet | Inner edge biased to ~lerp(hilt,tip,0.6) | Phase 3 (fair-game overlap) | Matches footage tip-arc emphasis; texture mapping already correct (verified) |

**Deprecated/outdated:** the `reps = len/0.9`, `hw = 0.14`, and `segs = 10` constants die with the old chain block. `CHAIN_LEN = 14` survives as the slack reference (Phase 4 owns real length behavior).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GL analog of the game's depth test for these draws is LEQUAL (GS ZTST=2 GEQUAL passes equal depths — the register semantics are [CITED: ps2tek]; that GoW1 uses ZTST=2 for these draws is [ASSUMED] until the Phase-5 GS dump) | Pitfall 1 | Low — LEQUAL is required for the coplanar overlay regardless; a GS dump showing ZTST=3 would mean the game offsets the glow instead (adjust then) |
| A2 | Glow U wrap = CLAMP; hot spot appears once near u=0 | Pattern 4 | Glow repeats per 16 links (visually obvious; one-line fix) |
| A3 | u=0 anchored at the pommel/blade end | Pattern 4 | Glow sits at the forearm instead of the blade (visually obvious; flip the walk direction) |
| A4 | LINK_PITCH initial value 0.9 model units | Pattern 2 | Link count off vs footage; recalibrated by the deferred Phase-1 check (one constant) |
| A5 | Kratos height ≈1.9 m → ≈5.1 cm/model-unit (context only; blade≈68 cm corroborates) | World-scale context | None functional — used only to sanity-narrate the INFERRED pitch |
| A6 | TXR tail flags (0x01 vs 0x51) semantics unknown — recorded, not acted on | TXR layout | None — nothing depends on them |
| A7 | ~90° alternating twist per 32px cell reads correctly vs footage (locked decision; the texture also paints both link phases in-cell, so the flat read partially works already — twist adds the 3D read) | Pattern 3 | Footage-gated torus fallback is pre-authorized if the Phase-7 comparison fails |
| A8 | uCutoff 0.35 for the link pass (inherited INFERRED value from Phase 2; Phase-5 GS dump reads the real TEST-register AREF) | Pattern 5 | Slightly fatter/thinner link edges |
| A9 | TRAIL_INNER_T = 0.6 tip-arc bias (footage analysis in the todo, not a decoded value) | Pattern 7 | Trail width reads wrong; single INFERRED constant |

## Open Questions

1. **Does the game place/animate the chainglow beyond the static shared-UV overlay?** (CHAIN-03's FXC_CNGemit candidate.) What we know: MAT gameFlags=0 → no material UV animation; the texture is a single blob. Unclear: whether the runtime slides it (hot streak) via emitter. Recommendation: ship the static overlay this phase (CHAIN-02's letter), leave the mechanism to Phase 5/6 — the INFERRED labels on A2/A3 mark the seam.
2. **TXR tail flags 0x01 vs 0x51** — pattern matches strip-vs-additive-sprite split (wrap? alpha handling?). Recommendation: record verbatim in parseTxr, revisit when Phase 5 cross-references more TXRs or the GS dump shows sampler state.
3. **Twist phase at the pommel** (does link 0 start face-on or edge-on, and is there a 45° global roll?). Recommendation: pick face-on at link 0, expose as a named constant; the 12-frame mid-swing burst can informally arbitrate at the checkpoint.
4. **Intra-link subdivision count** (1 vs 2 rows inside a link for sag smoothness). Recommendation: start with 2; it's a walker parameter, not an architecture question.

## Environment Availability

Code-only phase (browser + Node). No new external dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | test suites, first-party decode scripts | ✓ (all suites + this session's decode scripts ran) | repo-local | — |
| Browser + preview server (`server.js`) | human checkpoints | ✓ (Phase-2 checkpoints used it; preview server active) | — | — |
| `assets/wads/R_WPN0_0.WAD` + `assets/weapon/*.bin` | textures/MATs | ✓ git-tracked, byte-verified | — | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Plain Node + `node:assert` (zero-dependency, established Phase-2 pattern) |
| Config file | none (by design — no build step) |
| Quick run command | `node tools/kratos-lab/test/chain.test.js` |
| Full suite command | `node tools/kratos-lab/test/wad.test.js && node tools/kratos-lab/test/fx.test.js && node tools/kratos-lab/test/loop.test.js && node tools/kratos-lab/test/chain.test.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAIN-01 | Link pitch/twist/U-mapping geometry: pitch spacing = LINK_PITCH along arc; consecutive link cross-axes perpendicular; rows duplicated at boundaries; u ∈ [0,1]; square-texel invariant; vertical-chain degenerate guard | unit | `node tools/kratos-lab/test/chain.test.js` | ❌ Wave 0 |
| CHAIN-01 | Texture ground truth: chainlink decodes 512×32, binary alpha, 32px U-period (autocorr peak) | unit (known-answer) | `node tools/kratos-lab/test/wad.test.js` (extended; needs the ImageData shim — Pitfall 8) | ✅ file exists, assertions ❌ Wave 0 |
| CHAIN-01 | Link pass state usual/dw-ON from decoded MAT | unit (already pinned) | `node tools/kratos-lab/test/fx.test.js` | ✅ |
| CHAIN-01 | Reads as segmented chain w/ gaps + alternating twist; link count plausible (`KratosLab.chainInfo()`) | manual-only (perceptual) — checkpoint:human-verify with programmatic pre-proof (fxLog, chainInfo) | — | — |
| CHAIN-02 | TXR resolve chain: parseTxr known answers for all 3 TXRs; texName→GFX/PAL names round-trip via `resolve` | unit (known-answer) | `node tools/kratos-lab/test/wad.test.js` (extended) | assertions ❌ Wave 0 |
| CHAIN-02 | Glow texture ground truth: 512×32, all-opaque, hottest texel (254,229,0), blob confined to x<80 | unit (known-answer) | `node tools/kratos-lab/test/wad.test.js` (extended) | assertions ❌ Wave 0 |
| CHAIN-02 | Glow pass additive/dw-OFF via applyMaterial | unit (already pinned for the additive mode) | `node tools/kratos-lab/test/fx.test.js` | ✅ |
| CHAIN-02 | Glow visible OVER links (LEQUAL coplanar), heat ramp shows near blade, no hand-picked color (grep: no new color literals in the glow path) | manual + `fxLog` three-entry assertion mid-swing | — (browser console via KratosLab) | — |

### Sampling Rate
- **Per task commit:** the touched suite (`chain.test.js` for geometry tasks; `wad.test.js` for decode/plumbing tasks)
- **Per wave merge:** full suite command above
- **Phase gate:** full suite green + the human-verify checkpoint (perceptual criteria + regression: magenta test, native-res toggle, 60±1 sim rate) before `verify-work`

### Wave 0 Gaps
- [ ] `tools/kratos-lab/test/chain.test.js` — covers CHAIN-01 geometry (new pure module's suite)
- [ ] `tools/kratos-lab/test/wad.test.js` extensions — TXR known-answers + chainlink/chainglow texture known-answers (with the Node ImageData shim, Pitfall 8)
- [ ] `KratosLab.chainInfo()` hook + `fxLog` chainglow entry — the checkpoint's programmatic proof surface

## Security Domain

`security_enforcement` not configured (treated enabled) — but this phase's surface is minimal: a local static tool, zero packages, zero network beyond localhost asset fetches.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication / V3 Session / V4 Access Control / V6 Cryptography | no | No auth/session/crypto surface (local static viewer) |
| V5 Input Validation | yes | Fail-loud decode asserts on untrusted-format bytes (established pattern: magic checks, size checks, named throws) — `parseTxr` must follow it (magic!=7 throws, names NUL-bounded at 24) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Crafted WAD/GFX bytes driving out-of-record reads | Tampering | Size-bounded reads (WR-01 pattern already enforced in buildMats); parseTxr asserts size ≥ 0x58 before field reads |
| Data-derived strings into `innerHTML` (pre-existing IN-06) | Injection | Phase 3 must not add any decoded string to `innerHTML` — use `textContent` for anything new (e.g., chainInfo debug display) |

## Sources

### Primary (HIGH confidence)
- **First-party decode session (2026-07-25):** GFX/PAL chainlink, chainglow, swordtrail decoded via `Parsers.decodeTexture` in Node; MAT/TXR records decoded from `assets/wads/R_WPN0_0.WAD`; WAD-vs-extracted byte identity checked for all 6 files; hero/blade mesh bounds via `Parsers.parseMesh` — all numbers in "Decoded Asset Facts" reproduce from `parsers.js`/`fxparse.js` against git-tracked assets
- `tools/kratos-lab/{app,fx,fxparse,parsers}.js` — current geometry constants, pass architecture, shader layout (read this session)
- `.planning/phases/02-*/02-02-SUMMARY.md`, `02-04-SUMMARY.md`, `02-REVIEW.md` — locked pass architecture, restore discipline, IN-01/IN-03 findings
- `.planning/phases/01-*/01-03-SESSION-LOG.md` — capture library state (49 PNGs, 12-frame mid-swing burst, at-rest stills NOT captured)
- CLAUDE.md — GS blend table, texture-state guidance, alternatives table, anti-features (binding)
- [ps2tek — GS TEST register](https://psi-rockin.github.io/ps2tek/) — ZTST values: 2=GEQUAL "pixel Z >= zbuffer Z passes" [CITED: fetched this session]

### Secondary (MEDIUM confidence)
- `.planning/todos/pending/trail-fidelity-from-footage.md` — footage analysis (tip-arc bias 0.6, ~30-frame persistence) — user-sourced footage observations, not decoded data

### Tertiary (LOW confidence)
- Kratos real-world height ≈1.9 m (training knowledge; used only for narrative scale context) [ASSUMED]

## Metadata

**Confidence breakdown:**
- Decoded asset facts: HIGH — first-party decode of git-tracked bytes, reproducible commands
- Architecture patterns: HIGH — built on Phase-2's tested, human-verified machinery; the one new GL behavior (LEQUAL coplanar overlay) is core-spec certain
- Pitch/scale values: MEDIUM — the square-texel *rule* is data-verified; the absolute LINK_PITCH is INFERRED pending Phase-1 measurement (deferred check designed)
- Glow placement (CLAMP, pommel anchor): MEDIUM — strongly motivated by the decoded blob position + footage direction of heat, but the game's actual mapping is unconfirmed until Phase 5

**Research date:** 2026-07-25
**Valid until:** stable (first-party data + frozen constraints) — re-check only if Phase-1 measurements land (recalibrates A4) or Phase-5 GS dump lands (resolves A1/A2/A3/A8)
