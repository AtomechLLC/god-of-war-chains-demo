---
phase: 06-particle-runtime-fire-sparks-trails
plan: 02
subsystem: decode
tags: [webgl, ps2, fxparse, blade-light, particle, fxdb, known-answer-test]

# Dependency graph
requires:
  - phase: 05-fx-record-decode
    provides: FxParse.buildFxDb (db.fxc/db.ptc/db.refs), parseTxr size-gate idiom, standaloneRecs 3rd-arg
  - phase: 06-particle-runtime-fire-sparks-trails
    provides: (06-01) pure particles.js sim module (untouched by this plan)
provides:
  - FxParse.parseLight — thin byte-exact LeftBladeLight/RightBladeLight decoder (REND-02 values are REAL)
  - light.test.js — byte-exact blade-light known-answers + fail-loud size-gate + range-attenuation math
  - fxdb.test.js Phase-6 binding contracts — FXC_BDEsparkemit real-key + fire shapeRef-NAME binding + FXC_CNGemit→PTC_CNGpart name-confirmed ref
affects: [06-05 buildFxDb wiring, 06-07 chain-glow state gating, 06-08 per-blade point lights]

# Tech tracking
tech-stack:
  added: []  # zero packages — node:assert + WebGL1/JS only (project ban on runtime deps)
  patterns:
    - "parseLight mirrors the parseTxr size-gate-then-DataView fail-loud idiom (Security V5 OOB-read guard)"
    - "REND-02 blade-light values sourced REAL/decoded from a LIGHT record, not hardcoded roadmap constants (D-06)"
    - "render-wave binding contracts pinned as regression tests before the render slices consume them (D-08 shapeRef-NAME join, Pitfall 6)"

key-files:
  created:
    - tools/kratos-lab/test/light.test.js
  modified:
    - tools/kratos-lab/fxparse.js
    - tools/kratos-lab/test/fxdb.test.js

key-decisions:
  - "parseLight decodes only the 4 core values (color/intensity/range/anchor) as REAL; ancillary +0x24/+0x3c/+0x40 tagged INFERRED-meaning (A5) — no falloff exponent claimed real"
  - "LeftBladeLight/RightBladeLight resolved by name + tag 0x1e + size>0 (the WAD stores a size-0 tag-0x32 back-reference under each name; the data-carrying copy is the 88-B tag-0x1e record)"
  - "requirements-completed left EMPTY: this decode/test-only plan CONTRIBUTES the decode+contract foundation for REND-02/FIRE-01/FIRE-02/CHAIN-03 but does NOT complete them (rendering lands in 06-05..06-08)"

patterns-established:
  - "Blade-light decode: size-gate rec.size < 0x48 BEFORE any field read, name the record, DataView f32 LE at the byte-exact offsets"
  - "Already-real FxDb facts asserted as green regression contracts (no decode top-up) so render waves bind against verified data"

requirements-completed: []  # see key-decisions — contributes-to, does not complete (REND-02/FIRE-01/FIRE-02/CHAIN-03 remain Pending until the render slices)

# Metrics
duration: 12min
completed: 2026-07-26
---

# Phase 6 Plan 02: Blade-Light Decode + Fire/Spark/Glow Binding Contracts Summary

**FxParse.parseLight decodes the real LeftBladeLight/RightBladeLight values byte-exact (color 1.0/0.622/0.288, intensity 2.5, range 160, anchor -0.32/-8.0/1.0) with a fail-loud size-gate, and fxdb.test.js now pins FXC_BDEsparkemit as an already-real db.fxc key plus the FXC_CNGemit→PTC_CNGpart name-confirmed ref — the contracts the fire/spark/glow/light render waves bind against.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-26T08:01:24Z
- **Completed:** 2026-07-26T08:13Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `FxParse.parseLight` — thin binary decoder mirroring `parseTxr`: size-gate (`rec.size < 0x48`) BEFORE any read, then DataView f32-LE reads at the VERIFIED byte offsets. REND-02's values become REAL/decoded, not INFERRED roadmap constants (D-09b resolved).
- `light.test.js` (NEW) — byte-exact known-answers for both blade lights, Left≡Right byte-identity, the fail-loud short-record throw (OOB-read guard), and the `atten = max(0, 1 − dist/range)` math the render wave 06-08 will wire into the mesh shader.
- `fxdb.test.js` extended with a Phase-6 binding-contract block proving (no decode top-up): `FXC_BDEsparkemit` is a real `db.fxc` key (subtype 0x3, shapeRef ∈ flame3/6/5Shape), a flame3 variant exists, the fire family binds by shapeRef NAME (Pitfall 6 — placeholder slot 0x0, not a slot pair), and `FXC_CNGemit → PTC_CNGpart` is a `shapeNameMatch === true` name-confirmed ref (CHAIN-03).
- Full test suite green (anm, chain, fx, fxdb, light, loop, particles, wad) — zero Phase-5 regression.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — parseLight known-answers + BDEsparkemit/CNG binding contracts** — `8b373e6` (test)
2. **Task 2: GREEN — implement parseLight in fxparse.js** — `81a656e` (feat)

**Plan metadata:** _(this SUMMARY + STATE/ROADMAP commit)_

_Note: this plan's TDD cycle is RED (test) → GREEN (feat); no refactor commit was needed._

## Files Created/Modified
- `tools/kratos-lab/fxparse.js` — added `function parseLight(buf, rec)` immediately after `parseTxr`, with a byte-layout JSDoc header (offsets + REND-02/D-09b provenance) and an evidence array (4 core values `real`, ancillary `INFERRED`); added `parseLight` to the module export.
- `tools/kratos-lab/test/light.test.js` — NEW byte-exact suite (REND-02): color/intensity/range/anchor, Left≡Right identity, size-gate throw, attenuation math.
- `tools/kratos-lab/test/fxdb.test.js` — added the `--- Phase-6 binding contracts ---` block (BDEsparkemit key/subtype/shapeRef, fire shapeRef-NAME binding, CNG name-confirmed ref).

## Decisions Made
- **Core-only real tagging (T-06-02-02):** only color/intensity/range/anchor are tagged `real`; the ancillary `+0x24` (1,1,1) triple and `+0x3c`=8.0 / `+0x40`=1.5 are read as evidence with `INFERRED` meaning — the data-first rule forbids claiming a falloff exponent as decoded fact.
- **Record resolution by tag 0x1e + size>0:** each blade-light name also has a size-0 `tag 0x32` back-reference; the test and any caller must select the data-carrying 88-B `tag 0x1e` copy (documented in the test + this summary).
- **No `buildFxDb` edit:** the blade-light record is consumed directly by the render wave; it is not part of the FXC/PTC/MSH graph, so `parseLight` is standalone (plan-honored).
- **Requirements not marked complete:** REND-02/FIRE-01/FIRE-02/CHAIN-03 stay Pending — this plan delivers only their decode/contract foundation; the actual rendering lands in plans 06-05..06-08. Marking them complete now would be a false claim a verifier would catch.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The byte-exact offsets from RESEARCH were confirmed against the live WAD by a first-party probe before writing the RED known-answers; all values matched exactly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `FxParse.parseLight` is ready for plan 06-08 (per-blade point-light term): light world position = decoded anchor `(-0.32,-8.0,1.0)` transformed by `bladeSim[key].mat`; the `atten = max(0, 1 − dist/range)` math is already tested.
- The fire (FXC_BDEsparkemit → flame6/flame3 by shapeRef NAME), spark, and chain-glow (FXC_CNGemit → PTC_CNGpart) bindings are pinned as green contracts for plans 06-05 (buildFxDb wiring), 06-07 (glow gating), and the fire/spark render slices.
- **Not touched (as instructed):** `app.js` gets no `buildFxDb` call here (that is plan 06-05); `particles.js` (06-01) is untouched.

## Self-Check: PASSED

- Files verified on disk: `light.test.js`, `fxparse.js`, `fxdb.test.js`, `06-02-SUMMARY.md` — all FOUND.
- Commits verified in git log: `8b373e6` (test/RED), `81a656e` (feat/GREEN) — both FOUND.
- `parseLight` present (1 def) and listed in the FxParse export line.
- Full test suite green (anm, chain, fx, fxdb, light, loop, particles, wad).

---
*Phase: 06-particle-runtime-fire-sparks-trails*
*Completed: 2026-07-26*
