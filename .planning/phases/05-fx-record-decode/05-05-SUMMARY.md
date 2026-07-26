---
phase: 05-fx-record-decode
plan: 05
subsystem: fx-decode
tags: [reverse-engineering, binary-decode, anm, blade-state, differential-decode, escalation-disposition, node-assert, data-first]

# Dependency graph
requires:
  - phase: 05-fx-record-decode
    plan: 04
    provides: "buildFxDb color provenance + full FX corpus; the FxParse decode idiom (size-gate -> identity -> named reads, real/INFERRED evidence) to mirror"
  - phase: 02-wad-mat-decode-render-pass-foundation
    provides: "Parsers.parseWad/resolve (WAD record access), FxParse.readName"
provides:
  - "FxParse.parseAnmType5 — decodes the type-5 ANM blade-state descriptor (gomaiblade-class: class id 1 / variant 2, u32@0 0x00020001) into a queryable, JSON-dumpable { subtype, classId, variant, bound, tierSelector, anchorOffset, states, visibilityFor, size, evidence }"
  - "A state -> visibility query the Phase-6 blade presentation gates on: visibilityFor('in-combat')='in-hand', visibilityFor('out-of-combat')='on-back' (mapping INFERRED/runtime per D-04, framing/binding/placement real)"
  - "Escalation disposition recorded data-first: NO instance-class-5 record exists in the WAD and NO level-1 ANM_maiblade (god-tier ANM only) — 'type-5' is a taxonomy label (INFERRED, ELF-tiebreaker), not a magic; the blade-state descriptor is the gomaiblade scene-binding node with a genuine level-1<->god pair"
affects: [06-particle-render]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Differential-decode with an escalation disposition: when the prescribed pair-diff is impossible (no level-1 ANM) and the taxonomy label has no literal magic, pin ONLY the byte-exact framing/binding/placement (real) and INFERRED-label the unconfirmable label + the runtime combat-state mapping with corroboration + an ELF tiebreaker note — never a fabricated byte seed (D-04 / T-05-04)"
    - "Separate TIER-varying from STATE-varying via the pair-diff: gomaiblade vs gomaigodblade differ only at bound-name / selector @0x1c (1 vs 2) / placement vec — proving @0x1c is a tier field, NOT the in-hand/on-back combat state, so the show/hide mapping is runtime (INFERRED), not a decoded byte"
    - "Queryable descriptor: expose a plain states[] (JSON-serializable) plus a visibilityFor() method (query helper, dropped by JSON.stringify) so the Phase-6 gate is both callable and dumpable"

key-files:
  created:
    - "tools/kratos-lab/test/anm.test.js"
  modified:
    - "tools/kratos-lab/fxparse.js"

key-decisions:
  - "DEC-03 descriptor = the gomaiblade/gomaigodblade scene-binding node (not the ANM record): it is the only blade-presentation record with a genuine level-1<->god differential pair (both 92 B, u32@0 0x00020001). The WAD has no level-1 ANM_maiblade (god-tier ANM_maigodblade only), so the prescribed ANM pair-diff is impossible."
  - "'type-5' is a taxonomy LABEL, not a magic (escalation disposition, D-04): a full instance-class histogram over every data-carrying tag-0x1e record has NO class-5 record. The label is corroborated only by the ANM resource context (ANMX_R_Wpn type-id 3) and is tagged INFERRED; ELF-disassembly is the recorded tiebreaker. No byte-exact seed was fabricated to force a class-5 read."
  - "Show/hide (in-hand vs on-back) is runtime/animation-driven (D-04): the only differential-varying selector (@0x1c) is TIER, so the combat-state mapping is NOT a static byte. Exposed as an INFERRED, footage-corroborated query — decoded framing/binding/placement stay real."

patterns-established:
  - "Escalation-disposition decode: confirm identity from the corpus first (histogram + differential), pin real seeds, INFERRED-label the residue with a corroboration note + ELF tiebreaker, and record the gap honestly in the SUMMARY rather than fabricating a green"

requirements-completed: [DEC-03]

# Metrics
duration: 15min
completed: 2026-07-25
---

# Phase 5 Plan 05: Type-5 ANM Blade-State Descriptor Decode Summary

**`FxParse.parseAnmType5` decodes the level-1 blade-state descriptor (`gomaiblade`, off 0xD580, size 92) — the scene-binding node that presents the `maiblade` instance — into a queryable, JSON-dumpable `state -> visibility` result the Phase-6 blade presentation gates on, with every field tagged real (byte-exact framing/binding/placement/tier) or INFERRED (the "type-5" taxonomy label and the in-hand/on-back combat mapping), following the D-04 escalation disposition honestly: the WAD has NO instance-class-5 record and NO level-1 `ANM_maiblade` (god-tier ANM only), so "type-5" is confirmed as a label — not a magic — the descriptor is located via the genuine `gomaiblade`↔`gomaigodblade` level-1↔god pair-diff, and the runtime show/hide mapping is INFERRED (footage-corroborated, ELF-tiebreaker noted) rather than fabricated as a byte seed.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-25
- **Tasks:** 2 (Task 1 RED locate/frame/confirm; Task 2 GREEN decoder — TDD)
- **Files:** 1 created (`test/anm.test.js`), 1 modified (`fxparse.js`)

## Accomplishments

- **Located + confirmed the descriptor identity data-first (Task 1):** a full instance-class histogram over every data-carrying tag-0x1e record in `R_WPN0_0.WAD` has NO class-5 record (classes present: 1,3,4,6,7,8,9,12,15,17,19,20,23,24,26,28,30,33,35,39), and there is NO level-1 `ANM_maiblade` — only the god-tier `ANM_maigodblade` (644 B). So "type-5" is confirmed as mogaika's ANM-taxonomy LABEL, not a magic, and the prescribed level-1-vs-god ANM pair-diff is impossible on the ANM record. The blade-state descriptor with a genuine level-1↔god pair AND a blade-presentation role is the `gomaiblade`/`gomaigodblade` scene-binding node (class id 1, variant 2 → u32@0 = 0x00020001).
- **Byte-exact differential (Task 1):** `gomaiblade` (@0xD580) vs `gomaigodblade` (@0x1F240), both 92 B, differ ONLY at the bound-instance name (0x07-0x0e), the selector @0x1c (1 vs 2), and the placement vec (0x40-0x4b) — every other byte is constant framing. This proves @0x1c is a TIER field, not the combat show/hide field.
- **parseAnmType5 decoder (Task 2 GREEN):** size-gate (`< 0x5c`) → identity assert (`u32@0 == 0x00020001`) → named field reads bounded by `rec.size`. Returns `{ subtype, classId, variant, bound:"maiblade", tierSelector, anchorOffset:[0,-0.320,-8.0,1.0], sentinel, states, visibilityFor, size, evidence }`.
- **Queryable, JSON-dumpable state→visibility (the Phase-6 gate):** `visibilityFor("in-combat")==="in-hand"`, `visibilityFor("out-of-combat")==="on-back"`; the `states[]` array carries the same data for the JSON hand-off. `JSON.stringify` round-trips (the `visibilityFor` method is a query helper, not serialized data).
- **Per-field evidence table (data-first):** framing (classId/variant/identity), binding (`bound`), tier selector, placement `anchorOffset`, and the end sentinel are tagged **real** (byte-exact). The **type-5 label** and the **show/hide mapping** are tagged **INFERRED** with corroboration notes + the ELF-disassembly tiebreaker (D-04). No field fabricates the combat show/hide state as a real byte.
- **Fail-loud (WR-01 / T-05-01):** a wrong-identity ANM and a short ANM both throw named errors (`ANM ${rec.name}: …`).
- **Full suite green:** all 6 `test/*.test.js` suites pass (anm + the DEC-02 suites sharing `fxparse.js` — no regression). `index.html` left UNCHANGED (decode-only; Phase-6 wires the presentation).

## Task Commits

1. **Task 1 (RED):** `test(05-05): add RED type-5 ANM blade-state descriptor known-answers` — `57dcbe9`
2. **Task 2 (GREEN):** `feat(05-05): parseAnmType5 type-5 ANM blade-state descriptor decode` — `2ded3d5`

## Files Created/Modified

- `tools/kratos-lab/test/anm.test.js` (created) — the type-5 known-answer suite: a top-of-file per-field evidence table + escalation disposition, a data-first identity confirmation (no class-5; sole ANM is god-tier), the `gomaiblade`↔`gomaigodblade` differential pin, byte-exact decoder known-answers, the state→visibility query, the real/INFERRED evidence audit, and the fail-loud throws.
- `tools/kratos-lab/fxparse.js` (modified) — added `parseAnmType5(buf, rec)` inside the `FxParse` IIFE (JSDoc byte-layout header + escalation disposition) and extended the export return line. No other decoder touched.

## Deviations from Plan

### [Escalation disposition — D-04 / plan's Task-1 ABORT PROTOCOL] Type-5 label + show/hide mapping are INFERRED, not byte-decoded

- **Found during:** Task 1 (differential locate + confirm).
- **What the plan anticipated:** "this plan discovers its own seeds at execution time"; if a field cannot be confirmed, "INFERRED-label the unresolved field(s) with a corroboration note … do NOT fabricate byte-exact assertions for an unconfirmed field."
- **What was found:** (1) NO instance-class-5 record exists in the WAD, and NO level-1 `ANM_maiblade` (god-tier `ANM_maigodblade` only) — so "type-5" is a taxonomy label, not a magic, and the ANM pair-diff is impossible. (2) The only differential-varying selector (@0x1c) encodes TIER (level-1 vs god), not the in-hand/on-back combat state — so the show/hide mapping is runtime/animation-driven, not a static byte.
- **Disposition:** located a genuine blade-state descriptor (`gomaiblade`) with a real level-1↔god pair, pinned ONLY byte-exact framing/binding/placement/tier as **real** seeds, and INFERRED-labeled the "type-5" attribution and the show/hide mapping with corroboration + the ELF-disassembly tiebreaker. This is the plan's sanctioned INFERRED-label branch (not an abort, and not a fabrication).
- **Files:** `tools/kratos-lab/test/anm.test.js`, `tools/kratos-lab/fxparse.js`. **Commits:** `57dcbe9`, `2ded3d5`.

### [Note] The DEC-03 descriptor is the `gomaiblade` scene-binding node, not the `ANM_*` record

- The plan listed `ANM_maigodblade` / `ANMX_R_Wpn` / `maiblade` / `gomaiblade` as candidates and directed the executor to "differentially confirm which carries the type-5 blade-state descriptor." The differential + the class histogram selected `gomaiblade` (the record that binds the blade instance and carries the placement + selector), consistent with the plan's stated candidate framing (first u16 is 0x1/0x3). The ANM record (`ANM_maigodblade`) is a full keyframe-curve animation record with no level-1 counterpart; it is cross-referenced as the ANM taxonomy anchor only, not decoded here.

## Known Stubs

None that block the plan goal. The `states[]` visibility mapping (in-combat→in-hand / out-of-combat→on-back) is an INFERRED, footage-corroborated runtime mapping by design (D-04), documented as INFERRED in both the evidence array and this SUMMARY. Phase-6 calibrates the actual show/hide trigger against footage / the ELF; the decode deliverable (a real, queryable blade-binding descriptor) is complete.

## Threat Flags

None. `parseAnmType5` reads only `assets/wads/R_WPN0_0.WAD` (via caller-supplied bytes), size-gates before the identity read, asserts the identity, and bounds every read by `rec.size` — the T-05-01/02 mitigations. No new network/auth/file surface introduced.

## TDD Gate Compliance

- **RED gate:** `57dcbe9` `test(05-05)` — `anm.test.js` committed failing (`FxParse.parseAnmType5 is not a function`), with the identity-confirmation + differential assertions passing before the decoder call. Fail-fast honored: no test passed unexpectedly during RED.
- **GREEN gate:** `2ded3d5` `feat(05-05)` — `parseAnmType5` implemented; anm suite + full suite pass, committed after RED.
- **REFACTOR gate:** none needed (the decoder mirrors the `parseTxr`/`parsePtc` idiom verbatim; clean on first pass).

## Self-Check: PASSED

- FOUND: tools/kratos-lab/test/anm.test.js
- FOUND: tools/kratos-lab/fxparse.js
- FOUND: .planning/phases/05-fx-record-decode/05-05-SUMMARY.md
- FOUND: commit 57dcbe9 (Task 1 RED, test)
- FOUND: commit 2ded3d5 (Task 2 GREEN, feat)
- `FxParse.parseAnmType5` is exported (typeof === function)
- `node tools/kratos-lab/test/anm.test.js` exits 0; full suite (anm/chain/fx/fxdb/loop/wad) all PASS; parseAnmType5 runs standalone on `gomaiblade` and JSON-dumps (exit 0)

---
*Phase: 05-fx-record-decode*
*Completed: 2026-07-25*
