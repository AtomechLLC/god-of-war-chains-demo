# Phase 5: FX Record Decode - Pattern Map

**Mapped:** 2026-07-25
**Files analyzed:** 3 predicted touch (1 modified decoder, 1 modified/new test suite, 1 optional helper); 3 reused-UNCHANGED
**Analogs found:** 3 / 3 (all exact or role-match — this phase extends its own established decode machinery; the three new decoders copy `parseTxr`/`buildMats` verbatim in idiom)

All line numbers are CURRENT as of commit `683696e` (files read this session). This is a **decode-only phase** — no GL, no DOM, no render passes. Output is a pure, JSON-dumpable `FxDb`.

**Decode-first note:** the RESEARCH doc byte-recovered the FXC/PTC/MSH framing this session and supplies byte-exact seed values (RESEARCH "Per-Field Evidence Tables") — those are the RED known-answers, authoritative over any prose. This map covers *which existing code to copy from*, not the byte layout (that lives in RESEARCH).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tools/kratos-lab/fxparse.js` (MODIFIED — add `parseMsh`, `parsePtc`, `parseFxc`, `buildFxDb` to the `FxParse` IIFE) | binary decoder + data assembler | file-I/O → transform (record bytes → fields → `FxDb`) | same file: `parseTxr` (159–173) for single-record decode; `buildMats` (74–146) for the batch/assemble loop; `readName` (60–68) reused | exact |
| `tools/kratos-lab/test/wad.test.js` (EXTEND — FX record known-answers) **or** new `tools/kratos-lab/test/fxdb.test.js` | test (known-answer, real bytes) | batch / file-I/O | same file (WAD read 20–21, ImageData shim 26–32, resolve round-trip 222–260, synthetic bad-magic throw 263–280); scaffold from `test/loop.test.js` / `test/chain.test.js` | exact |
| `tools/kratos-lab/tools/fxdiff.js` (OPTIONAL — committed byte-diff framing helper) | utility / test-support | transform (record instances → constant-vs-varying offset ranges) | `tools/kratos-lab/loop.js` / `chain.js` (pure-module scaffold + export guard) | role-match |
| `tools/kratos-lab/parsers.js` | — | — | — | **UNCHANGED** — `parseWad` (288–311) + `resolve` (318–324) reused as-is to locate/slice WAD records (RESEARCH "Don't Hand-Roll") |
| `tools/kratos-lab/index.html` | — | — | — | **UNCHANGED (likely)** — decode-only phase; the browser (`app.js`) does not consume `buildFxDb` this phase, so no `?v=` bump is functionally required (see "Shared Patterns → Script-tag versioning") |
| `tools/kratos-lab/app.js`, `fx.js` | — | — | — | **UNCHANGED** — Phase 6 consumes `FxDb`; no render code this phase |

**Recommended approach (RESEARCH "Recommended structure — extend, don't add files"):** extend the existing `FxParse` IIFE rather than create a new `fxdb.js`. The TXR/MAT decoders already live there and share `readName` + the dual-env export guard. A standalone `fxdb.js` was the considered alternative (RESEARCH "Alternatives Considered") and rejected for idiom reuse — if the planner splits it out anyway, it inherits every pattern below unchanged plus the export-guard shared pattern.

## Pattern Assignments

### `tools/kratos-lab/fxparse.js` — add `parseMsh` / `parsePtc` / `parseFxc` (single-record decoders, file-I/O)

**Analog:** same file, `parseTxr` (159–173) — the closest structural match: a single `(buf, rec)` decoder with size-gate → magic-assert → `readName` → verbatim tail. The three new decoders mirror it exactly, only the offsets/magics differ (magics per RESEARCH: MSH has no magic — a count header; PTC = u32 `0x13`; FXC = u16 `0x1e`).

**`parseTxr` idiom to copy verbatim** (159–173 — the whole shape: JSDoc-style layout comment, size gate BEFORE magic both naming the record, DataView over `buf.buffer/byteOffset/byteLength`, `readName` for NUL-terminated names, verbatim tail field):
```js
  function parseTxr(buf, rec) {
    if (rec.size < 0x58) {
      throw new Error(`TXR ${rec.name}: size ${rec.size} < 0x58 (88-byte TXR record)`);
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const magic = dv.getUint32(rec.dataOff, true);
    if (magic !== 7) {
      throw new Error(`TXR ${rec.name}: bad magic 0x${magic.toString(16)} (expected 7)`);
    }
    return {
      gfxName: readName(buf, rec.dataOff + 0x04, 24), // TXR gfx record name
      palName: readName(buf, rec.dataOff + 0x1c, 24), // TXR pal record name
      tailFlags: dv.getUint16(rec.dataOff + 0x56, true), // verbatim (Open Q2)
    };
  }
```

**`parseFxc(buf, rec)`** — size-gate `rec.size < 0x58` (name lives at +0x54); u16 magic @`rec.dataOff` must be `0x1e`; read u16 subtype @+0x02; **branch on subtype** for the ref-name offset (Pitfall 2: subtype 2/3 → name at +0x54; subtype 0xd → u32 count at +0x54, name at +0x58). RESEARCH "Pattern 1" gives the exact skeleton:
```js
// Source: RESEARCH.md Architecture Patterns → Pattern 1 (mirrors parseTxr)
function parseFxc(buf, rec) {
  if (rec.size < 0x58) throw new Error(`FXC ${rec.name}: size ${rec.size} < 0x58`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = dv.getUint16(rec.dataOff, true);
  if (magic !== 0x1e) throw new Error(`FXC ${rec.name}: bad magic 0x${magic.toString(16)} (expected 0x1e)`);
  const subtype = dv.getUint16(rec.dataOff + 2, true);   // 0x2 emitter / 0x3 spark / 0xc grav / 0xd poly
  // slot @+0x08 (u16), idx @+0x0a (u16), matrix f32[16] @+0x10, size u32 @+0x50,
  // name @+0x54  (or u32 count @+0x54 then name @+0x58 when subtype===0xd)
}
```
Confirmed against bytes this session — `FXC_BFTemit1.bin` @0 = `1e00 0200` (magic `0x1e`, subtype `0x2`), slot `1d00` @0x08, idx `0500` @0x0a, size `e4000000` @0x50 (=228), `"BFTpart1Shape\0"` @0x54.

**`parsePtc(buf, rec)`** — size-gate against the layout minimum, then u32 magic @+0 must be `0x13` (confirmed: `PTC_BFTpart1.bin` @0 = `1300 0000`), slot u16 @+0x08 (=`0x1d`, matches its paired FXC), matrix f32[16] @+0x10, size u32 @+0x50, ref name @+0x54, params in the +0x64.. region as NTSC 60Hz ticks (D-05), `"1555"` descriptor at the tail. **Bound every read by `rec.size`** — PTC is variable length (520–632; the standalone `PTC_BFTpart1.bin` is 568) — never assume a fixed length (Anti-Patterns / Pitfall 3).

**`parseMsh(buf, rec)`** — no magic; size-gate then u32 vertCount @+0, u32 index/strip count @+0x04, two `0xffffffff` sentinels @+0x08/+0x0c, then interleaved `(pos vec3, nrm vec3)` f32 pairs from +0x10. Verify each decoded normal is unit-length as the real-vs-noise check (RESEARCH Differential Protocol step 3). MSH records are tag `0x70` raw data (the opaque-to-mogaika record) and **vary in size** (768 vs 1008 — Pitfall 3): resolve via `Parsers.resolve`, never assume one size.

**Name-read helper — reuse, do not re-implement** (60–68; the new decoders live in the same IIFE and call it directly):
```js
  // strictly NUL-terminated string — bytes after the NUL are dev-machine garbage
  function readName(buf, off, maxLen) {
    let s = "";
    for (let i = 0; i < maxLen; i++) {
      const c = buf[off + i];
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
```

**Export line to extend** (195): `return { decodeFlags, buildMats, enumTuples, parseTxr };` → add `parseMsh, parsePtc, parseFxc, buildFxDb`.

---

### `tools/kratos-lab/fxparse.js` — add `buildFxDb` (batch decoder + cross-ref assembler, transform)

**Analog:** same file, `buildMats` (74–146) — the batch loop over `records` that gates size (WR-01), asserts magic, reads named fields, and assembles a `{ byName, list }` plain object. `buildFxDb` is the same shape, keyed by name, with cross-refs resolved via `Parsers.resolve`.

**Batch-loop + WR-01 + assemble pattern to copy** (74–100, 127–146):
```js
  function buildMats(records, buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const list = [];
    const byName = {};
    for (const r of records) {
      if (r.tag !== 0x1e || r.size === 0 || !r.name.startsWith("MAT_")) continue;
      // WR-01: parseWad only guarantees the record fits the BUFFER, not that
      // the decoder stays inside the RECORD — a short size would silently
      // decode the next record's bytes. Fail loud, name the record.
      if (r.size < 0x38) {
        throw new Error(`MAT ${r.name}: size ${r.size} < 0x38 header`);
      }
      const base = r.dataOff;
      const magic = dv.getUint32(base, true); // mat.go Magic @+0
      if (magic !== 0x8) {
        throw new Error(`MAT ${r.name}: bad magic 0x${magic.toString(16)} (expected 0x8)`);
      }
      // ... field reads ...
      const mat = { name: r.name, /* ...fields... */ };
      list.push(mat);
      byName[r.name] = mat; // last record wins
    }
    return { byName, list };
  }
```
For `buildFxDb(records, wadBuf)`: filter FXC/PTC records (tag `0x1e`, size > 0, name prefix `FXC_`/`PTC_`) and MSH records (tag `0x70`, `MSH_*Shape`), dispatch each to `parseFxc`/`parsePtc`/`parseMsh`, key results by `r.name`, and build the `refs[]` array. Return the `FxDb` shape from RESEARCH "FxDb Shape": `{ meta, msh{}, ptc{}, fxc{}, refs[] }` — a plain object, `JSON.stringify`-able, no GL/DOM (same purity as `buildMats`'s `{byName, list}`).

**Cross-ref resolution — reuse `Parsers.resolve`, mirror the round-trip in `wad.test.js`** (`resolve` at parsers.js 318–324; usage template in wad.test.js `decodeFxTexture` 222–236):
```js
  // parsers.js 318–324 — nearest-preceding, data-carrying targets only
  function resolve(records, name, fromIdx) {
    for (let i = fromIdx - 1; i >= 0; i--) {
      const r = records[i];
      if (r.name === name && r.size > 0 && (r.tag === 0x1e || r.tag === 0x70)) return r;
    }
    return null; // caller decides: throw with record name
  }
```
Rules (RESEARCH "FxDb Shape" + cross-reference chain):
- Link `FXC.slotId (+0x08) ↔ PTC.slotId (+0x08)` for the emitter→particle pair (byte-confirmed: `FXC_BFTemit1` slot `0x1d` == `PTC_BFTpart1` slot `0x1d`).
- Resolve a `shapeRef` **only when it is an `MSH_*Shape` name** (via `resolve` from the referencing record's `idx`, honoring nearest-preceding). Non-`MSH_` refs (`"BFTpart1Shape"`, `"flame3Shape"`) are runtime handles — mark `resolved:false`, **do not throw** (Anti-Pattern: "Treating `…Shape` refs as always-resolvable").
- `resolve` returns `null` on a true miss for an `MSH_*` target → throw naming the record (the parsers.js:323 "caller decides" contract).

**Do NOT read effect color from PTC** (Pitfall 4 / A3): the static RGBA region is identity `(1,1,1)` and byte-identical fire-vs-swoosh. Store it if decoded, but tag any runtime tint `INFERRED` and trace color to `MAT_pticleMat` via the existing `buildMats` — never fabricate a "crimson" field.

---

### `tools/kratos-lab/test/wad.test.js` (EXTEND) — FX record known-answers (test, batch)

**Analog:** same file. It already reads the WAD, installs the `ImageData` shim, and demonstrates every idiom the FX suite needs: resolve round-trip, case-table iteration, and the synthetic bad-magic/short-size throw. Scaffold conventions (header comment naming the run command, `{}` scenario blocks, `// --- title ---` rules, message on every assert, final `console.log`) also match `test/loop.test.js` and `test/chain.test.js`.

**WAD read from the curated `assets/` subset — copy verbatim** (20–21; the DEC-01 "never copy game bytes into fixtures" constraint):
```js
const WAD_PATH = path.join(__dirname, "..", "..", "..", "assets", "wads", "R_WPN0_0.WAD");
const buf = new Uint8Array(fs.readFileSync(WAD_PATH));
```

**NEW input pattern — standalone `.bin` as a headerless record** (no existing analog; the closest is the hand-built rec object at line 278 `const shortRec = { name: "TXR_short", dataOff: 0, size: 0x10 };`). The `assets/kratos/fx/*.bin` files are record DATA with **no WAD header** — the file starts at the same bytes as the in-WAD `dataOff`. Feed the decoders a synthesized rec with `dataOff: 0`:
```js
// BFT/BGT/CNG/FXCF are standalone-only — NOT in R_WPN0_0.WAD (Pitfall 1).
const FX_DIR = path.join(__dirname, "..", "..", "..", "assets", "kratos", "fx");
function loadBin(name, tag = 0x1e) {           // tag 0x1e for FXC/PTC, 0x70 for MSH
  const b = new Uint8Array(fs.readFileSync(path.join(FX_DIR, `${name}.bin`)));
  return { buf: b, rec: { name, idx: 0, tag, size: b.length, dataOff: 0 } };
}
// e.g. const { buf: fxcBuf, rec: fxcRec } = loadBin("FXC_BFTemit1");
//      const fxc = FxParse.parseFxc(fxcBuf, fxcRec);
```
Verified this session: `FXC_BFTemit1.bin` @0 = `1e00 0200 …`, size `0xe4` @0x50, `"BFTpart1Shape"` @0x54 — so `dataOff:0` reads the magic correctly. WAD-native records (spark/flame/BDepoly/EG, MSH) use `Parsers.parseWad` + `Parsers.resolve` as the existing tests already do.

**Resolve round-trip + case-table idiom to copy** (222–260 — the `decodeFxTexture` helper and the three-TXR `cases` loop):
```js
  for (const c of cases) {
    const matRec = recs.find((r) => r.name === c.mat && r.tag === 0x1e && r.size > 0);
    assert.ok(matRec, `${c.mat} record exists`);
    const txrRec = Parsers.resolve(recs, c.txr, matRec.idx);
    assert.ok(txrRec, `${c.txr} resolves`);
    const t = FxParse.parseTxr(buf, txrRec);
    assert.strictEqual(t.gfxName, c.gfx, `${c.txr} gfxName`);
    // ...
  }
```
FX version: a `cases` table of `{ name, source: "wad"|"bin", magic, subtype, slot, size, ref }` (seed values verbatim from RESEARCH "Per-Field Evidence Tables"): `FXC_BFTemit1` (subtype 2, ref `"BFTpart1Shape"`), `FXC_BDEsparkemit` (subtype 3, ref `"flame6Shape"`, matrix identity), `FXC_BDepoly3` (subtype `0xd`, u32@0x54=1, name@0x58 `"MSH_BDepoly3Shape"` — the subtype branch, Pitfall 2), `PTC_flame3` (magic `0x13`, size 632, ref `"flame3Shape"`), `MSH_BDepoly3Shape` (vertCount 24, v0 pos `(0, 2.982, −13.684)`, v1 nrm unit-length).

**Differential invariant assertion** (DEC-02 test map row 4): `BFTemit1` vs `BGTemit1` — matrix **identical**, differ only at idx byte / name byte @0x55 / shape block. Use `assert.deepStrictEqual` on the decoded matrix arrays.

**Existing WAD known-answers already pin the MSH resolve targets** (73–86 — reuse these `off`/`size` anchors; they prove `resolve` picks the right same-name copy, Pitfall 3):
```js
const mshL1 = Parsers.resolve(recs, "MSH_BDepoly6Shape", fxcL1.idx);
assert.strictEqual(mshL1.off, 0x6bc0, "level-1 MSH_BDepoly6Shape offset");
assert.strictEqual(mshL1.size, 768, "level-1 MSH_BDepoly6Shape size");
// god copy: off 0x13c80, size 1008 — different size, same name
```

**Fail-loud tests — copy the synthetic bad-magic + short-size throws** (263–280, the `parseTxr` block):
```js
  // magic u32 @ data+0 left 0 (!= expected)
  assert.throws(() => FxParse.parseTxr(bogus, brecs[0]), /TXR_bogus/, "bad TXR magic names the record");
  // size-bound throw: a record shorter than the layout min throws BEFORE any field read.
  const shortRec = { name: "TXR_short", dataOff: 0, size: 0x10 };
  assert.throws(() => FxParse.parseTxr(bogus, shortRec), /TXR_short/, "short TXR size throws named (before magic)");
```
FX version: one bad-magic + one short-size throw per new decoder, each asserting the record name appears in the message (V5 input-validation control, RESEARCH Security Domain).

**ImageData shim** (26–32) — only needed if the suite decodes a texture (e.g. inspecting `GFX_swordtrail` via `Parsers.decodeTexture`, which builds `new ImageData`). Already present in `wad.test.js`; a new dedicated suite file would need to copy it.

**Alternative — a new `test/fxdb.test.js` file:** equally valid if the planner prefers to keep `wad.test.js` focused. It copies the `loop.test.js`/`chain.test.js` scaffold (header + `require("../fxparse.js")` + `require("../parsers.js")`) plus the `wad.test.js` WAD-read line, ImageData shim, and synthetic-throw idiom. RESEARCH's Wave 0 gap names `wad.test.js` extension as primary; the validation "Full suite command" already lists a distinct `fx.test.js` (the unrelated GL-mapping test for `fx.js`) — do not conflate the two.

---

### `tools/kratos-lab/tools/fxdiff.js` (OPTIONAL) — committed byte-diff framing helper (utility, transform)

**Analog:** `tools/kratos-lab/loop.js` / `chain.js` — the pure-module scaffold (IIFE + named exports + dual-env export guard). RESEARCH Differential Protocol step 1 recommends committing the `diff()` so the constant-vs-varying framing ranges re-verify in CI; Wave 0 lists it as optional.

**Scaffold to copy** (`chain.js` tail, verified this session):
```js
  return { buildRibbon, LINK_PITCH, LINKS_PER_TILE };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Chain;
```
Contents: given N same-family record buffers, return the set of byte offsets that are constant vs varying (RESEARCH: over the 6 FXC this yields varying ranges `0x10–0x4b` matrix, `0x54–0x60` name, `0x62–0x83` shape block; everything else framing). Pure, Node-only, no assets baked in — reads from `assets/` at call time like the tests do. Low priority; the known-answer tests are the authoritative pin.

## Shared Patterns

### Fail-loud size-gate → magic-assert → named reads (WR-01) — apply to all three new decoders + `buildFxDb`
**Source:** `fxparse.js` 83–92 (`buildMats`) and 159–167 (`parseTxr`); enforced by the test synthetic-throws at `wad.test.js` 263–280.
```js
      if (r.size < 0x38) {
        throw new Error(`MAT ${r.name}: size ${r.size} < 0x38 header`);
      }
      const magic = dv.getUint32(base, true);
      if (magic !== 0x8) {
        throw new Error(`MAT ${r.name}: bad magic 0x${magic.toString(16)} (expected 0x8)`);
      }
```
Size gate runs BEFORE any field read and BEFORE magic; every throw names the record (`FXC ${rec.name}` / `PTC ${rec.name}` / `MSH ${rec.name}`). This is the V5 control against OOB reads into adjacent records (RESEARCH Security Domain). **Variable-length PTC/MSH: bound every read by `rec.size`, never a fixed layout** (Anti-Patterns / Pitfall 3).

### Subtype-branched layout — apply to `parseFxc` (Pitfall 2)
**Source:** RESEARCH Record Structure (FXC) + Pitfall 2. Read u16 subtype @+0x02 after the size gate; branch the ref-name offset: subtype 2/3 → name @+0x54; subtype `0xd` → u32 count @+0x54, name @+0x58. A single hardcoded offset mis-reads poly emitters (garbled or mid-word name = the warning sign). Add a known-answer per subtype (`FXC_BFTemit1` subtype 2, `FXC_BDepoly3` subtype 0xd).

### `readName` reuse — do not re-implement NUL-terminated reads
**Source:** `fxparse.js` 60–68. Called directly by every decoder in the same IIFE; also the standalone WAD name-walk uses the identical loop (`parsers.js` 296–302). RESEARCH "Don't Hand-Roll" forbids inline string loops.

### WAD access reuse — `parseWad` + `resolve`, never a new scanner
**Source:** `parsers.js` 288–311 (`parseWad`) + 318–324 (`resolve`). WAD-native FX records (spark/flame/BDepoly/EG, MSH) are located identically to MATs/TXRs; nearest-preceding + tag-0x1e/0x70 + size>0 rules (skips size-0 back-refs and GroupEnd markers) are subtle and already byte-verified against 283 records. RESEARCH "Don't Hand-Roll" table row 1.

### Standalone `.bin` = headerless record (`dataOff: 0`) — apply in the test + any `.bin` decode path
**Source:** verified this session (`FXC_BFTemit1.bin` byte-0 is the record magic). The `.bin` files carry no 32-byte WAD header, so synthesize `{ name, idx: 0, tag, size: file.length, dataOff: 0 }` and pass the whole file as `buf`. WAD-native records instead carry `dataOff = off + 32` from `parseWad`. **Pitfall 1: BFT/BGT/CNG/FXCF are standalone-only; spark/flame/BDepoly/EG/MSH are WAD-only — the slice-1 corpus spans both sources**, so there is no standalone-vs-in-WAD diff for BFT/BGT.

### `real` vs `INFERRED` evidence tagging + verbatim-unknown fields — data-first discipline
**Source:** `fxparse.js` `rawFlags0` and `tailFlags` are decoded but recorded verbatim and "NEVER acted on" (39–40, 155–157, 171) — the same discipline the FxDb evidence entries formalize. Every FxDb field carries `{ field, offset, rawHex, interp, corrob, tag:"real"|"INFERRED" }` (RESEARCH "FxDb Shape"). `real` = byte-decoded; `INFERRED` = runtime-computed / footage-calibrated, per CLAUDE.md and D-04. **Do not read color from PTC and call it real** (Pitfall 4). The RED known-answer test is authoritative over prose (03-02 correction discipline).

### Pure, JSON-dumpable output (no GL/DOM) — apply to `buildFxDb`
**Source:** `buildMats` returns a plain `{ byName, list }` (145); `parseTxr` returns a plain object (168–172); the whole `FxParse`/`Parsers` layer is Node-requireable with zero build step. `FxDb` must be `JSON.stringify`-able with cross-refs resolved — the Phase-6 hand-off boundary (CONTEXT Integration Points).

### Dual-environment export guard — apply to any new module (and the `FxParse` return line)
**Source:** identical two lines at `fxparse.js` 198–199, `parsers.js` 329–330, `loop.js`, `chain.js`, `fx.js`:
```js
// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = FxParse;
```
When extending `FxParse`, only the `return { ... }` at line 195 changes (add the four new names); the guard is untouched. A new `fxdb.js`/`fxdiff.js` copies these two lines verbatim.

### Educational comment style — apply to every new decoder
**Source:** `fxparse.js` 1–22 (MAT layout header), 148–158 (`parseTxr` layout header), `chain.js` 1–27. Each decoder opens with a JSDoc-style byte-layout table citing the offsets, the magic, and the source doc (RESEARCH "Per-Field Evidence Tables"); INFERRED/runtime fields are labeled inline. This is a course repo — WHY-comments with requirement IDs (DEC-02) are a binding user preference.

### Test-suite conventions — apply to the FX known-answer suite
**Source:** all four suites (`wad`/`fx`/`loop`/`chain`.test.js). `node:assert` only; header comment names the requirement ID + run command; `{}` scenario blocks with `// --- title ---` rules; a message on every assert; known answers cite where they were verified; final `console.log("<file>: ...passed")`; exit code is the pass/fail signal. Full-suite command (RESEARCH Validation): `node tools/kratos-lab/test/wad.test.js && node tools/kratos-lab/test/fx.test.js && node tools/kratos-lab/test/loop.test.js && node tools/kratos-lab/test/chain.test.js`.

### Script-tag versioning (`index.html`) — likely no change this phase
**Source:** `index.html` 115–122, currently `?v=23` lockstep. The 03-phase convention bumps ALL tags on every script change (03-PATTERNS Pitfall 7). **However this is a decode-only phase**: `app.js` does not call `buildFxDb`/`parseFxc` in the browser yet (Phase 6 does), so `fxparse.js`'s new functions change no browser behavior and a `?v=` bump is not functionally required. If the planner adds any browser consumption (it should not, per phase boundary), bump every tag to `?v=24` in lockstep. Default: leave `index.html` UNCHANGED.

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Standalone `.bin` headerless-record decode input | test input | file-I/O | No existing test reads `assets/kratos/fx/*.bin` — every current suite reads the WAD. The pattern is trivial (synthesize `{name, dataOff:0, size, tag}`; closest precedent is the hand-built `shortRec` at `wad.test.js` 278) and documented under Shared Patterns → "Standalone `.bin`". Not a blocker. |
| MSH interleaved pos+nrm float-pair parse (internal math) | decoder internals | transform | No vertex-interleave decoder exists in `fxparse.js` (that lives in `parsers.js` `parseMesh`, a different DMA/VIF format). Use RESEARCH "Record Structure (MSH)" byte table as the reference; the `(buf, rec)` wrapper, size gate, and unit-length-normal validation DO have exact analogs (`parseTxr` shape + the vector helpers in `chain.js` 37–47 if a norm check is inlined). |
| `buildFxDb` cross-ref `refs[]` assembly (slotId pairing) | assembler internals | transform | No prior code builds a name→record reference graph; `buildMats`'s `byName`/`list` assembly is the closest (batch loop → keyed object), and `Parsers.resolve` supplies the `MSH_*` resolution. The graph shape itself is new (RESEARCH "FxDb Shape → refs[]"). |

## Metadata

**Analog search scope:** `tools/kratos-lab/` — `fxparse.js`, `parsers.js`, `chain.js`, `loop.js`, `fx.js` (module scaffolds), `index.html`, and all four `test/*.test.js`. Plus `assets/kratos/fx/*.bin` framing spot-check (hexdump, this session).
**Files scanned:** 7 read in full (fxparse.js, parsers.js, wad.test.js, loop.test.js, chain.test.js, fx.test.js, chain.js head/tail) + 2 byte-verified (`FXC_BFTemit1.bin`, `PTC_BFTpart1.bin`); assets confirmed present (12 fx `.bin`, `R_WPN0_0.WAD`).
**Pattern extraction date:** 2026-07-25 (line anchors valid at commit `683696e`).
