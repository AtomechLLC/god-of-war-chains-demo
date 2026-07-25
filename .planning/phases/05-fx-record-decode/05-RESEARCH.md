# Phase 5: FX Record Decode - Research

**Researched:** 2026-07-25
**Domain:** Original reverse-engineering of GoW1 (PS2, 2005) particle/emitter/shape binary records (FXC / PTC / MSH_BDepoly) — no public decode exists
**Confidence:** HIGH for record framing (byte-verified this session across 15+ instances); MEDIUM–LOW for individual field *semantics* (offsets located, meanings inferred, need footage/GS-dump/ELF corroboration)

## Summary

This is the project's core original-RE phase. Before this session no public tool decoded these records — mogaika's `god_of_war_browser` treats `MSH_BDepoly*Shape` as opaque `TAG_GOW1_FILE_RAW_DATA` (tag 0x70) and has no fxc/ptc/emitter parser at all. **This research changes that baseline: a hands-on differential hex pass over all on-disk instances this session recovered the FXC and PTC record framing directly from the bytes** — a fixed magic, a subtype selector, a 4×4 placement matrix, an embedded record size, a NUL-terminated cross-reference name, and a shared slot-id that links an emitter to its particle def. The MSH shape decodes cleanly as interleaved position+normal float pairs with a count header. The blade-light records decode to exactly the REND-02 published values (color 1.0/0.622/0.288, intensity 2.5), which independently validates that the float-reading approach is correct.

The decode method is **differential**: compare the 15+ record instances against each other to separate fixed framing from varying payload, then anchor varying fields to meaning using (a) Phase-1 footage color/timing anchors, (b) cross-record consistency, and (c) the known GS blend math in CLAUDE.md. Two structural facts fell out immediately and reshape downstream work: the fire-vs-swoosh (`BFT` vs `BGT`) emitters differ **only** in their referenced particle name and a small shape-geometry block — **not in any color field** — and the `GFX_swordtrail` texture carries **no painted length-wise age→color ramp** (it is a uniform soft additive streak, like `chainglow`). Both findings point the same way: effect *color* is a runtime tint (from `MAT_pticleMat`/texture/runtime), while the records own *placement, rates, sizes, lifetimes, and shape*.

**Primary recommendation:** Add three pure decoders — `parseMsh`, `parsePtc`, `parseFxc` — to the existing `FxParse` IIFE, mirroring the `buildMats`/`parseTxr` fail-loud idiom (size-gate → magic-assert → named field reads), and assemble their output into a JSON-dumpable `FxDb` keyed by record name with cross-references resolved (`FXC.slotId → PTC`, `FXC/PTC.shapeRef → MSH_* record or runtime handle`). Decode in the order MSH → PTC → FXC(subtype 0x2 first). Pin every recovered value with a `node:assert` known-answer test against the byte offsets in this document. Tag every field `real` (byte-decoded) or `INFERRED` (runtime-computed / footage-calibrated), per CLAUDE.md.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 — Payoff-first slice.** Prioritize records feeding the **swing trails and their spark particles** first. Slice 1 targets `BFT` (blade fire trail, crimson) + `BGT` (neutral swoosh trail) + the spark emitter (`FXC_BDEsparkemit`), plus inspecting `GFX_swordtrail` for a painted age→color ramp. Blade fire (`FXCF`/flame3/flame6) is slice 2; chain glow (`CNG`) refinement and MSH-only shapes are lower priority.
- **D-02 — Decode ORDER within each slice:** `MSH` (shapes) → `PTC` (particles, reference shapes) → `FXC` (emitters, reference particles); FXC subtype `0x2` first. Priority (D-01) picks *which effect family*; the order picks *how* to decode within it.
- **D-03 — Decode-first, aggressively.** Budget explicitly unconstrained. Use the differential-decode protocol (compare 15+ record instances) as the primary method.
- **D-04 — Escalate to ELF disassembly** for fields that resist decoding AND materially affect the look. Accept a **footage-calibrated INFERRED value (clearly labeled)** ONLY for fields that (a) genuinely won't decode after escalation, OR (b) the game computes/animates at runtime. Lean decode over infer.
- **D-05 — Disc region = NTSC-U** (confirmed from footage source `God of War_SCUS-97399_...`; `SCUS-97399` is the US serial). Rate/lifetime fields interpreted as **NTSC 60Hz tick units**.
- **D-06 — A PCSX2 GS dump is RECOMMENDED, not blocking.** It would upgrade per-effect blend-config confidence MEDIUM→HIGH. Plan the decode to be corroborated **primarily** by (a) differential decode, (b) Phase-1 freeze-frame color anchors, (c) cross-record consistency, so it does not stall without a GS dump. **NEEDS USER CONFIRMATION:** whether a GS dump can be captured; if yes, fold it in as blend/color ground truth.
- **D-07 — Defer the type-5 ANM descriptor (DEC-03)** out of the fast-track slice. It is blade *presentation*, not particles. Note it as a later Phase-5 slice or fold into Phase-6 blade work.

### Claude's Discretion
User answered "no preference" on which areas to discuss — all decisions above were made on the user's behalf, grounded in the project's data-first ethos, the unconstrained budget, and the user's stated priority (thick, particle-rich trails and prominent fire vs. reference footage). User can adjust any decision before planning proceeds.

### Deferred Ideas (OUT OF SCOPE)
- **Type-5 ANM blade-state descriptor** (blades on back vs in hands) — presentation, not particles; deferred out of the fast-track slice (D-07). Revisit later or with Phase-6 blade work.
- **Chain-glow (`CNG`) intensity refinement** — lower priority than trails/fire in slice 1; pursue in slice 2 alongside the alpha-over-1.0 intensity fix.
- **Phase 4 (chain motion)** — deferred entirely by the fast-track pivot.
- **`hitbox-visualization`** todo — concerns combat hitbox display, not FX decode. Out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DEC-02** | FXC emitter configs, PTC particle definitions, and MSH_BDepoly shapes decoded with a per-field evidence table (differential comparison across instances; ELF as tiebreaker); colors/rates/sizes/lifetimes come from these records | **Directly enabled.** This session byte-recovered the FXC/PTC/MSH framing and the cross-reference mechanism (see *Record Structure Investigation* + *Per-Field Evidence Tables*). Differential protocol defined (*Differential-Decode Protocol*). ELF tiebreaker path defined (*ELF-Disassembly Escalation Path*). **Nuance surfaced:** *rates/sizes/lifetimes/placement/shape* live in these records; *color* traces to `MAT_pticleMat`/texture/runtime, not to a static PTC RGBA (fire vs swoosh emitters are color-identical). |
| **DEC-03** | The type-5 ANM descriptor (blade show/hide state) decoded and driving in-hand vs on-back blade presentation | **DEFERRED per D-07** out of the fast-track slice. Lower-risk RE than DEC-02: mogaika's `pack/wad/anm/` *does* decode ANM (incl. `type8`), so type-5 has partial public precedent unlike FXC/PTC/MSH. WAD carries `ANM_maigodblade` (god tier) + the level-1 blade ANM. Planner should scope DEC-03 as a **later Phase-5 slice or Phase-6 blade work**, not part of slice 1/2. |
</phase_requirements>

---

## Architectural Responsibility Map

Tiers here are the project's **decode/data layers**, not web tiers. This maps each phase capability to the module that should own it, so the planner assigns tasks to the right file.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Locate + slice FX records from the WAD (or read standalone `.bin`) | `parsers.js` (`parseWad`, `resolve`) | — | Already owns WAD record access `{idx,off,tag,size,name,dataOff}` and nearest-preceding-name resolution; FX records are reached identically |
| Decode a single MSH_BDepoly shape (raw poly data, tag 0x70) | new `FxParse.parseMsh` | — | Pure byte decode; mirrors `buildMats`/`parseTxr` fail-loud idiom in `fxparse.js` |
| Decode a single PTC particle def | new `FxParse.parsePtc` | — | Same idiom; references shapes by name/slot |
| Decode a single FXC emitter config (subtype-branched) | new `FxParse.parseFxc` | — | Same idiom; references particles/shapes by name/slot; layout after +0x50 branches on subtype |
| Assemble records into a queryable `FxDb` with cross-refs resolved | new `FxParse.buildFxDb` | `parsers.js` `resolve` | Resolution reuses the WAD name→record machinery; the DB is the Phase-6 hand-off |
| Per-field evidence tables (offset, raw bytes, interp, corroboration, real/INFERRED) | RESEARCH.md + source comments + `node:assert` known-answers | this document | Data-first discipline; the test file is the authoritative pin (as in 03-02) |
| Blend/color ground-truth corroboration | PCSX2 GS dump (external, RECOMMENDED) | Phase-1 footage anchors; `MAT_*` decode already in `fxparse.js` | External verification tool, NOT a runtime dependency |
| Resistant-field tiebreaker | Ghidra + `ghidra-emotionengine-reloaded` on the NTSC-U ELF (external) | — | Escalation only; out of the normal decode loop |

---

## Standard Stack

**This phase installs ZERO external packages** — vanilla JS + `node:` built-ins only, per CLAUDE.md (no build step, no runtime deps). The "stack" is the existing in-repo decode idiom plus external *verification* tools that are not runtime dependencies.

### Core (in-repo, already present)
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `tools/kratos-lab/parsers.js` | current | `parseWad` record walk, `resolve` (nearest-preceding-name), `decodeTexture` | Already the WAD access + texture layer; FX records reached identically [VERIFIED: read this session] |
| `tools/kratos-lab/fxparse.js` (`FxParse` IIFE) | current | `buildMats`/`parseTxr` decode idiom to extend with `parseMsh`/`parsePtc`/`parseFxc`/`buildFxDb` | The fail-loud size-bound→magic→named-reads pattern the new decoders must copy [VERIFIED: read this session] |
| `node:assert` | Node v24.15.0 | known-answer tests (`test/*.test.js`, run as plain `node test/x.test.js`) | Project's only test tool; zero-dependency constraint [VERIFIED: `node --version` this session] |
| `node:fs` / `DataView` | Node v24.15.0 | read bytes, little-endian float/int reads | Already used throughout `parsers.js`/`fxparse.js` |

### Supporting (external VERIFICATION tools — NOT runtime deps)
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| **PCSX2** (Qt) | ≥ 2.0 | GS dump of a blade swing → read per-draw `ALPHA`(ABCD/FIX)/`TEX0`(TFX)/`TEST`/`ZBUF` | RECOMMENDED (D-06). Upgrades blend-config confidence MEDIUM→HIGH. Not blocking. |
| **Ghidra** + `ghidra-emotionengine-reloaded` | current | Disassemble the NTSC-U EE ELF (MIPS R5900 little-endian) to read how a resistant field is *used* | ESCALATION only (D-04), for look-critical fields that won't decode from bytes alone |
| **god_of_war_browser** | master | Cross-check ANM/MAT decode against a second implementation; confirms FXC/PTC/MSH are *undecoded* upstream (baseline) | RE cross-reference; already the project's established reference |
| **Spector.js** | current | Frame-capture kratos-lab to catch blend state leaks (Phase-6 concern) | Not this phase; noted for continuity |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend `FxParse` IIFE in `fxparse.js` | New `fxdb.js` module | A separate file is cleaner separation, but the TXR/MAT decoders already live in `FxParse` and share `readName`; keeping FX decode co-located reuses the idiom and the dual-env export guard. Recommend extending `FxParse`. |
| Differential decode as primary | GS-dump-first / ELF-first | Differential is zero-setup, reproducible in CI, and already productive (this session). GS-dump/ELF are corroboration/escalation, gated on availability. |
| Decode against `R_WPN0_0.WAD` in-WAD copies | Standalone `assets/kratos/fx/*.bin` | Use BOTH — they are byte-identical in format. **But note (Pitfall 1): the BFT/BGT/CNG/FXCF names are NOT in `R_WPN0_0.WAD`** — they are standalone-only. The WAD instead carries the *richer* slice-1/2 set (spark/flame/BDepoly/EG). |

**Installation:** None. Confirm the test harness runs: `node tools/kratos-lab/test/wad.test.js` (exit 0).

---

## Package Legitimacy Audit

**N/A — this phase installs no external packages.** The project constraint (CLAUDE.md) forbids build steps and runtime dependencies; all code is vanilla JS using `node:` built-ins (`assert`, `fs`) already in use. There is no `package.json` in `tools/kratos-lab/`. slopcheck / npm-registry verification does not apply. External verification tools (PCSX2, Ghidra, god_of_war_browser) are developer-machine tools, never imported by the shipped code.

---

## Record Structure Investigation (hands-on, byte-verified this session)

All offsets below were recovered by reading the actual bytes of every on-disk instance (6 standalone FXC, 6 standalone PTC, plus the in-WAD `FXC_BDEsparkemit`/`FXC_BDepoly3/6`/`FXC_EGemit`/`FXC_EGgrav`, `PTC_flame3/5/6`/`PTC_EGpart`, and `MSH_BDepoly3/6Shape`). The **standalone `.bin` files are the record DATA with no WAD header** — they start at the same bytes as the in-WAD `dataOff`, so format is identical across both sources.

### FXC record (emitter config)

Constant framing across ALL FXC instances (standalone + in-WAD): [VERIFIED: byte-diff this session]

| Offset | Type | Value / meaning | Evidence |
|--------|------|-----------------|----------|
| +0x00 | u16 | **0x001e** magic (constant across all 9 FXC read) | identical bytes every instance |
| +0x02 | u16 | **subtype** — `0x2` emitter (BFT/BGT/CNG/FXCF/EGemit), `0x3` spark (BDEspark), `0xc` gravity mod (EGgrav), `0xd` poly/flame-shape emitter (BDepoly3/6) | correlates with record family; matches CONTEXT "FXC subtype 0x2 first" |
| +0x04 | u32 | 0 | constant |
| +0x08 | u16 | **slot/class id** — 0x1d, 0x32, 0x01, 0x00… links FXC↔PTC (same id in the paired PTC) | `emit1`=0x1d, `emit2`=0x32 pair with `PTC_*part1/2` +0x08 |
| +0x0a | u16 | per-emitter index / `0xffff` root sentinel | sequential 5,6,7,8,9,10 across the standalone set; 0xffff on in-WAD roots |
| +0x0c | u32 | 0 | constant |
| +0x10..0x4f | f32[16] | **4×4 row-major placement matrix** (3×3 orthonormal rotation + translation row + `0,0,0,1`) | rows are unit-length & orthogonal; identity for parent-origin emitters (spark/flame); real rotation+translation for BFT/BGT/CNG |
| +0x50 | u32 | **record size in bytes** (0xe4=228 subtype-2/3; 0x88=136 subtype-0xd) | equals file/record length exactly |
| +0x54 | char[] | **NUL-terminated shape/particle reference name** (subtype 2/3) — e.g. `"BFTpart1Shape"`, `"flame6Shape"` | THE cross-reference field |
| +0x54 | u32 then char[] | subtype **0xd** puts a u32 count at +0x54, then the MSH name at +0x58 — e.g. `FXC_BDepoly3 → "MSH_BDepoly3Shape"` | layout after +0x50 **branches on subtype** |
| ~+0x60.. | f32[] | shape-geometry / emitter params (varies) | the fire-vs-swoosh distinguishing block |
| tail | f32[] | common defaults incl. **2π = 6.2832** at ~+0xbc (full-circle angle range) | identical across subtype-2 emitters |

### PTC record (particle definition) — VARIABLE LENGTH (520–632 bytes)

| Offset | Type | Value / meaning | Evidence |
|--------|------|-----------------|----------|
| +0x00 | u32 | **0x00000013** magic (constant across all 10 PTC read) | identical every instance |
| +0x04 | u32 | 0 | constant |
| +0x08 | u16 | **slot id** (matches the paired FXC +0x08) | `PTC_BFTpart1` +0x08 = `FXC_BFTemit1` +0x08 = 0x1d |
| +0x0a | u16 | `0xffff` / index | as FXC |
| +0x10..0x4f | f32[16] | 4×4 placement matrix (same convention as FXC; often identity) | `PTC_CNGpart` matrix == `FXC_CNGemit` matrix |
| +0x50 | u32 | record size (0x278=632 flame; varies) | equals record length |
| +0x54 | char[] | NUL-terminated `"...Shape"` name | e.g. `"flame3Shape"`, `"BFTpart1Shape"` |
| ~+0x64.. | f32[] | **particle params** — lifetimes/rates/sizes as NTSC 60Hz ticks (D-05); static RGBA in this region reads mostly identity (1,1,1) → color is runtime, not here | fire/swoosh/flame identical in the scanned float region |
| tail | mixed | **`"1555"` ASCII descriptor** (bytes `31 35 35 35`) + params — suspected 16-bit A1R5G5B5 texture-format tag for the particle sprite | present at the tail of ALL 6 PTC; `05 00 00 00` / `00 04 00 00` follow |

### MSH_BDepoly shape (tag 0x70 raw data — the opaque-to-mogaika record)

| Offset | Type | Value / meaning | Evidence |
|--------|------|-----------------|----------|
| +0x00 | u32 | **vertex count** (24 for `MSH_BDepoly3Shape` size-768) | header |
| +0x04 | u32 | 22 — suspected index/strip/triangle count | header |
| +0x08 | u32 | 0xffffffff sentinel | constant |
| +0x0c | u32 | 0xffffffff sentinel | constant |
| +0x10.. | f32 pairs | **interleaved (position vec3, normal vec3)** — v0 pos (0, 2.98, −13.68), v1 **normal (−0, 0.176, −0.984)** ‖·‖≈1.0, v2 pos, v3 normal ‖·‖≈1.0 … | normals decode unit-length → confirms the interleave |

> **Note on multiple copies / sizes:** records appear ~3× in the WAD (a full copy, sometimes a differently-sized copy, and size-0 back-references). `MSH_BDepoly3Shape` is **768 bytes at idx 105 but 1008 bytes at idx 190**; `PTC_flame6` is 632 at idx 117 but 568 at idx 205. `Parsers.resolve` (nearest-preceding, size>0, tag 0x1e/0x70) picks the correct copy per reference — the decoder must NOT assume a single fixed size. This size variance is itself differential signal (LOD or god-vs-stage1 variants).

### Cross-reference chain (the FxDb backbone)

```
FXC (emitter)  --slotId(+0x08)-->  PTC (particle)     [same 16-bit id links the pair]
FXC/PTC        --shapeRef(+0x54)-->  "…Shape" name
                                       ├─ "MSH_BDepoly*Shape"  → resolves to a WAD tag-0x70 raw record  (parseMsh)
                                       └─ "flame3Shape"/"BFTpart1Shape"/… → NO WAD record (runtime handle / self-shape)
FXC(subtype 0xd) --name(+0x58)-->  "MSH_BDepoly*Shape"   [explicit FXC→MSH link, byte-confirmed]
```
[VERIFIED this session] Only `MSH_*Shape` names resolve to WAD records; `flame3Shape`/`BFTpart1Shape`/`CNGpartShape` do **not** exist as records — they are engine-internal shape handles (likely the shape embedded in the PTC/FXC itself, registered under that name at load). The FxDb should store the raw reference string, resolve `MSH_*` names to records, and mark the rest `runtime-handle`.

---

## Differential-Decode Protocol (roadmap topic 1 — concrete method)

**Goal:** decode with NO format spec by letting the corpus reveal itself. Method, in order:

1. **Byte-diff to separate framing from payload.** For each record family, compute the set of byte offsets that are *constant* vs *varying* across instances (this session's `diff()` over the 6 FXC produced ranges `0x10-0x4b` (matrix), `0x54-0x60` (name), `0x62-0x83` (shape block) as the only varying regions — everything else is framing). Constant regions = magic/size/defaults; varying regions = the real payload to interpret. **Implement this as a committed `node` helper** so it re-runs in CI and pins the framing.

2. **Pair-diff to isolate one variable at a time:**
   - `emit1` vs `emit2` (same effect, second position) → isolates the **placement matrix** + name index (differ at 0x10–0x4a, 0x5b, shape block; params identical).
   - `BFT` vs `BGT` (fire vs swoosh, same location) → isolates the **shape/particle reference** (differ ONLY at the index byte 0xa, name byte 0x55, and shape block 0x62–0x83; **matrix identical, no color field**).
   - standalone `.bin` vs in-WAD copy (where both exist) → confirms extraction fidelity. *(Not available for BFT/BGT/CNG/FXCF — see Pitfall 1 — but available for spark/flame/BDepoly/EG.)*
   - stage1 vs god-tier size variants (`MSH_BDepoly3Shape` 768 vs 1008) → isolates LOD/tier fields.

3. **Anchor varying fields to meaning:**
   - **Colors:** map candidate float RGBA quads (values in [0,~2], A up to ~1.99 for fire per CLAUDE.md 0x80=1.0) against Phase-1 freeze-frame color anchors. **Finding this session:** the static RGBA region in PTC is identity (1,1,1) and *identical* fire-vs-swoosh — so color is NOT a static PTC field; trace it to `MAT_pticleMat.blendColor` (already decodable via `buildMats`) and/or the texture and/or runtime. Validate the *reading method* against the byte-confirmed `LeftBladeLight` color (1.0, 0.622, 0.288) + intensity 2.5, which match REND-02 exactly.
   - **Rates/lifetimes/sizes:** interpret small positive floats/ints as **NTSC 60Hz tick units** (D-05). Corroborate lifetimes against the footage anchor "trail fully gone ~30 frames post-swing" (trail-fidelity todo point 3).
   - **Angles:** the recurring **2π (6.2832)** default is a full-circle emission spread — anchor other angle fields relative to it.
   - **Matrix:** verify each candidate 3×3 is orthonormal (rows unit-length, mutually perpendicular) before accepting it as a rotation — a cheap, decisive real-vs-noise test used this session.

4. **Consistency cross-checks:** the FXC↔PTC slot id (+0x08) must match for a paired emitter/particle; the shape reference must resolve or be explicitly a runtime handle; the +0x50 size must equal the record length. Any mismatch = fail-loud (WR-01 discipline).

---

## FxDb Shape (roadmap topic 3 — recommended structure)

JSON-dumpable without a renderer. Keyed by record name; cross-refs resolved so Phase-6 can walk emitter → particle → shape/texture.

```js
// buildFxDb(records, wadBuf) -> plain object, JSON.stringify-able
{
  meta: { region: "NTSC-U", tickHz: 60, source: "R_WPN0_0.WAD" | "standalone" },
  msh:  { "MSH_BDepoly3Shape": { vertCount, verts:[{pos:[x,y,z], nrm:[x,y,z]}], size,
                                 evidence:[{field,offset,rawHex,interp,corrob,tag:"real"}] }, ... },
  ptc:  { "PTC_flame3": { magic, slotId, matrix:[16], shapeRef:"flame3Shape",
                          params:{ lifeTicks:{value,tag:"real|INFERRED"}, ... },
                          texFormat:"1555?", size, evidence:[...] }, ... },
  fxc:  { "FXC_BDEsparkemit": { magic, subtype:0x3, slotId, index, matrix:[16],
                                shapeRef:"flame6Shape", params:{...}, size, evidence:[...] }, ... },
  refs: [ { from:"FXC_BFTemit1", kind:"slot", to:"PTC_BFTpart1" },
          { from:"FXC_BDepoly3", kind:"shape", to:"MSH_BDepoly3Shape", resolved:true },
          { from:"PTC_flame3",   kind:"shape", to:"flame3Shape", resolved:false, note:"runtime handle" } ]
}
```

Rules:
- Every field carries an `evidence` entry: `{ field, offset, rawHex, interp, corrob, tag:"real"|"INFERRED" }`. `real` = byte-decoded; `INFERRED` = runtime-computed or footage-calibrated (labeled per D-04/CLAUDE.md).
- `refs` are resolved via `Parsers.resolve` where the target is an `MSH_*` record; unresolved `"…Shape"` names are kept verbatim with `resolved:false`.
- Fail-loud like `buildMats`/`parseTxr`: size-gate before magic, both naming the record (WR-01). Variable-length PTC/MSH must bound every read by the record size, never by an assumed fixed layout.
- Node-testable, no GL/DOM. Known-answer suite pins the byte-exact values in *Per-Field Evidence Tables* below (RED test authoritative over prose, per the 03-02 correction discipline).

---

## Per-Field Evidence Tables (seed values for the known-answer tests)

These are byte-exact, first-party, this session — use them verbatim as the initial RED test.

**FXC_BFTemit1** (standalone, 228 B): magic@0=`0x1e`, subtype@2=`0x2`, slot@8=`0x1d`, idx@a=`0x05`, size@0x50=`228`, ref@0x54=`"BFTpart1Shape"`. Matrix row0 @0x10 = (0.00203, 0.7579, 0.6524).
**FXC_BGTemit1** (standalone): identical to BFTemit1 EXCEPT idx@a, name byte @0x55 (`F`→`G`), and shape block 0x62–0x83. **Matrix identical.** → fire and swoosh share placement; differ in particle ref + shape only.
**FXC_BDEsparkemit** (in-WAD idx 120, 228 B): magic@0=`0x1e`, subtype@2=`0x3`, ref@0x54=`"flame6Shape"`, matrix = identity (parent-origin).
**FXC_BDepoly3** (in-WAD idx 121, 136 B): subtype@2=`0xd`, u32@0x54=`1`, name@0x58=`"MSH_BDepoly3Shape"` → explicit FXC→MSH link.
**PTC_flame3** (in-WAD idx 123, 632 B): magic@0=`0x13`, ref@0x54=`"flame3Shape"`, size@0x50=`632`; tail `"1555"` descriptor present.
**MSH_BDepoly3Shape** (in-WAD idx 105, 768 B): u32@0=`24` (vertCount), u32@4=`22`, u32@8/@c=`0xffffffff`; v0 pos@0x10=(0.000, 2.982, −13.684), v1 nrm@0x1c=(−0.000, 0.176, −0.984) ‖·‖≈1.0.
**LeftBladeLight** (in-WAD, 88 B — REND-02 cross-check, NOT DEC-02 scope): floats include color (1.000, 1.000, 1.000)/(**1.000, 0.622, 0.288**)/intensity **2.500** — matches REND-02 published values → validates the float-reading method.

---

## PCSX2 GS-Dump Procedure (roadmap topic 4 — RECOMMENDED, not blocking)

D-06: a GS dump upgrades per-effect blend-config confidence MEDIUM→HIGH by reading the actual `ALPHA`/`TEX0`/`TEST`/`ZBUF` registers per FX draw. **The decode must NOT stall without it** — differential + footage + cross-record consistency are the primary corroboration.

**Verified architecture** [CITED: deepwiki.com/PCSX2/pcsx2/3.4-gs-dump-system]: a GS dump is a recording of all GS transfers + an initial GS state (a "GS save state"). File is `.gs` / `.gs.xz` / `.gs.zst`, begins with magic `0xFFFFFFFF`, a header, and **the game serial string** (this independently corroborates NTSC-U `SCUS-97399`, D-05). Because only communication is recorded, you can re-replay it under any renderer/options.

**Capture + inspect procedure** (PCSX2 ≥ 2.0 Qt) [CITED: PCSX2 wiki "05 How to Create a GS Dump"; some UI-label specifics [ASSUMED] from training — confirm in-app]:
1. Run the NTSC-U disc; execute a Level-1 blade swing so the FX are on-screen.
2. Trigger a **single-frame GS dump** from the Debug menu (GS dump control) or the bound hotkey; use a multi-frame dump if a full swing arc is needed. The `.gs` writes next to the dumps folder.
3. Open the dump in the **GS debugger / dump replay** (the Qt build's GS debugger; the standalone `GSDumpGUI` also replays). Step draw-call by draw-call.
4. For each FX draw, read the registers CLAUDE.md Part 1 needs: **`ALPHA`** (A/B/C/D + `FIX`) → the exact ABCD blend equation and whether `FIX`/source-alpha exceeds 0x80 (the alpha-over-1.0 case); **`TEX0`** (`TFX` modulate/decal) → color math; **`TEST`** (alpha test) and **`ZBUF`/`ZTST`** → depth-write/compare (confirms the LEQUAL/ZTST assumption A1 carried from 03-02).
5. Fold each read register set into the FxDb evidence as `corrob: "GS-dump ABCD=0201"` and upgrade the affected field's confidence.

**Sources:** [PCSX2 wiki: How to Create a GS Dump](https://github.com/PCSX2/pcsx2/wiki/05-How-to-Create-a-GS-Dump), [PCSX2 GSdx Debug](https://wiki.pcsx2.net/PCSX2_Documentation/GSdx_Debug), [GSDumpGUI](https://github.com/PCSX2/GSDumpGUI).

---

## ELF-Disassembly Escalation Path (roadmap topic 5 — D-04 tiebreaker)

Escalate ONLY when a field resists differential decode AND materially affects the look (D-04). The point is to read how the game *uses* the field, resolving its meaning.

**Toolchain** [CITED: search this session]:
- **Ghidra** + **`ghidra-emotionengine-reloaded`** (chaoticgd) — the current, maintained EE extension: disassembles/decompiles EE-specific instructions (MMI, VU0 macro mode) and recovers types/functions/globals from ELF `.mdebug` sections. Alternatives: `beardypig/ghidra-emotionengine`, `astrelsky/ghidra_MIPSR5900` (processor def only).
- Import the NTSC-U EE ELF; language **MIPS R5900 little-endian**. PS2 ELFs *may* carry DWARF symbols (Ghidra parses these) — if present, field-use functions are named, drastically easing the trace.

**Procedure:**
1. Obtain the NTSC-U (`SCUS-97399`) `SYSTEM.CNF`-referenced boot ELF from the user's own disc image (user must supply; do not fetch copyrighted binaries).
2. Locate the FXC/PTC/MSH loader by searching for the magic constants recovered this session — **`0x1e` FXC / `0x13` PTC record magic**, the `"1555"` string, or the record-name strings — as immediates/data refs.
3. Follow the loader to the struct field the resistant offset maps to; read the arithmetic (e.g., a field multiplied by the frame delta → it's a per-tick rate; compared to a lifetime accumulator → it's a lifetime).
4. Record the finding as `corrob: "ELF @0x… field used as tick-rate"` and tag the field `real`.

**Cost/when:** highest-effort path; reserve for look-critical fields (e.g., a spark spawn-rate or trail-lifetime that differential + footage cannot pin). Most framing is already `real` from bytes, so escalation should be rare.

---

## Architecture Patterns

### System Architecture (data flow)

```
                 assets/kratos/fx/*.bin (standalone record DATA, no WAD hdr)
                 assets/wads/R_WPN0_0.WAD ──parseWad──> records[{idx,off,tag,size,name,dataOff}]
                          │                                     │
                          │ (byte-identical FXC/PTC format)     │ resolve(name, fromIdx)  [nearest-preceding]
                          ▼                                     ▼
   ┌──────────────────────────── FxParse (extend the existing IIFE) ────────────────────────────┐
   │  parseMsh(buf,rec) ── size-gate→count hdr→(pos,nrm) pairs ──► shape verts                    │
   │  parsePtc(buf,rec) ── size-gate→magic 0x13→matrix→size→name→params(ticks)→"1555" ──► ptc def │
   │  parseFxc(buf,rec) ── size-gate→magic 0x1e→SUBTYPE(+2 branch)→slot→matrix→size→ref ──► emitter│
   └───────────────────────────────────────────────────────────────────────────────────────────┘
                          │  buildFxDb: key by name, link FXC.slot↔PTC.slot,
                          │             resolve shapeRef→MSH record | mark runtime-handle
                          ▼
              FxDb  { meta, msh{}, ptc{}, fxc{}, refs[] }  ── JSON.stringify ──►  (dump, no renderer)
                          │
                          ▼  (Phase 6 consumes: emitter → particle → shape/texture, real values)
              per-field evidence + node:assert known-answers  (real vs INFERRED tags)
```

### Recommended structure (extend, don't add files)
```
tools/kratos-lab/
├── parsers.js       # UNCHANGED — parseWad/resolve/decodeTexture (WAD access reused)
├── fxparse.js       # EXTEND FxParse: + parseMsh, parsePtc, parseFxc, buildFxDb
└── test/
    └── wad.test.js  # EXTEND — FX known-answers (seed from Per-Field Evidence Tables)
```

### Pattern 1: Fail-loud size-gate → magic-assert → named reads (copy verbatim)
**What:** every decoder gates `rec.size` before touching bytes, asserts the record magic, then reads named fields — each throw names the record.
**When to use:** all three new decoders.
**Example:**
```js
// Source: tools/kratos-lab/fxparse.js parseTxr (read this session) — the idiom to mirror
function parseFxc(buf, rec) {
  if (rec.size < 0x58) throw new Error(`FXC ${rec.name}: size ${rec.size} < 0x58`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint16(rec.dataOff, true);
  if (magic !== 0x1e) throw new Error(`FXC ${rec.name}: bad magic 0x${magic.toString(16)} (expected 0x1e)`);
  const subtype = dv.getUint16(rec.dataOff + 2, true);   // 0x2 emitter / 0x3 spark / 0xc grav / 0xd poly
  // ... matrix @+0x10, size @+0x50, name @+0x54 (or u32+name @+0x54/+0x58 when subtype===0xd)
}
```

### Anti-Patterns to Avoid
- **Assuming a fixed record length.** PTC (520–632) and MSH (768 vs 1008) vary; bound every read by `rec.size`. A short size that slips past the gate would silently read the next record (the exact WR-01 failure).
- **Treating `"…Shape"` refs as always-resolvable.** Only `MSH_*Shape` resolves to a record; others are runtime handles — mark, don't throw.
- **Reading color from the PTC static RGBA.** It's identity (1,1,1) fire-vs-swoosh; color is runtime/MAT-sourced. Pulling a "color" from there would fabricate data.
- **Hardcoding one blend mode for all FX** (CLAUDE.md "What NOT to Use"). Use each record's decoded/GS-dump blend.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WAD record walk + name resolution | A new record scanner | `Parsers.parseWad` + `Parsers.resolve` | Already byte-verified against 283 records; nearest-preceding + tag/size rules are subtle (skips size-0 back-refs, GroupEnd markers) |
| NUL-terminated name reads | Inline string loops | `FxParse.readName(buf, off, maxLen)` | Already handles post-NUL garbage bytes |
| Texture decode (swordtrail/sparkle/flame) | A PSMT/CLUT decoder | `Parsers.decodeTexture` | PSMT4/8 + swizzle + CLUT 0x80-alpha already correct |
| MAT blend/color for particle material | Guessing blend from FX name | `FxParse.buildMats` on `MAT_pticleMat` | The particle material's real blend/depth/color is already decodable; color likely lives here, not in PTC |
| PS2 GS blend → WebGL mapping | New mapping table | CLAUDE.md Part 1 ABCD→WebGL table | Authoritative, already in the repo |
| Test runner / assertions | A framework | `node:assert` + plain `node test/x.test.js` | Project's zero-dep constraint; existing suites do exactly this |

**Key insight:** the WAD-access, texture, MAT, and name-read layers are done and verified. This phase's *only* new code is the three FX-record decoders + the FxDb assembler — everything else is reuse. Custom re-implementations would re-introduce already-solved edge cases (swizzle, CLUT alpha, back-ref resolution).

---

## Common Pitfalls

### Pitfall 1: Assuming BFT/BGT/CNG/FXCF live in `R_WPN0_0.WAD`
**What goes wrong:** CONTEXT and the roadmap state these records exist "both standalone AND inside `assets/wads/R_WPN0_0.WAD`". **They do NOT** — a byte-search this session for `BFTpart`/`BGTpart`/`CNGpart`/`FXCFpart`/`BFTemit` in the WAD returned *absent*. The WAD instead carries the *richer* slice-1/2 corpus: `FXC_BDEsparkemit(.0/0/2)`, `PTC_flame3/5/6`, `FXC_BDepoly3/6`, `MSH_BDepoly3/6Shape`, `FXC_EGemit`/`PTC_EGpart`/`FXC_EGgrav`, `MAT_pticleMat`, `TXR_sparkle3`, `TXR_swordtrail`, `LeftBladeLight`/`RightBladeLight`.
**Why it happens:** the standalone `.bin` were extracted from a different (hero/global-effects) WAD; the weapon WAD holds the blade-mounted FX.
**How to avoid:** decode BFT/BGT/CNG/FXCF from the standalone `.bin`; decode spark/flame/BDepoly/EG from the WAD. The D-01 priority slice **spans both sources** (trails = standalone; sparks = WAD). Do NOT plan a "standalone-vs-in-WAD" diff for BFT/BGT — it doesn't exist; the diff IS available for the WAD-native records.

### Pitfall 2: Layout after +0x50 is subtype-dependent
**What goes wrong:** subtype-2/3 FXC put the reference name directly at +0x54; subtype-0xd (`BDepoly`) inserts a u32 count at +0x54 and the name at +0x58. A single hardcoded name offset mis-reads poly emitters.
**How to avoid:** branch on the +0x02 subtype after reading size; add a known-answer for each subtype.
**Warning signs:** a garbled reference name, or a name that starts mid-word.

### Pitfall 3: Multiple same-name copies at different sizes
**What goes wrong:** `MSH_BDepoly3Shape` is 768 B (idx 105) and 1008 B (idx 190); `PTC_flame6` is 632 (idx 117) and 568 (idx 205). Picking the wrong copy decodes a different vertex count.
**How to avoid:** always locate via `Parsers.resolve(name, fromIdx)` from the referencing record, honoring nearest-preceding; treat the size difference as tier/LOD signal, not corruption.

### Pitfall 4: Reading color from PTC and calling it "real"
**What goes wrong:** the fire trail should be crimson, the swoosh neutral — but the emitters/particles are byte-identical in that respect; the static RGBA scanned in PTC is identity. Inventing a "crimson" field there fabricates data.
**How to avoid:** trace color to `MAT_pticleMat.blendColor` (decodable) + texture + runtime; label any runtime tint `INFERRED` and corroborate against footage (D-04). `GFX_swordtrail` has **no** painted length-wise ramp (verified — uniform additive streak, hot only at one edge), so the age→color ramp (white-hot→orange→ember) is runtime, `INFERRED`.

### Pitfall 5: NTSC vs PAL tick misread
**What goes wrong:** interpreting a rate/lifetime as 50Hz halves/doubles timing vs the NTSC-U reference footage.
**How to avoid:** region is **NTSC-U 60Hz** (D-05, `SCUS-97399`), independently reconfirmable from the GS-dump header's embedded game serial. All tick fields are 60Hz.

---

## Runtime State Inventory

Not applicable — this is a decode/data phase producing a new in-memory/JSON `FxDb`, not a rename/refactor/migration. **None — verified: no stored data keys, live-service config, OS-registered state, secrets, or build artifacts are renamed or migrated by this phase.** The only outputs are new source (`fxparse.js` additions), new tests, and a JSON dump.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FXC/PTC/MSH_BDepoly = opaque raw data (mogaika treats as `TAG_GOW1_FILE_RAW_DATA`, tag 112/0x70) | Differential byte-decode recovers FXC/PTC framing + MSH poly format | **This session (2026-07-25)** | The phase is now decode-forward, not exploratory; seed offsets exist |
| "Trail age→color ramp is painted in `GFX_swordtrail`" (trail-fidelity hypothesis) | Texture has NO length-wise ramp (uniform additive streak) — ramp is runtime | **This session** | Phase-6 trail color is a runtime `INFERRED` tint, not a UV-mapping fact |
| "BFT/BGT/CNG/FXCF are in `R_WPN0_0.WAD`" (CONTEXT/roadmap) | Absent from that WAD; standalone-only; WAD holds spark/flame/BDepoly/EG | **This session** | Corrects the differential-source plan (Pitfall 1) |

**Deprecated/outdated:**
- Old GSdx plugin GS-dump UI (pre-2.0) — PCSX2 ≥ 2.0 is a unified Qt build; use its GS debugger / `GSDumpGUI`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `"1555"` tail string is a 16-bit A1R5G5B5 particle-texture-format tag | Record Structure (PTC) | LOW — not look-critical for slice 1; mislabel only |
| A2 | Small positive PTC/FXC float/int fields are per-tick rates/lifetimes/sizes (60Hz) | Differential Protocol | MEDIUM — wrong unit skews Phase-6 timing; footage anchor + ELF resolve |
| A3 | Effect color is runtime/MAT-sourced, not a static PTC field | Pitfall 4 / DEC-02 | MEDIUM — if a gradient/keyframe table exists elsewhere in PTC, would be missed; mitigate by scanning the full PTC payload, not just the identity region |
| A4 | FXC +0x08 u16 is the slot id linking FXC↔PTC | Record Structure | LOW–MEDIUM — the pairing is also inferable by name; slot is corroboration |
| A5 | MSH +0x04 u32 (=22) is an index/strip count | Record Structure (MSH) | LOW — vertex block already decodes; count only affects triangulation in Phase 6 |
| A6 | PCSX2 2.x exact GS-dump menu/hotkey labels | GS-Dump Procedure | LOW — RECOMMENDED not blocking; confirm in-app |
| A7 | The type-5 ANM descriptor (DEC-03) is reachable via mogaika's `anm/` decoders | Phase Requirements | LOW — DEC-03 is deferred (D-07); only affects a later slice |

**If this table is empty:** it is not — these are the fields needing user confirmation or corroboration before they become locked decisions.

---

## Open Questions

1. **Where exactly do the crimson fire tint and white-hot trail core come from?**
   - Known: not the PTC static RGBA (identity fire-vs-swoosh); not the `GFX_swordtrail` texture (no ramp).
   - Unclear: `MAT_pticleMat.blendColor` vs `MAT_swordtrail` vs a runtime state ramp.
   - Recommendation: decode `MAT_pticleMat`/`MAT_swordtrail` via `buildMats` first; if still neutral, label the ramp `INFERRED` and calibrate to footage (D-04).

2. **Which PTC payload floats are lifetime vs rate vs size vs velocity?**
   - Known: they are in the +0x64..tail region as 60Hz ticks; offsets located per family.
   - Unclear: the exact field→meaning map.
   - Recommendation: pair-diff `flame3` vs `flame6` vs `flame5` (three fire variants) to isolate, anchor lifetime to "trail gone ~30 frames", escalate the single most look-critical field to ELF if it resists.

3. **Can a GS dump be captured?** (D-06 — NEEDS USER CONFIRMATION.)
   - Recommendation: proceed decode-first; if the user can capture, fold the ABCD/TEX0/ZBUF reads in as HIGH-confidence corroboration and resolve the A1 (ZTST/LEQUAL) assumption carried from 03-02.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | decoders + tests (`node:assert`, `fs`, `DataView`) | ✓ | v24.15.0 | — |
| `assets/wads/R_WPN0_0.WAD` | in-WAD decode (spark/flame/BDepoly/EG) | ✓ | 169,760 B | — |
| `assets/kratos/fx/*.bin` | standalone decode (BFT/BGT/CNG/FXCF) | ✓ | 12 files | — |
| `assets/weapon/GFX_swordtrail.bin`+`PAL_swordtrail.bin` | trail-ramp inspection | ✓ | 2072+1048 B | — |
| PCSX2 (Qt) ≥ 2.0 | GS-dump blend ground truth (D-06) | ? (user machine) | — | Differential + footage + cross-record consistency (primary) |
| Ghidra + `ghidra-emotionengine-reloaded` | ELF escalation (D-04) | ? (user machine) | — | Footage-calibrated INFERRED value, labeled (last resort) |
| NTSC-U EE ELF (`SCUS-97399`) | ELF escalation | ? (user-supplied disc) | — | same as above |

**Missing dependencies with no fallback:** none — all *required* decode inputs (Node, WAD, `.bin`, textures) are present. The two `?` tools are RECOMMENDED/ESCALATION only; the decode proceeds without them.

---

## Validation Architecture

nyquist_validation is enabled (`workflow.nyquist_validation: true`). Every decode claim maps to an automated known-answer test plus a corroboration source.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:assert` (built-in), zero-dependency |
| Config file | none — no `package.json`; tests are standalone scripts |
| Quick run command | `node tools/kratos-lab/test/wad.test.js` |
| Full suite command | `node tools/kratos-lab/test/wad.test.js && node tools/kratos-lab/test/fx.test.js && node tools/kratos-lab/test/loop.test.js && node tools/kratos-lab/test/chain.test.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEC-02 | `parseMsh` decodes `MSH_BDepoly3Shape`: vertCount=24, v0 pos=(0,2.982,−13.684), v1 nrm unit-length | unit | `node tools/kratos-lab/test/wad.test.js` | ❌ Wave 0 (extend `wad.test.js`) |
| DEC-02 | `parsePtc` decodes `PTC_flame3`: magic 0x13, size 632, ref `"flame3Shape"`; bad-magic + short-size throw named | unit | same | ❌ Wave 0 |
| DEC-02 | `parseFxc` decodes `FXC_BFTemit1` (subtype 2, ref `"BFTpart1Shape"`) AND `FXC_BDepoly3` (subtype 0xd, name@+0x58 `"MSH_BDepoly3Shape"`) — subtype branch covered | unit | same | ❌ Wave 0 |
| DEC-02 | Differential invariant: `BFTemit1` vs `BGTemit1` matrix identical; differ only at idx/name/shape block | unit | same | ❌ Wave 0 |
| DEC-02 | `buildFxDb` links `FXC_BFTemit1.slot == PTC_BFTpart1.slot`; resolves `FXC_BDepoly3→MSH_BDepoly3Shape`; marks `"flame3Shape"` unresolved; output is `JSON.stringify`-able | integration | same | ❌ Wave 0 |
| DEC-02 | Every FxDb field carries an evidence entry tagged `real`/`INFERRED` | unit | same | ❌ Wave 0 |
| DEC-03 | (DEFERRED per D-07) type-5 ANM decode | — | — | N/A this slice |

### Sampling Rate
- **Per task commit:** `node tools/kratos-lab/test/wad.test.js` (quick — the FX known-answers live here).
- **Per wave merge:** full 4-suite command above.
- **Phase gate:** full suite green before `/gsd:verify-work`; every decoded field either has a `real` known-answer or an explicit `INFERRED` label with a corroboration note.

### Corroboration ladder (beyond automated tests)
| Claim class | Automated | Cross-record | Footage anchor | GS-dump / ELF |
|-------------|-----------|--------------|----------------|----------------|
| Record framing (magic/subtype/size/name/matrix/slot) | ✅ byte known-answer | ✅ 15+ instances agree | — | — (already HIGH) |
| Rates/lifetimes/sizes (ticks) | ✅ value pinned | ✅ family pair-diff | ✅ "~30-frame trail decay" | ELF if resistant |
| Blend/color | ✅ MAT decode pinned | ✅ MAT_pticleMat | ✅ freeze-frame hues | GS-dump ABCD (upgrades to HIGH) |

### Wave 0 Gaps
- [ ] Extend `tools/kratos-lab/test/wad.test.js` — FX known-answers seeded from *Per-Field Evidence Tables* (MSH/PTC/FXC + differential invariant + FxDb cross-ref). Covers DEC-02.
- [ ] (No new framework install — `node:assert` already in use.)
- [ ] (Optional) a committed `diff()` helper so the framing-vs-payload byte ranges are re-verified in CI.

---

## Security Domain

`security_enforcement` is not set in config (absent = enabled), but this is a **pure offline binary-decode phase**: no network, no auth, no sessions, no user-supplied input beyond trusted local game bytes. Most ASVS categories are N/A. The one genuinely relevant control is **untrusted-binary input validation** — the decoders parse attacker-shaped-if-swapped binary records, so out-of-bounds reads on a malformed/short record are the real threat.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | Fail-loud size-gate BEFORE magic, bound every read by `rec.size`, throw named errors (the existing WR-01 discipline in `buildMats`/`parseTxr`). Prevents OOB reads into adjacent records. |
| V6 Cryptography | no | — (no secrets; never hand-roll crypto — none needed here) |

### Known Threat Patterns for local binary decoders
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Short/truncated record slips past → reads next record's bytes | Tampering / Info-disclosure | Size-gate before any field read; assert `rec.size ≥ layout minimum` naming the record (WR-01) |
| Variable-length PTC/MSH read past record end | Tampering | Bound every offset by `rec.size`; never assume a fixed length |
| Wrong same-name copy decoded | Tampering | Resolve via `Parsers.resolve` nearest-preceding; assert `size>0` + tag 0x1e/0x70 |
| Fabricated "decoded" value (e.g., inventing a color) | Integrity of the data-first mandate | `real` vs `INFERRED` tag on every field; RED test pins byte-exact values (authoritative over prose) |

---

## Project Constraints (from CLAUDE.md)

The planner MUST verify compliance with these — treat as locked:
- **Vanilla WebGL1 + JS in kratos-lab — no build step, no external libraries, no npm runtime deps.** (This phase adds no GL; pure JS decoders + `node:assert` tests.)
- **Assets loaded from git-tracked `assets/` curated subset only** — never copy game bytes into test fixtures; read the WAD/`.bin` from `assets/`.
- **Data-first:** where the game stores a value, the decoder must use it; hand-tuning only for runtime-computed quantities, always labeled `INFERRED`.
- **0x80 = 1.0** color/alpha convention; alpha-over-1.0 legal for fire (up to ~1.99) — relevant when interpreting any decoded blend/intensity field and when reading GS-dump `ALPHA`.
- **Fail-loud:** unknown/short records assert, never silently default (matches WR-01 + Phase-2 review discipline).
- **Node-testable pure decoders** (no GL/DOM); `FxDb` JSON-dumpable without a renderer; `node:assert`-only known-answer suites.
- **Do NOT hand-tune glow/trail colors** — decode `MAT`/`FXC`/`PTC` values first; label runtime-computed tints `INFERRED`.

---

## Sources

### Primary (HIGH confidence — first-party this session)
- **`assets/kratos/fx/*.bin`** (6 FXC + 6 PTC) + **`assets/wads/R_WPN0_0.WAD`** (283 records) — byte-diffed directly: FXC magic 0x1e / subtype @+0x02 / matrix @+0x10 / size @+0x50 / name @+0x54; PTC magic 0x13; MSH interleaved pos+nrm; cross-reference chain; BFT/BGT absent from WAD; swordtrail no length-ramp; blade-light color/intensity match REND-02.
- **`tools/kratos-lab/fxparse.js`** + **`tools/kratos-lab/parsers.js`** — the decode idiom (`buildMats`/`parseTxr`/`readName`) + WAD access (`parseWad`/`resolve`/`decodeTexture`) to reuse. Read this session.
- **`CLAUDE.md`** Parts 1–4 — GS blend ABCD→WebGL table, 0x80=1.0, alpha-over-1.0; "what exists / what doesn't" (FXC/PTC/MSH undecoded upstream); verification tools.

### Secondary (MEDIUM confidence — verified external)
- [DeepWiki: PCSX2 GS Dump System](https://deepwiki.com/PCSX2/pcsx2/3.4-gs-dump-system) — dump file format (magic 0xFFFFFFFF, `.gs`/`.gs.xz`/`.gs.zst`, embedded game serial), architecture.
- [PCSX2 wiki: How to Create a GS Dump](https://github.com/PCSX2/pcsx2/wiki/05-How-to-Create-a-GS-Dump), [PCSX2 GSdx Debug](https://wiki.pcsx2.net/PCSX2_Documentation/GSdx_Debug), [GSDumpGUI](https://github.com/PCSX2/GSDumpGUI) — capture/replay procedure.
- [ghidra-emotionengine-reloaded](https://github.com/chaoticgd/ghidra-emotionengine-reloaded), [ghidra_MIPSR5900](https://github.com/astrelsky/ghidra_MIPSR5900) — EE/R5900 disassembly toolchain (MIPS R5900 LE, `.mdebug`/DWARF).

### Tertiary (LOW confidence — training, flagged)
- Exact PCSX2 2.x GS-dump menu labels/hotkeys (A6) — confirm in-app.

---

## Metadata

**Confidence breakdown:**
- Record framing (magic/subtype/size/name/matrix/slot/MSH pos+nrm): **HIGH** — byte-verified across 15+ instances with internal consistency (unit-length MSH normals; blade-light values match REND-02).
- Cross-reference mechanism (slot id + `…Shape` name resolution): **HIGH** — byte-confirmed `FXC_BDepoly3→MSH_BDepoly3Shape`; unresolved handles enumerated.
- Field semantics (which float = lifetime/rate/size; `"1555"`; color source): **MEDIUM–LOW** — offsets located, meanings inferred; need footage/GS-dump/ELF corroboration.
- GS-dump / ELF procedures: **MEDIUM** — architecture verified; exact UI steps ASSUMED.

**Research date:** 2026-07-25
**Valid until:** ~2026-08-24 for external tool procedures (PCSX2/Ghidra move slowly); the byte-level findings are permanent (fixed game bytes).
