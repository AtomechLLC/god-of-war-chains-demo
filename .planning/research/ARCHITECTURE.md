# Architecture Research

**Domain:** Data-driven PS2 FX rendering (particles, ribbons, chain links) inside an existing vanilla-WebGL1 viewer (kratos-lab)
**Researched:** 2026-07-24
**Confidence:** HIGH for record inventory/known formats (verified against first-party binary data + mogaika source); MEDIUM for FXC/PTC field interpretations (structural observations, decode is this project's work)

## Part 1 — What god_of_war_browser Already Documents

Repo cloned and searched at commit HEAD (2026-07-24). **Bottom line: MAT is fully decoded and portable today; FXC/PTC/MSH-shape records have NO parser anywhere in the repo — decoding them is novel reverse-engineering work for this project.**

### Files checked and what each contains

| Repo file | What it documents | Relevance |
|---|---|---|
| `pack/wad/mat/mat.go` | **Complete MAT record format** (see below). This alone closes the "MAT blend/flags undecoded" gap. | Port directly to JS |
| `pack/wad/gow1.go` | WAD tag semantics. `TAG_GOW1_FILE_RAW_DATA = 112` carries the literal comment `// MSH_BDepoly6Shape` — shape records are raw-data tags, added to the node directory *"only if another node with this name not exists"* (first-wins). `TAG_GOW1_SERVER_INSTANCE = 30`: *"server determined by first uint16 … overwrite previous instance with same name"* (last-wins). | Name-resolution semantics for the WAD directory component |
| `pack/wad/anm/anm.go` | ANM datatype table: `DATATYPE_UNKNOWN5 = 5 // apply to object (show/hide maybe or switch meshes or cameras)` — mogaika's read of the undecoded type-5 blade-state descriptor matches ours. Also `DATATYPE_MATERIAL = 3` (material color), `DATATYPE_TEXUREPOS = 8` (material UV scroll), `DATATYPE_TEXTURESHEET = 9` (palette/frame flip "like gif frame"), `DATATYPE_PARTICLES = 10`. | Type-5 decode target; types 3/8/9 are how the game animates fire materials |
| `pack/wad/obj/obj.go` | `ObjMarshal` struct declares `ParticleEmitters []interface{}` / `Particles []interface{}` (lines 307–308) but the marshal switch only ever fills Model/Script/Collision/Animations — **placeholder fields, never implemented**. | Confirms no emitter support exists |
| `pack/wad/` (directory listing) | Subdirs: anm, cam, collision, cxt, flp, gfx, inst, light, mat, mdl, mesh, obj, rsrcs, sbk, scr, shg, twk, txr. **No fxc/, ptc/, or emitter directory.** | Confirms the gap |
| grep of all `wad.SetHandler(config.GOW1, …)` registrations | Handled magics: 0x1 cxt, 0x3 anm, 0x6 light, 0x7 txr, 0x8 mat, 0xc gfx, 0x11 collision, 0x18 sbk, 0x27 shg, 0x1000f mesh, 0x2000f mdl, 0x3000f gmdl, 0x10004 scr, 0x20001 inst, 0x40001 obj, flp. **No handler for 0x13 (particles), 0x1a (EMTX), or 0x1e (FX server).** | Definitive: FXC/PTC unhandled upstream |

### The MAT format (from `pack/wad/mat/mat.go` — port this verbatim)

120-byte record = `0x38` header + N × `0x40` layers (`layerCount` u32 at `+0x34`; our records all have 1 layer → 0x38+0x40 = 0x78 = 120 bytes, matching every MAT in both WADs).

- Header: magic u32 `0x8` at `+0x00`; material color RGB as 3 floats at `+0x08..0x14`.
- Layer at `+0x38`: `Flags[4]` u32 at `+0x00`; **texture name, 24-byte NUL-terminated string at layer`+0x10` = file offset `0x48`** (confirms the "+0x48ish" observation exactly); `BlendColor` RGBA floats at layer`+0x28`; `FloatUnk` float at `+0x38` (layer transparency?); `GameFlags` u32 at `+0x3C`.
- `Flags[0]` bits (from `ParseFlags()`): bit 7 = HaveTexture, bit 16 = FilterLinear, **bit 19 = DisableDepthWrite**, bit 24 = "StrangeBlended", **bit 25 = RenderingSubstract**, **bit 26 = RenderingUsual (alpha blend)**, **bit 27 = RenderingAdditive** — exactly one of bits 24–27 may be set (mat.go errors otherwise).
- `GameFlags`: bit 0 = UV animation enabled (ANM type 8), bit 1 = color animation enabled (ANM type 3). mat.go's `Marshal` walks the MAT node's *children* looking for `anm.Animations` — material animations are child ANM records of the MAT node.
- Texture reference resolution: `wrsrc.Wad.GetNodeByName(layer.Texture, node.Id-1, false)` — **searches the node directory backwards from the referencing node** (nearest preceding record with that name). This matters: R_WPN0_0.WAD contains both level-1 and god-tier variants of same-named records.

## Part 2 — First-Party Verification (R_WPN0_0.WAD walked directly)

Walked `extracted/wads/R_WPN0_0.WAD` (169,760 B) with the documented record format (`u32 type, u32 size, char name[24]`, align-16). HIGH confidence — this is the shipping data.

### Server declaration table (WAD header region)

The header group declares each content server: `GFXX→0xc, TXRX→0x7, MATX→0x8, MDLX→0xf, ANMX→0x3, PRTX→0x13, EMTX→0x1a, FX→0x1e, …`. Every record's payload begins with its server id in the low u16 of the first u32 — the routing key the engine (and gow1.go's comment) describes.

### Level-1 blade FX record inventory (decode targets, exact offsets)

| Record | Size | First u32 | Meaning |
|---|---|---|---|
| `MSH_BDepoly6Shape` @0x6bc0 | 768 B | `0x18` | Raw-data tag 0x70; header counts (0x18/0x16 = 24/22), then dense float table (plausible ribbon spine points ~ blade-scale coords) |
| `MSH_BDepoly3Shape` @0x6ee0 | 768 B | `0x18` | Same layout |
| `FXC_BDepoly6` @0xc7c0 | 136 B | `0x000d001e` | FX server 0x1e, **subtype 0xd = poly-ribbon effect**; references `MSH_BDepoly6Shape` by name |
| `PTC_flame6` @0xc890 | 632 B | `0x13` | Particle server; own shape name "flame6Shape" |
| `FXC_BDEsparkemit` @0xcb70 | 228 B | `0x0003001e` | **Subtype 0x3 = spark emitter**; references "flame6Shape" + "BDepoly6Shape" |
| `FXC_BDepoly3` @0xcc80 | 136 B | `0x000d001e` | Ribbon effect for the 3-poly variant |
| `PTC_flame3` @0xcd50 | 632 B | `0x13` | |
| `FXC_BDEsparkemit.0` @0xd030 | 228 B | `0x0003001e` | |
| `MAT_chainlink` @0x21440, `MAT_chainglow` @0x25880, `MAT_swordtrail` @0x28880, `MAT_Bstage1TX*` | 120 B | `0x8` | **Parseable today with mat.go layout** — this is where the game's real blend modes for chain/glow/trail live |

God-tier group (same WAD, later offsets) repeats every record plus `FXC_EGemit`/`PTC_EGpart`/`FXC_EGgrav` (subtype `0xc` = gravity/force?) and `FXC_BDEsparkemit2` (subtype `0x2`). Hero-side `extracted/kratos/fx/` holds six more FXC (all 228 B, **all subtype 0x2**: BFTemit1/2, BGTemit1/2, CNGemit, FXCFemit) and six PTC (520–568 B). So: **subtype 0x2 decode covers 7 records, 0x3 covers 3, 0xd covers 4, 0xc covers 1** — and every PTC shares one 0x13 layout with a variable-length tail (PTC_flame6 is 632 B at stage1, 568 B in the god group → size field at `+0x50` is real, tail is variable curve/key data).

### Observed FXC internal structure (MEDIUM confidence — structural, not yet semantic)

Common prologue across all subtypes: `u32 subtypeMagic` at `+0x00`; `u32` flags-ish at `+0x08` (`0xffff0000`/`0xffff0001`); **4×4 float local transform at `+0x10..0x4C`** (identity for BDepoly; BDEsparkemit carries translate row `(0, 0.226, -9.172)` — an emitter offset along the blade); `u32 selfSize` at `+0x50`; then **NUL-terminated name references** (`"MSH_BDepoly6Shape"`, `"flame6Shape"`) followed by float parameters — observed values `0.75`, `1300`, `0.5`, `6.283 (=2π)`, `±1.0` (rate/cone/lifetime candidates). PTC prologue mirrors it (magic, matrix, selfSize, own name), then floats (`0.05`, `16.0`, `-1, -1`), byte params, a u16 index table (`0xffff000c`-style entries — frame/curve indices), and float triples (`1,1,1` — color multiplier candidate).

**Critical parser rule:** name fields contain dev-machine memory garbage after the NUL (`"ow\Z_drive"`, `"x.TXR" p "c:"` fragments). Strings must be read strictly NUL-terminated.

## System Overview

```
┌────────────────────────── load time ───────────────────────────────┐
│  fetch R_WPN0_0.WAD ──► Parsers.parseWad ──► WadDir                │
│                                    (name→record index, nearest-    │
│                                     preceding-name resolution)     │
│  WadDir ──► FxParse.build ──► FxDb                                 │
│    ├─ parseMat   (port of mat.go)      → materials{blend,dw,tex}   │
│    ├─ parseShape (MSH_*Shape floats)   → shapes                    │
│    ├─ parsePtc   (0x13 layout)         → particleDefs              │
│    └─ parseFxc   (per subtype 2/3/c/d) → emitterDefs ──refs──►     │
│                                          shapes/particleDefs/mats  │
├────────────────────────── frame time ──────────────────────────────┤
│  combat.js ─► anim.js (pose + type-5 state + type-10 blade tracks) │
│      │                                                             │
│  updateSkinning()  ── world mats, bladeSim mats ──►  Fx.update(dt) │
│      │                    ├─ emitter enable ← type-5 state         │
│      │                    ├─ particle pool step (world space)      │
│      │                    └─ geometry builders → dynamic VBO       │
│      ▼                        (links / shape-ribbons / sprites)    │
│  render():                                                         │
│    pass 1  opaque    hero + blade meshes   depth RW, no blend      │
│    pass 2  cutout    chain links (discard) depth RW, no blend      │
│    pass 3  blended   Fx.draw(passList)     depth R only, blend per │
│                                            MAT flags               │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|---|---|---|
| `Parsers.parseWad` (extend `parsers.js`) | Walk a raw WAD buffer into an ordered node list + by-name index with *nearest-preceding* resolution (matches gow1.go semantics; handles the duplicate level-1/god names correctly) | ~40 lines; the record format is already documented in `extracted/README.md` |
| `fxparse.js` (new) | Pure decode: bytes → plain JS descriptor objects. `parseMat`, `parseShape`, `parsePtc`, `parseFxc` (dispatch on subtype). Resolves cross-record name refs against WadDir. Tags every field `real` vs `inferred` | No GL, no DOM — testable by dumping JSON |
| `fx.js` (new) | Runtime: emitter instances bound to joint/blade matrices; CPU particle pool; geometry builders (ChainLinks, ShapeRibbon, SpriteBatch); pass-sorted draw with MAT-driven GL state | Owns one interleaved dynamic VBO + the fx shader (extend existing fxProg) |
| `matgl` (small table in fx.js) | The **only** place PS2 blend semantics map to WebGL: Additive→`(SRC_ALPHA, ONE)`, Usual→`(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)`, Substract→`blendEquation(FUNC_REVERSE_SUBTRACT)`+`(SRC_ALPHA, ONE)`, DisableDepthWrite→`depthMask(false)`, FilterLinear→sampler filter | Replaces the current hardcoded `uAdd` flag |
| `anim.js` (extend) | Decode + sample the type-5 act descriptor (blade show/hide/fire state per mogaika's `DATATYPE_UNKNOWN5` comment) alongside the already-decoded type-10 blade tracks | Same state-descriptor walking code path |
| `app.js` (modify) | Orchestration only: load-time `FxParse.build`, per-frame `Fx.update(dt, world, bladeSim, bladeState)` after `updateSkinning`, and replace the body of `drawFx` with `Fx.draw(mvp, passes)` | Existing structure (`updateSkinning → render → drawFx`) is preserved; `drawFx` becomes pass-driven |
| `combat.js` | Unchanged | — |

## Recommended Project Structure

```
tools/kratos-lab/
├── parsers.js      # + parseWad(buf) → WadDir  (mesh/texture code untouched)
├── fxparse.js      # NEW — MAT/MSH-shape/PTC/FXC byte decoders → FxDb
├── fx.js           # NEW — emitters, particle pool, builders, pass renderer
├── anim.js         # + type-5 state descriptor decode/sampling
├── combat.js       # unchanged
├── app.js          # wire-up: build FxDb at load; Fx.update/Fx.draw per frame
└── README.md       # + FXC/PTC/MSH format docs as they're decoded
```

**Rationale:** decode (fxparse.js) and runtime (fx.js) split so the decode work is verifiable without a renderer (dump JSON, diff across the 2× stage variants and 7× subtype-0x2 instances — differential comparison across instances is the primary decode technique). Keeping `parseWad` in parsers.js keeps all byte-level I/O in one file, per existing convention. No build step; two new `<script>` tags.

## Data Flow

1. **Load:** one fetch of `R_WPN0_0.WAD` (166 KB) → `parseWad` → WadDir → `FxParse.build(dir, Parsers.decodeTexture)` → `FxDb` with fully resolved object graph: `emitterDef.shape` → shape object, `emitterDef.particle` → particle def, `particleDef.material` → material → GL texture. Loading the raw WAD in-browser (rather than adding more extraction outputs) reproduces the engine's name-directory mechanism, which the FXC name references *require*, and keeps `extracted/` churn at zero.
2. **Per frame (after `updateSkinning`, before draw):** sample type-5 state → gate emitters; step particle pool **in world space** (spawn at current blade matrix, then integrate freely — this is what makes fire trail behind a whipping blade instead of sticking to it); builders write interleaved verts `(pos, uv, rgba)` into per-pass CPU arrays.
3. **Draw:** app.js `render()` draws opaque as today, then calls `Fx.draw(mvp)`, which uploads the dynamic VBO once and iterates the pass list, switching GL blend/depth state per MAT flags.

## Part 3 — Render Pass Ordering (PS2-style compositing)

| # | Pass | Content | Depth test | Depth write | Blend |
|---|---|---|---|---|---|
| 1 | Opaque | Hero mesh, blade meshes | ✓ | ✓ | off |
| 2 | Alpha cutout | Segmented chain links (chainlink texture, `discard` on alpha < ~0.5) | ✓ | **✓ on** | off |
| 3a | Alpha blend ("Usual" MATs) | Smoke/soft particles if any MAT demands it | ✓ | off | `(SRC_ALPHA, 1-SRC_ALPHA)`, back-to-front |
| 3b | Additive | chainglow overlay, BDepoly fire ribbons, flame/spark sprites, swordtrail | ✓ | off | `(SRC_ALPHA, ONE)` — **no sorting needed** (additive is commutative) |

Rules and rationale:

- **Chain links write depth** (pass 2). Cutout-with-depth-write is how PS2 alpha-test geometry composites: links occlude each other, the hero, and — critically — the additive fire drawn later reads that depth so flames vanish correctly behind links and body. The current code already does cutout for chains but must keep depth write on and run *before* all blended passes. Expect `MAT_chainlink` to confirm (RenderingUsual + DisableDepthWrite unset); if its flags disagree, the MAT wins — that's the data-first rule.
- **Glow over links without z-fighting:** draw chainglow as the *same* link vertices (or slightly inflated) with `depthFunc(LEQUAL)` (already GL default) and depth write off — equal-depth fragments pass, no polygon offset hacks needed if geometry is shared.
- **All blended passes: depth test ON, depth write OFF** — the existing swordtrail path already does exactly this (`depthMask(false)` + `(SRC_ALPHA, ONE)`); generalize it into the pass loop.
- **Ordering within additive doesn't matter; ordering *between* classes does:** opaque → cutout → alpha-blend → additive. Additive must come last or alpha-blended fragments drawn after it would incorrectly dim glow.
- **PS2 alpha convention pitfall:** GS treats texel alpha 0x80 as 1.0 (0…0xFF spans 0…~2.0). Verify what `Parsers.decodeTexture` emits for the 4bpp FX palettes; additive intensity will read ~half-strength vs the console if 0x80 maps to 0.5. Handle once in the material mapper (alpha ×2 clamp), not per-effect.
- MAT `Substract` (bit 25) maps to `blendEquation(FUNC_REVERSE_SUBTRACT)` — WebGL1 core supports this; no extension needed.

## Part 4 — Suggested Build Order

```
1. parseWad (WadDir)            ── foundation, no deps
2. MAT decode + matgl mapper    ── needs 1  ── immediate visible payoff on
                                   existing chain/trail draws; validates 1
3. Pass-list restructure of drawFx / Fx.draw skeleton
                                ── needs 2
4. Chain link builder + glow pass (links along existing chain curve,
   MAT_chainlink/MAT_chainglow-driven)
                                ── needs 3; independent of FXC/PTC decode
5. MSH_*Shape decode            ── needs 1; diff stage1(768B) vs god(1008B)
6. PTC decode                   ── needs 1,2; diff 8 instances (520–632B)
7. FXC decode by subtype        ── needs 5,6 (resolves refs into them);
   order: 0x2 (7 instances → most data), 0x3, 0xd, 0xc
8. Particle sim + sprite batch + shape-ribbon runtime in fx.js
                                ── needs 6,7 (real values to drive it)
9. Type-5 ANM descriptor decode (anim.js) → emitter/blade-state gating
                                ── independent decode; integrates into 8
10. Chain motion (catenary / whip-lag)
                                ── pure sim, independent; anytime after 4
11. Footage comparison + tuning of the labeled-inferred residue
                                ── needs everything
```

Dependency shape: **two parallel tracks after step 3** — the chain-visual track (4, 10) needs no new decoding, while the fire/spark track (5→6→7→8→9) is decode-gated. Step 2 is deliberately early: it is the cheapest real-data win (mat.go is a known-good spec) and de-risks the pass architecture before any novel decoding.

## Anti-Patterns

### 1. Hardcoding blend state per effect
**What people do:** keep the `uAdd` boolean and per-effect `gl.blendFunc` calls.
**Why it's wrong:** violates the project's data-first constraint; MAT records carry the real blend mode, depth-write, and blend color per texture — including cases you'd guess wrong (e.g. Substract).
**Instead:** single MAT→GL mapping table; every FX draw states only *which material* it uses.

### 2. Guessing FXC fields from one record
**What people do:** stare at one 228-byte dump and assign meanings.
**Why it's wrong:** single-instance interpretation is unfalsifiable.
**Instead:** differential decode — 7 subtype-0x2 instances (hero) + stage1/god pairs of every weapon record give multiple data points per field; fields that differ across BFT/BGT/CNG variants are the tunables, constant fields are structure. Also mine `hashes.dump.txt` in the mogaika repo ("Emitter Rotate", "Emitter Translate", PTC_* names) for engine vocabulary.

### 3. Fixed-length string reads
**What:** reading 24-byte name fields as content. Records contain dev-machine garbage after NUL (`"ow\Z_drive"`). Read strictly NUL-terminated; compare only the terminated prefix.

### 4. Local-space particle simulation
**What:** updating particles in blade-local space so they inherit the blade transform every frame.
**Why it's wrong:** fire rigidly glued to a whipping blade reads completely wrong vs footage — real flames spawn at the blade and lag in world space.
**Instead:** spawn with the blade's world matrix, integrate in world space (the FXC local transform positions the *spawn point*, e.g. sparkemit's `(0, 0.226, -9.172)` offset).

### 5. Per-particle draws or additive sorting
**What:** one draw call per sprite, or depth-sorting additive particles.
**Why it's wrong:** WebGL1 draw-call overhead; additive blending is order-independent so sorting is wasted work.
**Instead:** one interleaved dynamic VBO, one draw per (material, pass) bucket — the existing `fxBuf` pattern, extended.

### 6. Global-unique name lookup in the WAD directory
**What:** `dir[name]` flat map.
**Why it's wrong:** R_WPN0_0.WAD holds level-1 *and* god variants of `MSH_BDepoly6Shape`, `FXC_BDepoly6`, `PTC_flame6`… A flat map silently resolves level-1 emitters to god-tier shapes.
**Instead:** nearest-preceding-node resolution (what mat.go does via `GetNodeByName(name, node.Id-1)`), plus gow1.go's rules: server instances overwrite same-name predecessors, raw-data nodes are first-wins.

## Performance Considerations

| Concern | Assessment |
|---|---|
| Particle counts | PS2-era budgets: tens per emitter, low hundreds total. CPU sim + one VBO upload/frame is negligible next to the existing CPU skinning of 7.4k verts. |
| Draw calls | ≤ ~8 per frame added (one per material/pass bucket). |
| WAD parse | 166 KB, load-time only. |
| 60 fps target | No architectural risk; frame budget remains dominated by existing CPU skinning. |

## Integration Points

| Boundary | Communication | Notes |
|---|---|---|
| `fxparse.js` ↔ `parsers.js` | `Parsers.parseWad`, `Parsers.decodeTexture`, `Parsers.fetchBuf` | fxparse consumes, never touches GL |
| `fx.js` ↔ `app.js` | `Fx.init(gl, fxDb)`, `Fx.update(dt, world, bladeSim, bladeState)`, `Fx.draw(mvp, modelMat)` | called exactly where `drawFx` sits today; `render()` keeps opaque passes |
| `anim.js` ↔ `fx.js` | `rig.bladeState(act, t)` (new, type-5) alongside existing `rig.bladePos` (type-10) | anim.js owns all ANM byte-walking |
| `combat.js` | none new | machine state already reaches fx via which act is playing |

## Sources

- `mogaika/god_of_war_browser` (GitHub, cloned 2026-07-24): `pack/wad/mat/mat.go` (full MAT spec), `pack/wad/gow1.go` (tag semantics, MSH raw-data comment), `pack/wad/anm/anm.go` (datatype table incl. type 5/10), `pack/wad/obj/obj.go` (unimplemented particle fields), `pack/wad/mesh/mesh.go`, `pack/wad/txr/txr.go`, `pack/wad/gfx/gfx.go` (handler magics), `hashes.dump.txt` (engine name vocabulary) — HIGH confidence.
- First-party binary inspection of `extracted/wads/R_WPN0_0.WAD` and `extracted/kratos/fx/*` (record walk + hexdump, this session) — HIGH for inventory/offsets/sizes/magics, MEDIUM for field interpretations flagged above.
- Existing code: `tools/kratos-lab/app.js` (`updateSkinning`/`render`/`drawFx` at lines 418/538/469), `tools/kratos-lab/README.md`, `extracted/README.md` (WAD record format) — HIGH.

---
*Architecture research for: kratos-lab data-driven PS2 FX layer*
*Researched: 2026-07-24*
