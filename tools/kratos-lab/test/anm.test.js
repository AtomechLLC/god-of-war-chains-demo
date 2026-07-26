// anm.test.js — known-answer suite for the type-5 ANM blade-state descriptor
// (DEC-03, Wave 5 — the LAST slice; deferred per D-07 so it never blocks the
// DEC-02 payoff). Decode-only: the rendering that consumes this is Phase-6 work.
//
// Zero-dependency by project constraint: node built-ins only.
// Run: node tools/kratos-lab/test/anm.test.js
//
// ===========================================================================
// DIFFERENTIAL-DECODE FINDINGS + PER-FIELD EVIDENCE TABLE (recovered this
// session directly from R_WPN0_0.WAD bytes — RESEARCH "Differential-Decode
// Protocol"; these seeds were NOT pre-supplied by RESEARCH, so they are pinned
// here after CONFIRMING the descriptor identity, never invented to force green).
// ===========================================================================
//
// TYPE-5 IDENTITY — CONFIRMATION + ESCALATION DISPOSITION (D-04, Warning 2):
//   The candidate blade records' first u16 is 0x1 / 0x3, NOT a literal 5 — so
//   "type-5" is mogaika's ANM-taxonomy LABEL, not a magic at +0x00. A full
//   instance-class histogram over every data-carrying tag-0x1e record in the WAD
//   contains NO class-5 record at all (classes present: 1,3,4,6,7,8,9,12,15,17,
//   19,20,23,24,26,28,30,33,35,39). There is also NO level-1 `ANM_maiblade` — the
//   WAD carries only the god-tier `ANM_maigodblade` (644 B). So the prescribed
//   level-1-vs-god pair-diff is IMPOSSIBLE on the ANM record itself.
//   DISPOSITION (per the escalation/abort protocol): the blade-state descriptor
//   that DOES have a genuine level-1<->god differential pair AND binds the blade
//   presentation is the `gomaiblade` / `gomaigodblade` scene-binding node
//   (instance class id 1, variant 2 => u32@0 = 0x00020001 — consistent with the
//   plan's "first u16 is 0x1/0x3"). Its type-5 taxonomy attribution is corroborated
//   by the ANM resource context (ANMX_R_Wpn resource-type id = 3; ANM_maigodblade
//   u32@0 = 3 animates "MAIgodblade"), but CANNOT be byte-confirmed to a literal
//   magic — so the "type-5" LABEL itself is tagged INFERRED, and the ELF-disassembly
//   path (RESEARCH "ELF-Disassembly Escalation Path", D-04) is noted as the
//   tiebreaker. No byte-exact seed is fabricated for an unconfirmed field.
//
// LOCATED RECORD — `gomaiblade` (level-1 target), idx 140, off 0xD580, size 92:
//   +0x00  u16   = 1            instance class id ("object/instance" class)   [real]
//   +0x02  u16   = 2            descriptor variant => u32@0 = 0x00020001      [real]
//   +0x04  char[24] "maiblade"  the blade INSTANCE this node binds            [real]
//   +0x1c  u16   = 1            selector — differential-confirmed TIER field  [real raw;
//                               (gomaiblade=1, gomaigodblade=2), NOT the        meaning
//                               combat show/hide field                         INFERRED]
//   +0x2c  f32   = 1.0          transform diagonal (constant across the pair)  [real]
//   +0x3c  f32   = 1.0          transform diagonal (constant across the pair)  [real]
//   +0x40  f32[4]= (0, -0.320, -8.0, 1.0)  placement/anchor offset; the -8.0   [real raw;
//                               z is an on-back-anchor candidate                on-back
//                                                                               INFERRED]
//   +0x58  u32   = 0xffffffff   end sentinel (== last 4 bytes)                 [real]
//
// DIFFERENTIAL BASIS (gomaiblade @0xD580 vs gomaigodblade @0x1F240, both 92 B):
//   differ ONLY at 0x07-0x0e (bound name), 0x1c (tier selector 1 vs 2), and
//   0x40-0x4b (placement vec) — every other byte is CONSTANT framing. This
//   isolates the framing from the tier-varying payload and proves the selector
//   @0x1c encodes TIER (level-1 vs god), not the in-hand/on-back combat state.
//
// SHOW/HIDE (in-hand during combat vs on-back out of combat) — INFERRED, D-04:
//   NOT a static varying byte in the located record (the only differential-varying
//   selector, @0x1c, is TIER). The in-hand/on-back toggle is runtime/animation-
//   driven — the class of quantity D-04 permits as a clearly-labeled INFERRED value
//   (corroborated by footage: blades in hands during combat, sheathed on the back
//   otherwise; and by the -8.0 placement z as a back-anchor candidate). The
//   ELF-escalation path is the tiebreaker; NO byte-exact seed is invented for it.
// ===========================================================================

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
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const recs = Parsers.parseWad(buf);

// ---------------------------------------------------------------------------
// (0) TYPE-5 IDENTITY CONFIRMATION — data-first, before any decode seed is pinned
// ---------------------------------------------------------------------------
// No data-carrying tag-0x1e record has instance-class 5: "type-5" is NOT a literal
// magic here. Establish that from the bytes so the label's INFERRED tag is earned.
{
  const class5 = recs.filter((r) => r.tag === 0x1e && r.size >= 2 && dv.getUint16(r.dataOff, true) === 5);
  assert.strictEqual(class5.length, 0, "no data-carrying tag-0x1e record has instance-class 5 (type-5 is a label, not a magic)");

  // No level-1 ANM_maiblade exists — only the god-tier ANM (differential pair on
  // the ANM record itself is impossible; recorded in the escalation disposition).
  const anmRecs = recs.filter((r) => /^ANM_/.test(r.name) && r.size > 0);
  assert.strictEqual(anmRecs.length, 1, "only the god-tier ANM_maigodblade carries ANM data (no level-1 ANM_maiblade)");
  assert.strictEqual(anmRecs[0].name, "ANM_maigodblade", "the sole data-carrying ANM_* is ANM_maigodblade");

  // ANM taxonomy anchors (cross-ref the "type-5 ANM" context): ANMX_R_Wpn declares
  // the ANM resource-type id (3); ANM_maigodblade's u32@0 is that same 3.
  const anmx = recs.find((r) => r.name === "ANMX_R_Wpn" && r.off === 0x540);
  assert.ok(anmx, "ANMX_R_Wpn resource-type header exists");
  assert.strictEqual(dv.getUint16(anmx.dataOff, true), 3, "ANMX_R_Wpn resource-type id === 3 (ANM)");
  assert.strictEqual(dv.getUint32(recs.find((r) => r.name === "ANM_maigodblade" && r.size > 0).dataOff, true), 3, "ANM_maigodblade u32@0 === 3 (ANM magic/type)");
}

// ---------------------------------------------------------------------------
// (a) LOCATE + FRAME the level-1 type-5 blade-state descriptor: `gomaiblade`
// ---------------------------------------------------------------------------
// Byte-exact anchors (grep-able hex): off 0xD580, size 92. u32@0 0x00020001.
const gomai = recs.find((r) => r.name === "gomaiblade" && r.off === 0xd580);
assert.ok(gomai, "gomaiblade @0xD580 (level-1 blade-state descriptor) exists");
assert.strictEqual(gomai.off, 0xd580, "gomaiblade located off === 0xD580");
assert.strictEqual(gomai.size, 92, "gomaiblade located size === 92");
assert.strictEqual(dv.getUint32(gomai.dataOff, true) >>> 0, 0x00020001, "gomaiblade u32@0 === 0x00020001 (type-5 descriptor identity: class 1 / variant 2)");

// ---------------------------------------------------------------------------
// (b) DIFFERENTIAL BASIS — level-1 `gomaiblade` vs god-tier `gomaigodblade`,
//     plus the `maiblade`/`maigodblade` instance pair the node binds.
// ---------------------------------------------------------------------------
const gogod = recs.find((r) => r.name === "gomaigodblade" && r.off === 0x1f240);
const maiL1 = recs.find((r) => r.name === "maiblade" && r.off === 0xd160);
const maiGod = recs.find((r) => r.name === "maigodblade" && r.off === 0x1ed60);
assert.ok(gogod, "god-tier gomaigodblade @0x1F240 exists (differential counterpart)");
assert.ok(maiL1, "level-1 maiblade @0xD160 instance exists (the bound blade)");
assert.ok(maiGod, "god-tier maigodblade @0x1ED60 instance exists (differential counterpart)");

// The pair shares constant framing and differs ONLY at bound-name / tier / vec.
assert.strictEqual(gogod.size, 92, "gomaigodblade size === 92 (same framing as gomaiblade)");
assert.strictEqual(dv.getUint32(gogod.dataOff, true) >>> 0, 0x00020001, "gomaigodblade shares the 0x00020001 identity (constant framing)");
{
  const diff = [];
  for (let o = 0; o < 92; o++) if (buf[gomai.dataOff + o] !== buf[gogod.dataOff + o]) diff.push(o);
  // every differing byte lies in the bound-name (0x04-0x1b), the tier selector
  // (0x1c-0x1d) or the placement vec (0x40-0x4b) — nothing in the framing.
  for (const o of diff) {
    const inBound = o >= 0x04 && o <= 0x1b;
    const inTier = o >= 0x1c && o <= 0x1d;
    const inVec = o >= 0x40 && o <= 0x4b;
    assert.ok(inBound || inTier || inVec, `gomaiblade vs gomaigodblade differ only in name/tier/vec (offset 0x${o.toString(16)})`);
  }
  // and the identity framing bytes ARE constant across the pair.
  assert.strictEqual(buf[gomai.dataOff + 0x00], buf[gogod.dataOff + 0x00], "framing byte +0x00 constant across the pair");
  assert.strictEqual(buf[gomai.dataOff + 0x02], buf[gogod.dataOff + 0x02], "framing byte +0x02 constant across the pair");
  // the tier selector @0x1c genuinely differs (1 vs 2) — a TIER field, not show/hide.
  assert.strictEqual(dv.getUint16(gomai.dataOff + 0x1c, true), 1, "gomaiblade tier selector @0x1c === 1 (level-1)");
  assert.strictEqual(dv.getUint16(gogod.dataOff + 0x1c, true), 2, "gomaigodblade tier selector @0x1c === 2 (god) — TIER, not combat show/hide");
}

// ===========================================================================
// (c) DECODER known-answers — RED until FxParse.parseAnmType5 is exported (Task 2)
// ===========================================================================
{
  const d = FxParse.parseAnmType5(buf, gomai); // RED: parseAnmType5 not exported yet

  // Byte-exact framing (real).
  assert.strictEqual(d.subtype, 0x00020001, "parseAnmType5 subtype === 0x00020001 (type-5 descriptor identity)");
  assert.strictEqual(d.classId, 1, "parseAnmType5 classId === 1");
  assert.strictEqual(d.variant, 2, "parseAnmType5 variant === 2");
  assert.strictEqual(d.bound, "maiblade", "parseAnmType5 bound instance === 'maiblade' (name @+0x04)");
  assert.strictEqual(d.size, 92, "parseAnmType5 size === 92");
  assert.strictEqual(d.tierSelector, 1, "parseAnmType5 tierSelector @0x1c === 1 (level-1)");

  // Placement/anchor offset (real raw bytes; the -8.0 z is a back-anchor candidate).
  assert.strictEqual(d.anchorOffset.length, 4, "anchorOffset is a vec4");
  assert.strictEqual(d.anchorOffset[0], 0, "anchorOffset.x === 0");
  assert.ok(Math.abs(d.anchorOffset[1] - -0.320007) < 1e-4, `anchorOffset.y ≈ -0.320 (got ${d.anchorOffset[1]})`);
  assert.strictEqual(d.anchorOffset[2], -8, "anchorOffset.z === -8.0 (byte-exact 0xC1000000)");
  assert.strictEqual(d.anchorOffset[3], 1, "anchorOffset.w === 1.0");

  // Queryable state -> visibility result (the Phase-6 gate). The MAPPING is INFERRED
  // (runtime/animation-driven; footage-corroborated), not a fabricated byte seed.
  assert.strictEqual(d.visibilityFor("in-combat"), "in-hand", "in-combat -> in-hand (blades drawn during combat)");
  assert.strictEqual(d.visibilityFor("out-of-combat"), "on-back", "out-of-combat -> on-back (blades sheathed)");
  assert.ok(Array.isArray(d.states) && d.states.length === 2, "descriptor exposes a 2-entry states array");
  for (const s of d.states) {
    assert.ok(s.combat === "in-combat" || s.combat === "out-of-combat", `state.combat labelled (${s.combat})`);
    assert.ok(s.visibility === "in-hand" || s.visibility === "on-back", `state.visibility labelled (${s.visibility})`);
    assert.strictEqual(s.tag, "INFERRED", "show/hide state mapping is INFERRED (runtime, D-04) — not fabricated as real");
  }

  // Data-first discipline: every decoded field carries a real|INFERRED tag; every
  // INFERRED carries a corroboration note (the type-5 label + show/hide mapping).
  assert.ok(Array.isArray(d.evidence) && d.evidence.length > 0, "parseAnmType5 carries a non-empty evidence array");
  for (const e of d.evidence) {
    assert.ok(e.tag === "real" || e.tag === "INFERRED", `evidence '${e.field}' tagged real|INFERRED (got ${e.tag})`);
    if (e.tag === "INFERRED") {
      const note = e.corrob || e.note;
      assert.ok(note && String(note).trim().length > 0, `INFERRED evidence '${e.field}' carries a corroboration note`);
    }
  }
  // The type-5 LABEL and the show/hide mapping MUST be present and INFERRED (the
  // honest escalation disposition — never a real-tagged fabricated field).
  assert.ok(
    d.evidence.some((e) => /type-?5|label/i.test(e.field) && e.tag === "INFERRED"),
    "the 'type-5' taxonomy label is tagged INFERRED (no literal class-5 magic; ELF-escalation is the tiebreaker)"
  );
  assert.ok(
    d.evidence.some((e) => /show|hide|visib|state/i.test(e.field) && e.tag === "INFERRED"),
    "the in-hand/on-back show/hide mapping is tagged INFERRED (runtime, D-04)"
  );
  // ...and no evidence entry fabricates the show/hide state as a byte-exact real field.
  assert.ok(
    !d.evidence.some((e) => /show|hide|onback|inhand/i.test(e.field) && e.tag === "real"),
    "no real-tagged fabricated show/hide byte field (the combat state is runtime, not decoded)"
  );

  // JSON-dumpable (the Phase-6 hand-off boundary): the states/evidence data survives
  // JSON round-trip (the visibilityFor method is a query helper, not serialized data).
  let json;
  assert.doesNotThrow(() => { json = JSON.stringify(d); }, "parseAnmType5 result is JSON.stringify-able");
  assert.ok(json.includes("on-back") && json.includes("in-hand"), "JSON dump contains the queryable visibility states");
}

// ---------------------------------------------------------------------------
// (d) fail-loud: bad-identity + short ANM record both throw named (WR-01 / T-05-01)
// ---------------------------------------------------------------------------
{
  const big = new Uint8Array(0x5c); // u32@0 left 0 (!= 0x00020001)
  const badRec = { name: "ANM_bogus", dataOff: 0, size: 0x5c, tag: 0x1e };
  assert.throws(() => FxParse.parseAnmType5(big, badRec), /ANM_bogus/, "wrong-identity ANM names the record");

  const shortRec = { name: "ANM_short", dataOff: 0, size: 0x10, tag: 0x1e };
  assert.throws(
    () => FxParse.parseAnmType5(big, shortRec),
    /ANM_short/,
    "short ANM size throws named (before any field read)"
  );
}

console.log("anm.test.js: type-5 ANM blade-state descriptor known-answers passed");
