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

  // WR-01: a record that PASSES the 0x10 header gate but is too short to hold a
  // full first vertex (0x10 <= size < 0x28) must ALSO throw a NAMED error — the
  // evidence block reads the first vertex (base+0x10..+0x28), and those raw reads
  // must be bounded by rec.size. The backing buffer here is deliberately LARGE
  // (0x40) so the reads would NOT hit a RangeError — the only thing that makes a
  // truncated record throw is the record-size bound (proving it is a NAMED
  // fail-loud, not an incidental out-of-buffer RangeError or a silent spill into
  // the next record's bytes).
  const band = new Uint8Array(0x40);
  for (const sz of [0x10, 0x18, 0x1c, 0x20, 0x24, 0x27]) {
    const rec = { name: `MSH_trunc_${sz.toString(16)}`, dataOff: 0, size: sz, tag: 0x70 };
    assert.throws(
      () => FxParse.parseMsh(band, rec),
      new RegExp(`MSH_trunc_${sz.toString(16)}`),
      `truncated MSH size 0x${sz.toString(16)} throws NAMED (not a bare RangeError / silent spill)`
    );
  }
  // A record with a full first vertex (size >= 0x28) does NOT throw on the size
  // bound — the guard is exactly at the first-vertex boundary, not over-tight.
  assert.doesNotThrow(
    () => FxParse.parseMsh(band, { name: "MSH_min", dataOff: 0, size: 0x28, tag: 0x70 }),
    "MSH size 0x28 (one full vertex) passes the WR-01 first-vertex bound"
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

// (e2) WR-02: a standalone PTC whose name COLLIDES with an in-WAD PTC must NOT
// overwrite the WAD entry — keep-first, mirroring the FXC/MSH loops. Feed a
// standalone under the in-WAD name PTC_flame3 (using BFT bytes, shapeRef
// "BFTpart1Shape"); the WAD decode ("flame3Shape") must survive and NO duplicate/
// contradictory shape ref may be pushed for that name.
{
  const { buf: bftBuf } = loadBin("PTC_BFTpart1");
  const collide = [{ name: "PTC_flame3", buf: bftBuf, tag: 0x1e }];
  const db = FxParse.buildFxDb(recs, buf, collide);
  assert.strictEqual(
    db.ptc["PTC_flame3"].shapeRef,
    "flame3Shape",
    "colliding standalone PTC_flame3 does NOT overwrite the in-WAD entry (keep-first, not BFTpart1Shape)"
  );
  const flame3Refs = db.refs.filter((x) => x.from === "PTC_flame3" && x.kind === "shape");
  assert.strictEqual(flame3Refs.length, 1, "no duplicate/contradictory shape ref for the colliding PTC name");
  assert.strictEqual(flame3Refs[0].to, "flame3Shape", "the single shape ref is the WAD value flame3Shape");
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

// ---------------------------------------------------------------------------
// --- FXC subtype-branch known-answers ---  parseFxc + buildFxDb fxc/refs (DEC-02, Wave 3)
// ---------------------------------------------------------------------------
// FXC is the LAST decode layer (D-02) and the FxDb root: an emitter links to its
// particle def (shared +0x08 slot) and, for poly emitters, to an explicit MSH shape.
// The layout after +0x50 BRANCHES on the u16 subtype @+0x02 (Pitfall 2): subtype
// 2/3 read the ref name @+0x54; subtype 0xd reads a u32 count @+0x54 then the MSH
// name @+0x58. BFT/BGT emit1 are standalone-ONLY (Pitfall 1) — they reach the FxDb
// only via the buildFxDb 3rd arg, exactly as the PTC defs did in 05-02. Seed values
// are byte-exact this session (05-RESEARCH "Per-Field Evidence Tables").

// (a) subtype 0x2 emitter (standalone FXC_BFTemit1, 228 B).
let bftMatrix;
{
  const { buf: fb, rec: fr } = loadBin("FXC_BFTemit1");
  const fxc = FxParse.parseFxc(fb, fr); // RED: parseFxc not exported until Task 2
  assert.strictEqual(fxc.magic, 0x1e, "FXC_BFTemit1 magic === 0x1e");
  assert.strictEqual(fxc.subtype, 0x2, "FXC_BFTemit1 subtype === 0x2 (emitter)");
  assert.strictEqual(fxc.slotId, 0x1d, "FXC_BFTemit1 slot@0x08 === 0x1d (pairs PTC_BFTpart1)");
  assert.strictEqual(fxc.index, 0x05, "FXC_BFTemit1 idx@0x0a === 0x05");
  assert.strictEqual(fxc.size, 228, "FXC_BFTemit1 size@0x50 === 228");
  assert.strictEqual(fxc.shapeRef, "BFTpart1Shape", "FXC_BFTemit1 shapeRef@0x54 === BFTpart1Shape");
  const r0 = [fxc.matrix[0], fxc.matrix[1], fxc.matrix[2]];
  assert.ok(Math.abs(r0[0] - 0.00204) < 1e-4, `matrix row0.x ≈ 0.00204 (got ${r0[0]})`);
  assert.ok(Math.abs(r0[1] - 0.7579) < 1e-4, `matrix row0.y ≈ 0.75790 (got ${r0[1]})`);
  assert.ok(Math.abs(r0[2] - 0.65237) < 1e-4, `matrix row0.z ≈ 0.65237 (got ${r0[2]})`);
  bftMatrix = fxc.matrix;
}

// (b) Differential invariant (DEC-02 test-map row 4): FXC_BGTemit1's 16-float matrix
// is BYTE-IDENTICAL to BFTemit1 (fire & swoosh share placement); they differ ONLY at
// idx (0x06) / name (F->G) / shape block. The shapeRef NAME discriminates, not slot (A4).
{
  const { buf: gb, rec: gr } = loadBin("FXC_BGTemit1");
  const fxc = FxParse.parseFxc(gb, gr);
  assert.deepStrictEqual(fxc.matrix, bftMatrix, "FXC_BGTemit1 matrix IDENTICAL to BFTemit1 (shared placement)");
  assert.strictEqual(fxc.shapeRef, "BGTpart1Shape", "FXC_BGTemit1 shapeRef === BGTpart1Shape");
  assert.strictEqual(fxc.index, 0x06, "FXC_BGTemit1 idx@0x0a === 0x06 (differs from BFT 0x05)");
  // Orthonormality sanity: the 3x3 rotation rows are each unit length — a wrong
  // stride/offset would not yield unit vectors (real-vs-noise interleave check).
  for (let r = 0; r < 3; r++) {
    const row = [fxc.matrix[r * 4], fxc.matrix[r * 4 + 1], fxc.matrix[r * 4 + 2]];
    const len = Math.hypot(row[0], row[1], row[2]);
    assert.ok(Math.abs(len - 1.0) < 1e-3, `matrix rotation row${r} unit-length (|row|=${len.toFixed(4)})`);
  }
}

// (c) subtype 0x3 spark (in-WAD FXC_BDEsparkemit @0xCB70): ref "flame6Shape",
// matrix identity (row0 = (1,0,0) — parent-origin placement).
{
  const spark = recs.find((r) => r.name === "FXC_BDEsparkemit" && r.off === 0xcb70);
  assert.ok(spark, "FXC_BDEsparkemit @0xCB70 (in-WAD) record exists");
  const fxc = FxParse.parseFxc(buf, spark);
  assert.strictEqual(fxc.subtype, 0x3, "FXC_BDEsparkemit subtype === 0x3 (spark)");
  assert.strictEqual(fxc.shapeRef, "flame6Shape", "FXC_BDEsparkemit shapeRef === flame6Shape");
  assert.ok(
    Math.abs(fxc.matrix[0] - 1.0) < 1e-4 && Math.abs(fxc.matrix[1]) < 1e-4 && Math.abs(fxc.matrix[2]) < 1e-4,
    `FXC_BDEsparkemit matrix identity (row0 = 1,0,0; got ${fxc.matrix.slice(0, 3)})`
  );
}

// (d) subtype 0xd poly branch (in-WAD FXC_BDepoly3 @0xCC80, 136 B, Pitfall 2): a u32
// count lives @+0x54 and the MSH name is read at +0x58 (NOT +0x54). This proves the
// subtype branch — reading the name at +0x54 would return the count bytes as garbage.
{
  const poly = recs.find((r) => r.name === "FXC_BDepoly3" && r.off === 0xcc80);
  assert.ok(poly, "FXC_BDepoly3 @0xCC80 (in-WAD) record exists");
  const dvp = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const count54 = dvp.getUint32(poly.dataOff + 0x54, true); // u32 count @+0x54 (subtype-0xd)
  assert.strictEqual(count54, 1, "FXC_BDepoly3 u32 count @+0x54 === 1");
  const fxc = FxParse.parseFxc(buf, poly);
  assert.strictEqual(fxc.subtype, 0xd, "FXC_BDepoly3 subtype === 0xd (poly)");
  assert.strictEqual(fxc.count, 1, "FXC_BDepoly3 parsed count === 1 (u32 @+0x54, subtype-0xd branch)");
  // name read at +0x58 AFTER the u32 count — the explicit FXC->MSH link.
  assert.strictEqual(fxc.shapeRef, "MSH_BDepoly3Shape", "FXC_BDepoly3 shapeRef@+0x58 === MSH_BDepoly3Shape (NOT +0x54)");
  assert.strictEqual(fxc.size, 136, "FXC_BDepoly3 size@0x50 === 136");
}

// (e) buildFxDb cross-ref graph WITH the standalone source (the D-01 payoff): the
// in-WAD spark/poly emitters come from the WAD; the BFT/BGT trail emitters + their
// PTC defs come from the 3rd arg. All become REAL db.fxc/db.ptc keys, and the full
// emitter->particle->shape graph assembles + serializes.
{
  const mk = (n) => ({ name: n, buf: loadBin(n).buf, tag: 0x1e });
  const standaloneRecs = ["FXC_BFTemit1", "FXC_BGTemit1", "PTC_BFTpart1", "PTC_BGTpart1"].map(mk);
  const db = FxParse.buildFxDb(recs, buf, standaloneRecs);

  // in-WAD spark emitter + standalone trail emitters are all real db.fxc keys
  assert.ok(db.fxc["FXC_BDEsparkemit"], "db.fxc['FXC_BDEsparkemit'] present (in-WAD)");
  assert.ok(db.fxc["FXC_BFTemit1"], "db.fxc['FXC_BFTemit1'] present (standalone 3rd arg)");
  assert.ok(db.fxc["FXC_BGTemit1"], "db.fxc['FXC_BGTemit1'] present (standalone 3rd arg)");

  // shape refs: the subtype-0xd MSH link RESOLVES (resolved:true); the spark runtime
  // handle is recorded resolved:false (non-MSH_ name — no WAD record, never thrown).
  const hasRef = (from, kind, to, resolved) =>
    db.refs.some((x) => x.from === from && x.kind === kind && x.to === to && x.resolved === resolved);
  assert.ok(
    hasRef("FXC_BDepoly3", "shape", "MSH_BDepoly3Shape", true),
    "refs: FXC_BDepoly3 -> MSH_BDepoly3Shape resolved:true (explicit FXC->MSH link)"
  );
  assert.ok(
    hasRef("FXC_BDEsparkemit", "shape", "flame6Shape", false),
    "refs: FXC_BDEsparkemit -> flame6Shape resolved:false (runtime handle)"
  );

  // the D-01 trail slot pair (both share slot 0x1d — the RESEARCH canonical FxDb example)
  const hasSlot = (from, to) => db.refs.some((x) => x.kind === "slot" && x.from === from && x.to === to);
  assert.ok(hasSlot("FXC_BFTemit1", "PTC_BFTpart1"), "refs: FXC_BFTemit1 -> PTC_BFTpart1 slot pair (0x1d) present");

  // WR-03: slot 0x1d is a GROUP id shared by BOTH the fire (BFT) and swoosh (BGT)
  // trail records, so the loop cross-multiplies 2 FXC × 2 PTC = 4 slot refs. Only
  // the name-matched DIAGONAL is a true emitter->particle binding; the off-diagonal
  // edges (fire emitter -> swoosh particle, and vice-versa) are false cross-links.
  // Every slot ref must be SELF-DESCRIBING so the Phase-6 consumer can tell them
  // apart — corroboration-only, with the A4 name discriminator (shapeNameMatch).
  const slotRef = (from, to) => db.refs.find((x) => x.kind === "slot" && x.from === from && x.to === to);
  const bftTrue = slotRef("FXC_BFTemit1", "PTC_BFTpart1"); // true diagonal
  const bftFalse = slotRef("FXC_BFTemit1", "PTC_BGTpart1"); // false cross-link
  const bgtTrue = slotRef("FXC_BGTemit1", "PTC_BGTpart1"); // true diagonal
  const bgtFalse = slotRef("FXC_BGTemit1", "PTC_BFTpart1"); // false cross-link
  for (const [r, label] of [[bftTrue, "BFT<->BFT"], [bftFalse, "BFT->BGT"], [bgtTrue, "BGT<->BGT"], [bgtFalse, "BGT->BFT"]]) {
    assert.ok(r, `slot ref ${label} present (group 0x1d cross-product)`);
    assert.strictEqual(r.via, "slot", `slot ref ${label} carries via:"slot" marker`);
    assert.strictEqual(r.corroborationOnly, true, `slot ref ${label} is corroboration-only (never authoritative)`);
  }
  // The marker DISTINGUISHES the real pair from the false ones (the whole point):
  assert.strictEqual(bftTrue.shapeNameMatch, true, "true pair FXC_BFTemit1<->PTC_BFTpart1: shapeNameMatch true (A4)");
  assert.strictEqual(bgtTrue.shapeNameMatch, true, "true pair FXC_BGTemit1<->PTC_BGTpart1: shapeNameMatch true (A4)");
  assert.strictEqual(bftFalse.shapeNameMatch, false, "false cross-link FXC_BFTemit1->PTC_BGTpart1: shapeNameMatch false");
  assert.strictEqual(bgtFalse.shapeNameMatch, false, "false cross-link FXC_BGTemit1->PTC_BFTpart1: shapeNameMatch false");
  assert.strictEqual(bftTrue.confidence, "name-confirmed", "true pair confidence === name-confirmed");
  assert.strictEqual(bgtTrue.confidence, "name-confirmed", "true pair confidence === name-confirmed");
  assert.strictEqual(bftFalse.confidence, "group", "false cross-link confidence === group (corroboration-only)");
  assert.strictEqual(bgtFalse.confidence, "group", "false cross-link confidence === group (corroboration-only)");
  // A group with N×M members must NOT look like N×M real bindings: exactly the two
  // diagonal edges are name-confirmed; the cross-links are not.
  const nameConfirmed = db.refs.filter((x) => x.kind === "slot" && x.confidence === "name-confirmed");
  assert.strictEqual(nameConfirmed.length, 2, "exactly 2 name-confirmed slot bindings in the 0x1d group (not 4)");

  // GUARD (Warning 1): no slot pair is fabricated over placeholder slot 0x00 / the
  // 0xffff root sentinel — every WAD-native FXC/PTC carries slot 0x00, and pairing on
  // it would invent false 0x00×0x00 links. Every emitted slot ref must carry a real,
  // non-placeholder slot on BOTH ends.
  const isPlaceholder = (s) => s === 0x00 || s === 0xffff;
  for (const ref of db.refs) {
    if (ref.kind !== "slot") continue;
    const fromSlot = db.fxc[ref.from] && db.fxc[ref.from].slotId;
    const toSlot = db.ptc[ref.to] && db.ptc[ref.to].slotId;
    assert.ok(!isPlaceholder(fromSlot), `slot ref from ${ref.from} carries a real slot (not 0x00/0xffff)`);
    assert.ok(!isPlaceholder(toSlot), `slot ref to ${ref.to} carries a real slot (not 0x00/0xffff)`);
  }

  // the whole graph (msh+ptc+fxc+refs) is the Phase-6 hand-off — must serialize.
  let json;
  assert.doesNotThrow(() => {
    json = JSON.stringify(db);
  }, "FxDb (msh+ptc+fxc+refs) is JSON.stringify-able");
  assert.ok(
    json.includes("MSH_BDepoly3Shape") && json.includes("FXC_BFTemit1"),
    "JSON dump contains the resolved MSH shape + the standalone BFT emitter"
  );
}

// (f) fail-loud: bad-magic + short FXC both throw named errors (WR-01 / T-05-01).
{
  const big = new Uint8Array(0x60); // magic @0 left 0 (!= 0x1e)
  const badRec = { name: "FXC_bogus", dataOff: 0, size: 0x60, tag: 0x1e };
  assert.throws(() => FxParse.parseFxc(big, badRec), /FXC_bogus/, "bad FXC magic names the record");

  const shortRec = { name: "FXC_short", dataOff: 0, size: 0x10, tag: 0x1e };
  assert.throws(
    () => FxParse.parseFxc(big, shortRec),
    /FXC_short/,
    "short FXC size throws named (before magic)"
  );
}

// ---------------------------------------------------------------------------
// --- swordtrail no-ramp + color provenance ---  (DEC-02 color clause, D-04)
// ---------------------------------------------------------------------------
// RESEARCH Open Q1 + Pitfall 4: effect color is NOT painted into GFX_swordtrail
// and is NOT a static PTC RGBA. This block PINS both halves of that finding:
//   1. GFX_swordtrail carries NO length-wise (U-axis) age->color ramp — the fire
//      hue is a single amber family (uniform g/r) across the strip length, the hot
//      region is a CROSS-strip (V) edge (a soft additive streak cross-section, like
//      chainglow), and the hottest texel is amber — NOT the white-hot end a painted
//      white->orange->ember ramp would require. So the ramp is RUNTIME (INFERRED).
//   2. buildFxDb records the color provenance at db.meta.colorSource, tracing color
//      to MAT_pticleMat.blendColor (a real MAT field) with the ramp tagged INFERRED.
// Decode via the decodeFxTexture idiom (mirrors wad.test.js): MAT -> TXR -> GFX/PAL.
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
  return Parsers.decodeTexture(buf.subarray(g.dataOff, g.dataOff + g.size), buf.subarray(p.dataOff, p.dataOff + p.size));
}

{
  const trail = decodeFxTexture("MAT_swordtrail", "TXR_swordtrail");
  const W = trail.width, H = trail.height, d = trail.data;
  assert.strictEqual(W, 64, "swordtrail width 64");
  assert.strictEqual(H, 32, "swordtrail height 32");

  // additive-black transparency (like chainglow): every alpha decodes to 255, and
  // the (1,1,1) additive-black background dominates the strip.
  let allAlpha255 = true, bg = 0;
  for (let i = 0; i < W * H; i++) {
    if (d[i * 4 + 3] !== 255) allAlpha255 = false;
    if (d[i * 4] === 1 && d[i * 4 + 1] === 1 && d[i * 4 + 2] === 1) bg++;
  }
  assert.ok(allAlpha255, "swordtrail every alpha === 255 after decode (additive-black, not alpha)");
  assert.strictEqual(bg, 1690, "swordtrail (1,1,1) additive-black background count === 1690");
  assert.ok(bg > (W * H) / 2, "swordtrail background dominates the strip (soft streak, mostly empty)");

  // (1) NO WHITE-HOT END: the global hottest texel is amber (243,176,18) — low blue,
  // g/r ~0.72 — NOT the near-white (g/r~1, b/r~1) a painted white-hot ramp end needs.
  let hotLum = -1, hot = [0, 0, 0];
  for (let i = 0; i < W * H; i++) {
    const l = d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2];
    if (l > hotLum) { hotLum = l; hot = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]; }
  }
  assert.deepStrictEqual(hot, [243, 176, 18], "swordtrail hottest texel === (243,176,18) amber core");
  assert.ok(hot[2] < 30, "swordtrail hottest texel is low-blue (no white-hot end painted)");
  const hotGR = hot[1] / hot[0];
  assert.ok(hotGR > 0.5 && hotGR < 0.85, `swordtrail hottest is amber (g/r=${hotGR.toFixed(3)} in [0.5,0.85], not white ~1)`);

  // (2) NO LENGTH-WISE (U) HUE RAMP: every bright column's brightest pixel is the SAME
  // amber hue family (g/r in a tight band, low blue), and the mean hue does NOT shift
  // from one end of the strip to the other. A painted age->color ramp would put a white
  // (g/r~1) end and an ember/red (g/r<0.4) end at opposite U — instead the hue is flat.
  const bright = [];
  for (let x = 0; x < W; x++) {
    let bl = -1, bp = [0, 0, 0];
    for (let y = 0; y < H; y++) {
      const c = (y * W + x) * 4, l = d[c] + d[c + 1] + d[c + 2];
      if (l > bl) { bl = l; bp = [d[c], d[c + 1], d[c + 2]]; }
    }
    if (bl > 20) bright.push({ x, gr: bp[1] / bp[0], br: bp[2] / bp[0] });
  }
  assert.ok(bright.length > 10, `swordtrail has bright fire columns to inspect (n=${bright.length})`);
  for (const b of bright) {
    assert.ok(b.gr > 0.45 && b.gr < 0.9, `col x=${b.x} amber hue g/r=${b.gr.toFixed(3)} (no white/deep-ember end)`);
    assert.ok(b.br < 0.15, `col x=${b.x} low blue b/r=${b.br.toFixed(3)} (uniform amber, blue-poor)`);
  }
  const meanGR = (arr) => arr.reduce((s, b) => s + b.gr, 0) / arr.length;
  const left = bright.filter((b) => b.x < W / 2), right = bright.filter((b) => b.x >= W / 2);
  const hueShift = Math.abs(meanGR(left) - meanGR(right));
  assert.ok(hueShift < 0.12, `swordtrail hue is flat along U (left vs right mean g/r shift ${hueShift.toFixed(3)} < 0.12 — no age->color ramp)`);

  // Cross-strip (V) heat profile: the streak is hot at ONE edge (bottom row bright,
  // top row background) — the soft additive streak cross-section, NOT a length ramp.
  const rowLum = (y) => { let s = 0; for (let x = 0; x < W; x++) { const c = (y * W + x) * 4; s += d[c] + d[c + 1] + d[c + 2]; } return s / W; };
  assert.ok(rowLum(0) < 5, `swordtrail top edge (row 0) is background (lum ${rowLum(0).toFixed(1)} < 5)`);
  assert.ok(rowLum(H - 1) > 100, `swordtrail bottom edge (row ${H - 1}) is the hot streak edge (lum ${rowLum(H - 1).toFixed(1)} > 100)`);

  // Color provenance: trace to MAT_pticleMat.blendColor via buildMats, and assert
  // buildFxDb records it at db.meta.colorSource with the ramp tagged INFERRED.
  const mats = FxParse.buildMats(recs, buf);
  const pticle = mats.byName["MAT_pticleMat"];
  assert.ok(pticle, "MAT_pticleMat decodes via buildMats");
  assert.ok(Array.isArray(pticle.blendColor) && pticle.blendColor.length === 4, "MAT_pticleMat has a decodable blendColor");

  const db = FxParse.buildFxDb(recs, buf);
  assert.ok(db.meta.colorSource, "buildFxDb records db.meta.colorSource");
  assert.strictEqual(db.meta.colorSource.record, "MAT_pticleMat", "colorSource.record === MAT_pticleMat");
  assert.strictEqual(db.meta.colorSource.field, "blendColor", "colorSource.field === blendColor");
  assert.strictEqual(
    `${db.meta.colorSource.record}.${db.meta.colorSource.field}`,
    "MAT_pticleMat.blendColor",
    "color provenance === MAT_pticleMat.blendColor"
  );
  assert.deepStrictEqual(db.meta.colorSource.value, pticle.blendColor, "colorSource.value === MAT_pticleMat.blendColor (real byte value)");
  assert.strictEqual(db.meta.colorSource.tag, "real", "colorSource.tag === real (blendColor is byte-decoded)");
  assert.strictEqual(db.meta.colorSource.rampTag, "INFERRED", "colorSource.rampTag === INFERRED (runtime age->color tint)");

  // PROVENANCE GUARD (T-05-04): NO FxDb field is a real-tagged effect color sourced
  // from a PTC or the swordtrail texture. Walk every decoded record's evidence.
  const dbFull = FxParse.buildFxDb(recs, buf, [
    { name: "PTC_BFTpart1", buf: loadBin("PTC_BFTpart1").buf, tag: 0x1e },
    { name: "PTC_BGTpart1", buf: loadBin("PTC_BGTpart1").buf, tag: 0x1e },
  ]);
  for (const sec of ["msh", "ptc", "fxc"]) {
    for (const [k, v] of Object.entries(dbFull[sec])) {
      for (const e of v.evidence) {
        assert.ok(
          !(/color|rgba|crimson|ember/i.test(e.field) && e.tag === "real"),
          `${sec}.${k} evidence '${e.field}' is not a real-tagged effect color (color is MAT/runtime, not PTC/texture)`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// --- full priority corpus + evidence audit ---  (DEC-02 closeout, slice-2)
// ---------------------------------------------------------------------------
// The full priority corpus enters the FxDb as ACTUAL KEYS via the generic decoders
// (no new decoder code): WAD-native fire flame5/EG through the WAD loop, and the
// standalone-only fire (FXCF) + chain-glow (CNG) + trails (BFT/BGT) through the
// standaloneRecs 3rd arg. Every decoded field must be real (byte-exact) or INFERRED
// (labelled + corroborated) — the data-first discipline (CLAUDE.md / D-04).
{
  // FULL standalone source: both PTC_* and FXC_* names for BFT/BGT/CNG/FXCF.
  const standaloneNames = [
    "PTC_BFTpart1", "PTC_BGTpart1", "PTC_CNGpart", "PTC_FXCFpart",
    "FXC_BFTemit1", "FXC_BGTemit1", "FXC_CNGemit", "FXC_FXCFemit",
  ];
  const standaloneRecs = standaloneNames.map((n) => ({ name: n, buf: loadBin(n).buf, tag: 0x1e }));
  const db = FxParse.buildFxDb(recs, buf, standaloneRecs);

  // WAD-native fire particles are real keys with byte-exact fields.
  assert.ok(db.ptc["PTC_flame5"], "db.ptc['PTC_flame5'] present (WAD-native fire)");
  assert.strictEqual(db.ptc["PTC_flame5"].magic, 0x13, "PTC_flame5 magic === 0x13");
  assert.strictEqual(db.ptc["PTC_flame5"].size, 568, "PTC_flame5 size@0x50 === 568");
  assert.strictEqual(db.ptc["PTC_flame5"].shapeRef, "flame5Shape", "PTC_flame5 shapeRef === flame5Shape");
  assert.ok(db.ptc["PTC_EGpart"], "db.ptc['PTC_EGpart'] present (WAD-native EG fire)");
  assert.strictEqual(db.ptc["PTC_EGpart"].shapeRef, "EGpartShape", "PTC_EGpart shapeRef === EGpartShape");
  assert.ok(db.fxc["FXC_EGemit"], "db.fxc['FXC_EGemit'] present (WAD-native EG emitter)");
  assert.ok(db.fxc["FXC_EGgrav"], "db.fxc['FXC_EGgrav'] present (WAD-native EG grav, subtype 0xc)");

  // CORPUS-KEY ASSERTION (the plan-04 Blocker fix): the standalone chain-glow + fire
  // + trail families are ALL ACTUAL KEYS in the built FxDb — not merely proven via
  // loadBin in isolation.
  assert.ok(db.fxc["FXC_CNGemit"], "db.fxc['FXC_CNGemit'] present (standalone chain-glow emitter)");
  assert.ok(db.ptc["PTC_CNGpart"], "db.ptc['PTC_CNGpart'] present (standalone chain-glow particle)");
  assert.strictEqual(db.ptc["PTC_CNGpart"].slotId, 0x1, "PTC_CNGpart slot@0x08 === 0x1");
  assert.strictEqual(db.ptc["PTC_CNGpart"].shapeRef, "CNGpartShape", "PTC_CNGpart shapeRef === CNGpartShape");
  assert.ok(db.fxc["FXC_FXCFemit"], "db.fxc['FXC_FXCFemit'] present (standalone fire emitter)");
  assert.ok(db.ptc["PTC_FXCFpart"], "db.ptc['PTC_FXCFpart'] present (standalone fire particle)");
  assert.strictEqual(db.ptc["PTC_FXCFpart"].shapeRef, "FXCFpartShape", "PTC_FXCFpart shapeRef === FXCFpartShape");
  assert.ok(db.fxc["FXC_BFTemit1"] && db.ptc["PTC_BFTpart1"], "BFT trail family present as actual keys");
  assert.ok(db.fxc["FXC_BGTemit1"] && db.ptc["PTC_BGTpart1"], "BGT trail family present as actual keys");

  // EVIDENCE-COMPLETENESS AUDIT: every FxDb entry carries a non-empty evidence array;
  // every entry is tagged real|INFERRED; every INFERRED entry has a non-empty corrob/note.
  for (const sec of ["msh", "ptc", "fxc"]) {
    for (const [k, v] of Object.entries(db[sec])) {
      assert.ok(Array.isArray(v.evidence) && v.evidence.length > 0, `${sec}.${k} carries a non-empty evidence array`);
      for (const e of v.evidence) {
        assert.ok(e.tag === "real" || e.tag === "INFERRED", `${sec}.${k} field '${e.field}' tagged real|INFERRED (got ${e.tag})`);
        if (e.tag === "INFERRED") {
          const note = e.corrob || e.note;
          assert.ok(note && String(note).trim().length > 0, `${sec}.${k} INFERRED field '${e.field}' carries a non-empty corroboration note`);
        }
      }
    }
  }

  // Every DECODED PTC field must be attested (must-have truth #4): the placement
  // matrix (+0x10) and the index (+0x0a) are byte-decoded, so they require real
  // evidence entries alongside magic/slot/size/shapeRef/params (parseFxc already
  // attests both; parsePtc must too — closed in this task's GREEN).
  for (const k of ["PTC_BFTpart1", "PTC_CNGpart", "PTC_FXCFpart", "PTC_flame5"]) {
    const ev = db.ptc[k].evidence;
    assert.ok(
      ev.some((e) => e.field === "matrix" && e.tag === "real"),
      `${k} evidence attests the decoded placement matrix (real)`
    );
    assert.ok(
      ev.some((e) => e.field === "index" && e.tag === "real"),
      `${k} evidence attests the decoded index (real)`
    );
  }

  // The full corpus still JSON.stringify-round-trips (the Phase-6 hand-off boundary).
  let json;
  assert.doesNotThrow(() => { json = JSON.stringify(db); }, "full-corpus FxDb is JSON.stringify-able");
  for (const k of ["FXC_CNGemit", "PTC_CNGpart", "FXC_FXCFemit", "PTC_FXCFpart", "PTC_flame5"]) {
    assert.ok(json.includes(k), `JSON dump contains ${k}`);
  }
}

console.log("fxdb.test.js: MSH + PTC + FXC + swordtrail-provenance + full-corpus known-answers passed");
