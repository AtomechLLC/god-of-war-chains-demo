<!-- GSD:project-start source:PROJECT.md -->
## Project

**Chains of Chaos — Visual Fidelity**

An upgrade to the existing **kratos-lab** browser tool that makes the Blades of Chaos'
chains visually indistinguishable from God of War 1 (PS2, 2005) — real segmented
chain links, the burning-hot additive glow, authentic chain motion, and the blades'
fire and spark effects. Everything is driven by data decoded from the actual game
disc wherever such data exists.

**Core Value:** A GoW1 attack in kratos-lab reads 80–90% identical to real gameplay footage —
because the chains, glow, and fire use the game's own textures, particle
definitions, colors, and values, not approximations.

### Constraints

- **Budget**: Explicitly unconstrained — "spend as many hours and credits as needed";
  favor decoding real data over quick approximations every time
- **Tech stack**: Vanilla WebGL1 + JS in kratos-lab — no build step, no external
  libraries; all assets loaded from `extracted/` raw game files
- **Data-first**: Where the game stores a value (color, rate, size, blend mode),
  the renderer must use it; hand-tuning only where the game computes at runtime,
  and such cases must be labeled inferred
- **Target**: Level 1 blades (stage1 textures, chainlink/chainglow/swordtrail)
- **Performance**: Must stay interactive (60fps-ish) in the browser pane
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Part 1: PS2 GS Blending → WebGL1 (the core of PS2-authentic FX)
### The GS blend equation
- **A, B, D** select a color: `0 = Cs` (source), `1 = Cd` (framebuffer), `2 = 0`
- **C** selects a multiplier: `0 = As` (source alpha), `1 = Ad` (framebuffer alpha), `2 = FIX` (8-bit constant in the ALPHA register)
- The `>> 7` means **0x80 = 1.0**. C can be up to 0xFF ≈ 1.99 — alpha *brighter than 1.0* is legal on GS and used by fire effects.
### Authoritative ABCD → WebGL mapping
| ABCD | GS math | Meaning | WebGL1 state |
|------|---------|---------|--------------|
| `0101` | (Cs−Cd)·As + Cd | **"Usual" alpha blend** | `blendEquation(FUNC_ADD)`; `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` |
| `0201` | Cs·As + Cd | **Additive ("soft additive")** — the PS2 flame/glow staple; source fades itself by its own alpha, dest untouched | `blendEquation(FUNC_ADD)`; `blendFunc(SRC_ALPHA, ONE)` |
| `0221` | Cs·FIX + Cd | Additive with constant intensity (FIX=0x80 → pure `ONE, ONE`) | `blendColor(F,F,F,1)` with `F = FIX/128`; `blendFunc(CONSTANT_COLOR, ONE)` — or `blendFunc(ONE, ONE)` when FIX=0x80 |
| `2001` | Cd − Cs·As | **Subtractive** (smoke/darkening) | `blendEquation(FUNC_REVERSE_SUBTRACT)`; `blendFunc(SRC_ALPHA, ONE)` |
| `2021` | Cd − Cs·FIX | Subtractive, constant | `blendEquation(FUNC_REVERSE_SUBTRACT)`; `blendFunc(CONSTANT_COLOR, ONE)` |
| `2101` | Cd·(1−As) | Multiplicative fade of dest | `blendEquation(FUNC_ADD)`; `blendFunc(ZERO, ONE_MINUS_SRC_ALPHA)` |
| `1201` | Cd·(1+As) | Dest brighten (rare) | needs shader trick; flag if encountered |
### The alpha-over-1.0 problem (WebGL1's one real gap)
- For additive `0201` with As potentially > 1.0: output `gl_FragColor.rgb = color.rgb * (alpha128 / 128.0)` premultiplied in the shader and blend with `blendFunc(ONE, ONE)`. This is mathematically identical to `Cs·As + Cd` and imposes no clamp on As up to the float range.
- For `0101` with As ≤ 0x80 (the overwhelmingly common case): plain `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` is exact; only handle premultiply when decoded data actually contains >0x80 alphas.
### Color conventions — 0x80 = 1.0 everywhere
### GS behaviors to deliberately NOT emulate
- **COLCLAMP=0 wrapping** (blend results wrap mod 256): assume clamping (COLCLAMP=1, the default); WebGL clamps natively. Only revisit if a GS dump shows GoW1 disabling it for an effect. Confidence: MEDIUM.
- **Dithering (DTHE) / 16-bit framebuffer banding:** invisible at the 80–90%-vs-footage bar; skip.
- **PABE (per-pixel blend enable):** rarely used; skip unless a GS dump shows it.
## Part 2: GoW1 FX data formats — what exists, what doesn't
### Verified: MAT record blend/flags decode exists
- Header 0x38 bytes (magic `0x00000008`, material color RGB floats at +8, layer count at +0x34), then 0x40 bytes per layer.
- Per-layer `Flags[0]` bits (**this is the blend-mode field the project needs**):
- Per-layer: texture name (24 bytes at +0x10), blend color RGBA floats (+0x28), float at +0x38 (suspected layer transparency), game flags at +0x3C (bit 0: UV animation, bit 1: color animation).
- The god_of_war_browser web viewer maps these to: usual → `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`, depth write on; additive → `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE)`, **depth write off** ([RenderChain.js](https://github.com/mogaika/god_of_war_browser/blob/master/web/data/static/js/RenderChain.js) `renderFlashesBatch`). This is the correct starting mapping for kratos-lab.
### Verified: material UV/flipbook animation decode exists
### Verified: FXC / PTC / MSH-shape records are NOT decoded anywhere public
- god_of_war_browser has **no** fxc/ptc/emitter/particle parser (confirmed by full repo tree listing — no matching files; `pack/wad/` covers anm, cam, collision, cxt, flp, gfx, inst, light, mat, mdl, mesh, obj, rsrcs, sbk, scr, shg, twk, txr only).
- `MSH_BDepoly6Shape` appears in [pack/wad/gow1.go](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/gow1.go) only as the example comment for `TAG_GOW1_FILE_RAW_DATA` (tag 112) — i.e., mogaika treats the project's exact target records as opaque raw data.
- Web/forum search (ZenHAX, ResHax, ps2-home modding threads) found WAD container tooling only; no FXC/PTC field documentation exists.
## Part 3: Rendering techniques (raw WebGL1, no libraries)
### Billboard particles (sparks, flame puffs)
- One interleaved `Float32Array` + one `gl.ARRAY_BUFFER` with `gl.DYNAMIC_DRAW`, rewritten per frame via `bufferSubData`. 4 vertices per particle, static index buffer (6 indices/quad, built once).
- Per-vertex attributes: particle center (vec3), corner offset (vec2, ±halfSize with rotation pre-applied or as raw corner + angle attribute), UV, color+alpha (128-based, normalized at decode time).
- Vertex shader billboarding: `worldPos = center + cameraRight * corner.x + cameraUp * corner.y` with `cameraRight/Up` extracted from the view matrix (columns of its transpose) — no per-particle CPU matrix math, no geometry shaders needed (WebGL has none anyway).
- Spark stretching (velocity-aligned billboards): pass per-particle velocity, build the axis in the vertex shader from projected velocity; this reproduces the PS2 "stretched spark" look which is just a quad scaled along motion.
- Budget: GoW1-era emitters are tens-to-hundreds of particles. A few hundred quads rebuilt per frame is trivial (<0.1 ms); do **not** add `ANGLE_instanced_arrays` complexity for this scale.
### Ribbons/trails — chain links vs glow are different passes
### Frame/state ordering (per-frame render plan)
### Texture state for FX
- `LINEAR` filtering when MAT bit 16 set (it will be, for FX), `NEAREST` otherwise; no mipmaps for FX textures (GS FX draws were typically un-mipped and the assets are tiny).
- `REPEAT` wrap on U for the chainlink/swordtrail strips, `CLAMP_TO_EDGE` for flame/glow sprites. All listed FX textures are power-of-two, so WebGL1 NPOT restrictions don't bite.
- Canvas context: ensure the existing context uses `{ alpha: false }` (or correct premultiplied handling) so page compositing doesn't wash out additive passes — a classic vanilla-WebGL FX pitfall.
## Part 4: Verification tools (external, not runtime dependencies)
| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| **PCSX2 GS Debugger / GS dumps** | PCSX2 ≥ 2.0 (Qt) | Capture a GS dump during a blade swing in the real game; step draw calls and read the exact `ALPHA` (ABCD/FIX), `TEX0` (TFX), `TEST`, `ZBUF` registers per FX draw | **Ground truth.** Removes all guessing about which blend config each effect uses; converts the MEDIUM-confidence MAT-bit→ABCD mapping to fact. This is the single highest-leverage verification step for the authenticity bar. |
| **Spector.js** (browser extension) | current | Frame-capture kratos-lab; inspect actual blend state per draw call | Catches state-leak bugs (unreset `blendEquation`, depthMask) that visually read as "slightly wrong glow" |
| **god_of_war_browser** | master | Cross-check MAT/ANM-type-8 decode against a second implementation; browse the weapon WAD records | Already the project's established RE cross-reference |
| Side-by-side capture (existing plan) | — | Compare against reference footage (user's YouTube reference + screenshots) | The acceptance metric is defined vs footage |
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
