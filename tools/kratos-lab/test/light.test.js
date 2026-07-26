// light.test.js — byte-exact known-answer suite for FxParse.parseLight, the thin
// blade-light decoder (REND-02, D-09b resolved). LeftBladeLight / RightBladeLight
// are REAL 88-byte WAD records (tag 0x1e @0x6a60 / @0x6b20, byte-identical); their
// four core values are byte-EXACT/REAL — not INFERRED — so the per-blade warm point
// light the render wave (06-08) draws is sourced from the game's own decoded values,
// never from hardcoded roadmap constants (D-06).
//
// Expected values are byte-exact, first-party, VERIFIED by direct WAD probe this
// session (06-RESEARCH § "Decoded Data Inventory" LeftBladeLight/RightBladeLight row
// + § "Code Examples -> parseLight"). Those are the AUTHORITATIVE source of truth
// over any prose (the 03-02 RED-test discipline).
// Requirement: REND-02.
//
// Zero-dependency by project constraint: node built-ins only.
// Run: node tools/kratos-lab/test/light.test.js
//
// RED: FxParse.parseLight is NOT exported until Task 2 (GREEN) — every parseLight
// call throws `TypeError: FxParse.parseLight is not a function` until the decoder
// lands, so this file exits NON-zero until then.

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
const recs = Parsers.parseWad(buf);

// Resolve the LIGHT records by name + tag 0x1e + size > 0 (the WAD also stores a
// size-0 tag-0x32 back-reference under each name — the data-carrying tag-0x1e copy
// is the one to decode; filter it explicitly so a 0-byte dupe never reaches parseLight).
const recLeft = recs.find((r) => r.name === "LeftBladeLight" && r.tag === 0x1e && r.size > 0);
const recRight = recs.find((r) => r.name === "RightBladeLight" && r.tag === 0x1e && r.size > 0);
assert.ok(recLeft, "LeftBladeLight data-carrying record (tag 0x1e, 88 B) exists");
assert.ok(recRight, "RightBladeLight data-carrying record (tag 0x1e, 88 B) exists");
assert.strictEqual(recLeft.size, 88, "LeftBladeLight size === 88 (0x58)");
assert.strictEqual(recRight.size, 88, "RightBladeLight size === 88 (0x58)");

// tolerance helper — the four core values are byte-exact f32, so 1e-3 is generous.
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------
// (a) parseLight byte-exact core values (color / intensity / range / anchor)
// ---------------------------------------------------------------------------
// Byte offsets (RESEARCH "Code Examples -> parseLight"):
//   anchor    = f32[+0x10, +0x14, +0x18] -> (-0.32, -8.0, 1.0)
//   color     = f32[+0x2c, +0x30, +0x34] -> (1.0, 0.622, 0.288)
//   intensity = f32[+0x38]               -> 2.5
//   range     = f32[+0x44]               -> 160
{
  // RED: FxParse.parseLight is not exported until Task 2 — this throws now.
  const L = FxParse.parseLight(buf, recLeft);

  assert.ok(near(L.color[0], 1.0), `LeftBladeLight color.r ≈ 1.0 @+0x2c (got ${L.color[0]})`);
  assert.ok(near(L.color[1], 0.622), `LeftBladeLight color.g ≈ 0.622 @+0x30 (got ${L.color[1]})`);
  assert.ok(near(L.color[2], 0.288), `LeftBladeLight color.b ≈ 0.288 @+0x34 (got ${L.color[2]})`);
  assert.ok(near(L.intensity, 2.5), `LeftBladeLight intensity ≈ 2.5 @+0x38 (got ${L.intensity})`);
  assert.ok(near(L.range, 160), `LeftBladeLight range ≈ 160 @+0x44 (got ${L.range})`);
  assert.ok(near(L.anchor[0], -0.32), `LeftBladeLight anchor.x ≈ -0.32 @+0x10 (got ${L.anchor[0]})`);
  assert.ok(near(L.anchor[1], -8.0), `LeftBladeLight anchor.y ≈ -8.0 @+0x14 (got ${L.anchor[1]})`);
  assert.ok(near(L.anchor[2], 1.0), `LeftBladeLight anchor.z ≈ 1.0 @+0x18 (got ${L.anchor[2]})`);

  // Data-first discipline: the four core values are tagged real (byte-exact); any
  // ancillary field's MEANING is INFERRED (A5). Every evidence entry is tagged.
  assert.ok(Array.isArray(L.evidence) && L.evidence.length > 0, "parseLight carries an evidence array");
  for (const e of L.evidence) {
    assert.ok(e.tag === "real" || e.tag === "INFERRED", `evidence field ${e.field} tagged real|INFERRED (got ${e.tag})`);
  }
  for (const f of ["color", "intensity", "range", "anchor"]) {
    assert.ok(
      L.evidence.some((e) => e.field === f && e.tag === "real"),
      `${f} is attested REAL/decoded, not INFERRED (REND-02 — values come from the game)`
    );
  }
}

// ---------------------------------------------------------------------------
// (b) Left ≡ Right: the two blade-light records are byte-identical
// ---------------------------------------------------------------------------
{
  const L = FxParse.parseLight(buf, recLeft);
  const R = FxParse.parseLight(buf, recRight);
  assert.deepStrictEqual(R.color, L.color, "RightBladeLight color === LeftBladeLight color (byte-identical)");
  assert.deepStrictEqual(R.anchor, L.anchor, "RightBladeLight anchor === LeftBladeLight anchor (byte-identical)");
  assert.strictEqual(R.intensity, L.intensity, "RightBladeLight intensity === LeftBladeLight intensity");
  assert.strictEqual(R.range, L.range, "RightBladeLight range === LeftBladeLight range");
}

// ---------------------------------------------------------------------------
// (c) fail-loud size-gate (Security V5 / T-06-02-01): a short LIGHT record throws
//     NAMED BEFORE any field read — never spilling into the adjacent WAD record.
// ---------------------------------------------------------------------------
{
  // A record claiming size 0x20 (< 0x48) must throw before reading fields. The
  // backing buffer is deliberately large so the ONLY thing that trips is the size
  // bound (a NAMED fail-loud, not an incidental out-of-buffer RangeError).
  const band = new Uint8Array(0x80);
  const shortRec = { name: "LeftBladeLight_short", dataOff: 0, size: 0x20, tag: 0x1e };
  assert.throws(
    () => FxParse.parseLight(band, shortRec),
    /LIGHT .*size .*0x48/,
    "short LIGHT size (0x20 < 0x48) throws named BEFORE any field read (OOB-read guard)"
  );
  // The exact 0x48 boundary: the max read is range @+0x44..+0x48, so a record of
  // size 0x48 is the minimum that holds all four core values (gate is not over-tight).
  const okRec = { name: "LeftBladeLight_min", dataOff: 0, size: 0x48, tag: 0x1e };
  assert.doesNotThrow(
    () => FxParse.parseLight(band, okRec),
    "LIGHT size 0x48 (exactly enough for +0x44 range) passes the size gate"
  );
}

// ---------------------------------------------------------------------------
// (d) range-attenuation math (pure) — the REND-02 wave 06-08 wires this into the
//     mesh shader; test the math NOW so it is proven before it is used.
// ---------------------------------------------------------------------------
// atten(dist, range) = max(0, 1 - dist/range): full at the light, linear falloff,
// zero past the range boundary.
{
  const atten = (dist, range) => Math.max(0, 1 - dist / range);
  const range = 160; // decoded LeftBladeLight range
  assert.strictEqual(atten(0, range), 1, "atten(0, range) === 1 (full brightness at the light source)");
  assert.strictEqual(atten(range, range), 0, "atten(range, range) === 0 (dark at the range boundary)");
  assert.strictEqual(atten(range / 2, range), 0.5, "atten(range/2, range) === 0.5 (linear falloff midpoint)");
  assert.strictEqual(atten(2 * range, range), 0, "atten(2*range, range) === 0 (clamped, never negative past range)");
}

console.log("light.test.js: parseLight byte-exact blade-light values + Left≡Right + size-gate + attenuation passed");
