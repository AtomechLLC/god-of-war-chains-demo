# Phase 8: God of War III Data Breakdown - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning
**Source:** user directives given in-session 2026-09-25 (no discuss-phase questionnaire — the user stated the vision directly) + the same-day format investigation

<domain>
## Phase Boundary

Open the God of War III (PS3, big-endian) reverse-engineering track and deliver
its designer-data extraction the way the GoW1 work delivered its tweak sheets:
decoded, labeled real-vs-INFERRED, browsable in the repo, and consumable by a
future GoW3 sim lab. The user's words: "resume data extraction of all of the
branches and the data within, producing all of the tweak data files for use by
the future god of war 3 sim" and "use info from this project to make the best
guesses possible, looking at the previous project as expectations on what to
produce for god of war 3 (both should exist in parallel here)."

Out of this phase: the GoW3 sim itself (a later phase), GoW1 work.

</domain>

<decisions>
## Implementation Decisions (locked by the user)

### What "the branches and the data within" means
- The GoW3 hero designer data lives in the `DC_WAD_R_Hero` record family of
  `R_HERO00.WAD` (RES.PSARC): a serialized property database of 55,265 entries
  — 2,921 `MOV_*`/`ATT_*`/`BRA_*` move families, 17,264 `tBranch_*` combat
  branches, ~25k `tAction*` per-animation events, plus leaf properties
  (TweenIn/Out, Offset, *Impulse, Tint). "All of the branches" = every tBranch
  with its owning move family and decoded fields; "the data within" = the
  actions and properties nested under them. All four hero WADs
  (R_HERO00/01/05/08 checked) carry the byte-identical database — R_HERO00 is
  the complete hero set.
- Best guesses are explicitly welcome: label every reading real / INFERRED /
  raw exactly as the GoW1 sheets do; never present an INFERRED reading as real.

### Deliverable shape — mirror the GoW1 project
- GoW1 has `design/twk/decoded/*.twk` (81 sheets), `design/twk/index.html`,
  `design/data-archaeology.html`, `assets/` + `extracted/` study sets, and
  `tools/kratos-lab/`. GoW3 gets the parallel set: `design/gow3/decoded/*.twk`
  (the exported DC sheets: ~22 grouped sheets + BRANCHES/INDEX/TYPES),
  `design/gow3/README.md` (format facts), a GoW3 archaeology page (GOW3-03,
  may be a later plan), `extracted-gow3/` (default-ignored; README tracked;
  records tracked deliberately), and the extraction tooling under
  `tools/gow3/` (`psarc.py`, `gow3_dc_export*.py`) so everything is
  re-derivable from the user's own disc.
- Both games exist side by side in the repo; nothing GoW1 is moved or renamed.

### Distribution policy (2026-09-25 ruling)
- Source media (the disc folder, `.dec.iso`, PSARCs) is NEVER committed.
- Extracted records and decoded sheets ARE distributable and may be tracked.

### Claude's Discretion
- Sheet grouping granularity (per weapon family vs per move), file naming,
  and how much raw hex to keep per row.
- Order of follow-up decodes within the phase (schema tables tag-13/14/15,
  ANM_hero act table, DDS textures, enemy WAD databases).

</decisions>

<specifics>
## Specific Findings Already In Hand (2026-09-25, scratchpad-verified)

- PSARC: 'PSAR' v1.4 zlib, blockSize 0x10000, manifest = entry 0. Reader:
  scratchpad `psarc.py` (working; used to extract R_HERO00/01/05/08).
- PS3_BE WAD: 64-byte record headers `[u16 tag][u16 flags][u32 size][name 24]
  [32 reserved]`, data at +64, next at align16. Tags: 20 WAD, 2/3 Group,
  1 data, 11-16 DC family, 25/26 Debug. R_HERO00 walks byte-exact (885 recs).
- DC tag-16 = index: u32 count, u32 0, count x 12-byte `[u32 nameOff][u32
  typeId][u32 dataOff]`, then the string table; entries in depth-first tree
  order. DC tag-12 = value blob (self-payload size = next.dataOff - dataOff).
  tag-13 (366 pairs), tag-14 (2,040 pairs + external symbol names), tag-15
  (5,544 pairs) = lookup tables, not yet decoded. tag-11 = a 4-byte hash.
- Validated readings: tAction* = `[u8 kind][3][f16 tStart][f16 tEnd][u32 ref]`
  (23,971/25,283 windows in [0,1]); tBranch variant B = `[f16 scale][f16
  tween][u32 refA][u32 refB][u32 refC]...` (1,531 branches; tween mode 0.2 s /
  0.1 s — GoW1's ' Tween' value spectrum, per branch, as the combat designer
  described); MOV/tBranch node = 56-byte base struct (id, flags, f16 scale,
  i16 fields with 0x7fff = unset, optional child-offset table); leaves: Offset
  vec3 f32, Tint rgba f32, TweenIn/Out f32[], *Impulse f16x3 (GoW1 magnitudes).
- Exporter v4 (`gow3_dc_export4.py` over `gow3_dc_export{,2,3}.py`): 22 group
  sheets + BRANCHES.twk + INDEX.twk + TYPES.twk, 14 MB, 84% of entries carrying
  a validated reading; output staged at scratchpad `gow3_out4/R_HERO00/`.
- Other facts: ANM_hero (10.5 MB) act names readable (`attComboSlash01-05`…);
  MAT records open with magic 8; textures are DDS-named records; the
  hash-named `01106C05_*` branches are ubershader permutations (dbg_ stubs
  name `ubershader.fx`), not tweak data.

</specifics>

<canonical_refs>
## Canonical References

- `design/data-archaeology.html` — GoW1 finds/status conventions (real / inferred / dead end)
- `design/twk/decoded/*.twk` — GoW1 sheet format to mirror (header block, `; [real]` row tags)
- `CLAUDE.md` — data-first rule: game-stored values are used as-is; runtime-computed values are labeled inferred
- `.gitignore` disc-contents block + memory `distribution-policy` — the 2026-09-25 ruling
- Memory `elf-fx-tweak-schema` — GoW1 TWK/Tween lineage the GoW3 findings continue

</canonical_refs>

<deferred>
## Deferred (in-phase but later plans, or out of phase)

- Decode of the DC lookup tables (tag-13/14/15) → exact field schemas (would
  turn today's INFERRED node/branch readings into real ones)
- ANM_hero act table (names + durations + channels), DDS texture export,
  MAT layout diff vs GoW1, enemy/boss WAD databases (their own branch sets)
- GOW3-03 archaeology page (write once the first sheets are in the repo)
- The GoW3 sim lab itself (separate phase)

</deferred>
