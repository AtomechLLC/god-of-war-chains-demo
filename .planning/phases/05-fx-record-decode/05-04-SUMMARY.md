---
phase: 05-fx-record-decode
plan: 04
subsystem: fx-decode
tags: [reverse-engineering, binary-decode, color-provenance, texture-analysis, fxdb, evidence-audit, node-assert, data-first]

# Dependency graph
requires:
  - phase: 05-fx-record-decode
    plan: 01
    provides: "FxParse.parseMsh + buildFxDb skeleton { meta, msh, ptc, fxc, refs }; keep-first same-name rule"
  - phase: 05-fx-record-decode
    plan: 02
    provides: "FxParse.parsePtc + buildFxDb 3rd-arg standaloneRecs (headerless .bin records enter db.ptc)"
  - phase: 05-fx-record-decode
    plan: 03
    provides: "FxParse.parseFxc (subtype-branched) + full JSON-dumpable emitter->particle->shape cross-ref graph"
  - phase: 02-wad-mat-decode-render-pass-foundation
    provides: "FxParse.buildMats (MAT blendColor/mode), FxParse.parseTxr, Parsers.decodeTexture (CLUT 0x80-alpha), Parsers.parseWad/resolve"
provides:
  - "buildFxDb color provenance — db.meta.colorSource traces effect color to MAT_pticleMat.blendColor (real byte value [2,2,2,1]) with the runtime age->color ramp tagged INFERRED; the DEC-02 'colors come from these records' clause closed honestly"
  - "Full priority-corpus coverage — WAD-native fire (PTC_flame5, PTC_EGpart, FXC_EGemit, FXC_EGgrav) via the WAD loop and standalone-only fire (FXC_FXCFemit/PTC_FXCFpart) + chain-glow (FXC_CNGemit/PTC_CNGpart) via the 3rd arg are ACTUAL keys in db.fxc/db.ptc (no new decoder code — the 05-02/03 generic loops already admit them)"
  - "parsePtc evidence completeness — the byte-decoded +0x0a index and +0x10 4x4 placement matrix now carry real evidence entries (parity with parseFxc)"
  - "GFX_swordtrail no-length-ramp proof — uniform amber hue across U, hot only at the cross-strip (V) edge, hottest texel amber (243,176,18) not white-hot; the white->orange->ember ramp is runtime (INFERRED)"
affects: [06-particle-render]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Color provenance via MAT, not PTC/texture: buildFxDb decodes ONLY MAT_pticleMat (records.filter first) so buildFxDb's success never couples to decoding every unrelated MAT; the blendColor is real, its use as the runtime tint is INFERRED (Pitfall 4 / D-04)"
    - "Texture no-ramp proof by hue-uniformity: a painted age->color ramp shows the normalized g/r hue SHIFTING monotonically across U (white g/r~1 end -> ember g/r<0.4 end); GFX_swordtrail's fire hue is a single amber family (g/r flat, |left-right mean| < 0.12) with the heat as a CROSS-strip (V) edge — proves the ramp is runtime, mirroring the chainglow single-hot-spot idiom"
    - "Evidence-completeness audit: walk every db.msh/db.ptc/db.fxc entry — non-empty evidence array, every tag real|INFERRED, every INFERRED carries a corrob/note; plus every DECODED field (matrix/index included) is attested"

key-files:
  created: []
  modified:
    - "tools/kratos-lab/fxparse.js"
    - "tools/kratos-lab/test/fxdb.test.js"

key-decisions:
  - "D-06 GS-dump corroboration = SKIP (user decision): per-effect blend confidence stays MEDIUM, corroborated by differential-decode + Phase-1 footage anchors + cross-record consistency; Phase 6 uses the MAT-decoded blend already pinned in DEC-01. No GS-dump follow-up gap-closure task recorded (that was the not-taken capture branch)."
  - "DEC-02 color clause closed data-first: effect color is NOT a static PTC RGBA (identity, byte-identical fire-vs-swoosh) and NOT painted into GFX_swordtrail (no length-wise ramp) — it is MAT_pticleMat.blendColor applied as a runtime INFERRED tint. No per-effect color fabricated as `real` anywhere."
  - "Full-corpus coverage needed NO new decoder code: the generic WAD + standalone loops from 05-02/03 already admit fire/chain-glow/trail families; the one real gap closed was parsePtc's missing matrix/index evidence entries."

patterns-established:
  - "buildFxDb owns color provenance at db.meta.colorSource — the single sanctioned place a color is attributed to a real record; every other FxDb color reference stays INFERRED or absent"
  - "Decode-only slice-2 rides the same generic decoders as slice-1 — new families are added by passing more standaloneRecs, not by branching the decoders"

requirements-completed: [DEC-02]

# Metrics
duration: 15min
completed: 2026-07-25
---

# Phase 5 Plan 04: Color Provenance + Full FX Corpus + Evidence Audit Summary

**`buildFxDb` now closes the DEC-02 color clause honestly — effect color is traced to `MAT_pticleMat.blendColor` (a real MAT field) at `db.meta.colorSource` with the white-hot→orange→ember age→color ramp tagged INFERRED, proven by a `GFX_swordtrail` texture inspection showing NO length-wise painted ramp (uniform amber hue, heat confined to the cross-strip edge) — while the full priority corpus (fire flame5/EG + FXCF, chain-glow CNG, trails BFT/BGT) lands as ACTUAL FxDb keys through the existing generic decoders, every decoded field is real-or-INFERRED (parsePtc's matrix/index now attested), and the D-06 GS-dump corroboration is recorded as SKIP so the decode ships at documented MEDIUM per-effect-blend confidence.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-25
- **Tasks:** 2 auto/TDD (Task 1 + Task 2 RED→GREEN) + 1 decision checkpoint (Task 3)
- **Files modified:** 2 (both extended, none created)

## Accomplishments
- **Color provenance (Task 1):** `buildFxDb` records `db.meta.colorSource = { record:"MAT_pticleMat", field:"blendColor", value:[2,2,2,1], tag:"real", rampTag:"INFERRED", note:… }`. The `blendColor` VALUE is byte-decoded (real); its application as the runtime age→color tint is the INFERRED part (D-04). No per-effect color is fabricated.
- **swordtrail no-ramp proof (Task 1):** `GFX_swordtrail` (64×32) decoded via the `decodeFxTexture` idiom carries NO length-wise (U) age→color ramp — the fire hue is a single amber family (normalized g/r flat across U, left-vs-right mean shift 0.043 < 0.12; b/r < 0.15 everywhere), the hottest texel is amber `(243,176,18)` NOT white-hot, and the heat is a CROSS-strip (V) edge (row 0 background lum ≈3, row 31 hot lum ≈117). This pins RESEARCH Open Q1 / Pitfall 4: the white→orange→ember ramp is runtime.
- **Provenance guard (Task 1):** no FxDb evidence field across `db.msh/ptc/fxc` is a `real`-tagged effect color sourced from a PTC or a texture (T-05-04).
- **Full priority corpus as ACTUAL keys (Task 2):** all five SC2-named records — `PTC_flame3`, `PTC_flame6`, `FXC_BDEsparkemit`, BFT (`FXC_BFTemit1`/`PTC_BFTpart1`), BGT (`FXC_BGTemit1`/`PTC_BGTpart1`) — PLUS slice-2 chain-glow (`FXC_CNGemit`/`PTC_CNGpart`, slot 0x1, ref `CNGpartShape`) and fire (`FXC_FXCFemit`/`PTC_FXCFpart`, ref `FXCFpartShape`) and WAD-native `PTC_flame5`/`PTC_EGpart`/`FXC_EGemit`/`FXC_EGgrav` are ACTUAL keys in the built `FxDb`, not merely proven in isolation. Coverage required NO new decoder code (the 05-02/03 generic loops already admit every family; standalone families flow through the 3rd arg).
- **Evidence-completeness audit (Task 2):** every `db.msh/ptc/fxc` entry has a non-empty evidence array, every entry is tagged `real`|`INFERRED`, and every `INFERRED` entry carries a non-empty corroboration note. The one real gap — `parsePtc` decoded its `index` (+0x0a) and 4×4 placement `matrix` (+0x10) WITHOUT evidence — was closed (both now `real`-tagged, parity with `parseFxc`).
- **JSON hand-off intact:** the full-corpus `FxDb` still `JSON.stringify`-round-trips (the Phase-6 boundary).
- **D-06 decision recorded (Task 3):** GS-dump corroboration = SKIP (user). Per-effect blend confidence stays MEDIUM, corroborated by differential-decode + Phase-1 footage anchors + cross-record consistency; Phase 6 uses the MAT-decoded blend already pinned in DEC-01. No GS-dump follow-up gap-closure task recorded.

## Task Commits

Each task committed atomically (Task 2 followed TDD RED → GREEN):

1. **Task 1: swordtrail no-ramp proof + MAT_pticleMat color-provenance trace** — `11d3d42` (feat)
2. **Task 2 (RED): full priority corpus + evidence-completeness audit** — `cc5dd0e` (test)
3. **Task 2 (GREEN): attest PTC placement matrix + index as real evidence** — `f9fa973` (feat)
4. **Task 3: D-06 GS-dump decision (skip) disposition** — `59fe585` (docs)

_No REFACTOR commit — the GREEN change mirrors the existing `parseFxc` evidence idiom verbatim and was clean on first pass._

## Files Created/Modified
- `tools/kratos-lab/fxparse.js` — `buildFxDb` now decodes ONLY `MAT_pticleMat` (via `buildMats` on a filtered record list) to populate `db.meta.colorSource` (color provenance, ramp INFERRED); `parsePtc` gained real-tagged evidence entries for the decoded `index` (+0x0a) and 4×4 placement `matrix` (+0x10).
- `tools/kratos-lab/test/fxdb.test.js` — added the `// --- swordtrail no-ramp + color provenance ---` block (local `decodeFxTexture` helper mirroring wad.test.js; hue-uniformity/no-U-ramp assertions; cross-strip V-edge heat profile; `db.meta.colorSource` assertions; provenance guard) and the `// --- full priority corpus + evidence audit ---` block (8-record standalone build; CNG/FXCF/BFT/BGT + flame5/EG corpus-key assertions; the full evidence-completeness audit; the PTC matrix/index attestation checks; JSON round-trip).

## Decisions Made
- **D-06 = SKIP** (see key-decisions). The checkpoint was placed AFTER the decode was green precisely so it never blocked shipping; skipping keeps per-effect blend confidence at documented MEDIUM.
- **Color lives in MAT, not PTC/texture** — the honest data-first answer to DEC-02's color clause; recorded at `db.meta.colorSource`, guarded against fabrication.
- **No new decoder code for slice-2** — the generic loops already covered the fire/chain-glow families; the sanctioned production change was the parsePtc matrix/index evidence completion.

## Deviations from Plan

None — plan executed exactly as written. The plan explicitly anticipated that full-corpus coverage already worked through the generic 05-02/03 loops ("already match", "flow through … added in 05-02/03", "verify no family is skipped") and directed the GREEN work at evidence completeness ("if any decoded field lacks an evidence entry, add one"); the parsePtc `matrix`/`index` attestation is exactly that. The plan left the concrete swordtrail no-ramp assertion shape to the executor; it was implemented as a hue-uniformity + cross-strip-edge proof (byte-exact known answers: dims 64×32, background (1,1,1) count 1690, hottest (243,176,18)).

## Issues Encountered
- None. The swordtrail texture and MAT_pticleMat were byte-probed before writing the RED assertions (dims, background count, hottest texel, per-column hue band, left/right hue-shift, V-edge profile all confirmed against the decoded bytes). The pre-existing odd-named in-WAD FXC keys (`FXC_BDEsparkemit.0` etc.) predate this plan (05-03 populated db.fxc from the WAD) and are out of scope — they decode as valid FXC records and pass the evidence audit; left untouched (SCOPE BOUNDARY).

## User Setup Required
None — no external service configuration required. (D-06 GS-dump capture was declined by the user; no PCSX2/disc setup needed.)

## Next Phase Readiness
- The FxDb is the complete Phase-6 hand-off: `meta` (region NTSC-U / 60Hz tick basis + `colorSource`), `msh`, `ptc`, `fxc`, `refs` — fire + sparks + trails + chain-glow families all present as actual keys, JSON-dumpable, every field real-or-INFERRED with corroboration.
- **Phase-6 color note:** effect color = `MAT_pticleMat.blendColor` applied as a runtime tint; the white-hot→orange→ember age ramp is INFERRED (calibrate to footage per D-04, no painted texture ramp exists). Trail texture (`GFX_swordtrail`) is a uniform additive streak — tint at runtime, do not expect a baked gradient.
- **Documented MEDIUM confidence:** per-effect GS blend config stays MEDIUM (D-06 skip). Phase 6 uses the MAT-decoded blend pinned in DEC-01; if a specific effect reads wrong vs footage, a GS dump remains the upgrade path (RECOMMENDED, not blocking).
- Remaining Phase-5 work: `05-05` — the type-5 ANM blade-state descriptor (DEC-03), the last wave.

## TDD Gate Compliance
- Task 2 RED gate: `cc5dd0e` `test(05-04)` — full-corpus + evidence-audit suite committed failing (parsePtc lacked matrix/index evidence), before implementation.
- Task 2 GREEN gate: `f9fa973` `feat(05-04)` — parsePtc matrix/index evidence added, suite passes, committed after RED.
- REFACTOR gate: none needed (implementation clean on first pass, mirrors parseFxc).
- Task 1 was `type="auto"` (not TDD): test + implementation landed together in `11d3d42`, verified green before commit.

## Self-Check: PASSED
- FOUND: .planning/phases/05-fx-record-decode/05-04-SUMMARY.md
- FOUND: tools/kratos-lab/fxparse.js
- FOUND: tools/kratos-lab/test/fxdb.test.js
- FOUND: commit 11d3d42 (Task 1, feat)
- FOUND: commit cc5dd0e (Task 2 RED, test)
- FOUND: commit f9fa973 (Task 2 GREEN, feat)
- FOUND: commit 59fe585 (Task 3 disposition, docs)
- `node tools/kratos-lab/test/fxdb.test.js` exits 0 (MSH + PTC + FXC + swordtrail-provenance + full-corpus); `node tools/kratos-lab/test/wad.test.js` regression exits 0; full suite (fxdb/wad/fx/chain/loop) all PASS; both plan acceptance CLI checks exit 0.

---
*Phase: 05-fx-record-decode*
*Completed: 2026-07-25*
