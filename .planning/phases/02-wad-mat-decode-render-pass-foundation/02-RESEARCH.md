# Phase 2: WAD/MAT Decode & Render-Pass Foundation - Research

**Researched:** 2026-07-24
**Domain:** In-browser WAD container parsing, MAT record decode, PS2-GS-authentic WebGL1 render-state foundation (blend/depth table, 0x80=1.0 conventions, fixed 60Hz tick, native-res render target)
**Confidence:** HIGH — every load-bearing claim verified this session against the shipping `R_WPN0_0.WAD` bytes and/or the upstream `god_of_war_browser` source

## Summary

This phase has an unusual property: **almost nothing about it is unknown anymore.** During this research session the entire `R_WPN0_0.WAD` (169,760 B, 283 records) was walked first-party with the documented record format, every one of the 24 real MAT records was decoded with the mat.go layout, and the complete blend-tuple inventory was produced: **exactly two distinct tuples exist across all weapon MATs** — `usual | depth-write ON | linear` (18 layers, incl. `MAT_chainlink`) and `additive | depth-write OFF | linear` (6 layers: `MAT_chainglow`, `MAT_swordtrail`, god variants, blade icons). The mat.go field offsets and flag bits were re-verified against upstream source, and wad.go confirmed the nearest-preceding-name resolution semantics (backward scan from the referencing node). The planner can treat the decode targets as a known-answer test: the phase's own enumeration deliverable must reproduce the inventory in this document.

Two implementation-level discoveries from the first-party walk correct assumptions in existing project docs: (1) the record header's first field is **`u16 tag + u16 flags`, not a `u32 type`** — real server-instance records carry tags like `0x0006001E` (tag 0x1E, flags 0x6), so a parser comparing the full u32 against 0x1E sees only the size-0 back-references and misses every data record; (2) **GroupEnd markers (tag 0x32) carry the name of their group's head record** (e.g., record #252 is a 0-byte tag-0x32 record named `MAT_chainlink`), so a naive backward name-scan that doesn't filter by tag/size will resolve names to empty markers. Both are cross-wire hazards the success criteria explicitly guard against.

The rendering-foundation half (REND-01/REND-03) is a set of small, well-understood changes to `tools/kratos-lab/app.js`: add `alpha: false` to the context creation (currently missing — classic additive-washout pitfall), replace the hardcoded `uAdd` FX flag with a single MAT→GL mapping table that asserts on unknown tuples, restructure the rAF loop into a fixed 1/60s accumulator, and add a 512×448 FBO + blit-quad toggle. All required GL features are core WebGL1; no extensions, no libraries, no packages.

**Primary recommendation:** Build `parseWad` + `parseMat` as pure decode functions in `parsers.js`/`fxparse.js` (Node-testable against the known inventory in this doc), then drive the existing chain/trail draws from `MAT_chainlink`/`MAT_chainglow`(Phase 3)/`MAT_swordtrail` state via one `matgl` table, and land the loop/canvas/FBO conventions in the same phase — they are the highest-retrofit-cost items in the project.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEC-01 | MAT records fully decoded (blend mode bits, depth-write, filtering) and every FX draw uses its material's real blend/depth state via the GS→WebGL blend mapping | MAT layout + flag bits verified against mat.go source AND against all 24 weapon MAT records first-party (§Verified MAT Inventory); complete blend-tuple enumeration produced (§Blend Tuple Inventory); MAT→GL mapping table specified (§Pattern 3) with unknown-tuple assert; nearest-preceding name resolution verified in wad.go + demonstrated on the level-1/god `MSH_BDepoly6Shape` pair (§Pattern 2) |
| REND-01 | PS2-authentic compositing: clamped LDR gamma-space additive saturating to flat white, 0x80=1.0 at texture/CLUT/modulate/blend stages, no bloom/tonemap/soft-particles | Per-stage 0x80 conventions table with current-code audit (§0x80 Conventions — what exists, what's missing); canvas `alpha:false` requirement + magenta test (§Pattern 5); saturation behavior is native to 8-bit clamped additive blending — nothing to build, only invariants to not violate |
| REND-03 | Fixed 60Hz simulation timestep and native-res (512×448-class) render-target toggle before formal footage comparison | Accumulator pattern specified against the actual app.js loop structure with sim/derived-state split (§Pattern 6); 512×448 FBO + blit quad spec incl. WebGL1 NPOT rules for the 448 dimension (§Pattern 7) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Binding directives extracted from ./CLAUDE.md — the planner must not contradict these:

- **Vanilla WebGL1 + JS, no build step, no external libraries**; all assets loaded from `extracted/` raw game files. New code = new `<script>` tags in `tools/kratos-lab/index.html`.
- **Data-first**: where the game stores a value, the renderer uses it; hand-tuning only for runtime-computed quantities, and those must be labeled inferred.
- **Target: Level 1 blades** (stage1 textures, chainlink/chainglow/swordtrail). God-tier records exist in the same WAD and must never cross-wire — but are not rendered.
- **Performance**: stay ~60fps interactive in the browser pane.
- **MAT→GL starting mapping** (from CLAUDE.md, re-verified this session against RenderChain.js): usual → `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`, depth write on; additive → `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE)`, depth write off; subtract → `FUNC_REVERSE_SUBTRACT` + `(SRC_ALPHA, ONE)`.
- **Do NOT add**: post-process bloom/tonemap/soft-particles, sRGB/gamma management, mipmaps on FX textures, depth-sorted additive particles, `gl.POINTS` sprites, any npm runtime dependency.
- **0x80 = 1.0 everywhere**: CLUT alpha ×255/128 clamped; vertex colors ÷128; TFX MODULATE `>>7`; blend FIX ÷128. Shader-premultiply + `ONE, ONE` for any alpha > 0x80.
- **Core-WebGL1 only**: `blendEquation` (ADD/SUBTRACT/REVERSE_SUBTRACT), `blendFuncSeparate`, `blendColor`/CONSTANT_COLOR are all core; no extension gates; never mix CONSTANT_COLOR- and CONSTANT_ALPHA-family factors in one call.
- **GSD workflow enforcement**: file changes go through GSD commands (plan-phase → execute-phase).

## Architectural Responsibility Map

This is a single-page browser app + static Node file server; "tiers" here are the app's internal layers, which the existing code already separates cleanly.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WAD container walk + name resolution | Decode layer (`parsers.js`) | — | Pure bytes→records; no GL, no DOM; Node-testable. Same file already owns all byte-level I/O (mesh, textures) |
| MAT record decode → material descriptors | Decode layer (`fxparse.js`, new) | — | Pure decode, separate file per the established ARCHITECTURE.md plan; keeps parseWad generic and MAT-specific knowledge isolated |
| Blend-tuple enumeration + assert-on-unknown | Decode layer (`fxparse.js`) | Dev console/UI readout | Enumeration is a decode-time pass over all MATs; surfacing the inventory is presentation |
| MAT→GL state mapping (`matgl` table) | Render layer (`fx.js` new, or app.js) | — | The ONLY place PS2 blend semantics touch WebGL calls; replaces the `uAdd` boolean |
| Chain/trail draw state (uses matgl) | Render layer (`app.js` `drawFx`) | — | Existing draw sites; Phase 2 re-states them from decoded MATs, does not redesign their geometry (Phase 3 does) |
| Fixed 60Hz accumulator | Sim loop (`app.js` main loop) | `combat.js` (unchanged — already takes dt) | Loop restructure only; `machine.tick`, blade sim, trail aging become fixed-step consumers |
| Native-res FBO + blit toggle | Render layer (`app.js` `render()`) | UI hint text | Wraps the existing render body; blit quad is a second trivial program |
| Canvas context attributes (`alpha:false`) | Render layer (app bootstrap) | — | Context attributes are fixed at first `getContext` call — must change at the creation site |
| Serving the WAD bytes | Static server (`server.js`) | — | Already serves the whole project root incl. `extracted/wads/*.WAD` with correct octet-stream MIME; zero changes needed |

## Standard Stack

This is a **technique stack** — the project bans runtime dependencies. Nothing is installed in this phase.

### Core

| Technique | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `fetch` + `DataView`/`Uint8Array` WAD walk | Web platform | Load `extracted/wads/R_WPN0_0.WAD` (166 KB, one fetch) and walk records | Same pattern as existing `Parsers.fetchBuf`/`parseMesh`; format verified first-party this session `[VERIFIED: first-party WAD walk]` |
| mat.go MAT layout (ported to JS) | god_of_war_browser master | Decode all MAT records: header 0x38 + 0x40/layer | Battle-tested across the whole game's assets; re-verified against source AND against all 24 weapon MATs this session `[VERIFIED: mat.go source + first-party decode]` |
| Core-WebGL1 blend state (`blendFuncSeparate`, `blendEquation`, `depthMask`) | WebGL 1.0 core | Implement the MAT→GL table | No extensions needed for any observed or plausible tuple `[CITED: CLAUDE.md Version Compatibility]` |
| Fixed-timestep accumulator ("Fix Your Timestep" pattern) | — | 60Hz sim decoupled from rAF | Industry-standard; mandated by PITFALLS.md P5 (retrofit = rewrite of tuning) `[CITED: .planning/research/PITFALLS.md]` |
| WebGL1 FBO (`framebufferTexture2D` + depth renderbuffer) + textured blit quad | WebGL 1.0 core | 512×448 native-res target; WebGL1 has no `blitFramebuffer` | Only way to do offscreen-then-upscale in WebGL1 `[VERIFIED: WebGL1 spec knowledge, core API]` |

### Supporting

| Technique | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| Node plain-assert test scripts | Node v24.15.0 (present) | Known-answer tests for parseWad/parseMat against the inventory in this doc | Wave 0 + every decode task; dev-side only, not a runtime dep (precedent: `server.js`, `gen_twk.js`) |
| `if (typeof module !== "undefined") module.exports = …` guard on parser IIFEs | — | Lets Node `require()` the same files the browser loads via `<script>` | Needed once per decode file; harmless in browser |
| Spector.js browser extension | current | Frame-capture to verify per-draw blend/depth state matches the MAT table | Manual verification of REND-01 criteria; not a dependency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| One `matgl` table keyed on decoded flag tuple | Per-effect hardcoded blendFunc (status quo) | Never — violates data-first; the current `uAdd` boolean is exactly what DEC-01 replaces |
| Backward flat scan for name resolution | Full mogaika node-tree (groups as scopes) | Tree is more work for identical results on this WAD; backward scan from the referencing record replicates `GetNodeByName(name, id-1, false)` exactly `[VERIFIED: wad.go source]` |
| 512×448 FBO + blit quad | `canvas.width=512;height=448` + CSS upscale | CSS scaling changes the canvas for ALL passes and breaks the full-res inspect mode; FBO keeps the toggle instant and per-frame |
| Render-once-per-sim-tick (skip redundant renders) | Interpolated rendering between ticks | The game is 60Hz; interpolation adds complexity and un-PS2 smoothness. Not needed for the success criterion ("decoupled accumulator") |

**Installation:** none — no packages, no build step.

**Version verification:** N/A — zero external packages are installed by this phase (`npm view` etc. not applicable).

## Package Legitimacy Audit

**This phase installs no external packages.** The project constraint bans runtime dependencies outright, and the dev-side test scripts use only Node built-ins (`fs`, `assert`). slopcheck run: not applicable — there is nothing to check. If any plan task proposes an `npm install`, that is a constraint violation, not a legitimacy question.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Verified First-Party Data (decode targets — treat as known-answer tests)

All values below were produced this session by walking `extracted/wads/R_WPN0_0.WAD` with a Node script implementing the documented record format. `[VERIFIED: first-party WAD walk, 2026-07-24]`

### WAD container facts

- 283 records, file ends exactly at the last aligned record boundary (format documented in `extracted/README.md` is correct, with the header-field correction below).
- **Record header (32 B): `u16 tag` @+0, `u16 flags` @+2, `u32 size` @+4, `char name[24]` @+8**, data follows, next record at `align16(off + 32 + size)`. The `extracted/README.md` description "u32 type" is imprecise: real server instances have nonzero high-u16 flags (observed: MAT=0x6, GFX/SHG=0x3, FXC=0x4, PTC=0x8, CDV=0x7, MDL=0x16, mesh-payload=0x19, CXT/SCRX/MDLX/EEPR headers=0x1). **Parse the tag as u16.** `[VERIFIED: wad.go header struct + first-party observation]`
- Tags present: 0x1E (server instance, 70×), 0x28/0x32 (GroupStart/GroupEnd, 59× each), 0x70 (raw data, 4× — the two MSH shapes × two tiers), 888/666/999 decimal (0x378/0x29A/0x3E7 — WAD header/heap/pop markers, one each). No 0x18 heap records in this WAD.
- **Size-0 tag-0x1E records are back-references** (e.g., #108 `MAT_Bstage1TX` size 0 inside the MDL group references the real #96) — they are how records declare dependencies. **Size-0 tag-0x32 GroupEnd records carry the group head's name** (e.g., #252 named `MAT_chainlink`). Both must be excluded from name-resolution *targets* (resolution must land on data-carrying records only).
- Duplicate names abound (46 distinct duplicated names). The critical level-1/god same-name pairs with **different data**: `MSH_BDepoly6Shape` (#104 @0x6BC0, 768 B level-1 vs #189 @0x13C80, 1008 B god), `MSH_BDepoly3Shape` (#105/#190), `FXC_BDepoly6` (#115 @0xC7C0 vs #203 @0x1DBC0), `PTC_flame6` (#117, 632 B vs #205, 568 B), `FXC_BDEsparkemit`, `FXC_BDepoly3`, `PTC_flame3`, `MAT_M01splash`, `MAT_lambert1New`, `MAT_M01blurredSplotch`, `MAT_oftFire_lambert1New`. Chain/glow/trail MATs use distinct names per tier (`MAT_chainlink` vs `MAT_godchainlink`) — the cross-wire risk is concentrated in the MSH/FXC/PTC/M01 names.
- Complete level-1 FX texture groups live at the WAD tail with a strict GFX→PAL→TXR→(GroupStart)→MAT ordering: chainlink (#247–#252), godchainlink, chainglow (#259–#264), godchainglow, swordtrail (#271–#276), godswordtrail. `GFX_chainlink`/`GFX_chainglow` are 8216 B (= 24 B header + 8192 = 512×32 4bpp), PALs 88 B (16-color CSM1); `GFX_swordtrail` 2072 B (64×32 8bpp), PAL 1048 B (256-color). All power-of-two. **The byte sizes match the files in `extracted/weapon/` exactly** — the extracted files are these records' payloads, so texture decode via the existing `Parsers.decodeTexture` will work unchanged on WAD-sourced bytes.
- `LeftBladeLight`/`RightBladeLight` (88 B, tag 0x1E flags 0x6) are at #99/#102 — Phase 6 (REND-02) will read them through this same parser; no extra work now beyond not choking on them.

### Verified MAT inventory (all 24 real MAT records)

Header magic `0x8`; layer count = 1 for every record (120 B = 0x38 + 0x40). Key records:

| MAT | flags0 | Mode | DepthWrite | Filter | BlendColor RGBA | MaterialColor RGB | Texture ref |
|-----|--------|------|-----------|--------|-----------------|-------------------|-------------|
| `MAT_chainlink` @0x21440 | `0x44010080` | usual | **ON** | linear | 1,1,1,1 | 1,1,1 | `TXR_chainlink` |
| `MAT_chainglow` @0x25880 | `0x48090080` | **additive** | **OFF** | linear | 1,1,1,1 | 1,1,1 | `TXR_chainglow` |
| `MAT_swordtrail` @0x28880 | `0x48090080` | **additive** | **OFF** | linear | 1,1,1,1 | 1,1,1 | `TXR_swordtrail` |
| `MAT_Bstage1TX` / `TX1` / `TX2` | `0x44010084` | usual | ON | linear | 1,1,1,1 | 0.8,0.8,0.8 | `TXR_Stage1Btx` |
| `MAT_M01splash` / `M01blurredSplotch` | `0x44010080` | usual | ON | linear | 1,1,1,1 | 0.8,0.8,0.8 | splash/splotch TXRs |
| `MAT_lambert1New` / `oftFire_lambert1New` / `pticleMat` | `0x44010000` | usual, **no texture** | ON | linear | **2,2,2,1** | 0.4,0.4,0.4 | (none) |
| `MAT_Bldicon` / `Bldicon1` (god group) | `0x48090080` | additive | OFF | linear | **0, 0.15, 0.9, 1** | 0.8,0.8,0.8 | icon TXRs |
| god variants (godchainlink etc.) | same flags as level-1 twins | — | — | — | 1,1,1,1 | 1,1,1 | god TXRs |

Notes for the decoder: bit 2 (`0x4`) appears only on the three Bstage blade-texture MATs — unparsed by mogaika, meaning unknown; record it, don't act on it. Bit 30 (`0x40000000`) is set on **every** real MAT — also unparsed by mogaika; record, don't act. `FloatUnk` = 1.0 and `GameFlags` = 0 on every weapon MAT (no UV/color animation on these materials — flipbook/scroll animation is a hero-side/Phase-5 concern).

### Blend Tuple Inventory (the success-criterion-2 expected answer)

| Tuple (mode, depthWrite, filter) | Layer count | Materials |
|----------------------------------|------------|-----------|
| usual, dw ON, linear | 18 | Bstage1TX/TX1/TX2, lambert1New ×2, M01splash ×2, oftFire_lambert1New ×2, M01blurredSplotch ×2, Bstage5TX/TX1/TX2, pticleMat, lambert5, chainlink, godchainlink |
| additive, dw OFF, linear | 6 | Bldicon, Bldicon1, chainglow, godchainglow, swordtrail, godswordtrail |

No subtract (bit 25), no "strange" (bit 24), no nearest-filter, no usual-with-dw-off exists in this WAD. The phase's enumerator must output exactly these two tuples; anything else is a decoder bug. Subtract/strange stay in the mapping table as assert-guarded paths for hero-side MATs (`MAT_Csmoke`, `MAT_firesploch1` in `extracted/kratos/materials/` may use them — enumerating those is optional stretch, not required by the criteria which say "weapon MATs").

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────── load time ─────────────────────────────┐
│ fetch extracted/wads/R_WPN0_0.WAD                                  │
│        │                                                           │
│        ▼                                                           │
│ Parsers.parseWad(buf) ──► WadDir { records[], resolve(name, from)} │
│        │                        (backward scan, data-carrying only)│
│        ▼                                                           │
│ FxParse.buildMats(wadDir) ──► MatDb { name → {mode, depthWrite,    │
│        │                        filter, blendColor, matColor,      │
│        │                        texName, rawFlags} }               │
│        ▼                                                           │
│ FxParse.enumTuples(MatDb) ──► tuple inventory (console + UI card)  │
│                               unknown tuple ⇒ throw               │
├──────────────────────────── frame time ────────────────────────────┤
│ rAF(now) ─► acc += clamp(now-last)                                 │
│   ├─ while acc ≥ 1/60: simStep(1/60)                               │
│   │      machine.tick → FK pose → blade track sample →             │
│   │      driveBlade → trail history push/age → heat                │
│   └─ renderFrame():                                                │
│        bind target (native? FBO 512×448 : canvas)                  │
│        pass 1 opaque: hero + blades (depth RW)                     │
│        pass 2 chain ribbon: matgl(MatDb["MAT_chainlink"])          │
│        pass 3 trail:        matgl(MatDb["MAT_swordtrail"])         │
│        restore state (FUNC_ADD, depthMask true, blend off)         │
│        if native: blit FBO → canvas (fullscreen quad, LINEAR)      │
└────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

Per the established ARCHITECTURE.md plan (keep it — it's right):

```
tools/kratos-lab/
├── parsers.js      # + Parsers.parseWad(buf) → WadDir; + module.exports guard
├── fxparse.js      # NEW — parseMat + tuple enumeration → MatDb (pure, no GL)
├── fx.js           # NEW or in app.js this phase — matgl table + applyMaterial(gl, mat)
├── app.js          # loop restructure (accumulator), context alpha:false,
│                   # native-res FBO toggle, drawFx state from MatDb
├── test/           # NEW — Node known-answer tests (dev-side, not served/runtime)
│   └── wad.test.js
└── index.html      # + <script src="fxparse.js">, <script src="fx.js">
```

### Pattern 1: WAD record walk (verified implementation)

```javascript
// Source: extracted/README.md format + wad.go header struct, verified against
// R_WPN0_0.WAD this session (283 records, clean EOF)
function parseWad(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const records = [];
  let off = 0;
  while (off + 32 <= buf.length) {
    const tag = dv.getUint16(off, true);        // u16, NOT u32
    const flags = dv.getUint16(off + 2, true);
    const size = dv.getUint32(off + 4, true);
    let name = "";
    for (let i = 0; i < 24; i++) { const c = buf[off + 8 + i]; if (!c) break; name += String.fromCharCode(c); }
    const dataOff = off + 32;
    records.push({ idx: records.length, off, tag, flags, size, name, dataOff });
    const dataSize = tag === 0x18 ? 0 : size;   // heap decl: size is reservation, no data
    off = (off + 32 + dataSize + 15) & ~15;
    if (dataSize > buf.length - dataOff) throw new Error(`WAD record ${name} overruns buffer`); // bounds check
  }
  return records;
}
```

**When to use:** load time, once. Strings are strictly NUL-terminated (bytes after NUL are dev-machine garbage — established project rule).

### Pattern 2: Nearest-preceding-name resolution

```javascript
// Source: wad.go GetNodeByName(name, searchStart, searchForward=false)
// — "for i := searchStart; i >= 0; i--" [VERIFIED: wad.go source]
// Resolution targets must carry data: tag 0x1E (server instance) or 0x70 (raw
// data) with size > 0. This skips size-0 back-references AND the named
// GroupEnd markers (tag 0x32) discovered first-party.
function resolve(records, name, fromIdx) {
  for (let i = fromIdx - 1; i >= 0; i--) {
    const r = records[i];
    if (r.name === name && r.size > 0 && (r.tag === 0x1e || r.tag === 0x70)) return r;
  }
  return null; // caller decides: throw with record name (bounds-checked, named errors)
}
```

**Known-answer tests (from the first-party walk):**
- `resolve("MSH_BDepoly6Shape", from=#115 FXC_BDepoly6@0xC7C0)` → #104 @0x6BC0 (768 B, level-1)
- `resolve("MSH_BDepoly6Shape", from=#203 FXC_BDepoly6@0x1DBC0)` → #189 @0x13C80 (1008 B, god) — **this pair IS the never-cross-wire criterion**
- `resolve("TXR_chainlink", from=#251 MAT_chainlink)` → #249 @0x213A0 (88 B), not the GroupEnd #252

### Pattern 3: MAT decode + matgl mapping table

```javascript
// Source: mat.go layout + ParseFlags bits [VERIFIED: mat.go source, 2026-07-24]
// Header 0x38: magic u32(=0x8)@+0, color RGB f32@+8; layerCount u32@+0x34.
// Layer 0x40 @ header+0x38 + n*0x40: Flags[4] u32@+0, texName[24]@+0x10,
// blendColor RGBA f32@+0x28, floatUnk f32@+0x38, gameFlags u32@+0x3C.
// Flags[0]: bit7 HaveTexture, bit16 FilterLinear, bit19 DisableDepthWrite,
// bits 24/25/26/27 = strange/subtract/usual/additive (exactly one may be set
// — mat.go errors on >1; we also error on 0-of-4 for a real layer).

const MATGL = {
  // key: `${mode}` — depthWrite is carried separately from bit 19, it is NOT
  // implied by the blend mode (they merely correlate in this WAD)
  usual:    (gl) => { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
                      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE); },
  additive: (gl) => { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
                      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE); },
  subtract: (gl) => { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
                      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); },
  // "strange" (bit 24): no GL path — must assert if ever hit
};
function applyMaterial(gl, mat) {
  const fn = MATGL[mat.mode];
  if (!fn) throw new Error(`Unmapped blend mode '${mat.mode}' in ${mat.name}`); // assert, never default
  fn(gl);
  gl.depthMask(!mat.disableDepthWrite);
  // blendColor/materialColor -> shader uniforms (floats, already 1.0-based;
  // values up to 2.0 observed — multiply in-shader BEFORE blending so >1 survives)
}
```

Reference mapping cross-checked against god_of_war_browser's viewer: usual → `blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE)` + `depthMask(true)`; additive → `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE)` + `depthMask(false)`; **both re-issue `blendEquation(FUNC_ADD)` before each batch** (state-reset discipline). `[VERIFIED: RenderChain.js via WebFetch this session]` Material color and layer blend color are separate shader uniforms multiplied in the fragment shader (`uMaterialColor`, `uLayerColor` in the reference viewer).

### Pattern 4: 0x80 conventions — per-stage audit of what exists vs what Phase 2 adds

| Stage | Convention | Current code status | Phase 2 action |
|-------|-----------|--------------------|----------------|
| CLUT/texture alpha | 0x80 = opaque; ×255/128 clamp | **Already correct** in `parsers.js` `decodeTexture`: `a >= 0x80 ? 255 : a * 2` | None — do not "fix" it to /255 |
| Vertex color bytes (mesh AO) | ÷128 | **Already correct**: `col[...] = b[...] / 128` | None |
| MAT material/blend colors | Stored as floats, already 1.0-based (observed 0.4/0.8/1.0/2.0) | Not read at all | Pass as uniforms; multiply in-shader before blending (2.0 must survive → premultiplied output where needed) |
| TFX MODULATE (tex × vertex/layer color) | `(Ct × Cv) >> 7` → in GLSL: `tex.rgb * color` where color is the ÷128 (or float) value; ×2 headroom only via values > 1.0, never a blanket ×2 | FX shader currently does ad-hoc `c.rgb * vT.z` | Replace with `tex × uLayerColor × uMaterialColor (× vertex color when present)` |
| Blend C term / FIX | ÷128; >0x80 → shader premultiply + `ONE, ONE` | N/A (no FIX in MAT bits; ABCD-level data arrives via Phase-5 GS dump) | Architecture must not preclude: keep the premultiply variant documented in matgl comments |
| Canvas compositing | dest alpha must not leak to page | **Missing**: context is `{ antialias:true, preserveDrawingBuffer:true }` — no `alpha:false` | Add `alpha:false` at the single `getContext` call (attributes are fixed at first creation; verify with magenta-background test) |
| Gamma | naive 8-bit gamma-space math IS the target | Correct by default (no sRGB/tonemap anywhere) | Add a code comment locking it (TARGET-DEFINITION.md is the citable authority) |

### Pattern 5: Canvas + compositing invariants (REND-01)

- `canvas.getContext("webgl", { alpha: false, antialias: true, preserveDrawingBuffer: true })` — keep the existing two attributes (`preserveDrawingBuffer` serves the screenshot/verification hooks), add `alpha: false`. Note `getContext` with different attributes on a canvas that already has a context **returns the existing context unchanged** — the attribute must go into the one creation site in app.js.
- `clearColor` alpha component becomes irrelevant with `alpha:false`, but set `clearColor(0,0,0,1)` anyway (currently `0,0,0,0`) so FBO-path clears are also opaque.
- Saturation-to-white needs no code: clamped 8-bit additive blending saturates natively. The phase's job is to *not* add anything that prevents it (no float FBO for the native-res target — use `gl.RGBA`/`UNSIGNED_BYTE`, which clamps exactly like the canvas).
- Verification: magenta page-background test (FX must not change), Spector.js capture showing per-draw blend/depth state equals the MAT table's output, stacked trail passes reaching flat 255 white.

### Pattern 6: Fixed 60Hz accumulator (REND-03) — applied to the actual app.js loop

Current: `loop(now)` computes `dt = min(0.05, elapsed)` and calls `step(dt)` (which runs `machine.tick`, `render`, `renderTimeline`) once per rAF — pure variable-step. Restructure:

```javascript
// Source: standard fixed-timestep pattern; split chosen for this codebase's
// cost profile (CPU skinning of 7.4k verts is the expensive part)
const STEP = 1 / 60;
let acc = 0, last = performance.now();
function loop(now) {
  acc += Math.min((now - last) / 1000, 0.25);  // stall clamp — no spiral of death
  last = now;
  let stepped = false;
  while (acc >= STEP) { simStep(STEP); acc -= STEP; stepped = true; }
  if (stepped || viewDirty) renderFrame();      // render latest state; no interpolation
  renderTimeline();
  requestAnimationFrame(loop);
}
```

- `simStep(STEP)`: `machine.tick`, FK pose (`rig.computePose` — cheap relative to skinning), blade-track sampling + `driveBlade`, **trail history push/age** (this matters: TRL-01 later requires stepped-60Hz trail extrusion, so trail points must be recorded per tick, not per rAF), heat decay, blend-window bookkeeping (`skin.blendLeft`).
- `renderFrame()`: CPU skinning (`skinPose`) + `bufferSubData` + draw passes — derived state, computed once per rendered frame from current sim state. On a 144Hz display the sim still runs exactly 60 steps/s and unchanged frames can skip re-render (camera drag sets `viewDirty`).
- Keep `window.KratosLab.step` as a deterministic `simStep+renderFrame` for the automated-verification hooks (it's used today).
- Verification: log sim-steps-per-second (must read 60±1 on any display); the existing `frame N @30fps` timeline readout must still track clip time correctly.

### Pattern 7: Native-res render target toggle (REND-03)

```javascript
// 512×448: width POT, height NPOT. WebGL1 NPOT rules: fine as an FBO color
// texture with CLAMP_TO_EDGE + LINEAR/NEAREST and no mipmaps — all true here.
const rt = { w: 512, h: 448 };
const rtTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, rtTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rt.w, rt.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);   // bilinear upscale = the authentic soft look
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const rtDepth = gl.createRenderbuffer();
gl.bindRenderbuffer(gl.RENDERBUFFER, rtDepth);
gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, rt.w, rt.h);
const fbo = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtTex, 0);
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rtDepth);
// assert gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
```

Per frame when the toggle is on: bind fbo, `viewport(0,0,512,448)`, aspect for the projection = the **display** aspect (see Open Question 1), render all passes, bind null framebuffer, viewport to canvas, draw the blit quad (own trivial program — do not reuse the FX program, to avoid state coupling). Toggle via a keybind + status-line indicator; default OFF (full-res inspect) until Phase 7 comparisons.

### Anti-Patterns to Avoid

- **Comparing the full u32 tag field against 0x1E/0x70:** misses every data record (they carry nonzero flag high-u16s). First-party-verified failure mode.
- **Flat `dir[name]` map or forward search for resolution:** silently cross-wires level-1 emitters to god shapes (`MSH_BDepoly6Shape` 768 B vs 1008 B). Backward scan from the referencing record, data-carrying targets only.
- **Defaulting unknown blend tuples to alpha blend:** the criterion demands an assert. Silent defaulting is how mistranslations ship (PITFALLS.md P2).
- **Deriving depthMask from the blend mode:** bit 19 is a separate flag. It correlates with additive in this WAD but the table must read the bit, not the correlation.
- **Blanket ×2 on colors "because PS2":** the ÷128 rule applies to byte-encoded alpha/vertex values only; MAT colors are already-normalized floats (2.0 appears in data where overbright is intended); texel RGB is plain 0–255.
- **Round-tripping FX textures through a 2D canvas before upload:** 2D canvases are premultiplied — texImage2D from a canvas loses color in low-alpha texels. The current FX path uploads `ImageData` directly (lossless); keep it that way for chainglow/swordtrail. (The skin atlas's canvas round-trip is tolerable — skin alpha is ~all 255 — but never copy that pattern for FX.)
- **Adding interpolation/smoothing to the fixed-step render:** the game presents discrete 60Hz states; smoothness is anti-authentic here (PITFALLS.md P7 logic applies to time as well as space).
- **"Fixing" `a >= 0x80 ? 255 : a*2` in decodeTexture to `/255`:** it is correct as-is (mogaika's `×255/128` clamped, in integer form).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MAT field layout | Your own offset guesses / re-RE | mat.go layout (verified twice this session) | Battle-tested across the whole game's assets; already fully specified above |
| Name-resolution semantics | Invented scoping rules | wad.go `GetNodeByName` backward-scan semantics | It's what the engine-alike reference does; verified against the actual duplicate-name pairs in this WAD |
| GS blend → GL mapping | Per-effect experimentation | CLAUDE.md ABCD table (derived from PCSX2 `m_blendMap`) + the RenderChain.js MAT-bit mapping | The mapping is already authoritative research; Phase 5's GS dump upgrades it to fact |
| Game-loop timing | Ad-hoc dt scaling / setInterval | Fixed accumulator pattern (Pattern 6) | setInterval drifts and stalls; dt-scaling is exactly what P5 forbids |
| Offscreen upscale | Manual pixel copy / CSS trickery | FBO + textured blit quad | WebGL1's one supported path; 6 lines of setup |
| Record inventory / expected decode results | Fresh discovery during execution | The Verified First-Party Data section above | It was walked this session; the plan should assert against it, not rediscover it |

**Key insight:** this phase's risk is not "can it be decoded" (it was, during research) — it's *fidelity of transcription*. Known-answer tests against the tables in this document eliminate that risk nearly for free.

## Common Pitfalls

### Pitfall 1: u16-vs-u32 tag confusion
**What goes wrong:** Parser tests `record.type === 0x1E` on a u32 read; all real server instances (tag u16 0x1E + flags 0x3/0x4/0x6/0x8…) fail the test; only 0-byte back-references match; loader appears to work but every record is "empty."
**Why it happens:** `extracted/README.md` says "u32 type" (imprecise); the u32 read *happens to work* for name-keyed walks, hiding the issue until tag filtering is added.
**How to avoid:** Read `u16 tag` @+0, `u16 flags` @+2 (wad.go struct). Test: tag histogram of R_WPN0_0.WAD must show 70× tag 0x1E.
**Warning signs:** resolution finds only size-0 records; "server instance" counts near zero.

### Pitfall 2: Name resolution landing on markers
**What goes wrong:** Backward scan matches GroupEnd #252 (`MAT_chainlink`, 0 B) or a size-0 back-reference instead of the real record; decode reads garbage at a marker's dataOff.
**Why it happens:** GroupEnd markers carry the group head's name (first-party discovery); back-references reuse names by design.
**How to avoid:** Resolution targets = `size > 0 && (tag === 0x1E || tag === 0x70)`. Known-answer test: `TXR_chainlink` from #251 → #249.
**Warning signs:** decoded MAT magic ≠ 0x8; NaN floats; layer counts in the thousands (this exact garbage was observed when the research scan initially decoded markers).

### Pitfall 3: Context attributes silently ignored
**What goes wrong:** `alpha:false` added in a second `getContext` call (or after any code path already created the context) does nothing — the browser returns the existing context; the magenta test then fails mysteriously.
**How to avoid:** One creation site; attribute goes there. Verify at runtime: `gl.getContextAttributes().alpha === false`.
**Warning signs:** FX tint changes with page CSS background.

### Pitfall 4: State leaks between passes
**What goes wrong:** A pass leaves `depthMask(false)` or a non-ADD `blendEquation` set; the next frame's opaque pass or clear misbehaves ("slightly wrong glow", disappearing geometry). `gl.clear` respects `depthMask` — a leaked false mask breaks depth clearing.
**How to avoid:** matgl applies full state per pass (never assumes prior state); explicit restore after the FX block: `blendEquation(FUNC_ADD)`, `depthMask(true)`, `disable(BLEND)`. Reference viewer does exactly this per batch.
**Warning signs:** Spector.js shows unexpected inherited state; first frame after toggling native-res looks different from steady state.

### Pitfall 5: Accumulator interacting with the auto-frame camera and test hooks
**What goes wrong:** Camera easing (`dist += (target-dist) * min(1, dt*…)`) and `autoSpin` currently consume the same dt as sim; moving them into 60Hz sim changes feel, leaving them in render with wall dt is correct but easy to forget — worse, `window.KratosLab.step(dt)` is used by automated verification and silently changes meaning.
**How to avoid:** Explicit split list (sim: machine/pose/blade/trail/heat; presentation: yaw autospin, camera easing, dist). Keep `KratosLab.step` semantics: one fixed sim step + one render, documented in the hook.
**Warning signs:** verification scripts drive different behavior than live rAF; camera speed changes with monitor refresh rate.

### Pitfall 6: FBO pass breaking existing screenshot/verify workflows
**What goes wrong:** With the native-res toggle on, the default framebuffer only ever contains the blit result; anything reading pixels mid-frame or assuming direct canvas rendering (Spector captures, `preserveDrawingBuffer` screenshots) sees the quad, not the scene draws.
**How to avoid:** Fine — that IS the output — but document it; keep the toggle default-off; ensure `readPixels`-based checks read after blit.
**Warning signs:** black screenshots with toggle on; viewport left at 512×448 for the blit (forgot to restore to canvas size).

### Pitfall 7: Treating the two-tuple result as the final mapping table
**What goes wrong:** Implementer hardcodes only `usual` and `additive` paths because that's all the weapon WAD contains; Phase 5/6 hit hero-side subtract smoke (`MAT_Csmoke`) and silently mis-render.
**How to avoid:** Table carries usual/additive/subtract with subtract untested-but-present, strange + none-of-four as throws. The assert is the contract.
**Warning signs:** a later phase's MAT decode throws in production — which is the designed behavior; the pitfall is *removing* the throw instead of adding the mapping.

## Code Examples

Verified patterns are inline in §Architecture Patterns (Patterns 1–3, 6, 7 are the load-bearing ones — the WAD walker and MAT decoder in Pattern 1/3 are condensed from the actual script run against the shipping WAD this session). Additional known-answer material for tests:

```javascript
// wad.test.js — known-answer assertions (values from 02-RESEARCH.md,
// first-party verified 2026-07-24)
const assert = require("assert");
const fs = require("fs");
const Parsers = require("../parsers.js");           // needs module.exports guard
const FxParse = require("../fxparse.js");
const buf = new Uint8Array(fs.readFileSync(require("path").join(__dirname, "../../../extracted/wads/R_WPN0_0.WAD")));
const recs = Parsers.parseWad(buf);
assert.strictEqual(recs.length, 283);
assert.strictEqual(recs.filter(r => r.tag === 0x1e).length, 70);
const mats = FxParse.buildMats(recs, buf);
assert.strictEqual(mats["MAT_chainlink"].mode, "usual");
assert.strictEqual(mats["MAT_chainlink"].disableDepthWrite, false);
assert.strictEqual(mats["MAT_chainglow"].mode, "additive");
assert.strictEqual(mats["MAT_chainglow"].disableDepthWrite, true);
assert.strictEqual(mats["MAT_swordtrail"].rawFlags0, 0x48090080);
const tuples = FxParse.enumTuples(mats);
assert.strictEqual(tuples.length, 2);               // the whole inventory
// cross-wire guard: level-1 vs god MSH resolution
const fxcL1 = recs.find(r => r.name === "FXC_BDepoly6" && r.off === 0xc7c0);
const fxcGod = recs.find(r => r.name === "FXC_BDepoly6" && r.off === 0x1dbc0);
assert.strictEqual(FxParse.resolve(recs, "MSH_BDepoly6Shape", fxcL1.idx).off, 0x6bc0);   // 768 B
assert.strictEqual(FxParse.resolve(recs, "MSH_BDepoly6Shape", fxcGod.idx).off, 0x13c80); // 1008 B
```

Note the decode files need the dual-environment guard (browser `<script>` global + Node require):

```javascript
// end of parsers.js / fxparse.js — no build step, works in both environments
if (typeof module !== "undefined" && module.exports) module.exports = Parsers;
```

## State of the Art

| Old Approach (current code) | Current Approach (this phase) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-file `.bin` fetches from `extracted/weapon/` | One raw WAD fetch + in-browser record walk with name resolution | Phase 2 | Engine-faithful name directory; unlocks MSH/FXC/PTC access for Phase 5 with zero extraction churn (extracted files verified byte-identical to WAD payloads, so texture decode is unchanged) |
| Hardcoded `uAdd` boolean; trail = `SRC_ALPHA, ONE` guess; chain = discard-cutout guess | `matgl` table driven by decoded MAT flags; unknown tuples throw | Phase 2 | Data-first compliance; trail's guess happens to match `MAT_swordtrail` (additive, dw off — now confirmed from data); chain moves to usual-blend + depth-write ON per `MAT_chainlink` |
| Variable-dt rAF loop (`dt = min(0.05, elapsed)`) | Fixed 1/60 accumulator; sim/presentation split | Phase 2 | Rates/lifetimes authored per-tick become usable as-is in Phases 4–6; density identical across display refresh rates |
| Direct-to-canvas at client resolution | Optional 512×448 FBO + bilinear blit toggle | Phase 2 | Authentic softness; mandatory before any formal comparison (Phase 7 gate) |
| Context `{antialias, preserveDrawingBuffer}` | + `alpha: false`, opaque clear | Phase 2 | Kills page-compositing washout of additive passes |

**Deprecated/outdated:** none externally — god_of_war_browser master is the current (and only) reference implementation; PCSX2 ≥ 2.0 remains the GS-dump tool for Phase 5.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MAT flag bits compile to the assumed GS ABCD configs (bit 27 ≙ `0201`, bit 26 ≙ `0101`, bit 25 ≙ `2001`) `[ASSUMED — engine-level inference; MAT-bit meanings themselves are VERIFIED]` | matgl table | Blend factors could differ subtly (e.g., additive could be `0221` FIX-driven). Phase 5's GS dump is the designed confirmation step; the matgl table isolates any correction to one file |
| A2 | Native-res display treatment: FBO at 512×448, displayed stretched to 4:3 (GS output had non-square pixels) `[ASSUMED — display-aspect convention; storage size is documented]` | Pattern 7 / Open Q1 | Comparison framing vs Phase-1 PCSX2 stills could mismatch; cheap to change (one quad-scale constant). Confirm against actual Phase-1 PNG dimensions when Wave 2 lands |
| A3 | Chain-link alpha-cutout threshold (current `discard < 0.35`) has no data source; GS alpha-test (TEST register) values are not in MAT records `[ASSUMED]` | drawFx restatement | Retain alongside usual-blend as INFERRED-labeled companion; Phase 5 GS dump reads the real TEST register |
| A4 | gow1.go directory rules ("server instances overwrite same-name predecessors; raw-data nodes first-wins") complement backward search `[CITED: .planning/research/ARCHITECTURE.md quoting gow1.go; backward search itself VERIFIED in wad.go]` | Pattern 2 | Both observed reference patterns in this WAD resolve correctly under plain backward scan; risk ≈ 0 for this WAD |
| A5 | Wrap modes for FX strips (REPEAT-U chainlink/swordtrail, CLAMP flame/glow) are convention, not decoded — TXR records (88 B, unparsed this phase) may encode them `[ASSUMED]` | Texture state | Visual seam artifacts if wrong; current code already uses this convention and it renders plausibly; TXR parse can be added via mogaika txr.go if Phase 3 footage comparison disputes it |
| A6 | Hero-side MATs (Csmoke, firesploch1 in `extracted/kratos/materials/`) may contain tuples beyond the weapon-WAD two (e.g., subtract) `[ASSUMED — not decoded this session]` | Pitfall 7 | None for this phase (criteria scope = weapon MATs); the assert path is the protection |

## Open Questions (RESOLVED — adopted by the Phase 2 plans)

1. **Native-res display aspect: 8:7 raw or 4:3 stretched?** — RESOLVED: 02-04-PLAN.md encodes the recommendation verbatim (4:3 letterbox default, 8:7 as one constant, non-blocking; revisit when Phase-1 stills land).
   - What we know: GS renders 512×448; NTSC displays stretched it to 4:3. PCSX2 software-renderer screenshots at native internal res are 512×448-class raw dumps; its display applies aspect correction. Phase-1 capture stills (the comparison partner) don't exist yet — Phase 1 paused mid-capture.
   - What's unclear: which presentation Phase 7's side-by-side will use.
   - Recommendation: render FBO at 512×448; blit stretched to 4:3 by default with an 8:7 raw option (one constant). Revisit when Phase-1 stills exist; don't block on it.
2. **Should the opaque hero/blade mesh draws route through matgl this phase?** — RESOLVED: no; 02-02-PLAN.md scopes matgl to chain/trail draws only (mesh materials deferred to Phase 3).
   - What we know: criterion 2 names "existing chain/trail draws"; blade-surface MATs decode as usual/dw-on which the current opaque draw approximates (it ignores blending entirely).
   - Recommendation: no — scope creep. Enumerate ALL weapon MATs (required), apply state to chain + trail draws (required), leave mesh materials to Phase 3 where the chainlink ribbon is rebuilt anyway.
3. **Where does the tuple inventory surface?**
   - Recommendation: console table at load + a line in the existing "Extraction stats" side card (`blend tuples: 2 (usual/dw-on, additive/dw-off)`), so criterion 2's "enumerated in one pass" is user-visible, not just testable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server.js, dev test scripts | ✓ | v24.15.0 | — |
| Browser w/ WebGL1 | kratos-lab runtime | ✓ (project's existing runtime) | — | — |
| `extracted/wads/R_WPN0_0.WAD` | the phase's input data | ✓ | 169,760 B, walked clean | — (gitignored; local-only by design) |
| `extracted/weapon/*.bin` | existing texture loads (unchanged) | ✓ | byte-identical to WAD payloads | load from WAD instead |
| Spector.js extension | manual blend-state verification | unverified (browser extension) | — | `gl.getParameter` dumps from console via KratosLab hook |
| PCSX2 | NOT needed this phase (GS dump = Phase 5) | n/a | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Spector.js (fallback: programmatic state dumps — adequate).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none exists; use plain Node scripts with `node:assert` (no framework install — respects zero-dependency constraint; precedent: `server.js`, `gen_twk.js`) |
| Config file | none — see Wave 0 |
| Quick run command | `node tools/kratos-lab/test/wad.test.js` |
| Full suite command | `for f in tools/kratos-lab/test/*.test.js; do node "$f" || exit 1; done` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEC-01 | parseWad: 283 records, 70 server instances, header fields correct | unit (Node) | `node tools/kratos-lab/test/wad.test.js` | ❌ Wave 0 |
| DEC-01 | Nearest-preceding resolution: level-1 vs god `MSH_BDepoly6Shape` land on 0x6BC0/0x13C80; `TXR_chainlink` skips the GroupEnd marker | unit (Node) | same file | ❌ Wave 0 |
| DEC-01 | MAT decode: chainlink=usual/dw-on, chainglow+swordtrail=additive/dw-off, blend colors, raw flags | unit (Node) | same file | ❌ Wave 0 |
| DEC-01 | Tuple enumeration returns exactly 2 tuples; synthetic unknown-tuple input throws | unit (Node) | same file | ❌ Wave 0 |
| DEC-01 | Live draws use MAT state (not hardcoded) | browser + manual | Spector.js / `KratosLab` state dump: trail draw shows `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE)` + `depthMask false`; chain draw `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` + `depthMask true` — manual-only because it inspects GPU state mid-frame | checkpoint:human-verify |
| REND-01 | `alpha:false` active | browser console | `KratosLab` hook exposing `gl.getContextAttributes().alpha === false` (assertable via preview console) | ❌ Wave 0 (hook) |
| REND-01 | Magenta-background test; additive stacks saturate flat white; no bloom/tonemap anywhere | browser + manual | visual check per PITFALLS "Looks Done But Isn't" — manual-only (perceptual) | checkpoint:human-verify |
| REND-03 | Accumulator: sim steps == 60/s regardless of rAF rate | unit (Node) for the pure accumulator function (feed synthetic wall-clock deltas incl. 144Hz + stall patterns, assert step counts + clamp) | `node tools/kratos-lab/test/loop.test.js` | ❌ Wave 0 |
| REND-03 | Native-res toggle renders 512×448 and upscales; framebuffer complete | browser | `KratosLab` hook: toggle + assert `checkFramebufferStatus` complete + readPixels sanity; visual softness check manual | checkpoint:human-verify |

### Sampling Rate
- **Per task commit:** `node tools/kratos-lab/test/wad.test.js`
- **Per wave merge:** full suite loop + browser checkpoints where the wave touched render state
- **Phase gate:** full suite green + all human-verify checkpoints passed before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tools/kratos-lab/test/wad.test.js` — covers DEC-01 decode criteria (known-answer values in this doc)
- [ ] `tools/kratos-lab/test/loop.test.js` — covers REND-03 accumulator (requires accumulator as a pure exported function)
- [ ] `module.exports` guards on `parsers.js` + new `fxparse.js` — enables Node tests without a build step
- [ ] `KratosLab` debug hooks: context attrs, current pass state dump, native-res toggle, sim-step counter

## Security Domain

Local single-user dev tool, static file server, no auth/session/user input surfaces. Config has no `security_enforcement` key → treated as enabled; most ASVS categories are structurally N/A.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | localhost-only static server, no accounts |
| V3 Session Management | no | stateless static serving |
| V4 Access Control | partial | `server.js` already guards path traversal (`filePath.startsWith(ROOT)`); keep it — it serves the project root |
| V5 Input Validation | **yes** | Binary-parser hardening: bounds-check every record offset/size against buffer length before reads; strictly NUL-terminated strings; fail with the record name in the error (PITFALLS.md Security table) |
| V6 Cryptography | no | none needed |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/truncated WAD sizes → OOB reads, tab crash | DoS | Bounds checks in parseWad (Pattern 1 includes one); named-record error messages |
| Committing copyrighted disc content | Info. disclosure / legal | Already mitigated: `.gitignore` has `extracted/**` (README excepted); tests read the WAD from its gitignored location — never copy game bytes into `test/` fixtures or planning docs |
| Marker records decoded as data (garbage floats into GL) | Tampering (self-inflicted) | Resolution tag/size filter (Pattern 2); MAT magic==0x8 assertion before layer walk |

## Sources

### Primary (HIGH confidence)
- **First-party walk of `extracted/wads/R_WPN0_0.WAD`** (Node script, this session) — record inventory, tag histogram, duplicate-name table, all 24 MAT decodes, blend-tuple inventory, byte-size match with `extracted/weapon/*`
- [mogaika/god_of_war_browser `pack/wad/mat/mat.go`](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/mat/mat.go) — fetched this session: header/layer offsets, ParseFlags bits 7/16/19/24–27, mutual-exclusion validation
- [mogaika/god_of_war_browser `pack/wad/wad.go`](https://github.com/mogaika/god_of_war_browser/blob/master/pack/wad/wad.go) — fetched this session: `u16 Tag + u16 Flags + u32 Size + name[24]` header; `GetNodeByName` backward iteration
- [god_of_war_browser `web/data/static/js/RenderChain.js`](https://github.com/mogaika/god_of_war_browser/blob/master/web/data/static/js/RenderChain.js) — fetched this session: usual/additive `blendFuncSeparate` mappings, per-batch `blendEquation(FUNC_ADD)` reset, depthMask policy, uMaterialColor/uLayerColor uniforms
- Existing code read in full: `tools/kratos-lab/app.js` (context attrs, loop, drawFx, test hooks), `parsers.js` (decodeTexture 0x80 alpha handling, ImageData upload path), `server.js`, `index.html`
- `./CLAUDE.md` — GS ABCD→WebGL table, 0x80 conventions, anti-feature list (project-verified research, treated as binding)
- `.planning/research/ARCHITECTURE.md` + `STACK.md` + `PITFALLS.md` (2026-07-24) — FXC/PTC structural priors, pass ordering, pitfall catalogue; independently re-verified where load-bearing for this phase
- `reference/TARGET-DEFINITION.md` — locked "GS output as captured, not CRT" target and exclusions

### Secondary (MEDIUM confidence)
- gow1.go directory-rule comments (server-instance overwrite / raw-data first-wins) — via ARCHITECTURE.md direct quotes; not re-fetched this session (backward-scan behavior independently verified)
- WebGL1 NPOT/FBO/context-attribute semantics — spec-level knowledge, consistent with the existing codebase's working NPOT-free texture usage; not re-cited to a fetched page

### Tertiary (LOW confidence)
- none — no unverified WebSearch findings were used

## Metadata

**Confidence breakdown:**
- WAD/MAT decode targets: HIGH — first-party verified against the shipping bytes AND upstream source; expected outputs are enumerated in this document
- Render-state mapping: HIGH for the MAT-bit→GL starting table (two independent verified sources + data confirming the expected chainlink/chainglow/swordtrail modes); MEDIUM for exact GS ABCD equivalence (A1 — Phase 5 GS dump confirms by design)
- Loop/FBO/canvas conventions: HIGH — core-WebGL1 mechanics applied to fully-read existing code
- Pitfalls: HIGH — two were discovered empirically this session (u16 tag, named GroupEnd markers); the rest inherit from verified project research

**Research date:** 2026-07-24
**Valid until:** stable — the WAD bytes and upstream repo are static; revisit only if Phase 5's GS dump contradicts A1 (~30+ days safe)
