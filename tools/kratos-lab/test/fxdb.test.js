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

console.log("fxdb.test.js: MSH known-answers passed");
