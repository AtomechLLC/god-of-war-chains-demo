---
phase: 02-wad-mat-decode-render-pass-foundation
plan: 01
subsystem: decode
tags: [wad, mat, ps2, webgl1, known-answer-tests, node-assert, gow1]

# Dependency graph
requires:
  - phase: 01-reference-pipeline
    provides: assets/ curated subset (R_WPN0_0.WAD + weapon/kratos bins) tracked in-repo
provides:
  - Parsers.parseWad(buf) WAD record walker (u16 tag/u16 flags/u32 size/name[24], align16, named overrun throw)
  - Parsers.resolve(records, name, fromIdx) nearest-preceding-name resolution (data-carrying tag 0x1E/0x70 only)
  - FxParse.decodeFlags / buildMats / enumTuples — pure MAT decode per mat.go layout, Node-requireable
  - tools/kratos-lab/test/wad.test.js known-answer suite (byte-verified expected values)
  - app.js WAD load stage + MatDb + live blend-tuple inventory in stats card
  - window.KratosLab.{wadRecords, matDb, matTuples} debug hooks
affects: [02-02 render-pass matgl table, 02-03, 02-04, phase-3 chain ribbon, phase-5 FXC/PTC access, phase-6 blade lights]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - IIFE module + dual-env export guard (`if (typeof module !== "undefined" && module.exports)`) for browser+Node decode files
    - Node known-answer tests with node:assert only (zero dependencies)
    - Decode failures throw named errors that surface in #status (no silent warns)

key-files:
  created:
    - tools/kratos-lab/fxparse.js
    - tools/kratos-lab/test/wad.test.js
  modified:
    - tools/kratos-lab/parsers.js
    - tools/kratos-lab/app.js
    - tools/kratos-lab/index.html

key-decisions:
  - "Corrected the tag-0x1E known answer from 70 to 158: the research figure matches a full-u32 tag comparison (Pitfall 1); the true u16-tag histogram is 158 (120 data-carrying + 38 size-0 back-refs)"
  - "Test asserts 88 nonzero-flags 0x1E records as a direct u16/u32-split guard"
  - "mat objects carry layerCount so enumTuples sums real layers instead of counting records"

patterns-established:
  - "Decode layer purity: fxparse.js has no DOM/GL references (grep-enforced), Node-requireable with zero build step"
  - "assets/ is the only fetch root for game data; public-build catch regex covers both extracted and assets"

requirements-completed: [DEC-01]

# Metrics
duration: 16min
completed: 2026-07-25
---

# Phase 2 Plan 01: WAD Walk + MAT Decode Summary

**In-browser WAD record walker with engine-faithful nearest-preceding-name resolution, full 24-MAT decode per mat.go, and a live 2-tuple blend inventory — all pinned by a Node known-answer suite against the shipping R_WPN0_0.WAD bytes**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-07-25T06:23:19Z
- **Completed:** 2026-07-25T06:39:00Z
- **Tasks:** 2 (1 TDD)
- **Files modified:** 5

## Accomplishments

- `Parsers.parseWad` walks all 283 records of R_WPN0_0.WAD with the corrected u16-tag/u16-flags header split; bounds-checked with named overrun errors (T-2-01)
- `Parsers.resolve` reproduces wad.go backward-scan semantics; the level-1/god `MSH_BDepoly6Shape` pair (0x6BC0/768 B vs 0x13C80/1008 B) proves no cross-wiring, and `TXR_chainlink` resolution skips the 0-byte GroupEnd marker (T-2-03)
- `FxParse` decodes all 24 real MAT records (magic 0x8 assert, exactly-one-mode-bit contract, overbright 2.0 blend colors pass through untouched) and enumerates exactly the 2 expected blend tuples: usual/dw-on/linear ×18 and additive/dw-off/linear ×6
- kratos-lab now fetches the WAD from tracked `assets/`, surfaces the tuple inventory in the stats card (built dynamically from `enumTuples`), throws if chainlink/chainglow/swordtrail MATs are missing, and exposes `wadRecords`/`matDb`/`matTuples` on `window.KratosLab`
- All existing `../../extracted/` fetches migrated to `../../assets/`; public-build fail-safe regex widened to `(extracted|assets)` (T-2-04)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing known-answer suite** - `041e3c2` (test)
2. **Task 1 (GREEN): parseWad/resolve + fxparse decode** - `90f8647` (feat)
3. **Task 2: WAD wiring, stats inventory, assets/ migration** - `bdd8879` (feat)

## Files Created/Modified

- `tools/kratos-lab/parsers.js` - Added parseWad + resolve inside the existing IIFE; dual-env export guard after the IIFE close. CLUT alpha (`a >= 0x80 ? 255 : a * 2`) and vertex ÷128 invariants untouched (grep-verified)
- `tools/kratos-lab/fxparse.js` - NEW: pure MAT decode (decodeFlags/buildMats/enumTuples), mat.go offsets commented field-by-field, no DOM/GL references
- `tools/kratos-lab/test/wad.test.js` - NEW: known-answer suite using node:fs/path/assert only; reads the WAD from `assets/` via __dirname-anchored path; synthetic buffers for overrun/bad-magic/mode-bit throw tests
- `tools/kratos-lab/app.js` - WAD load stage (no try/catch — decode throws surface in #status), required-MAT assert, console.table + summary log, dynamic stats-card tuple line, assets/ path migration, widened catch regex, KratosLab hook extension
- `tools/kratos-lab/index.html` - fxparse.js script tag between parsers.js and anim.js; all tags bumped to ?v=17

## Decisions Made

- **Known-answer correction (see Deviations):** the true u16-tag 0x1E count is 158, not the research doc's 70
- **materials[] in tuples keeps duplicate names** (they are distinct WAD records) so `layerCount` and `materials.length` agree
- Followed the plan's interfaces block verbatim otherwise (resolve lives on Parsers, not FxParse, superseding the research sketch)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the tag-0x1E known-answer from 70 to 158**
- **Found during:** Task 1 (GREEN run of the known-answer suite)
- **Issue:** Plan behavior and 02-RESEARCH.md pin "70 have tag 0x1E". The actual byte-verified u16-tag histogram shows 158 (120 data-carrying + 38 size-0 back-references). The flags histogram explains the discrepancy: exactly 70 records (38 size-0 + 32 data) have a zero flags-u16 — i.e. 70 is what a full-u32 `type === 0x1E` comparison matches, which is precisely the Pitfall-1 bug the assertion was designed to catch. Asserting 70 would reward the buggy parser and reject the correct one. Every other research known-answer (record count 283, indices #115/#203/#251, offsets 0x6BC0/0x13C80/0x213A0, sizes 768/1008/88, 24 MATs, 2 tuples, flags 0x6 on MAT records) reproduced byte-exact, confirming the walk is identical to the research session's.
- **Fix:** Test asserts 158 total 0x1E, 120 data-carrying, 88 nonzero-flags (direct u16/u32-split guard), with an explanatory comment
- **Files modified:** tools/kratos-lab/test/wad.test.js
- **Verification:** `node tools/kratos-lab/test/wad.test.js` exits 0; independent flags-histogram dump confirms the 70 = zero-flags identity
- **Committed in:** 90f8647 (GREEN commit, so every post-GREEN commit is test-green)

---

**Total deviations:** 1 auto-fixed (1 bug — incorrect expected value)
**Impact on plan:** Strengthens the Pitfall-1 guard; no scope change. 02-RESEARCH.md's "70×" figure should be treated as corrected by this suite.

## Issues Encountered

- **02-PATTERNS.md missing at the pinned base commit** (`244ce89`): the plan's read_first references it, but it does not exist in this worktree. The plan text inlines all needed conventions (module shell, export guard, assets/ path rule, ?v cache-buster), so execution proceeded without it. No code impact.
- **Preview server serves the orchestrator checkout, not this worktree** (fxparse.js returned 404 on :4173): live browser confirmation is not possible from the isolated worktree — consistent with the plan's done criteria deferring browser-side confirmation to plan 02-02's checkpoint. Node suite + `node --check` syntax passes cover everything verifiable here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Decode layer complete and proven: plan 02-02 can build the matgl table directly from `matDb.byName` (chainlink usual/dw-on, chainglow+swordtrail additive/dw-off)
- `window.KratosLab.matDb`/`matTuples` hooks ready for 02-02's browser checkpoint verification
- Phase 5 FXC/PTC access can reuse `Parsers.resolve` with the cross-wire guard already regression-tested

## Self-Check: PASSED

- All 6 claimed files exist (5 code + this SUMMARY)
- All 3 task commits present in git log (041e3c2, 90f8647, bdd8879)
- `node tools/kratos-lab/test/wad.test.js` exits 0 (283 records / 120 server instances / 24 MATs / 2 tuples)

---
*Phase: 02-wad-mat-decode-render-pass-foundation*
*Completed: 2026-07-25*
