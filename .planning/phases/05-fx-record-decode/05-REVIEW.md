---
phase: 05-fx-record-decode
reviewed: 2026-07-26T00:45:27Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - tools/kratos-lab/fxparse.js
  - tools/kratos-lab/test/fxdb.test.js
  - tools/kratos-lab/test/anm.test.js
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-07-26T00:45:27Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the Phase-05 FX-record decoders (`parseMsh`, `parsePtc`, `parseFxc`,
`parseAnmType5`, `buildFxDb`) in `fxparse.js` and their two known-answer test
suites. Both suites pass against the curated corpus, and the byte-exact
known-answers, fail-loud gates, and real/INFERRED tagging discipline are broadly
sound and genuinely defensive (bounded vertex/param loops that survive a hostile
`vertCount`/param length, size-gate-before-magic ordering, no fabricated `real`
color fields).

The review focused on the exact threat model the phase adopts — parsing
untrusted binary game-disc records — and found **three confirmed defects**, all
reproduced empirically:

1. `parseMsh` violates its own repeatedly-stated "never read past `rec.size`"
   invariant in the evidence block, producing an **unnamed `RangeError`** (not
   the architected named fail-loud) or a silent adjacent-record read on a
   truncated MSH.
2. `buildFxDb`'s standalone-PTC merge loop is missing the keep-first guard that
   the sibling standalone-FXC loop has, so a name collision **silently
   overwrites** a WAD entry and emits a **duplicate, contradictory** shape ref.
3. The slot-pair ref builder emits **semantically-false cross-links**
   (fire emitter → swoosh particle, and vice-versa) into the Phase-6 hand-off
   graph.

None rise to a security or data-loss BLOCKER: in JS an out-of-bounds `DataView`
read is a caught throw, not memory corruption, and the curated corpus never
triggers the malformed-input paths. But all three are correctness/robustness
defects against the phase's stated invariants and should be fixed before the
FxDb is consumed downstream.

## Warnings

### WR-01: `parseMsh` evidence block reads past `rec.size` (and past the buffer) — unnamed crash instead of named fail-loud

**File:** `tools/kratos-lab/fxparse.js:216-222` (evidence build; gate at `:189`)

**Issue:** `parseMsh` gates on `rec.size < 0x10` (a 4-u32 header). The vertex
loop is correctly bounded by `end = base + rec.size`. But the evidence array
then reads the first vertex **unconditionally**, regardless of whether any
vertex was actually decoded:

```js
const p0 = verts.length ? verts[0].pos : [0, 0, 0];   // interp guarded...
const evidence = [
  ...
  { field: "verts[0].pos", offset: "+0x10",
    rawHex: `${hex32(base + 0x10)} ${hex32(base + 0x14)} ${hex32(base + 0x18)}`, ... }, // ...rawHex NOT guarded
];
```

`hex32` calls `dv.getUint32(off)`. For a record with `0x10 <= rec.size < 0x28`
(passes the header gate, decodes **zero** vertices), these three reads span
`base+0x10 .. base+0x1c` — up to 12 bytes past the record end. The `verts.length`
guard on `p0` gives a false sense of safety: it protects the interpreted value
but not the raw reads. This directly contradicts the file's own repeated
invariant ("never read past `dataOff + rec.size`", "bound EVERY read by
`rec.size`", "V5 control").

Reproduced with a size-`0x10` record at buffer end:

```
THREW: RangeError - Offset is outside the bounds of the DataView
named fail-loud? false
```

So a truncated MSH yields an **unnamed `RangeError`** — not the named
`MSH <name>: ...` fail-loud the decoder is architected to always produce — or,
if the buffer happens to extend (a non-final record), a **silent read of the
next record's bytes** into the diagnostic `rawHex`. This is the exact
"reads past buffer end / spills into next record" failure the phase brief calls
out.

**Fix:** Emit the vertex evidence entry only when a vertex was decoded (mirror
the `p0` guard onto the raw reads), e.g.:

```js
const evidence = [
  { field: "vertCount", ... },
  { field: "idxCount", ... },
  { field: "sentinel0", ... },
  { field: "sentinel1", ... },
];
if (verts.length) {
  evidence.push({
    field: "verts[0].pos", offset: "+0x10",
    rawHex: `${hex32(base + 0x10)} ${hex32(base + 0x14)} ${hex32(base + 0x18)}`,
    interp: `first vertex position (${p0.map((v) => v.toFixed(3)).join(", ")})`,
    corrob: "RESEARCH: (0, 2.982, -13.684)", tag: "real",
  });
}
```

(Alternatively raise the size floor to `0x28` when a full first vertex is
expected, so the named gate covers every read — but the conditional-push keeps
zero-vertex records decodable and honest.)

### WR-02: `buildFxDb` standalone-PTC loop is missing the keep-first guard the FXC loop has — silent overwrite + duplicate ref

**File:** `tools/kratos-lab/fxparse.js:571-577` (PTC standalone) vs `:597-604` (FXC standalone)

**Issue:** The two standalone-merge loops are asymmetric. The FXC loop guards
against a name already present:

```js
for (const sr of standaloneRecs) {
  if (!sr.name.startsWith("FXC_")) continue;
  if (sr.name in db.fxc) continue;          // <-- keep-first guard
  ...
}
```

The PTC loop has **no such guard**:

```js
for (const sr of standaloneRecs) {
  if (!sr.name.startsWith("PTC_")) continue;
  const rec = { name: sr.name, idx: 0, tag: sr.tag, size: sr.buf.length, dataOff: 0 };
  const def = parsePtc(sr.buf, rec);
  db.ptc[sr.name] = def;                     // <-- overwrites unconditionally
  addPtcRef(sr.name, def.shapeRef);          // <-- pushes a second ref
}
```

A standalone PTC whose name collides with an in-WAD PTC will (a) silently
overwrite the WAD-decoded entry, and (b) push a second, contradictory shape ref.
Reproduced by feeding a standalone under the WAD name `PTC_flame3`:

```
db.ptc.PTC_flame3.shapeRef = BFTpart1Shape   (WAD value would be flame3Shape)
PTC_flame3 shape refs emitted: 2  ["flame3Shape","BFTpart1Shape"]
```

The current corpus has no PTC name collision so the suites pass, but this is a
latent silent-wrong-decode defect and an unexplained divergence from the FXC
loop's stated "keep-first (level-1 copy wins)" contract that the same function
applies everywhere else (MSH `:543`, in-WAD PTC `:561`, in-WAD FXC `:586`,
standalone FXC `:599`).

**Fix:** Add the same guard the FXC loop uses:

```js
for (const sr of standaloneRecs) {
  if (!sr.name.startsWith("PTC_")) continue;
  if (sr.name in db.ptc) continue;          // keep-first, matches FXC/MSH
  ...
}
```

### WR-03: slot-pair refs emit false cross-links within a shared slot group

**File:** `tools/kratos-lab/fxparse.js:642-650`

**Issue:** The slot-pair builder links each FXC to **every** PTC sharing its
`slotId`. Slot `0x1d` is, by the code's own comments, a *group* id shared by both
the fire (BFT) and swoosh (BGT) trail records, not a 1:1 discriminator — "the
shapeRef NAME is the discriminator (A4)". Because both BFT and BGT particles
carry `0x1d`, the loop cross-multiplies them. Reproduced:

```
FXC_BFTemit1 -> PTC_BFTpart1
FXC_BFTemit1 -> PTC_BGTpart1     <-- fire emitter -> swoosh particle (false)
FXC_BGTemit1 -> PTC_BFTpart1     <-- swoosh emitter -> fire particle (false)
FXC_BGTemit1 -> PTC_BGTpart1
```

The in-code note even lists "the only real pairing is ... (FXC_BFTemit1<->PTC_BFTpart1,
and the BGT pair)" — yet the code emits four, including two the note says are
not real pairings. These edges enter `db.refs` (the Phase-6 hand-off graph)
with no marker distinguishing them from the true bindings, so a consumer that
uses slot refs to wire emitter → particle will get an ambiguous/incorrect
binding for the fire vs swoosh trail.

**Fix:** Either encode the name-discriminator the design relies on (only pair
when the emitter/particle name stems correspond), or tag slot refs as
corroboration-only so the consumer does not treat them as authoritative
emitter → particle bindings, e.g.:

```js
db.refs.push({ from: name, kind: "slot", to: ptcName, confidence: "group" });
```

so `FXC_BFTemit1 -> PTC_BGTpart1` is at least distinguishable from the
name-confirmed binding.

## Info

### IN-01: `shapeRef` name reads in `parsePtc`/`parseFxc` are not bounded by `rec.size`

**File:** `tools/kratos-lab/fxparse.js:269` (PTC), `:358` / `:361` / `:364` (FXC)

**Issue:** The size gate for both decoders is only `0x58` — enough to reach the
`size` field at `+0x50`, but `readName(buf, base + 0x54, 0x20)` (and the poly
`base + 0x58` variant) can read up to 32 bytes, past the gate-guaranteed region.
`readName` is self-terminating (`buf[off+i]` returns `undefined` past the array
end → `if (!c) break`), so it never crashes, but on a record whose name field is
not NUL-terminated within the guaranteed bytes it will append the *next record's*
leading bytes to `shapeRef`. Harmless on the real corpus (records are 136–632 B);
worth bounding for the untrusted-input threat model. Consider passing an explicit
`Math.min(0x20, end - (base + 0x54))` cap to `readName`.

### IN-02: `buildFxDb` reports "dangling explicit link" when the resolver module is unavailable

**File:** `tools/kratos-lab/fxparse.js:626-628`

**Issue:** `const mshRec = P && P.resolve(records, ref, idx);` — when `P` is null
(neither `require("./parsers.js")` nor a global `Parsers` is available), `mshRec`
is falsy and the code throws `FXC <name>: MSH shape ref "<ref>" does not resolve
(dangling explicit link)`. That message misattributes an environment/wiring
failure (resolver missing) to a data defect (dangling link). Fail loud on the
real cause instead, e.g. `if (!P) throw new Error("buildFxDb: parsers.js
resolver unavailable")` before the resolve loop.

### IN-03: `parsePtc` texFormat "1555" detection scans the entire record

**File:** `tools/kratos-lab/fxparse.js:280-286`

**Issue:** The A1R5G5B5 tail-marker check scans every byte of the record for the
ASCII sequence `31 35 35 35` and will false-positive on any coincidental
occurrence of those four bytes inside the f32 param/matrix region. The result is
honestly tagged `INFERRED` and rendered `"1555?"`, so it does not corrupt the
real/INFERRED discipline, but the heuristic is fragile. Consider restricting the
scan to the expected tail window rather than `[base, end)`.

---

_Reviewed: 2026-07-26T00:45:27Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
