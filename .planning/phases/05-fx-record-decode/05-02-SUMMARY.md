---
phase: 05-fx-record-decode
plan: 02
subsystem: fx-decode
tags: [reverse-engineering, binary-decode, ptc, particle, fxdb, node-assert, data-first]

# Dependency graph
requires:
  - phase: 05-fx-record-decode
    plan: 01
    provides: "FxParse.parseMsh + buildFxDb(records, wadBuf) skeleton { meta, msh, ptc, fxc, refs }; readName; keep-first same-name copy rule; fxdb.test.js known-answer suite"
provides:
  - "FxParse.parsePtc — PTC_* particle-definition decoder (magic/slot/matrix/size/shapeRef + bounded param f32 region, texFormat, evidence)"
  - "buildFxDb 3rd arg standaloneRecs — populates db.ptc from BOTH the in-WAD fire particles (flame3/flame6) AND the standalone-only BFT/BGT trail particles; runtime-handle shape refs recorded resolved:false"
affects: [05-03-fxc-decode, 05-04-color-provenance, 06-particle-render]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone .bin = headerless record: synthesize { name, idx:0, tag, size:buf.length, dataOff:0 } and pass the whole file as buf (Pitfall 1 corpus reaches FxDb only via buildFxDb 3rd arg)"
    - "Variable-length PTC param walk (520-632 B) bounded by dataOff + rec.size; params stored as NTSC 60Hz tick CANDIDATES (raw real, tick meaning INFERRED)"
    - "Color-provenance guard: parsePtc emits NO color field; identity RGBA (1,1,1) is byte-identical fire-vs-swoosh so color is runtime/MAT-sourced (Pitfall 4, A3)"

key-files:
  created: []
  modified:
    - "tools/kratos-lab/fxparse.js"
    - "tools/kratos-lab/test/fxdb.test.js"

key-decisions:
  - "PTC in-WAD copies keep-FIRST per name (level-1 copy precedes god-tier in WAD order; god tier out of scope, PROJECT.md), mirroring the 05-01 MSH keep-first rule"
  - "No color field emitted from PTC — the static RGBA (1,1,1,0) @+0x128 is byte-identical BFT (fire) vs BGT (swoosh); color provenance recorded as an INFERRED evidence note only (Pitfall 4, A3)"
  - "PTC param floats stored raw (tag real); their meaning as tick lifetimes/rates/sizes tagged INFERRED (A2, D-05) pending FXC/footage cross-check"
  - "DEC-02 still Pending — PTC + MSH decoded; FXC (05-03) remains before DEC-02 completes"

patterns-established:
  - "buildFxDb stays pure (no fs): caller loads assets/kratos/fx/*.bin and supplies bytes via standaloneRecs; buildFxDb synthesizes the headerless rec"
  - "PTC shape refs are runtime handles (non-MSH_ names, no WAD record) -> pushed to refs[] resolved:false, never thrown"

requirements-completed: []  # DEC-02 is multi-plan (MSH+PTC+FXC); FXC still undecoded — see Decisions

# Metrics
duration: 10min
completed: 2026-07-25
---

# Phase 5 Plan 02: PTC Particle-Definition Decoder + FxDb ptc-Section Summary

**`parsePtc` decodes the `PTC_*` particle-definition records — the in-WAD fire particles (flame3/flame6, 632 B) and the standalone-only BFT/BGT trail particles (568/552 B, slot 0x1d) — into byte-exact magic/slot/matrix/size/shapeRef + a rec.size-bounded param region, and `buildFxDb`'s new 3rd arg merges the D-01 priority trail defs into `db.ptc` as real keys with runtime-handle shape refs (`resolved:false`).**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-25T21:29Z
- **Tasks:** 2 (RED test, GREEN implementation)
- **Files modified:** 2 (both extended, none created — extends the 05-01 skeleton)

## Accomplishments
- `FxParse.parsePtc(buf, rec)` decodes the four seed PTC records byte-exact: `PTC_flame3`/`PTC_flame6` (in-WAD @0xCD50/@0xC890, magic 0x13, size 632, shapeRef `flame3Shape`/`flame6Shape`); `PTC_BFTpart1` (standalone 568 B, slot 0x1d, `BFTpart1Shape`) and `PTC_BGTpart1` (standalone 552 B, slot 0x1d, `BGTpart1Shape`).
- `buildFxDb(records, wadBuf, standaloneRecs = [])` gained the optional 3rd arg. `db.ptc` is now populated from BOTH sources: the in-WAD fire particles (keep-first, level-1 copy) AND the standalone-only BFT/BGT trail defs — the D-01 payoff-first trail data actually enters the queryable, JSON-dumpable FxDb (not just the test).
- Each PTC shapeRef is pushed to `db.refs` as `{ from, kind:"shape", to, resolved:false, note:"runtime handle" }` — the non-MSH_ `…Shape` names are engine handles with no WAD record and are recorded, never thrown (RESEARCH cross-ref chain).
- Variable-length safety (T-05-02): the param f32 walk starts at +0x64 and is bounded by `dataOff + rec.size`; the test asserts `0x64 + 4·params.length ≤ rec.size` for both variable-length standalone records.
- Data-first color discipline (Pitfall 4 / A3 / T-05-04): `parsePtc` emits NO `color`/`rgba` field. The static RGBA quad is identity `(1,1,1,0)` at +0x128 and **byte-identical** between the fire (BFT) and swoosh (BGT) particles — the test pins that identity, proving effect color is runtime/MAT-sourced, not a PTC field.
- Fail-loud (WR-01 / T-05-01): a bad-magic PTC throws `PTC <name>: bad magic 0x… (expected 0x13)`; a short record (`size < 0x58`) throws `PTC <name>: size … < 0x58` before any field read. Both name the record.
- The `"1555"` ASCII tail marker is detected and stored as `texFormat:"1555?"`, tagged INFERRED (A1, suspected A1R5G5B5 particle-texture format).

## Task Commits

Each task committed atomically (TDD RED → GREEN):

1. **Task 1: RED — PTC known-answers (in-WAD + standalone) + color-provenance guard + BFT/BGT-in-db.ptc** — `c28676c` (test)
2. **Task 2: GREEN — parsePtc + buildFxDb ptc-section population (WAD + standalone 3rd arg)** — `f6c7df5` (feat)

_No REFACTOR commit — the GREEN implementation mirrors the parseMsh/parseTxr idioms and was clean on first pass._

## Files Created/Modified
- `tools/kratos-lab/fxparse.js` — Added `parsePtc` (with a JSDoc byte-layout header citing RESEARCH offsets + DEC-02) to the FxParse IIFE; extended `buildFxDb` with the optional `standaloneRecs` 3rd arg, WAD PTC population (keep-first), standalone PTC population, and the `addPtcRef` runtime-handle refs helper; added `parsePtc` to the export line.
- `tools/kratos-lab/test/fxdb.test.js` — Added the `// --- PTC known-answers ---` block: `loadBin` headerless-record helper, in-WAD + standalone seed assertions, the variable-length bound guard, the color-provenance byte-identity guard, the `buildFxDb(recs, buf, standaloneRecs)` 3rd-arg contract (BFT/BGT as real `db.ptc` keys + `resolved:false` refs), and bad-magic/short-record fail-loud throws.

## Decisions Made
- **PTC in-WAD keep-first per name.** `PTC_flame3` and `PTC_flame6` each appear twice in the WAD (level-1 copy first, then a god-tier/variant copy). Kept the first (level-1) copy, matching the project's Level-1 target and the 05-01 MSH keep-first precedent. The seed test asserts only `shapeRef` (identical across copies), so this is safe and principled.
- **No color from PTC (Pitfall 4).** Chose not to emit any `color`/`rgba` field at all — cleaner than storing an identity RGBA and risking a downstream "real color" misread. Provenance is documented in an INFERRED evidence entry (`colorProvenance`) plus the byte-identity test.
- **DEC-02 remains Pending.** DEC-02 requires MSH + PTC + FXC all decoded. MSH (05-01) + PTC (this plan) are done; FXC lands in 05-03. Marking DEC-02 complete now would falsely claim FXC is decoded.

## Deviations from Plan

None — plan executed exactly as written. The plan's Task-1 color-provenance guard called for asserting "BFT vs BGT byte-identical in that RGBA region"; the concrete region was pinned to the identity `(1,1,1,0)` quad at +0x128 (found byte-exact this session, within the 0x125–0x177 identical run), which the plan left for the executor to locate.

## Issues Encountered
- None. Seed values verified directly against the disc-derived bytes before writing tests; the "1555" tail marker sits at `rec.size − 0x28` in all three PTC sampled (byte-searched dynamically rather than hardcoded).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `db.ptc` now carries the fire (flame3/flame6) + trail (BFT/BGT part1) particle defs with slot ids, matrices, param tick-candidates, and runtime-handle shape refs — the substrate 05-03 (`parseFxc`) links emitter→particle via the shared `+0x08` slot id (`FXC_BFTemit1.slot 0x1d == PTC_BFTpart1.slot 0x1d`).
- `parsePtc` + the size-gate / rec.size-bounded / evidence-tagging idioms are the template `parseFxc` mirrors (with the subtype-branched name offset, Pitfall 2).
- Open: DEC-02 completes only after 05-03 (FXC). Param tick meanings (A2) and the "1555" texFormat (A1) remain INFERRED pending FXC/footage cross-check. Color source (A3) is confirmed NOT in PTC — trace to `MAT_pticleMat`/texture/runtime in the color-provenance slice (05-04).

## Self-Check: PASSED
- FOUND: tools/kratos-lab/fxparse.js
- FOUND: tools/kratos-lab/test/fxdb.test.js
- FOUND: commit c28676c (Task 1, RED)
- FOUND: commit f6c7df5 (Task 2, GREEN)
- `node tools/kratos-lab/test/fxdb.test.js` exits 0 (MSH + PTC); `node tools/kratos-lab/test/wad.test.js` regression exits 0; full suite (wad/fx/loop/chain/fxdb) all PASS.

## TDD Gate Compliance
- RED gate: `c28676c` `test(05-02)` — failing PTC/FxDb suite (TypeError: parsePtc not a function), committed before implementation.
- GREEN gate: `f6c7df5` `feat(05-02)` — implementation making the suite pass, committed after RED.
- REFACTOR gate: none needed (implementation clean on first pass).

---
*Phase: 05-fx-record-decode*
*Completed: 2026-07-25*
