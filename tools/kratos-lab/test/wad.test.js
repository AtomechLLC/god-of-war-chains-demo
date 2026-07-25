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

// ---------------------------------------------------------------------------
// parseWad: container walk (283 records; u16 tag + u16 flags header split)
// ---------------------------------------------------------------------------
const recs = Parsers.parseWad(buf);
assert.strictEqual(recs.length, 283, "record count");
assert.strictEqual(recs.filter((r) => r.tag === 0x1e).length, 70, "tag 0x1E server instances");
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

console.log("wad.test.js: all known-answer assertions passed");
console.log(`  records=${recs.length} serverInstances=70 mats=${matDb.list.length} tuples=${tuples.length}`);
