// wad.test.js — known-answer suite for the WAD walker + MAT decoder.
// Expected values are first-party verified in
// .planning/phases/02-wad-mat-decode-render-pass-foundation/02-RESEARCH.md
// (walked from the shipping R_WPN0_0.WAD bytes, 2026-07-24).
//
// Zero-dependency by project constraint: node built-ins only.
// Run: node tools/kratos-lab/test/wad.test.js

"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const Parsers = require("../parsers.js");
const FxParse = require("../fxparse.js");

// The WAD is read from the git-tracked assets/ curated subset ONLY — never
// copy game bytes into test fixtures.
const WAD_PATH = path.join(__dirname, "..", "..", "..", "assets", "wads", "R_WPN0_0.WAD");
const buf = new Uint8Array(fs.readFileSync(WAD_PATH));

// Node has no ImageData — Parsers.decodeTexture constructs `new ImageData(w,h)`
// (parsers.js), so the texture known-answers below need this shim (Pitfall 8).
// Must exist before any decodeTexture call.
global.ImageData = class ImageData {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
};

// ---------------------------------------------------------------------------
// parseWad: container walk (283 records; u16 tag + u16 flags header split)
// ---------------------------------------------------------------------------
const recs = Parsers.parseWad(buf);
assert.strictEqual(recs.length, 283, "record count");
// CORRECTED KNOWN ANSWER (deviation from 02-RESEARCH.md, verified against the
// bytes): the u16-tag count of 0x1E records is 158 — 120 data-carrying server
// instances + 38 size-0 back-references. The research doc's "70×" figure is
// exactly the count of 0x1E records whose flags-u16 is zero (38 size-0 + 32
// zero-flag data records), i.e. what a full-u32 `type === 0x1E` comparison
// matches — the very Pitfall-1 bug the histogram was meant to catch.
assert.strictEqual(recs.filter((r) => r.tag === 0x1e).length, 158, "tag 0x1E records (u16 tag)");
assert.strictEqual(
  recs.filter((r) => r.tag === 0x1e && r.size > 0).length,
  120,
  "data-carrying tag 0x1E server instances"
);
// u16/u32 split guard: a u32-comparing parser would match only 70 records
// (the zero-flag ones); 88 data-carrying 0x1E records have nonzero flags.
assert.strictEqual(
  recs.filter((r) => r.tag === 0x1e && r.flags !== 0).length,
  88,
  "tag 0x1E records with nonzero flags u16"
);
assert.strictEqual(recs.filter((r) => r.tag === 0x70).length, 4, "tag 0x70 raw-data records");

// Header must be parsed as u16 tag @+0 + u16 flags @+2 (NOT a u32 type):
// the data-carrying MAT_chainlink record stores tag 0x1E with flags 0x6 —
// a u32 read would see 0x0006001E and never match 0x1E.
const matRecChainlink = recs.find(
  (r) => r.name === "MAT_chainlink" && r.tag === 0x1e && r.size > 0
);
assert.ok(matRecChainlink, "data-carrying MAT_chainlink record exists");
assert.strictEqual(matRecChainlink.flags, 0x6, "MAT record flags u16 = 0x6");

// ---------------------------------------------------------------------------
// resolve: nearest-preceding-name, data-carrying targets only
// ---------------------------------------------------------------------------
// Level-1 vs god cross-wire guard: same name, different data.
const fxcL1 = recs.find((r) => r.name === "FXC_BDepoly6" && r.off === 0xc7c0);
const fxcGod = recs.find((r) => r.name === "FXC_BDepoly6" && r.off === 0x1dbc0);
assert.ok(fxcL1, "level-1 FXC_BDepoly6 @0xC7C0 exists");
assert.ok(fxcGod, "god FXC_BDepoly6 @0x1DBC0 exists");

const mshL1 = Parsers.resolve(recs, "MSH_BDepoly6Shape", fxcL1.idx);
assert.ok(mshL1, "level-1 MSH_BDepoly6Shape resolves");
assert.strictEqual(mshL1.off, 0x6bc0, "level-1 MSH_BDepoly6Shape offset");
assert.strictEqual(mshL1.size, 768, "level-1 MSH_BDepoly6Shape size");

const mshGod = Parsers.resolve(recs, "MSH_BDepoly6Shape", fxcGod.idx);
assert.ok(mshGod, "god MSH_BDepoly6Shape resolves");
assert.strictEqual(mshGod.off, 0x13c80, "god MSH_BDepoly6Shape offset");
assert.strictEqual(mshGod.size, 1008, "god MSH_BDepoly6Shape size");

// Marker guard: TXR_chainlink from the data-carrying MAT_chainlink record must
// land on the real 88-byte TXR record, never a 0-byte marker.
const txr = Parsers.resolve(recs, "TXR_chainlink", matRecChainlink.idx);
assert.ok(txr, "TXR_chainlink resolves");
assert.strictEqual(txr.off, 0x213a0, "TXR_chainlink offset");
assert.strictEqual(txr.size, 88, "TXR_chainlink size");

// GroupEnd markers carry their group head's name (e.g. the 0-byte tag-0x32
// record named MAT_chainlink) — backward scan from the end must skip it and
// land on the real MAT record.
const chainFromEnd = Parsers.resolve(recs, "MAT_chainlink", recs.length);
assert.ok(chainFromEnd, "MAT_chainlink resolves from end");
assert.ok(chainFromEnd.size > 0, "resolution never lands on a 0-byte marker");
assert.strictEqual(chainFromEnd.off, 0x21440, "MAT_chainlink record offset");

// parseWad bounds check: a record whose size overruns the buffer throws a
// named error (T-2-01 hardening).
{
  const trunc = new Uint8Array(32);
  const tdv = new DataView(trunc.buffer);
  tdv.setUint16(0, 0x1e, true); // tag
  tdv.setUint16(2, 0x6, true); // flags
  tdv.setUint32(4, 0x1000, true); // size far beyond the buffer
  const badName = "REC_truncated";
  for (let i = 0; i < badName.length; i++) trunc[8 + i] = badName.charCodeAt(i);
  assert.throws(() => Parsers.parseWad(trunc), /REC_truncated/, "overrun error names the record");
}

// ---------------------------------------------------------------------------
// buildMats: full MAT decode (24 real records, mat.go layout)
// ---------------------------------------------------------------------------
const matDb = FxParse.buildMats(recs, buf);
assert.strictEqual(matDb.list.length, 24, "24 real MAT records");

const chainlink = matDb.byName["MAT_chainlink"];
assert.ok(chainlink, "MAT_chainlink decoded");
assert.strictEqual(chainlink.mode, "usual");
assert.strictEqual(chainlink.disableDepthWrite, false);
assert.strictEqual(chainlink.filter, "linear");
assert.strictEqual(chainlink.texName, "TXR_chainlink");
assert.strictEqual(chainlink.rawFlags0, 0x44010080);

const chainglow = matDb.byName["MAT_chainglow"];
assert.ok(chainglow, "MAT_chainglow decoded");
assert.strictEqual(chainglow.mode, "additive");
assert.strictEqual(chainglow.disableDepthWrite, true);

const swordtrail = matDb.byName["MAT_swordtrail"];
assert.ok(swordtrail, "MAT_swordtrail decoded");
assert.strictEqual(swordtrail.mode, "additive");
assert.strictEqual(swordtrail.rawFlags0, 0x48090080);

// MAT colors are already-1.0-based floats; overbright 2.0 passes through
// untouched (no divide-by-128, no double).
const lambert = matDb.byName["MAT_lambert1New"];
assert.ok(lambert, "MAT_lambert1New decoded");
assert.deepStrictEqual(lambert.blendColor, [2, 2, 2, 1], "overbright blend color survives");

// ---------------------------------------------------------------------------
// enumTuples: exactly the two-tuple inventory from 02-RESEARCH.md
// ---------------------------------------------------------------------------
const tuples = FxParse.enumTuples(matDb.list);
assert.strictEqual(tuples.length, 2, "exactly 2 blend tuples in the weapon WAD");

const usual = tuples.find((t) => t.mode === "usual");
const additive = tuples.find((t) => t.mode === "additive");
assert.ok(usual, "usual tuple present");
assert.ok(additive, "additive tuple present");

assert.strictEqual(usual.depthWrite, true, "usual tuple: depth write ON");
assert.strictEqual(usual.filter, "linear");
assert.strictEqual(usual.layerCount, 18, "usual tuple: 18 layers");
assert.ok(usual.materials.includes("MAT_chainlink"), "usual tuple lists MAT_chainlink");

assert.strictEqual(additive.depthWrite, false, "additive tuple: depth write OFF");
assert.strictEqual(additive.filter, "linear");
assert.strictEqual(additive.layerCount, 6, "additive tuple: 6 layers");
assert.ok(additive.materials.includes("MAT_chainglow"), "additive tuple lists MAT_chainglow");
assert.ok(additive.materials.includes("MAT_swordtrail"), "additive tuple lists MAT_swordtrail");

// ---------------------------------------------------------------------------
// decodeFlags: exactly-one-mode-bit contract (bits 24/25/26/27)
// ---------------------------------------------------------------------------
// 0 of 4 mode bits set -> named throw
assert.throws(
  () => FxParse.decodeFlags(0x00010080, "MAT_synthNoMode"),
  /MAT_synthNoMode/,
  "decodeFlags throws on zero mode bits"
);
// more than 1 mode bit set (usual | additive) -> named throw
assert.throws(
  () => FxParse.decodeFlags(0x44010080 | 0x08000000, "MAT_synthTwoModes"),
  /MAT_synthTwoModes/,
  "decodeFlags throws on multiple mode bits"
);

// ---------------------------------------------------------------------------
// MAT header magic: anything but 0x8 throws with the record name
// ---------------------------------------------------------------------------
{
  const bogus = new Uint8Array(32 + 0x78); // record header + MAT header 0x38 + one 0x40 layer
  const bdv = new DataView(bogus.buffer);
  bdv.setUint16(0, 0x1e, true); // tag
  bdv.setUint16(2, 0x6, true); // flags
  bdv.setUint32(4, 0x78, true); // size
  const bogusName = "MAT_bogus";
  for (let i = 0; i < bogusName.length; i++) bogus[8 + i] = bogusName.charCodeAt(i);
  // magic u32 at data +0 left as 0 (!= 0x8)
  const bogusRecs = Parsers.parseWad(bogus);
  assert.strictEqual(bogusRecs.length, 1);
  assert.throws(() => FxParse.buildMats(bogusRecs, bogus), /MAT_bogus/, "bad magic names the record");
}

// ===========================================================================
// CHAIN-01 / CHAIN-02: parseTxr + chain-texture known answers
// ---------------------------------------------------------------------------
// TXR record layout verified first-party (03-RESEARCH "TXR record layout",
// size 88): u32 magic=7 @+0, gfx name[24] @+0x04, pal name[24] @+0x1C, u16
// tail flags @+0x56 (0x0001 strip / 0x0051 additive — semantics UNKNOWN,
// recorded verbatim, never acted on; Open Q2).
// NOTE (deviation from 03-RESEARCH "Decoded Asset Facts", verified against the
// bytes 2026-07-25): the chainglow strip's background is CLUT entry (1,1,1) —
// additive-black, NOT literal (0,0,0). So "blue===0 everywhere" and "black for
// x>=80" from the research narrative are perceptual, not literal. The real,
// byte-exact facts are asserted below: max blue anywhere is 1 (the (1,1,1)
// background); every FIRE color has blue 0; the hot blob's rightmost bright
// column is x=134 (u≈0.26), the strip tail is uniform (1,1,1). These pin the
// same intent (blue-free fire hues + blob confined to the strip start) with
// values that actually hold — required for the Task-2 GREEN decode to pass.
// ===========================================================================

// Decode a MAT's FX texture through the decoded texName -> TXR -> GFX/PAL chain
// (the production path app.js's load stage will use). parseTxr is exported by
// Task 2 — until then these references throw (RED).
function decodeFxTexture(matName, txrName) {
  const matRec = recs.find((r) => r.name === matName && r.tag === 0x1e && r.size > 0);
  assert.ok(matRec, `${matName} data-carrying record exists`);
  const txrRec = Parsers.resolve(recs, txrName, matRec.idx);
  assert.ok(txrRec, `${txrName} resolves`);
  const t = FxParse.parseTxr(buf, txrRec);
  const g = Parsers.resolve(recs, t.gfxName, txrRec.idx);
  const p = Parsers.resolve(recs, t.palName, txrRec.idx);
  assert.ok(g && g.size > 0, `${t.gfxName} resolves to a data-carrying record`);
  assert.ok(p && p.size > 0, `${t.palName} resolves to a data-carrying record`);
  return Parsers.decodeTexture(
    buf.subarray(g.dataOff, g.dataOff + g.size),
    buf.subarray(p.dataOff, p.dataOff + p.size)
  );
}

// --- parseTxr round-trip: all three weapon TXRs (names + verbatim tail) -----
{
  const cases = [
    { mat: "MAT_chainlink", txr: "TXR_chainlink", gfx: "GFX_chainlink", pal: "PAL_chainlink", tail: 0x0001 },
    { mat: "MAT_chainglow", txr: "TXR_chainglow", gfx: "GFX_chainglow", pal: "PAL_chainglow", tail: 0x0051 },
    { mat: "MAT_swordtrail", txr: "TXR_swordtrail", gfx: "GFX_swordtrail", pal: "PAL_swordtrail", tail: 0x0051 },
  ];
  for (const c of cases) {
    const matRec = recs.find((r) => r.name === c.mat && r.tag === 0x1e && r.size > 0);
    assert.ok(matRec, `${c.mat} record exists`);
    const txrRec = Parsers.resolve(recs, c.txr, matRec.idx);
    assert.ok(txrRec, `${c.txr} resolves`);
    const t = FxParse.parseTxr(buf, txrRec); // RED: parseTxr not exported until Task 2
    assert.strictEqual(t.gfxName, c.gfx, `${c.txr} gfxName`);
    assert.strictEqual(t.palName, c.pal, `${c.txr} palName`);
    assert.strictEqual(t.tailFlags, c.tail, `${c.txr} tailFlags 0x${c.tail.toString(16).padStart(4, "0")}`);
    // resolve round-trip: parseTxr's names land on data-carrying records
    const g = Parsers.resolve(recs, t.gfxName, txrRec.idx);
    const p = Parsers.resolve(recs, t.palName, txrRec.idx);
    assert.ok(g && g.size > 0, `${c.gfx} resolves to a data-carrying record`);
    assert.ok(p && p.size > 0, `${c.pal} resolves to a data-carrying record`);
  }
}

// --- parseTxr fail-loud: bad magic + short size both throw naming the record -
{
  // Synthetic TXR: 32B WAD header + 0x58 data body (copy the MAT_bogus pattern).
  const bogus = new Uint8Array(32 + 0x58);
  const bdv = new DataView(bogus.buffer);
  bdv.setUint16(0, 0x1e, true); // tag
  bdv.setUint16(2, 0x0, true); // flags
  bdv.setUint32(4, 0x58, true); // size (>= 0x58 so it passes the size gate)
  const bname = "TXR_bogus";
  for (let i = 0; i < bname.length; i++) bogus[8 + i] = bname.charCodeAt(i);
  // magic u32 @ data+0 left 0 (!= 7)
  const brecs = Parsers.parseWad(bogus);
  assert.strictEqual(brecs.length, 1);
  assert.throws(() => FxParse.parseTxr(bogus, brecs[0]), /TXR_bogus/, "bad TXR magic names the record");

  // size-bound throw: a record shorter than 0x58 throws BEFORE any field read.
  const shortRec = { name: "TXR_short", dataOff: 0, size: 0x10 };
  assert.throws(() => FxParse.parseTxr(bogus, shortRec), /TXR_short/, "short TXR size throws named (before magic)");
}

// --- no hand-picked glow color: MAT_chainglow carries identity colors so the
//     MODULATE shader passes decoded texels through unchanged -----------------
{
  const cg = matDb.byName["MAT_chainglow"];
  assert.ok(cg, "MAT_chainglow decoded");
  assert.deepStrictEqual(cg.materialColor, [1, 1, 1], "MAT_chainglow identity materialColor (no picked color)");
  assert.deepStrictEqual(cg.blendColor, [1, 1, 1, 1], "MAT_chainglow identity blendColor (no picked color)");
}

// --- chainlink texture ground truth (CHAIN-01 pixel proof) -----------------
{
  const link = decodeFxTexture("MAT_chainlink", "TXR_chainlink");
  assert.strictEqual(link.width, 512, "chainlink width 512");
  assert.strictEqual(link.height, 32, "chainlink height 32");
  const d = link.data, W = link.width, H = link.height;

  let opaque = 0, nonBinary = 0;
  for (let i = 0; i < W * H; i++) {
    const a = d[i * 4 + 3];
    if (a === 255) opaque++;
    else if (a !== 0) nonBinary++;
  }
  assert.strictEqual(nonBinary, 0, "chainlink alpha is binary (only 0 or 255)");
  assert.strictEqual(opaque, 7408, "chainlink opaque pixel count === 7408");

  // exact 32px U-periodicity: all 16 link cells byte-identical to the first
  // 32px cell => 32px/link, 16 links/tile (the CHAIN-01 pitch criterion, pixel-
  // verified). The alternating link read must come from geometry (the twist).
  let cellsIdentical = true;
  for (let x = 0; x < W && cellsIdentical; x++) {
    for (let y = 0; y < H; y++) {
      const b = (y * W + (x % 32)) * 4, c = (y * W + x) * 4;
      if (d[c] !== d[b] || d[c + 1] !== d[b + 1] || d[c + 2] !== d[b + 2] || d[c + 3] !== d[b + 3]) {
        cellsIdentical = false;
        break;
      }
    }
  }
  assert.ok(cellsIdentical, "chainlink: all 16 link cells byte-identical (32px/link, 16 links/tile)");

  // U-autocorrelation of the per-column opaque-count signal peaks at lag 32.
  const col = new Array(W).fill(0);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (d[(y * W + x) * 4 + 3] === 255) col[x]++;
  const mean = col.reduce((s, v) => s + v, 0) / W;
  const cen = col.map((v) => v - mean);
  const ac = (lag) => {
    let n = 0, dn = 0;
    for (let x = 0; x < W; x++) { dn += cen[x] * cen[x]; n += cen[x] * cen[(x + lag) % W]; }
    return n / dn;
  };
  assert.ok(ac(32) > 0.999, `chainlink U-autocorr peak at lag 32 (r=${ac(32).toFixed(4)})`);
  assert.ok(ac(32) > ac(16), "chainlink autocorr: lag 32 exceeds lag 16 (32px-periodic, not 16px)");
}

// --- chainglow texture ground truth (CHAIN-02 heat-ramp proof) -------------
{
  const glow = decodeFxTexture("MAT_chainglow", "TXR_chainglow");
  assert.strictEqual(glow.width, 512, "chainglow width 512");
  assert.strictEqual(glow.height, 32, "chainglow height 32");
  const d = glow.data, W = glow.width, H = glow.height;

  // every alpha 255 after decode (CLUT alpha 0x80 -> 255 via the >=0x80 rule);
  // the glow "transparency" is additive black, not alpha.
  let allAlpha255 = true;
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] !== 255) { allAlpha255 = false; break; }
  assert.ok(allAlpha255, "chainglow every alpha === 255 after decode");

  // hottest texel is the yellow core (254,229,0) and it is painted into the strip.
  let hot = [0, 0, 0], hotLum = -1, hotCount = 0;
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], lum = r + g + b;
    if (lum > hotLum) { hotLum = lum; hot = [r, g, b]; }
    if (r === 254 && g === 229 && b === 0) hotCount++;
  }
  assert.deepStrictEqual(hot, [254, 229, 0], "chainglow hottest texel === (254,229,0) yellow core");
  assert.ok(hotCount > 0, "chainglow yellow core is present in the strip");

  // pure fire hues: the heat ramp is blue-free. The ONLY nonzero blue anywhere
  // is 1, from the (1,1,1) additive-black background; every actual fire color
  // (luminance > 3, i.e. brighter than that background) has blue 0.
  let maxBlue = 0, fireBlueViolation = false;
  for (let i = 0; i < W * H; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    if (b > maxBlue) maxBlue = b;
    if (r + g + b > 3 && b !== 0) fireBlueViolation = true;
  }
  assert.strictEqual(maxBlue, 1, "chainglow max blue === 1 (only the (1,1,1) additive-black background)");
  assert.ok(!fireBlueViolation, "chainglow heat ramp is blue-free (every fire color has blue 0)");

  // single hot spot confined to the strip START: the rightmost column brighter
  // than the (1,1,1) background is x=134 (u≈0.26); the rest of the strip is the
  // additive-black background, so a CLAMP sampler lands the blob ONCE near u=0
  // (Pattern 4 / Pitfall 5 — REPEAT would re-tile it every 16 links).
  let rightmostBright = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = (y * W + x) * 4;
    if (d[c] > 1 || d[c + 1] > 1 || d[c + 2] > 1) { if (x > rightmostBright) rightmostBright = x; }
  }
  assert.strictEqual(rightmostBright, 134, "chainglow hot blob rightmost bright column === 134 (confined near u=0)");

  // the strip tail (x >= 200) is uniform (1,1,1) additive-black background.
  let tailAllBg = true;
  for (let y = 0; y < H && tailAllBg; y++) for (let x = 200; x < W; x++) {
    const c = (y * W + x) * 4;
    if (!(d[c] === 1 && d[c + 1] === 1 && d[c + 2] === 1)) { tailAllBg = false; break; }
  }
  assert.ok(tailAllBg, "chainglow strip tail (x>=200) is uniform (1,1,1) additive-black background");
}

console.log("wad.test.js: all known-answer assertions passed");
const nServer = recs.filter((r) => r.tag === 0x1e && r.size > 0).length;
console.log(`  records=${recs.length} serverInstances=${nServer} mats=${matDb.list.length} tuples=${tuples.length}`);
