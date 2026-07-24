# Stack Research

**Domain:** PS2 (GS)-authentic game VFX reproduction in vanilla WebGL1 (kratos-lab, no build step, no libraries)
**Researched:** 2026-07-24
**Confidence:** HIGH (GS blend math, MAT flags, color conventions — verified against ps2tek, PCSX2 source, mogaika/god_of_war_browser source) / MEDIUM (which blend configs GoW1 actually sets per-effect — inferable, verifiable via GS dumps) / LOW (FXC/PTC record internals — no public decode exists anywhere; original RE required)

This is a **technique stack**, not a package stack. The project constraint is vanilla WebGL1 + JS with zero dependencies, so every recommendation below is a pattern to implement in `tools/kratos-lab/`, plus external *tools* (not runtime dependencies) for verification.

---

## Part 1: PS2 GS Blending → WebGL1 (the core of PS2-authentic FX)

### The GS blend equation

The GS has exactly one blend formula with four configurable slots ([ps2tek](https://psi-rockin.github.io/ps2tek/), [PCSX2 blog](https://pcsx2.net/blog/2016/alpha-testing-gs-world/)):

```
Cv = ((A − B) × C) >> 7 + D
```

- **A, B, D** select a color: `0 = Cs` (source), `1 = Cd` (framebuffer), `2 = 0`
- **C** selects a multiplier: `0 = As` (source alpha), `1 = Ad` (framebuffer alpha), `2 = FIX` (8-bit constant in the ALPHA register)
- The `>> 7` means **0x80 = 1.0**. C can be up to 0xFF ≈ 1.99 — alpha *brighter than 1.0* is legal on GS and used by fire effects.

A blend mode in GoW1 data is therefore fully described by 4 small ints (A,B,C,D) plus optionally FIX. Any MAT/FXC blend field you decode will reduce to one of these configurations.

### Authoritative ABCD → WebGL mapping

PCSX2's `m_blendMap` (81 entries, one per ABCD combination) is the canonical reference: [pcsx2/GS/Renderers/Common/GSDevice.cpp](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/GS/Renderers/Common/GSDevice.cpp) (search `m_blendMap`), with flags explained in [GSDevice.h](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/GS/Renderers/Common/GSDevice.h) (`HWBlendFlags`). Verified against the actual source during this research.

The configs that matter for this project (comment format `ABCD`), with exact WebGL1 calls:

| ABCD | GS math | Meaning | WebGL1 state |
|------|---------|---------|--------------|
| `0101` | (Cs−Cd)·As + Cd | **"Usual" alpha blend** | `blendEquation(FUNC_ADD)`; `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` |
| `0201` | Cs·As + Cd | **Additive ("soft additive")** — the PS2 flame/glow staple; source fades itself by its own alpha, dest untouched | `blendEquation(FUNC_ADD)`; `blendFunc(SRC_ALPHA, ONE)` |
| `0221` | Cs·FIX + Cd | Additive with constant intensity (FIX=0x80 → pure `ONE, ONE`) | `blendColor(F,F,F,1)` with `F = FIX/128`; `blendFunc(CONSTANT_COLOR, ONE)` — or `blendFunc(ONE, ONE)` when FIX=0x80 |
| `2001` | Cd − Cs·As | **Subtractive** (smoke/darkening) | `blendEquation(FUNC_REVERSE_SUBTRACT)`; `blendFunc(SRC_ALPHA, ONE)` |
| `2021` | Cd − Cs·FIX | Subtractive, constant | `blendEquation(FUNC_REVERSE_SUBTRACT)`; `blendFunc(CONSTANT_COLOR, ONE)` |
| `2101` | Cd·(1−As) | Multiplicative fade of dest | `blendEquation(FUNC_ADD)`; `blendFunc(ZERO, ONE_MINUS_SRC_ALPHA)` |
| `1201` | Cd·(1+As) | Dest brighten (rare) | needs shader trick; flag if encountered |

**Why this exact mapping:** it is what PCSX2 itself uses to run GoW1 correctly; anything that renders right in PCSX2 hardware mode with these factors will render right in WebGL1 with the same factors. All required pieces — `blendEquation` with `FUNC_ADD/FUNC_SUBTRACT/FUNC_REVERSE_SUBTRACT`, `blendFuncSeparate`, `blendColor` + `CONSTANT_COLOR` — are **core WebGL1** (OpenGL ES 2.0), no extensions needed. (`MIN/MAX` would need `EXT_blend_minmax`, but no GS blend config produces min/max.)

**Reset discipline:** `blendEquation(FUNC_ADD)` must be restored after any subtractive pass — this is the classic bug (the god_of_war_browser viewer explicitly re-issues `gl.blendEquation(gl.FUNC_ADD)` before each batch in [RenderChain.js](https://github.com/mogaika/god_of_war_browser/blob/master/web/data/static/js/RenderChain.js)).

### The alpha-over-1.0 problem (WebGL1's one real gap)

GS alpha `0x80 = 1.0`, so decoded alphas 0x81–0xFF mean 1.0–1.99×. WebGL clamps `gl_FragColor` and blend factors to [0,1], and WebGL has **no dual-source blending** (PCSX2 uses `SRC1_COLOR` for exactly this; unavailable in any WebGL version).

**Prescription:** emulate in the fragment shader, exactly as PCSX2's `BLEND_MIX`/`BLEND_ACCU` software paths do:
- For additive `0201` with As potentially > 1.0: output `gl_FragColor.rgb = color.rgb * (alpha128 / 128.0)` premultiplied in the shader and blend with `blendFunc(ONE, ONE)`. This is mathematically identical to `Cs·As + Cd` and imposes no clamp on As up to the float range.
- For `0101` with As ≤ 0x80 (the overwhelmingly common case): plain `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` is exact; only handle premultiply when decoded data actually contains >0x80 alphas.

Confidence: HIGH (this is PCSX2's documented strategy — `BLEND_MIX1 // do Cs*F or Cs*As in shader`, [GSDevice.h](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/GS/Renderers/Common/GSDevice.h)).

### Color conventions — 0x80 = 1.0 everywhere

Three places the 128-based convention appears; get all three right or colors will be uniformly half-brightness or double-brightness:

1. **Texture function (TFX MODULATE):** `Cv = (Cvertex × Ctexture) >> 7` per ps2tek. In GLSL with [0,1]-normalized inputs: `texColor * vertColor * (255.0/128.0)` (≈1.992; using 2.0 is a <0.4% error, acceptable). Vertex color 0x80 = identity; 0xFF ≈ 2× brighten. **The existing kratos-lab AO vertex colors and any decoded FXC/PTC colors must be interpreted this way.**
2. **CLUT / texture alpha:** palette alpha 0x80 = fully opaque. god_of_war_browser converts with exactly `clr.A * (255.0/128.0)` clamped ([pack/wad/gfx/gfx.go line ~109](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/gfx/gfx.go), `convertAlphaToPCformat`). Any FX texture decode (chainglow, flame3/6, swordtrail, spark) must apply this or additive effects will render at half intensity.
3. **Blend FIX constant and per-vertex alpha in FX records:** assume 128-based until data proves otherwise; divide by 128, not 255.

Confidence: HIGH (ps2tek formulas + mogaika source + PCSX2 shaders all agree).

### GS behaviors to deliberately NOT emulate

- **COLCLAMP=0 wrapping** (blend results wrap mod 256): assume clamping (COLCLAMP=1, the default); WebGL clamps natively. Only revisit if a GS dump shows GoW1 disabling it for an effect. Confidence: MEDIUM.
- **Dithering (DTHE) / 16-bit framebuffer banding:** invisible at the 80–90%-vs-footage bar; skip.
- **PABE (per-pixel blend enable):** rarely used; skip unless a GS dump shows it.

---

## Part 2: GoW1 FX data formats — what exists, what doesn't

### Verified: MAT record blend/flags decode exists

[mogaika/god_of_war_browser `pack/wad/mat/mat.go`](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/mat/mat.go) — the single best reference for the MAT fields this milestone needs. Verified against source:

- Header 0x38 bytes (magic `0x00000008`, material color RGB floats at +8, layer count at +0x34), then 0x40 bytes per layer.
- Per-layer `Flags[0]` bits (**this is the blend-mode field the project needs**):
  - bit 7: texture present
  - bit 16: bilinear filtering (`FilterLinear`)
  - bit 19: **disable depth write**
  - bit 24: "strange blended" (unknown — mogaika renders it as a diffuse substitute; likely env/reflection layer)
  - bit 25: **subtractive** blending
  - bit 26: **"usual"** alpha blending
  - bit 27: **additive** blending
  - (exactly one of bits 24–27 may be set; mogaika errors otherwise)
- Per-layer: texture name (24 bytes at +0x10), blend color RGBA floats (+0x28), float at +0x38 (suspected layer transparency), game flags at +0x3C (bit 0: UV animation, bit 1: color animation).
- The god_of_war_browser web viewer maps these to: usual → `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`, depth write on; additive → `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE)`, **depth write off** ([RenderChain.js](https://github.com/mogaika/god_of_war_browser/blob/master/web/data/static/js/RenderChain.js) `renderFlashesBatch`). This is the correct starting mapping for kratos-lab.

The MAT flag bits are engine-level abstractions over GS ABCD configs — bit 27 ≙ `0201`, bit 25 ≙ `2001`, bit 26 ≙ `0101`. Confidence: HIGH for the bit meanings (mogaika's decode is battle-tested across the whole game's assets); MEDIUM for the exact ABCD each bit compiles to in the GoW engine (verify once via GS dump, below).

### Verified: material UV/flipbook animation decode exists

Flame/trail materials animate via ANM **type 8 "texturepos"** streams attached to the MAT node: float U/V offset keyframes targeting a material layer (param1 = layer id; stream target 0 = U, 1 = V). Fully decoded in [pack/wad/anm/type8.go](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/anm/type8.go); ANM type 3 is material *color* animation (partially understood). kratos-lab already parses ANM streams — extending to type 8 on FX materials is incremental, not new RE. Confidence: HIGH.

### Verified: FXC / PTC / MSH-shape records are NOT decoded anywhere public

- god_of_war_browser has **no** fxc/ptc/emitter/particle parser (confirmed by full repo tree listing — no matching files; `pack/wad/` covers anm, cam, collision, cxt, flp, gfx, inst, light, mat, mdl, mesh, obj, rsrcs, sbk, scr, shg, twk, txr only).
- `MSH_BDepoly6Shape` appears in [pack/wad/gow1.go](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/gow1.go) only as the example comment for `TAG_GOW1_FILE_RAW_DATA` (tag 112) — i.e., mogaika treats the project's exact target records as opaque raw data.
- Web/forum search (ZenHAX, ResHax, ps2-home modding threads) found WAD container tooling only; no FXC/PTC field documentation exists.

**Implication for roadmap:** FXC/PTC/MSH-shape decode is original reverse engineering. Useful structural priors from mogaika's WAD code: records are server-routed (`TAG_GOW1_SERVER_INSTANCE` = tag 30, first u16 of data = server id — FXC/PTC/EMT will each have a distinct server id and magic, like MAT's `0x00000008`), and group nesting (tags 40/50) ties FXC ↔ PTC ↔ MSH ↔ MAT records together under one emitter. Confidence: HIGH that no public decode exists; the record-structure prior is HIGH (same container conventions as every decoded type).

---

## Part 3: Rendering techniques (raw WebGL1, no libraries)

### Billboard particles (sparks, flame puffs)

**Recommended pattern — CPU-simulated, GPU-billboarded quads:**

- One interleaved `Float32Array` + one `gl.ARRAY_BUFFER` with `gl.DYNAMIC_DRAW`, rewritten per frame via `bufferSubData`. 4 vertices per particle, static index buffer (6 indices/quad, built once).
- Per-vertex attributes: particle center (vec3), corner offset (vec2, ±halfSize with rotation pre-applied or as raw corner + angle attribute), UV, color+alpha (128-based, normalized at decode time).
- Vertex shader billboarding: `worldPos = center + cameraRight * corner.x + cameraUp * corner.y` with `cameraRight/Up` extracted from the view matrix (columns of its transpose) — no per-particle CPU matrix math, no geometry shaders needed (WebGL has none anyway).
- Spark stretching (velocity-aligned billboards): pass per-particle velocity, build the axis in the vertex shader from projected velocity; this reproduces the PS2 "stretched spark" look which is just a quad scaled along motion.
- Budget: GoW1-era emitters are tens-to-hundreds of particles. A few hundred quads rebuilt per frame is trivial (<0.1 ms); do **not** add `ANGLE_instanced_arrays` complexity for this scale.

**Do NOT use `gl.POINTS` point sprites:** implementation-capped max size (`ALIASED_POINT_SIZE_RANGE` is commonly ≤64–256 px and can be as low as 1), the whole point clips when its center leaves the frustum, and no rotation/stretch. All three break flame/spark rendering. Confidence: HIGH (well-known WebGL1 limitations).

**PS2 authenticity note:** GS-native particles were often `SPRITE` primitives — always screen-axis-aligned, *unrotatable* rectangles. If GS dumps show GoW1 sparks as SPRITEs, matching the game means *not* rotating those billboards (roll = 0), which is cheaper anyway. Flames drawn via `MSH_BDepoly3Shape/6Shape` are triangle geometry, not sprites — see next section. Confidence: MEDIUM until dump-verified.

### Ribbons/trails — chain links vs glow are different passes

Two visually different problems; use two techniques:

1. **Chain link pass (textured, "usual" or opaque blend):** the `chainlink` texture is a 512×32 strip — a run of pre-shaded links with 16:1 aspect. Evidence strongly suggests the game renders chains as a **camera-facing ribbon** whose "3D reading" comes from the texture, segmented per-link in UV space. Recommended: quad-strip along the chain curve (catenary/verlet-sampled points), each segment oriented by `tangent × toCamera`, with UV.u mapped so an integer number of texture link-repeats spans the chain (no swimming: anchor UVs to arc length, not segment index). To get the requirement's "segmented 3D-reading links," add **per-link alternating twist**: rotate each segment's extrusion axis ~90° alternately around the tangent (real chain links alternate planes), or render two crossed ribbons (+45°/−45°). Start with the twisted single ribbon — it matches the texture's authored shading; escalate to crossed quads only if footage comparison demands it. Confidence: MEDIUM (texture-shape evidence + PS2-era practice; verify against GS dump / footage).
2. **Glow/heat pass (`chainglow`, additive):** second quad-strip over the same curve, wider than the link ribbon, `0201` additive (`SRC_ALPHA, ONE` or shader-premultiplied `ONE, ONE`), **depth write off, depth test on**, drawn after all opaque geometry. Intensity/color must come from the decoded MAT blend color for the glow layer, not hand-tuned. Order-independent (addition commutes), so no sorting.
3. **Swing trail (`swordtrail`, exists already):** keep the history-buffer ribbon; when MAT decode lands, drive its blend mode/color/fade from data.

**Flame rendering (`flame3`/`flame6` + `MSH_BDepoly3Shape/6Shape`):** working hypothesis — the "poly shapes" are small authored fan/strip meshes (3- and 6-poly variants) that the emitter spawns/attaches at the blade, textured with UV-scrolled flame textures (ANM type 8) and additive MAT blend. Render as ordinary small meshes with the FX blend state; no billboarding assumptions until the MSH shape decode says otherwise. Confidence: LOW on the hypothesis (naming + ecosystem convention only) — this is exactly what the FXC/PTC/MSH decode phase resolves.

### Frame/state ordering (per-frame render plan)

1. Opaque skinned meshes (existing) — depth write on.
2. "Usual"-blended layers — `0101`, depth write on (matches mogaika's viewer).
3. Additive FX (glow ribbon, trail, flames, sparks) — depth write **off**, depth test on, no sorting.
4. Subtractive FX (if any decoded) — depth write off; note subtract does not commute with add, so preserve the game's record draw order between passes 3 and 4.
5. Restore `FUNC_ADD` + default blend after FX.

### Texture state for FX

- `LINEAR` filtering when MAT bit 16 set (it will be, for FX), `NEAREST` otherwise; no mipmaps for FX textures (GS FX draws were typically un-mipped and the assets are tiny).
- `REPEAT` wrap on U for the chainlink/swordtrail strips, `CLAMP_TO_EDGE` for flame/glow sprites. All listed FX textures are power-of-two, so WebGL1 NPOT restrictions don't bite.
- Canvas context: ensure the existing context uses `{ alpha: false }` (or correct premultiplied handling) so page compositing doesn't wash out additive passes — a classic vanilla-WebGL FX pitfall.

---

## Part 4: Verification tools (external, not runtime dependencies)

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| **PCSX2 GS Debugger / GS dumps** | PCSX2 ≥ 2.0 (Qt) | Capture a GS dump during a blade swing in the real game; step draw calls and read the exact `ALPHA` (ABCD/FIX), `TEX0` (TFX), `TEST`, `ZBUF` registers per FX draw | **Ground truth.** Removes all guessing about which blend config each effect uses; converts the MEDIUM-confidence MAT-bit→ABCD mapping to fact. This is the single highest-leverage verification step for the authenticity bar. |
| **Spector.js** (browser extension) | current | Frame-capture kratos-lab; inspect actual blend state per draw call | Catches state-leak bugs (unreset `blendEquation`, depthMask) that visually read as "slightly wrong glow" |
| **god_of_war_browser** | master | Cross-check MAT/ANM-type-8 decode against a second implementation; browse the weapon WAD records | Already the project's established RE cross-reference |
| Side-by-side capture (existing plan) | — | Compare against reference footage (user's YouTube reference + screenshots) | The acceptance metric is defined vs footage |

No `npm install` of anything — all runtime code is hand-written in kratos-lab per project constraint.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Per-effect blendFunc from decoded ABCD/MAT bits | Single hardcoded additive mode for all FX | Never — the whole point is data-driven fidelity; hardcoding is what the current basic trail does |
| Shader-premultiply for alpha>0x80 | Dual-source blending | Not available in any WebGL; premultiply is exact for the additive cases |
| CPU quad expansion + VS billboard | `ANGLE_instanced_arrays` instancing | Only if particle counts exceed ~10k (they won't — GoW1-era budgets are hundreds) |
| Twisted single chain ribbon | Per-link 3D torus mesh instances | If footage comparison shows the flat ribbon reads wrong at gameplay camera distance; a generated link mesh (two half-tori) oriented per-segment with alternating 90° roll is the fallback — costlier but still cheap at ~30 links/chain |
| WebGL1 (project constraint) | WebGL2 | N/A — constraint is fixed; nothing in this milestone *requires* WebGL2 (no feature gap for GS blend emulation except dual-source, which WebGL2 also lacks) |

## What NOT to Use

- **Post-process bloom / fullscreen glow shaders** — the chain heat glow in GoW1 is *asset-driven*: a `chainglow` texture on additive geometry. Reproducing it with screen-space bloom would look modern, not PS2, and violates the data-first rule. (GoW1 does apply separate fullscreen framebuffer effects in some scenes — the known PCSX2 "glow/ghosting" behaviors, e.g. [GoW2 Pegasus glow issue](https://github.com/PCSX2/pcsx2/issues/14554) — but that is scene post, not the weapon glow, and is out of this milestone's scope.)
- **gl.POINTS point sprites** for particles — size caps, center-clipping, no rotation (details above).
- **Three.js / particle libraries / any npm runtime dependency** — banned by project constraint, and their PBR/sRGB pipelines actively fight the 128-based GS color math.
- **sRGB-correct rendering / tone mapping** — the GS pipeline is linear-ish 8-bit with no gamma management; the PS2 look *is* the naive math. Adding "correct" color management will make it match footage worse.
- **Mipmaps + trilinear on FX textures** — GS FX draws were bilinear at most; mipping the 512×32 chainlink strip smears the links.
- **Depth-sorted additive particles** — addition commutes; sorting buys nothing and costs CPU.
- **Hand-tuned glow colors/intensities** — decode MAT blend color + FXC values first (project's own data-first rule); tune only runtime-computed quantities and label them inferred.

## Version Compatibility

- Everything blend-related used here (`blendEquation` FUNC_ADD/SUBTRACT/REVERSE_SUBTRACT, `blendFuncSeparate`, `blendColor`/CONSTANT_COLOR) is **core WebGL1** — no extension gates. One spec quirk: WebGL1 forbids mixing CONSTANT_COLOR-family and CONSTANT_ALPHA-family factors in a single `blendFunc` call (INVALID_OPERATION); the recommended configs never do.
- `EXT_blend_minmax`, `OES_vertex_array_object`, `ANGLE_instanced_arrays`: not required. Do not add capability paths for them.

## Sources

- [ps2tek — GS documentation](https://psi-rockin.github.io/ps2tek/) — ALPHA register formula/field encodings, TFX MODULATE `>>7` math — HIGH
- [PCSX2 `GSDevice.cpp` m_blendMap](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/GS/Renderers/Common/GSDevice.cpp) + [`GSDevice.h` HWBlendFlags](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/GS/Renderers/Common/GSDevice.h) — canonical ABCD→GL factor table, alpha>1 mix strategies — HIGH (read directly from source)
- [PCSX2 blog: "Alpha Testing GS World"](https://pcsx2.net/blog/2016/alpha-testing-gs-world/) — GS blend formula background — HIGH
- [mogaika/god_of_war_browser `pack/wad/mat/mat.go`](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/mat/mat.go) — MAT layout + blend flag bits — HIGH (read directly)
- [mogaika/god_of_war_browser `pack/wad/gfx/gfx.go`](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/gfx/gfx.go) — CLUT alpha ×255/128 conversion — HIGH (read directly)
- [mogaika/god_of_war_browser `pack/wad/anm/type8.go`](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/anm/type8.go) — material UV animation streams — HIGH (read directly)
- [mogaika/god_of_war_browser `pack/wad/gow1.go`](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/gow1.go) — WAD tag semantics; `MSH_BDepoly6Shape` handled as raw data (no FX decode exists) — HIGH (read directly)
- [god_of_war_browser web viewer `RenderChain.js`](https://github.com/mogaika/god_of_war_browser/blob/master/web/data/static/js/RenderChain.js) — reference GL mapping of MAT modes (additive = SRC_ALPHA/ONE, depthMask off) — HIGH (read directly)
- [PSDevWiki — Graphics Synthesizer](https://www.psdevwiki.com/ps2/Graphics_Synthesizer) — GS register background — MEDIUM
- Forum sweep ([ZenHAX GoW WAD threads](http://zenhax.com/viewtopic.php@t=325.html), [ps2-home GoW modding](https://www.ps2-home.com/forum/viewtopic.php?t=9116), [ResHax](https://reshax.com/topic/19156-ps3-god-of-war-ascension-help-with-extracting-wad-as-streams/)) — confirmed absence of public FXC/PTC docs — MEDIUM (absence of evidence)
- [PCSX2 GoW2 fullscreen glow issue #14554](https://github.com/PCSX2/pcsx2/issues/14554) — GoW-series fullscreen post effects exist but are separate from weapon glow — MEDIUM

---
*Stack research for: PS2 GS-authentic VFX in vanilla WebGL1 (kratos-lab Chains of Chaos milestone)*
*Researched: 2026-07-24*
