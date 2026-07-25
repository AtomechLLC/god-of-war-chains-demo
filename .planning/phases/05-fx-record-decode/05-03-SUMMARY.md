---
phase: 05-fx-record-decode
plan: 03
subsystem: fx-decode
tags: [reverse-engineering, binary-decode, fxc, emitter, fxdb, cross-ref, node-assert, data-first]

# Dependency graph
requires:
  - phase: 05-fx-record-decode
    plan: 01
    provides: "FxParse.parseMsh + buildFxDb skeleton { meta, msh, ptc, fxc, refs }; readName; Parsers.resolve nearest-preceding MSH copy selection; keep-first same-name rule"
  - phase: 05-fx-record-decode
    plan: 02
    provides: "FxParse.parsePtc + buildFxDb 3rd-arg standaloneRecs (BFT/BGT trail defs at slot 0x1d as real db.ptc keys); runtime-handle shape refs resolved:false"
provides:
  - "FxParse.parseFxc — subtype-branched FXC_* emitter decoder (0x2 emitter / 0x3 spark / 0xc grav best-effort / 0xd poly with +0x58 name after a u32 count); magic/subtype/slot/idx/matrix/size/shapeRef + evidence"
  - "buildFxDb fxc-section — db.fxc populated from the WAD (spark/poly/EG) AND the standalone 3rd arg (FXC_BFTemit1/BGTemit1 become real keys); the FxDb root is complete"
  - "buildFxDb refs graph — FXC->MSH shape links resolved:true (throw on dangling); runtime handles resolved:false; guarded slot pairs (skip placeholder 0x00 / 0xffff) so only the real 0x1d BFT/BGT trail pairing is emitted"
affects: [05-04-color-provenance, 06-particle-render]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Subtype-branched name offset (Pitfall 2): read u16 subtype @+0x02 BEFORE the ref name; subtype 2/3 -> name @+0x54, subtype 0xd -> u32 count @+0x54 then MSH name @+0x58; the branch runs before the read so a poly emitter never mis-reads the count bytes as a name"
    - "Guarded slot-pairing (Warning 1 / T-05-04): SKIP placeholder slot 0x00 and the 0xffff root sentinel before pairing FXC<->PTC — every WAD-native record carries slot 0x00, so pairing on it would fabricate false 0x00x0x00 links; only the standalone 0x1d trail group pairs"
    - "Cross-env Parsers access in a pure module: `typeof require !== 'undefined' ? require('./parsers.js') : Parsers` — Node requires the same cached module the tests load; the browser uses the global lexical binding (buildFxDb is Node-only this phase)"

key-files:
  created: []
  modified:
    - "tools/kratos-lab/fxparse.js"
    - "tools/kratos-lab/test/fxdb.test.js"

key-decisions:
  - "DEC-02 COMPLETE: MSH (05-01) + PTC (05-02) + FXC (05-03) are all decoded with per-field evidence tables and differential comparison — the requirement's decode is satisfied. Color provenance (a DEC-02 sub-note) was found data-first NOT to live in these records (Pitfall 4) and is traced in 05-04; the record decode itself is done"
  - "FXC in-WAD copies keep-FIRST per name (level-1 precedes god-tier in WAD order; god tier out of scope, PROJECT.md), mirroring the 05-01 MSH / 05-02 PTC keep-first rule"
  - "The 0x1d slot is a trail-position GROUP id, not a fire/swoosh discriminator (A4): FXC_BFTemit1 (0x1d) pairs with BOTH PTC_BFTpart1 and PTC_BGTpart1 by slot — corroboration only; the shapeRef NAME (BFTpart1Shape vs BGTpart1Shape) is the real discriminator"
  - "subtype 0xc grav (FXC_EGgrav) reads its name @+0x54 as a best-effort tagged INFERRED — its +0x54 bytes are a control char, a non-MSH_ runtime handle (resolved:false), never thrown"

patterns-established:
  - "parseFxc mirrors the parseTxr/parsePtc idiom verbatim (JSDoc byte-layout header, size-gate BEFORE magic both naming the record, DataView over buf.buffer/byteOffset/byteLength, readName for NUL-terminated names) — only the subtype branch is new"
  - "buildFxDb tracks each FXC's WAD idx (fxcEntries) so the subtype-0xd MSH shape ref resolves nearest-preceding from the referencing record; standalone FXC use idx:0 (their refs are non-MSH runtime handles, so idx is unused)"

requirements-completed: [DEC-02]

# Metrics
duration: 12min
completed: 2026-07-25
---

# Phase 5 Plan 03: FXC Emitter Decoder + FxDb Cross-Reference Graph Summary

**`parseFxc` decodes the `FXC_*` emitter records across all three FX subtypes — 0x2 emitter (standalone BFT/BGT trails), 0x3 spark (in-WAD BDEsparkemit), 0xd poly (the explicit FXC->MSH link read at +0x58 after a u32 count) — branching the reference-name offset on the u16 subtype, and `buildFxDb` assembles the complete, JSON-dumpable emitter->particle->shape graph: standalone BFT/BGT emitters become real `db.fxc` keys, MSH shape refs resolve (`resolved:true`), runtime handles are recorded (`resolved:false`), and the guarded 0x1d BFT/BGT trail slot pair is emitted while placeholder slot 0x00 / 0xffff pairs are skipped. This completes the D-01 payoff slice and closes DEC-02 (MSH+PTC+FXC all decoded).**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-25
- **Tasks:** 2 (RED test, GREEN implementation)
- **Files modified:** 2 (both extended, none created — extends the 05-01/05-02 decoder + suite)

## Accomplishments
- `FxParse.parseFxc(buf, rec)` decodes the four seed FXC records byte-exact: `FXC_BFTemit1` (standalone 228 B, magic 0x1e, subtype 0x2, slot 0x1d, idx 0x05, ref@0x54 `BFTpart1Shape`, matrix row0 (0.00204, 0.75790, 0.65237)); `FXC_BGTemit1` (idx 0x06, ref `BGTpart1Shape`, matrix **byte-identical** to BFTemit1); `FXC_BDEsparkemit` (in-WAD @0xCB70, subtype 0x3, ref `flame6Shape`, identity matrix); `FXC_BDepoly3` (in-WAD @0xCC80, 136 B, subtype 0xd, u32 count@0x54 = 1, name@0x58 `MSH_BDepoly3Shape`).
- **Subtype branch (Pitfall 2 / T-05-02):** the u16 subtype @+0x02 is read BEFORE the ref name; subtype 2/3 read the name @+0x54, subtype 0xd reads a u32 count @+0x54 then the MSH name @+0x58, and subtype 0xc grav reads a best-effort name @+0x54 tagged INFERRED. A single hardcoded offset would mis-read the poly emitters — the known-answer per subtype proves the branch.
- **Differential invariant (A4):** `FXC_BFTemit1` vs `FXC_BGTemit1` decode to IDENTICAL 16-float matrices (fire & swoosh share placement); they differ only at idx / name / shape block. The test pins this with `assert.deepStrictEqual` plus a 3x3-rotation-row orthonormality sanity check (each row unit-length).
- **buildFxDb fxc-section:** `db.fxc` is populated from BOTH the WAD (spark/poly/EG emitters, keep-first) AND the standalone 3rd arg (the BFT/BGT trail emitters, absent from the WAD — Pitfall 1 — enter as real keys). The FxDb root is now complete: the D-01 payoff-first trail emitters are queryable end-to-end.
- **Guarded cross-ref graph:** `db.refs` carries (1) shape refs — `MSH_*` names resolve via `Parsers.resolve` (`resolved:true`; a true miss THROWS naming the record — no dangling explicit links), non-`MSH_` names are runtime handles (`resolved:false`, never thrown); and (2) slot pairs — the FXC<->PTC pairing SKIPS placeholder slot 0x00 and the 0xffff root sentinel, so the only pairs emitted are the real 0x1d BFT/BGT trail group (`FXC_BFTemit1 -> PTC_BFTpart1`, etc.), never a fabricated 0x00x0x00 pair (T-05-04).
- The whole `FxDb` (msh + ptc + fxc + refs) is `JSON.stringify`-able — the Phase-6 hand-off boundary.
- **Fail-loud (WR-01 / T-05-01):** a bad-magic FXC throws `FXC <name>: bad magic 0x… (expected 0x1e)`; a short record (`size < 0x58`) throws `FXC <name>: size … < 0x58` before any field read. Both name the record.

## Task Commits

Each task committed atomically (TDD RED -> GREEN):

1. **Task 1: RED — FXC subtype-branch known-answers + differential invariant + guarded cross-ref graph** — `35593ca` (test)
2. **Task 2: GREEN — parseFxc (subtype branch) + buildFxDb fxc-section (WAD + standalone) + guarded refs graph** — `af25a21` (feat)

_No REFACTOR commit — the GREEN implementation mirrors the parseTxr/parsePtc idioms and was clean on first pass._

## Files Created/Modified
- `tools/kratos-lab/fxparse.js` — Added `parseFxc` (with a JSDoc byte-layout header citing RESEARCH offsets + DEC-02 + Pitfall 2 + A4) to the FxParse IIFE; extended `buildFxDb` with the WAD FXC population (keep-first, idx-tracked in `fxcEntries`), the standalone FXC population (headerless rec), a cross-env `Parsers` accessor, the shape-ref resolution (MSH_* resolved:true / throw-on-dangling, runtime handle resolved:false), and the guarded slot-pairing loop; added `parseFxc` to the export line.
- `tools/kratos-lab/test/fxdb.test.js` — Added the `// --- FXC subtype-branch known-answers ---` block: per-subtype seed assertions (a-d), the BFT-vs-BGT matrix-identity differential invariant + row orthonormality, the +0x58 subtype-0xd branch (direct DataView count read + parsed `count`), the `buildFxDb(recs, buf, standaloneRecs)` full cross-ref graph (standalone emitters as real db.fxc keys, resolved MSH ref, runtime-handle ref, the 0x1d slot pair, the placeholder-slot GUARD, JSON serialization), and bad-magic/short-record fail-loud throws.

## Decisions Made
- **DEC-02 complete.** MSH (05-01) + PTC (05-02) + FXC (05-03) are all decoded byte-exact with per-field evidence tables and differential comparison across instances — the requirement's decode work is done. The requirement's "colors come from these records" clause was answered data-first: color is NOT in these records (identity RGBA byte-identical fire-vs-swoosh, Pitfall 4), so it is runtime/MAT-sourced — traced in the 05-04 color-provenance slice. That is a provenance finding, not an unfinished decode.
- **FXC in-WAD keep-first per name**, mirroring the MSH/PTC precedent — the level-1 copy is the project target; god-tier is out of scope (PROJECT.md).
- **0x1d slot is a group id, not a discriminator (A4).** Slot-pairing by shared 0x1d links FXC_BFTemit1 to BOTH PTC_BFTpart1 and PTC_BGTpart1 (all four cross pairs are emitted as corroboration); the shapeRef NAME discriminates fire from swoosh. The test asserts the canonical `FXC_BFTemit1 -> PTC_BFTpart1` pair is present (not that it is the only pair).
- **Cross-env `Parsers` access.** `buildFxDb` now needs `resolve` for the FXC->MSH link. Used `typeof require !== "undefined" ? require("./parsers.js") : Parsers` so Node gets the same cached module the tests load and the browser (Phase 6) uses the global lexical binding — no top-level require that could break the browser's classic-script load.

## Deviations from Plan

None — plan executed exactly as written. The plan left the concrete guard-assertion shape and the cross-env Parsers-access mechanism to the executor; both were implemented as described in the plan's behavior/action (skip slot 0x00/0xffff; resolve via Parsers.resolve). The subtype-0xc grav best-effort name (FXC_EGgrav reads a control-char runtime handle) is handled exactly per the plan's "0xc grav -> best-effort +0x54, tag INFERRED" instruction.

## Issues Encountered
- None. All four seed FXC records were byte-verified against the disc-derived bytes before writing the RED test (magic/subtype/slot/idx/size/matrix-row0/name-offsets confirmed); the full in-WAD FXC set was enumerated to confirm no MSH_* ref fails to resolve (only FXC_BDepoly3/6 carry MSH names, both resolve) and that no non-0x1d PTC exists to fabricate a false slot pair.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `db.fxc` now carries the emitter defs (subtype, slot, placement matrix, shapeRef) for the trail (BFT/BGT), spark (BDEsparkemit), and poly (BDepoly3/6) families; `db.refs` is the complete emitter->particle->shape graph the Phase-6 runtime walks. The whole FxDb is JSON-dumpable — the hand-off boundary.
- Open for 05-04 (color-provenance): effect color is confirmed NOT in FXC/PTC/MSH; trace it to `MAT_pticleMat` / texture / runtime. PTC param tick meanings (A2) and the "1555" texFormat (A1) remain INFERRED pending FXC/footage cross-check — the FXC placement matrices and emitter subtypes now decoded may inform the param interpretation.
- The `parseFxc` subtype-branch + guarded slot-pairing idioms are available if later slices decode the remaining standalone emitters (FXC_BFTemit2/BGTemit2/CNGemit/FXCFemit) — the same 3rd-arg path applies.

## Self-Check: PASSED
- FOUND: tools/kratos-lab/fxparse.js
- FOUND: tools/kratos-lab/test/fxdb.test.js
- FOUND: commit 35593ca (Task 1, RED)
- FOUND: commit af25a21 (Task 2, GREEN)
- `node tools/kratos-lab/test/fxdb.test.js` exits 0 (MSH + PTC + FXC + cross-ref + JSON-dump); `node tools/kratos-lab/test/wad.test.js` regression exits 0; full suite (fx/loop/chain) all PASS; both plan acceptance CLI checks exit 0.

## TDD Gate Compliance
- RED gate: `35593ca` `test(05-03)` — failing FXC/FxDb suite (TypeError: parseFxc not a function), committed before implementation.
- GREEN gate: `af25a21` `feat(05-03)` — implementation making the suite pass, committed after RED.
- REFACTOR gate: none needed (implementation clean on first pass).

---
*Phase: 05-fx-record-decode*
*Completed: 2026-07-25*
