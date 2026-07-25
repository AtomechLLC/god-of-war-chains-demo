// fxdb.test.js — known-answer suite for the FX-record decoders and the FxDb
// assembler. Slice 1 of the MSH -> PTC -> FXC decode order (D-02): shapes are
// decoded FIRST because PTC/FXC reference them.
//
// Expected values are byte-exact, first-party, verified in
// .planning/phases/05-fx-record-decode/05-RESEARCH.md § "Per-Field Evidence
// Tables" and § "Record Structure -> MSH_BDepoly shape". Those tables are the
// AUTHORITATIVE source of truth over any prose (the 03-02 RED-test discipline).
// Requirement: DEC-02.
//
// Zero-dependency by project constraint: node built-ins only.
// Run: node tools/kratos-lab/test/fxdb.test.js

"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const Parsers = require("../parsers.js");
const FxParse = require("../fxparse.js");

// The WAD is read from the git-tracked assets/ curated subset ONLY — never copy
// game bytes into test fixtures (DEC-01).
const WAD_PATH = path.join(__dirname, "..", "..", "..", "assets", "wads", "R_WPN0_0.WAD");
const buf = new Uint8Array(fs.readFileSync(WAD_PATH));

// Node has no ImageData — Parsers.decodeTexture constructs `new ImageData(w,h)`,
// so install the shim verbatim (present in wad.test.js) before any texture path.
global.ImageData = class ImageData {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
};

const recs = Parsers.parseWad(buf);

// ---------------------------------------------------------------------------
// (a) parseMsh: MSH_BDepoly3Shape known-answer (the 768-byte level-1 copy)
// ---------------------------------------------------------------------------
// Resolve the shape from its referencing FXC_BDepoly3 (@0xCC80) exactly as the
// FxDb cross-ref will — nearest-preceding, data-carrying tag-0x70 record.
{
  const fxc3 = recs.find((r) => r.name === "FXC_BDepoly3" && r.off === 0xcc80);
  assert.ok(fxc3, "FXC_BDepoly3 @0xCC80 referrer exists");

  const mshRec = Parsers.resolve(recs, "MSH_BDepoly3Shape", fxc3.idx);
  assert.ok(mshRec, "MSH_BDepoly3Shape resolves from FXC_BDepoly3");
  assert.strictEqual(mshRec.off, 0x6ee0, "resolved MSH_BDepoly3Shape offset (level-1 copy)");
  assert.strictEqual(mshRec.size, 768, "resolved MSH_BDepoly3Shape size 768");

  // RED: FxParse.parseMsh is not exported until Task 2 — this throws now.
  const msh = FxParse.parseMsh(buf, mshRec);
  assert.strictEqual(msh.vertCount, 24, "MSH_BDepoly3Shape vertCount === 24");
  assert.strictEqual(msh.idxCount, 22, "MSH_BDepoly3Shape +0x04 u32 === 22 (index/strip count)");

  // v0 position ≈ (0, 2.982, -13.684) within 1e-3 (RESEARCH per-field table).
  const p0 = msh.verts[0].pos;
  assert.ok(Math.abs(p0[0] - 0) < 1e-3, `v0 pos.x ≈ 0 (got ${p0[0]})`);
  assert.ok(Math.abs(p0[1] - 2.982) < 1e-3, `v0 pos.y ≈ 2.982 (got ${p0[1]})`);
  assert.ok(Math.abs(p0[2] - -13.684) < 1e-3, `v0 pos.z ≈ -13.684 (got ${p0[2]})`);

  // v1 normal must be unit-length within 1e-3 — the real-vs-noise interleave
  // check: a wrong stride would not yield a unit vector.
  const n1 = msh.verts[1].nrm;
  const nlen = Math.hypot(n1[0], n1[1], n1[2]);
  assert.ok(Math.abs(nlen - 1.0) < 1e-3, `v1 nrm unit-length (|nrm|=${nlen.toFixed(4)})`);
}

// ---------------------------------------------------------------------------
// (b) resolve picks the correct same-name MSH copy (768 vs 1008) — Pitfall 3
// ---------------------------------------------------------------------------
{
  const fxc6L1 = recs.find((r) => r.name === "FXC_BDepoly6" && r.off === 0xc7c0);
  const fxc6God = recs.find((r) => r.name === "FXC_BDepoly6" && r.off === 0x1dbc0);
  assert.ok(fxc6L1, "level-1 FXC_BDepoly6 @0xC7C0 referrer exists");
  assert.ok(fxc6God, "god FXC_BDepoly6 @0x1DBC0 referrer exists");

  const mshL1 = Parsers.resolve(recs, "MSH_BDepoly6Shape", fxc6L1.idx);
  assert.ok(mshL1, "level-1 MSH_BDepoly6Shape resolves");
  assert.strictEqual(mshL1.off, 0x6bc0, "level-1 MSH_BDepoly6Shape offset");
  assert.strictEqual(mshL1.size, 768, "level-1 MSH_BDepoly6Shape size 768");

  const mshGod = Parsers.resolve(recs, "MSH_BDepoly6Shape", fxc6God.idx);
  assert.ok(mshGod, "god MSH_BDepoly6Shape resolves");
  assert.strictEqual(mshGod.off, 0x13c80, "god MSH_BDepoly6Shape offset");
  assert.strictEqual(mshGod.size, 1008, "god MSH_BDepoly6Shape size 1008");

  // The two same-name copies decode DIFFERENT vertex counts — an LOD/tier
  // signal, not corruption (768 -> 24, 1008 -> 32).
  const decL1 = FxParse.parseMsh(buf, mshL1);
  const decGod = FxParse.parseMsh(buf, mshGod);
  assert.notStrictEqual(
    decL1.vertCount,
    decGod.vertCount,
    "768 vs 1008 copies decode different vertCounts (LOD/tier, not corruption)"
  );
}

// ---------------------------------------------------------------------------
// (c) buildFxDb: meta + msh section, JSON-dumpable, every field evidence-tagged
// ---------------------------------------------------------------------------
{
  const db = FxParse.buildFxDb(recs, buf);
  assert.strictEqual(db.meta.region, "NTSC-U", "meta.region === NTSC-U (D-05, SCUS-97399)");
  assert.strictEqual(db.meta.tickHz, 60, "meta.tickHz === 60 (D-05)");

  const m3 = db.msh["MSH_BDepoly3Shape"];
  assert.ok(m3, "db.msh['MSH_BDepoly3Shape'] present");
  assert.ok(Array.isArray(m3.verts), "MSH_BDepoly3Shape has a verts array");
  // Level-1 target: the 768-byte copy is kept (god-tier 1008 copy out of scope).
  assert.strictEqual(m3.size, 768, "db.msh MSH_BDepoly3Shape size 768 (level-1 copy)");

  let json;
  assert.doesNotThrow(() => {
    json = JSON.stringify(db);
  }, "FxDb is JSON.stringify-able without a renderer");
  assert.ok(json.includes("MSH_BDepoly3Shape"), "JSON dump contains MSH_BDepoly3Shape");

  // Data-first discipline: every decoded MSH field carries a real/INFERRED tag.
  assert.ok(m3.evidence.length > 0, "MSH_BDepoly3Shape carries evidence entries");
  for (const e of m3.evidence) {
    assert.ok(
      e.tag === "real" || e.tag === "INFERRED",
      `evidence field ${e.field} tagged real|INFERRED (got ${e.tag})`
    );
  }
}

// ---------------------------------------------------------------------------
// (d) fail-loud: a short/truncated MSH record throws named BEFORE any field read
// ---------------------------------------------------------------------------
{
  const tiny = new Uint8Array(0x10); // buffer exists, but the record claims < header
  const shortRec = { name: "MSH_short", dataOff: 0, size: 0x08, tag: 0x70 };
  assert.throws(
    () => FxParse.parseMsh(tiny, shortRec),
    /MSH_short/,
    "short MSH size throws named (before any field read)"
  );
}

// ---------------------------------------------------------------------------
// --- PTC known-answers ---  parsePtc + buildFxDb ptc-section (DEC-02, Wave 2)
// ---------------------------------------------------------------------------
// Decode order MSH -> PTC -> FXC (D-02): particles reference shapes, so they are
// decoded after MSH. Standalone .bin files carry NO WAD header — file byte 0 IS
// the record magic — so synthesize a HEADERLESS rec { name, idx:0, tag, size, dataOff:0 }
// (05-PATTERNS "Standalone .bin = headerless record"). BFT/BGT are standalone-ONLY
// (absent from R_WPN0_0.WAD — Pitfall 1); the D-01 payoff-first trail defs can only
// enter the FxDb through the buildFxDb 3rd arg.
const FX_DIR = path.join(__dirname, "..", "..", "..", "assets", "kratos", "fx");
function loadBin(name, tag = 0x1e) {
  const b = new Uint8Array(fs.readFileSync(path.join(FX_DIR, `${name}.bin`)));
  return { buf: b, rec: { name, idx: 0, tag, size: b.length, dataOff: 0 } };
}

const PTC_PARAM_START = 0x64; // f32 params begin here (RESEARCH PTC table)

// (a) In-WAD fire particles: PTC_flame3 @0xCD50, PTC_flame6 @0xC890 (level-1 copies).
{
  const f3 = recs.find((r) => r.name === "PTC_flame3" && r.off === 0xcd50);
  assert.ok(f3, "PTC_flame3 @0xCD50 (in-WAD) record exists");
  const d3 = FxParse.parsePtc(buf, f3); // RED: parsePtc not exported until Task 2
  assert.strictEqual(d3.magic, 0x13, "PTC_flame3 magic === 0x13");
  assert.strictEqual(d3.size, 632, "PTC_flame3 size@0x50 === 632");
  assert.strictEqual(d3.shapeRef, "flame3Shape", "PTC_flame3 shapeRef === flame3Shape");

  const f6 = recs.find((r) => r.name === "PTC_flame6" && r.off === 0xc890);
  assert.ok(f6, "PTC_flame6 @0xC890 (in-WAD) record exists");
  const d6 = FxParse.parsePtc(buf, f6);
  assert.strictEqual(d6.magic, 0x13, "PTC_flame6 magic === 0x13");
  assert.strictEqual(d6.size, 632, "PTC_flame6 size@0x50 === 632");
  assert.strictEqual(d6.shapeRef, "flame6Shape", "PTC_flame6 shapeRef === flame6Shape");
}

// (b) Standalone trail particles: PTC_BFTpart1 (568 B) / PTC_BGTpart1 (552 B),
// (c) variable-length guard, (d) color-provenance guard (Pitfall 4).
{
  const { buf: bftBuf, rec: bftRec } = loadBin("PTC_BFTpart1");
  const dBft = FxParse.parsePtc(bftBuf, bftRec);
  assert.strictEqual(dBft.magic, 0x13, "PTC_BFTpart1 magic === 0x13");
  assert.strictEqual(dBft.slotId, 0x1d, "PTC_BFTpart1 slot@0x08 === 0x1d (pairs FXC_BFTemit1)");
  assert.strictEqual(dBft.size, 568, "PTC_BFTpart1 size@0x50 === 568");
  assert.strictEqual(dBft.shapeRef, "BFTpart1Shape", "PTC_BFTpart1 shapeRef === BFTpart1Shape");

  const { buf: bgtBuf, rec: bgtRec } = loadBin("PTC_BGTpart1");
  const dBgt = FxParse.parsePtc(bgtBuf, bgtRec);
  assert.strictEqual(dBgt.magic, 0x13, "PTC_BGTpart1 magic === 0x13");
  assert.strictEqual(dBgt.slotId, 0x1d, "PTC_BGTpart1 slot@0x08 === 0x1d");
  assert.strictEqual(dBgt.size, 552, "PTC_BGTpart1 size@0x50 === 552");
  assert.strictEqual(dBgt.shapeRef, "BGTpart1Shape", "PTC_BGTpart1 shapeRef === BGTpart1Shape");

  // (c) variable-length guard (T-05-02): the param walk never reads past rec.size —
  // params start @+0x64 and (start + 4*length) must stay within the record.
  assert.ok(
    PTC_PARAM_START + dBft.params.length * 4 <= dBft.size,
    `BFT params bounded by rec.size (${PTC_PARAM_START} + 4*${dBft.params.length} <= ${dBft.size})`
  );
  assert.ok(
    PTC_PARAM_START + dBgt.params.length * 4 <= dBgt.size,
    `BGT params bounded by rec.size (${PTC_PARAM_START} + 4*${dBgt.params.length} <= ${dBgt.size})`
  );

  // (d) color-provenance guard (Pitfall 4 / A3 / T-05-04): PTC carries NO per-effect
  // color. parsePtc must emit no real-tagged color/rgba field; any stored RGBA is
  // INFERRED/runtime. Prove it: BFT (fire) vs BGT (swoosh) are byte-identical in the
  // static RGBA region — identity (1,1,1,0) @+0x128 — so no crimson lives there.
  assert.ok(!("color" in dBft) && !("rgba" in dBft), "parsePtc emits no color/rgba def field");
  assert.ok(
    !dBft.evidence.some((e) => /color|rgba/i.test(e.field) && e.tag === "real"),
    "no real-tagged color/rgba evidence entry (color is runtime/MAT-sourced, not PTC)"
  );
  const RGBA_OFF = 0x128, RGBA_LEN = 16; // identity (1,1,1,0) — the color-candidate quad
  const bftRgba = [...bftBuf.slice(RGBA_OFF, RGBA_OFF + RGBA_LEN)];
  const bgtRgba = [...bgtBuf.slice(RGBA_OFF, RGBA_OFF + RGBA_LEN)];
  assert.deepStrictEqual(
    bftRgba,
    bgtRgba,
    "BFT vs BGT byte-identical in the static RGBA region (proves color is not per-effect)"
  );
  const rgbaDv = new DataView(bftBuf.buffer, bftBuf.byteOffset, bftBuf.byteLength);
  assert.ok(Math.abs(rgbaDv.getFloat32(RGBA_OFF, true) - 1.0) < 1e-4, "static RGBA is identity (1, ...)");
}

// (e) buildFxDb WITH the standalone source (the D-01 hand-off): the fire particles
// come from the WAD, the BFT/BGT trail particles come from the 3rd arg — BOTH become
// REAL KEYS in db.ptc, and each runtime-handle shapeRef is recorded resolved:false.
{
  const { buf: bftBuf } = loadBin("PTC_BFTpart1");
  const { buf: bgtBuf } = loadBin("PTC_BGTpart1");
  const standaloneRecs = [
    { name: "PTC_BFTpart1", buf: bftBuf, tag: 0x1e },
    { name: "PTC_BGTpart1", buf: bgtBuf, tag: 0x1e },
  ];
  const db = FxParse.buildFxDb(recs, buf, standaloneRecs);

  // in-WAD fire particle entered db.ptc
  assert.ok(db.ptc["PTC_flame3"], "db.ptc['PTC_flame3'] present (in-WAD)");
  assert.strictEqual(db.ptc["PTC_flame3"].shapeRef, "flame3Shape", "db.ptc PTC_flame3 shapeRef");

  // standalone trail particles are REAL KEYS in db.ptc — the D-01 priority data
  // actually enters the queryable FxDb (not just the test).
  assert.ok(db.ptc["PTC_BFTpart1"], "db.ptc['PTC_BFTpart1'] present (standalone 3rd arg)");
  assert.strictEqual(db.ptc["PTC_BFTpart1"].shapeRef, "BFTpart1Shape", "db.ptc PTC_BFTpart1 shapeRef");
  assert.strictEqual(db.ptc["PTC_BFTpart1"].slotId, 0x1d, "db.ptc PTC_BFTpart1 slot 0x1d");
  assert.ok(db.ptc["PTC_BGTpart1"], "db.ptc['PTC_BGTpart1'] present (standalone 3rd arg)");
  assert.strictEqual(db.ptc["PTC_BGTpart1"].shapeRef, "BGTpart1Shape", "db.ptc PTC_BGTpart1 shapeRef");
  assert.strictEqual(db.ptc["PTC_BGTpart1"].slotId, 0x1d, "db.ptc PTC_BGTpart1 slot 0x1d");

  // runtime-handle shape refs recorded resolved:false (non-MSH_ names — no WAD record)
  const hasShapeRef = (from, to) =>
    db.refs.some((x) => x.from === from && x.kind === "shape" && x.to === to && x.resolved === false);
  assert.ok(hasShapeRef("PTC_flame3", "flame3Shape"), "refs: PTC_flame3 -> flame3Shape resolved:false");
  assert.ok(hasShapeRef("PTC_BFTpart1", "BFTpart1Shape"), "refs: PTC_BFTpart1 -> BFTpart1Shape resolved:false");
  assert.ok(hasShapeRef("PTC_BGTpart1", "BGTpart1Shape"), "refs: PTC_BGTpart1 -> BGTpart1Shape resolved:false");

  assert.doesNotThrow(() => JSON.stringify(db), "FxDb with ptc section is JSON.stringify-able");
}

// (f) fail-loud: bad-magic + short PTC both throw named errors (WR-01 / T-05-01).
{
  const big = new Uint8Array(0x64); // magic @0 left 0 (!= 0x13)
  const badRec = { name: "PTC_bogus", dataOff: 0, size: 0x64, tag: 0x1e };
  assert.throws(() => FxParse.parsePtc(big, badRec), /PTC_bogus/, "bad PTC magic names the record");

  const shortRec = { name: "PTC_short", dataOff: 0, size: 0x10, tag: 0x1e };
  assert.throws(
    () => FxParse.parsePtc(big, shortRec),
    /PTC_short/,
    "short PTC size throws named (before any field read)"
  );
}

console.log("fxdb.test.js: MSH + PTC known-answers passed");
