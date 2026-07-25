---
phase: 05-fx-record-decode
plan: 01
subsystem: testing
tags: [reverse-engineering, binary-decode, msh, fxdb, webgl-fx, node-assert]

# Dependency graph
requires:
  - phase: 02-wad-mat-decode-render-pass-foundation
    provides: "Parsers.parseWad + Parsers.resolve (WAD walk, nearest-preceding copy selection); FxParse IIFE with parseTxr/buildMats fail-loud decode idiom; readName"
provides:
  - "FxParse.parseMsh — MSH_BDepoly*Shape (tag 0x70 raw) vertex decoder with real/INFERRED evidence"
  - "FxParse.buildFxDb — JSON-dumpable FxDb skeleton { meta, msh, ptc, fxc, refs }; meta NTSC-U/60Hz, msh populated"
  - "tools/kratos-lab/test/fxdb.test.js — MSH known-answer + FxDb JSON-dump/evidence suite"
affects: [05-02-ptc-decode, 05-03-fxc-decode, 05-04-color-provenance, 06-particle-render]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MSH interleaved (pos vec3, nrm vec3) f32 walk bounded by rec.size (variable-length raw record)"
    - "FxDb skeleton: keyed-by-name sections + per-field {field,offset,rawHex,interp,corrob,tag} evidence array"
    - "keep-first same-name copy selection (level-1 768-B copy wins; god-tier 1008-B out of scope)"

key-files:
  created:
    - "tools/kratos-lab/test/fxdb.test.js"
  modified:
    - "tools/kratos-lab/fxparse.js"

key-decisions:
  - "buildFxDb keeps the FIRST (level-1, 768-B) same-name MSH copy, not last — god-tier 1008-B copy is out of scope (PROJECT.md) and the RED known-answer pins size 768"
  - "DEC-02 left Pending: this slice decodes MSH only; FXC/PTC still undecoded (05-02..04)"
  - "idxCount (+0x04) tagged INFERRED (meaning = suspected index/strip/triangle count, A5); raw value is real"

patterns-established:
  - "Variable-length raw-record decode: size-gate before any field read, bound every vertex read by dataOff+rec.size"
  - "Per-field evidence tagging (real vs INFERRED) on every decoded FxDb field; no color read from a shape (Pitfall 4)"

requirements-completed: []  # DEC-02 is multi-plan (FXC+PTC+MSH); only MSH decoded here — see Decisions

# Metrics
duration: 15min
completed: 2026-07-25
---

# Phase 5 Plan 01: MSH Shape Decoder + FxDb Skeleton Summary

**`parseMsh` decodes the opaque tag-0x70 MSH_BDepoly*Shape records into byte-exact interleaved (pos, nrm) vertices, and `buildFxDb` assembles the first JSON-dumpable FxDb skeleton (NTSC-U/60Hz meta + msh section) with per-field real/INFERRED evidence.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-25T14:01Z (approx)
- **Completed:** 2026-07-25T14:15Z
- **Tasks:** 2 (RED test, GREEN implementation)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `FxParse.parseMsh(buf, rec)` decodes MSH_BDepoly3Shape (768-B level-1 copy) to vertCount 24, idxCount 22, v0 pos (0, 2.982, −13.684), v1 normal unit-length — byte-exact, first slice of the MSH→PTC→FXC decode order (D-02).
- `FxParse.buildFxDb(records, wadBuf)` returns a JSON.stringify-able `{ meta, msh, ptc, fxc, refs }` with `meta.region === "NTSC-U"`, `meta.tickHz === 60` (D-05) and a populated `msh` section; ptc/fxc/refs are empty placeholders the later slices fill.
- Every decoded MSH field carries a `{field,offset,rawHex,interp,corrob,tag}` evidence entry tagged `real` or `INFERRED`; no color/rgba field is read from a shape (Pitfall 4).
- Fail-loud size-gate: a short/truncated MSH record throws `MSH <name>: size N < 0x10 header` before any field read (WR-01 / T-05-01).
- Variable-length safety: the vertex walk is bounded by `dataOff + rec.size`, never a fixed length (T-05-02); the 768-vs-1008 same-name copies decode different vertCounts (24 vs 32) and `Parsers.resolve` picks the correct copy per referrer (T-05-03).

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: RED — MSH known-answer + FxDb JSON-dump suite** - `6193af8` (test)
2. **Task 2: GREEN — parseMsh + buildFxDb skeleton (meta + msh)** - `a9640dc` (feat)

**Plan metadata:** _(this doc commit)_

_No REFACTOR commit — the GREEN implementation was already clean (mirrors the parseTxr/buildMats idioms)._

## Files Created/Modified
- `tools/kratos-lab/test/fxdb.test.js` - New node:assert known-answer suite: MSH byte-exact seeds, same-name copy selection, buildFxDb meta/msh/JSON-dump/evidence, short-record fail-loud.
- `tools/kratos-lab/fxparse.js` - Added `parseMsh` + `buildFxDb` to the FxParse IIFE and extended the export line; `index.html` untouched (decode-only phase, app.js does not consume buildFxDb yet).

## Decisions Made
- **Same-name MSH copy: keep-FIRST, not last.** The plan's Task-2 note said "last-copy-wins is fine," but the WAD stores the level-1 copy (768 B, idx 105) before the god-tier copy (1008 B, idx 190). Last-wins would select the 1008-B god copy, contradicting Task-1(c)'s `size === 768` known answer and the Level-1-only project target. Chose keep-first (level-1 wins), documented as a deviation below.
- **DEC-02 left Pending.** DEC-02 requires FXC + PTC + MSH all decoded. This slice delivers MSH only; marking DEC-02 complete would falsely claim FXC/PTC are decoded. Left Pending for 05-02..04.
- **idxCount (+0x04) tagged INFERRED.** Its raw u32 (22) is byte-real, but its meaning (index/strip/triangle count, A5) is unconfirmed — evidence entry tagged INFERRED per data-first discipline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] buildFxDb same-name copy selection: keep-first instead of the plan's "last-copy-wins"**
- **Found during:** Task 2 (GREEN — buildFxDb)
- **Issue:** The plan's Task-2 action text said "last-copy-wins is fine here," but Task-1(c) (the RED test, authoritative per the 03-02 discipline) asserts `db.msh["MSH_BDepoly3Shape"].size === 768`. Records iterate in WAD order, so the later 1008-B god-tier copy (idx 190) would overwrite the 768-B level-1 copy (idx 105) under last-wins → size 1008, failing the test and pulling an out-of-scope (PROJECT.md: Level-1 only) god-tier record into the FxDb.
- **Fix:** buildFxDb keeps the first same-name MSH copy (`if (r.name in db.msh) continue;`). The first-encountered copy is the level-1 (768 B) copy, matching the known answer and the project's Level-1 target. Per-referrer copy selection (768 vs 1008) is still exercised via `Parsers.resolve` in the callers/tests.
- **Files modified:** tools/kratos-lab/fxparse.js
- **Verification:** `node tools/kratos-lab/test/fxdb.test.js` exits 0 (size-768 assertion green).
- **Committed in:** `a9640dc` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — internal plan inconsistency resolved in favor of the RED known answer + Level-1 scope)
**Impact on plan:** Necessary for correctness and scope fidelity. No scope creep — the msh section is unchanged in shape; only which same-name copy is retained changed.

## Issues Encountered
- None beyond the plan-internal copy-selection inconsistency documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `FxDb` skeleton (`{ meta, msh, ptc, fxc, refs }`) is live and JSON-dumpable — 05-02 (parsePtc) and 05-03 (parseFxc) append to `ptc`/`fxc` and populate `refs` on this exact substrate.
- `parseMsh` + the fail-loud / evidence-tagging / bound-by-size idioms are the templates the PTC/FXC decoders mirror.
- Open: DEC-02 remains Pending until FXC/PTC are decoded (05-02..04). idxCount meaning (A5) is INFERRED — Phase 6 triangulation may confirm it.

## Self-Check: PASSED
- FOUND: tools/kratos-lab/fxparse.js
- FOUND: tools/kratos-lab/test/fxdb.test.js
- FOUND: commit 6193af8 (Task 1, RED)
- FOUND: commit a9640dc (Task 2, GREEN)
- `node tools/kratos-lab/test/fxdb.test.js` exits 0; `node tools/kratos-lab/test/wad.test.js` regression exits 0.

## TDD Gate Compliance
- RED gate: `6193af8` `test(05-01)` — failing MSH/FxDb suite, committed before implementation.
- GREEN gate: `a9640dc` `feat(05-01)` — implementation making the suite pass, committed after RED.
- REFACTOR gate: none needed (implementation clean on first pass).

---
*Phase: 05-fx-record-decode*
*Completed: 2026-07-25*
