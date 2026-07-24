# Phase 1: Reference Pipeline & Validation Criteria - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 8 (5 tracked docs, 1 config edit, 1 config snapshot, 3 gitignored media dirs counted as one entry)
**Analogs found:** 7 / 8

> This phase creates **no runtime code** — every deliverable is a document, a `.gitignore`
> edit, or a gitignored media directory. The relevant "patterns" are the repo's established
> documentation conventions: provenance labeling (real vs inferred), evidence citation with
> confidence tags, ground-truth anchor tables, and the copyright-gitignore comment style.
> The planner should treat the excerpts below as house style to copy, not code to port.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `reference/SETTINGS.md` | config-provenance doc | batch (one-time setup → doc) | `extracted/README.md` | exact (pipeline-provenance doc) |
| `reference/TARGET-DEFINITION.md` | policy/spec doc | reference (read-only by Phases 3/5/7) | `.planning/research/PITFALLS.md` P8/P9 + `REQUIREMENTS.md` "Out of Scope" table | role-match |
| `reference/MEASUREMENTS.md` | evidence/measurement doc | batch (offline analysis → doc) | `tools/kratos-lab/README.md` "Data provenance" table + `design/twk/README.md` | exact (measured-value + provenance convention) |
| `reference/ACCEPTANCE.md` | checklist/criteria doc | reference (judged by Phase 7) | `.planning/REQUIREMENTS.md` + PITFALLS.md "Looks Done But Isn't" | exact (checkbox-criteria convention) |
| `reference/shot-list.md` | capture-plan doc | batch (plan → human session) | `tools/kratos-lab/README.md` move set + `design/twk/README.md` table | role-match |
| `.gitignore` (modify) | config | — | existing `.gitignore` lines 7–10 (`extracted/**` block) | exact |
| `reference/PCSX2.ini` (snapshot copy) | config artifact | reference (diff target per session) | none — verbatim copy of `Documents\PCSX2\inis\PCSX2.ini` | no-analog (none needed) |
| `reference/captures/`, `reference/frames/`, `reference/annotated/` | asset storage (gitignored) | file-I/O (capture output) | `extracted/` directory policy | exact (same copyright policy) |

## Pattern Assignments

### `.gitignore` modification (config)

**Analog:** `C:\Projects\GameDesignSkills\GodOfWarChains\.gitignore` (lines 1–11 — entire file)

The repo's established convention: a comment block stating **why** (copyright + re-derivability), then the ignore rules, with an explicit `!` exception keeping docs tracked. Copy this comment style for the new block.

**Existing pattern** (lines 7–10):
```gitignore
# Extracted game assets (models/textures/animations from the disc) — copyrighted
# game content; local-only. The extraction docs (README) stay tracked.
extracted/**
!extracted/README.md
```

**New block to append** (same style; RESEARCH.md lines 183–188 specify the three dirs):
```gitignore
# Reference captures (PCSX2 screenshots/clips of the game) — copyrighted game
# output; local-only. The measurement/criteria docs in reference/ stay tracked.
reference/captures/
reference/frames/
reference/annotated/
```

Note: unlike `extracted/**`, ignore only the three media subdirectories — the five tracked
`.md` files and the ini snapshot live directly in `reference/` and must stay tracked without
needing `!` exceptions. The GitHub Pages deployment (repo has `.github/workflows/static.yml`)
makes this a hard requirement: gitignore **before** the first capture lands (RESEARCH.md
Security section, line 455).

---

### `reference/SETTINGS.md` (config-provenance doc)

**Analog:** `C:\Projects\GameDesignSkills\GodOfWarChains\extracted\README.md`

This is the repo's model for "document the pipeline that produced local-only artifacts so it can be reproduced": title states tool + purpose, an opening line naming the exact source, a "Where things came from" section with exact formats/versions, and tables for inventories.

**Header + provenance-first opening** (lines 1–9):
```markdown
# God of War (2005, PS2) — Kratos model / animation / chain-data extraction

Everything here was pulled from `God of War (USA)/part1.pak` using the index in
`God of War (USA)/godofwar.toc`.

## Where things came from

**TOC format** (`godofwar.toc`): flat array of 24-byte entries —
`char name[16]`, `u32 size`, `u32 offset` (offset in 2048-byte sectors into `part1.pak`).
```

**Inventory-table pattern** (lines 22–27):
```markdown
| WAD | Contents |
|---|---|
| `R_PERM.WAD` | Permanent (always resident): global tweaks, HUD, message text, hero runtime data |
| `R_HERO0.WAD` … `R_HERO5.WAD` | Kratos per blade-upgrade level 0–5 (model, textures, animation set, FX) |
```

**Apply as:** SETTINGS.md opens with "Every capture here was produced by PCSX2 2.6.3.0
(`C:\Program Files\PCSX2\pcsx2-qt.exe`), software renderer, from `God of War (USA).iso`
(SCUS-973.99, NTSC-U), BIOS scph39001.bin" — then a settings table (Setting | Value | Why,
prefilled from RESEARCH.md Pattern 1 lines 199–210), the reproducible launch lines
(RESEARCH.md lines 213–217), and a **Calibration** section recording `magick identify`
output and the 512/640 horizontal scale factor (RESEARCH.md Pattern 2). Note the ini
snapshot: `reference/PCSX2.ini` copied after configuration; each session starts by diffing
against it (RESEARCH.md Pitfall 3, lines 316–319).

---

### `reference/MEASUREMENTS.md` (evidence/measurement doc)

**Analog 1:** `C:\Projects\GameDesignSkills\GodOfWarChains\tools\kratos-lab\README.md` — the "Data provenance" table (lines 49–63) is the project's canonical evidence convention: every value gets a **bold `real`/`inferred` status plus the exact source record/offset**.

```markdown
## Data provenance

| element | status |
|---|---|
| clip names, ids, durations | **real** — decoded from `ANM_hero.bin` clip headers |
| per-clip blend-in times ("combo blends") | **real** — clip header +0x04 (0.09s light chain, 0.06s berserk, 0 = hard cut on finishers/air continuations) |
...
| input→branch placement of mixed strings | **inferred** — reconstructed from naming + move list |
| queue/branch/cancel window extents for attacks | **inferred defaults, adjustable** — searched exhaustively: attack windows are compiled into engine code (hash-keyed), not present as named data in the retail files |
```

**Analog 2:** `C:\Projects\GameDesignSkills\GodOfWarChains\design\twk\README.md` (lines 1–7) — the header pattern that declares up front which values are decoded vs modeled:

```markdown
Reconstructed designer-browsable branch data for every move in the combo
graph — one .twk per animation. Real values (clip id, duration, blend-in,
keyframe rate) are decoded from the disc; branch topology comes from clip
naming + the in-game move list; window timings are an inferred, adjustable
model (the game compiles exact windows into code).
```

**Apply as:** each MEASUREMENTS.md value is a table row: metric | value (GS px / hex /
cycles-per-s) | source frame file + pixel coordinates | method. The "source" column plays
the role kratos-lab's provenance column plays — e.g.
`**measured** — frames/combo1-square_f0142_chain-midswing_mid.png @ (231,187), ×0.8 calib`.
Frame filenames follow RESEARCH.md's convention (line 190):
`<clip-id>_f<frame#>_<subject>_<framing>.png`. RESEARCH.md's Pitfall "Writing measurements
without frame citations" (line 286) makes the citation column mandatory for every number.

**Ground-truth anchors to cross-check against** (from `.planning/research/FEATURES.md` — measured values must land near these or the capture/decode is suspect, per RESEARCH.md lines 253–255):

- FEATURES.md line 14: `chainlink` texture is **512×32, 16 links per tile, 32px pitch
  (~25px link + ~7px gap)**, links occupy rows 6–25, alpha 112–255, transparent gaps.
- FEATURES.md line 22: `chainglow` heat ramp **#FEE500 → #FCBE00 → #E44C00 → #360600**,
  hot cluster at x≈32–96 of the strip.
- FEATURES.md line 46: `swordtrail` 64×32, amber gradient **max #F3B012, alpha 0x80=1.0**.
- FEATURES.md line 53: blade light color (1.0, 0.622, 0.288), intensity 2.5, range ~160.

---

### `reference/ACCEPTANCE.md` (checklist/criteria doc)

**Analog 1:** `C:\Projects\GameDesignSkills\GodOfWarChains\.planning\REQUIREMENTS.md` — the checkbox-with-bold-ID convention (lines 7–10) and the traceability-table convention (lines 66–68):

```markdown
### Reference & Validation

- [ ] **VAL-01**: An uncontaminated reference library exists — native-res, software-renderer (or verified-clean) captures of Level-1 blade combat with freeze-frames catalogued for link pitch, glow hues, flame shapes, trail geometry
- [ ] **VAL-02**: A side-by-side comparison harness plays kratos-lab next to reference footage of the same moves, and the final result is judged 80–90% accurate in motion
```

```markdown
| Requirement | Phase | Status |
|-------------|-------|--------|
| VAL-01 | Phase 1 | Pending |
```

**Analog 2:** `C:\Projects\GameDesignSkills\GodOfWarChains\.planning\research\PITFALLS.md` "Looks Done But Isn't" checklist (lines 259–267) — each item names the common failure and the concrete verification, which is exactly the shape ACCEPTANCE.md items need:

```markdown
- [ ] **Fixed timestep:** Often "works on my monitor" — verify identical particle density at 60Hz and 144Hz displays (or with a forced-slow rAF test)
- [ ] **Canvas compositing:** Often invisible on dark pages — verify FX unchanged over a magenta page background
- [ ] **Flipbook cadence:** Often eyeballed — verify flame flicker cycles/second counted against footage
```

**Apply as:** grouped binary checks per element (Chain links / Chain glow / Chain motion /
Fire / Trails / Renderer invariants / Global — the grouping is fully specified in
RESEARCH.md Pattern 6, lines 266–278). Each item carries: metric, measured target (link to
the MEASUREMENTS.md row), tolerance (±10% link count, ±0.5 cycles/s cadence, ±20% fade
frames), and test method (A/B flicker, overlay, count). Give items stable IDs (e.g.
`ACC-CHAIN-01`) following the REQUIREMENTS.md ID style so Phase 7 can reference them.
Exit rule: no `TBD` anywhere (the phase gate greps for it — RESEARCH.md line 422).

---

### `reference/TARGET-DEFINITION.md` (policy/spec doc)

**Analog 1:** `C:\Projects\GameDesignSkills\GodOfWarChains\.planning\research\PITFALLS.md` — P9's lock-the-definition language (lines 195–197) is the content this doc exists to make normative:

```markdown
- Lock the definition now: the target is the GS's digital output as captured by the reference pipeline (Pitfall 8), *not* a CRT simulation. This matches the footage-comparison mandate.
- If CRT flavor is ever wanted, it goes in as a clearly separated, clearly labeled optional post-pass — never mixed into the data-driven layers, and never active during validation comparisons.
```

and P8's source-role assignment (lines 174–176):

```markdown
- Establish a reference-capture pipeline as an explicit early deliverable: PCSX2 **software renderer**, native internal resolution, blending accuracy maxed, lossless or high-bitrate local capture, documented deinterlace setting. This is the color/brightness ground truth.
- Use YouTube footage for *motion and timing* only (whip arcs, flicker cadence, particle burst rhythm) — never for color calibration.
```

**Analog 2:** `C:\Projects\GameDesignSkills\GodOfWarChains\.planning\REQUIREMENTS.md` "Out of Scope" table (lines 53–59) — the Exclusion | Reason table style for the anti-target list:

```markdown
| Exclusion | Reason |
|-----------|--------|
| HDR bloom, soft particles, motion blur, tonemapping, DoF | Not present on PS2; each one breaks the period look (locked anti-features) |
```

**Apply as:** a short doc with (1) the one-sentence target statement containing the literal
phrase **"GS output as captured, not CRT"** (the phase gate greps for "not CRT" —
RESEARCH.md line 421); (2) a source-roles table: PCSX2 PNG stills = color/brightness/
geometry truth; PCSX2 clips = motion/timing truth; YouTube FMGwS-bvNiU = move-selection +
motion cross-check only (RESEARCH.md Pitfall 4, lines 322–324) — note the YouTube footage
is the PS3 Collection port per FEATURES.md line 190, one more reason it is motion-only;
(3) an exclusions table (no CRT shaders, no bloom/tonemap/sRGB expectations, per CLAUDE.md
anti-features).

---

### `reference/shot-list.md` (capture-plan doc)

**Analog:** `C:\Projects\GameDesignSkills\GodOfWarChains\tools\kratos-lab\README.md` — the shot list must mirror kratos-lab's implemented move set so Phase 7 gets directly comparable clips (RESEARCH.md Pattern 4, line 244). The move inventory to mirror (lines 20–23):

```markdown
- **PS2 button pad** — Square (light), Triangle (heavy, hold for launcher), Circle
  (grab), X (jump), L1 modifier, Rage of the Gods toggle. Keyboard: J/K/L/Space/Shift/R.
- **Combo tester** — all chains unlocked. State machine over the real clip inventory
  (names, ids, durations decoded from `ANM_hero.bin`); ...
```

Secondary table-style analog: `design/twk/README.md` (lines 13–17) — one row per move with linked artifacts:

```markdown
| Move | Duration | Branches | ANM data |
|------|----------|----------|----------|
| [airH1](airH1.twk) | 0.73s | 2 | real |
```

**Apply as:** a moves × framings matrix. Rows = the RESEARCH.md-specified set (line 244):
Square light chain combo3A→3B→…, Triangle launcher, Plume of Prometheus (□□△), Circle
grab/throw (white-hot chain state), ~10s idle (chain drape). Columns per shot: in-game
inputs, framing (close ≥60% / mid 35–60% / wide <35% Kratos frame-height — RESEARCH.md
line 264), save-state slot, capture type (still burst / clip), and a done-checkbox.
Use the game's own clip names (combo3A etc.) so shot IDs match kratos-lab and the
`<clip-id>_f<frame#>_<subject>_<framing>.png` frame-naming convention.

---

### `reference/captures/`, `reference/frames/`, `reference/annotated/` (gitignored media dirs)

**Analog:** the `extracted/` directory policy — media local-only, one tracked doc explains
provenance. No README needed inside these dirs (SETTINGS.md + shot-list.md serve that role);
they may not exist in git at all (git doesn't track empty dirs, and every file in them is
ignored). Plans should create them at capture time, not as tracked placeholders — do NOT
add `.gitkeep` files, since that would put a tracked file inside an ignored tree and muddy
the copyright policy.

## Shared Patterns

### Provenance labeling: **real / measured / inferred**
**Source:** `tools/kratos-lab/README.md` lines 51–63, `design/twk/README.md` lines 2–7
**Apply to:** MEASUREMENTS.md (every row), ACCEPTANCE.md (targets cite measured rows), shot-list.md (assumptions like the 480p trigger)
Every value carries a bold status plus its exact source. For this phase the statuses are
`**measured**` (from a cited frame), `**decoded**` (texture/record ground truth from
FEATURES.md), `**inferred**` (e.g., relaxed framing bands if no true close framing exists).

### Evidence citation with confidence tags
**Source:** `01-RESEARCH.md` throughout (e.g. line 118: `serial SCUS-973.99 → **NTSC-U confirmed** [VERIFIED: ...]`) and PITFALLS.md header style (`Confidence: HIGH ... MEDIUM ...`)
**Apply to:** SETTINGS.md (each setting's Why column cites its source), MEASUREMENTS.md
Use `[VERIFIED: ...]` / `[ASSUMED: ...]` inline tags for claims that were checked vs
carried over — this matches how the phase's own research doc records evidence.

### Copyright-gitignore comment block
**Source:** `.gitignore` lines 1–10
**Apply to:** the `.gitignore` edit (excerpt above)
Comment explains the legal rationale before the rules; docs stay tracked.

### Footer metadata line
**Source:** `.planning/REQUIREMENTS.md` lines 86–88, `PITFALLS.md` lines 312–314
**Apply to:** all five reference docs
```markdown
---
*Defined: 2026-07-24 — from research (.planning/research/) + user scoping*
```
End each doc with an italic dated footer naming what produced it (e.g.
`*Captured & measured: <date> — PCSX2 2.6.3 software renderer, settings per SETTINGS.md*`).

### Ground-truth anchor table (decode ↔ capture cross-check)
**Source:** `.planning/research/FEATURES.md` lines 14, 22, 46, 53 (excerpted under MEASUREMENTS.md above)
**Apply to:** MEASUREMENTS.md, ACCEPTANCE.md
Captured hues/pitches are recorded **alongside** the decoded texture ground truths; a
systematic offset between the two is treated as a capture/decode bug to investigate, never
silently averaged (RESEARCH.md line 255).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `reference/PCSX2.ini` | config snapshot | reference | Verbatim copy of `Documents\PCSX2\inis\PCSX2.ini` after configuration — no authoring pattern applies; its only convention is "diff current ini against this at each session start" (RESEARCH.md Pitfall 3) |

## Metadata

**Analog search scope:** repo root (`.gitignore`), `extracted/`, `design/twk/`, `tools/kratos-lab/`, `.planning/` (REQUIREMENTS.md, research/PITFALLS.md, research/FEATURES.md)
**Files scanned:** 13 markdown docs enumerated; 7 read in full (all ≤ 314 lines, single-pass)
**Pattern extraction date:** 2026-07-24

Notes for the planner:
- No kratos-lab code files are touched this phase (RESEARCH.md line 52: "no kratos-lab code changes, no WebGL work").
- Wave 0 gaps from RESEARCH.md (lines 432–433): `reference/` dir + `.gitignore` entries, and `shot-list.md` authored **before** the first capture session.
- Capture sessions are human tasks (RESEARCH.md line 131): plans should model them checkpoint-style, with Claude preparing settings/shot lists/hotkey sheets beforehand and doing measurement/cataloguing after.
- Phase-gate grep targets the plans must satisfy: `renderer` in SETTINGS.md, `not CRT` in TARGET-DEFINITION.md, `cycles/s` in MEASUREMENTS.md, no `TBD` in ACCEPTANCE.md (RESEARCH.md Validation Architecture, lines 417–422).
