---
phase: 01-reference-pipeline-validation-criteria
plan: 01
subsystem: reference-pipeline
tags: [pcsx2, capture, gitignore, validation, gow1, shot-list]

# Dependency graph
requires: []
provides:
  - ".gitignore ignore rules for reference/captures/, reference/frames/, reference/annotated/ (landed BEFORE any capture exists — GitHub Pages legal requirement)"
  - "reference/TARGET-DEFINITION.md — normative 'GS output as captured, not CRT' target, three-row source-roles table, exclusions table, CRT post-pass rule"
  - "reference/shot-list.md — moves x framings capture matrix (idle/combo3A/launcher/plume/grab) + full session runbook (boot line, progressive-scan experiment, calibration-first rule, save-state library, hotkeys, naming convention)"
affects: [01-02, 01-03, 01-04, phase-3-chain-visuals, phase-5-fx-decode, phase-7-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Copyright-gitignore comment block (why-comment before rules, docs stay tracked)"
    - "Source-role assignment: PNG stills = color truth, clips = motion only, YouTube = move-selection/motion only"
    - "Measurable framing bands: close >= 60%, mid 35-60%, wide < 35% Kratos frame-height"
    - "Frame naming convention <clip-id>_f<frame#>_<subject>_<framing>.png"

key-files:
  created:
    - reference/TARGET-DEFINITION.md
    - reference/shot-list.md
  modified:
    - .gitignore

key-decisions:
  - "Ignore only the three media subdirectories (captures/, frames/, annotated/) — tracked docs live directly in reference/ so no ! exceptions needed"
  - "Shot IDs reuse the game's own clip names (combo3A, launcher, plume, grab, idle) so Phase 7 clips are directly comparable to kratos-lab"
  - "Human never renames captures — Claude ingests from Documents\\PCSX2\\snaps using capture-order notes; keeps the session runbook human-executable"

patterns-established:
  - "Provenance labels carried into capture docs: X + Triangle 480p trigger marked [ASSUMED]/inferred per 01-RESEARCH.md A1; framing-band relaxation labeled inferred"
  - "Session protocol ordering: calibration screenshot is ALWAYS the first capture of any session"

requirements-completed: []  # VAL-01 spans all four plans of this phase (01-01..01-04 all list it); it completes when the capture library + measurements + acceptance checklist exist (plans 01-03/01-04). This plan delivered its Wave-0 prerequisites.

# Metrics
duration: 8min
completed: 2026-07-24
---

# Phase 1 Plan 01: Capture-Safety & Capture-Campaign Docs Summary

**Repo made capture-safe (three reference media dirs gitignored before any capture exists) plus the normative "GS output as captured, not CRT" target definition and the verbatim-executable PCSX2 shot list for the plan 01-03 capture session**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-25T03:39:32Z
- **Completed:** 2026-07-25T03:47:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `.gitignore` now ignores `reference/captures/`, `reference/frames/`, `reference/annotated/` with the repo's established copyright-comment style — verified with `git check-ignore` on all three paths, closing threat T-1-01 before plan 01-03 (Wave 2) can produce any copyrighted capture file
- `reference/TARGET-DEFINITION.md` locks the fidelity target ("GS output as captured, not CRT"), assigns every footage source exactly one role (PCSX2 PNG stills = color/brightness/geometry truth; PCSX2 clips = motion/timing only; YouTube FMGwS-bvNiU = move-selection + motion cross-check only, noted as the PS3 Collection port), lists the anti-target exclusions (CRT shaders, bloom/tonemap/soft-particles/motion-blur/DoF, sRGB management), and states the CRT-flavor post-pass rule
- `reference/shot-list.md` fully specifies the capture campaign: 18-row matrix (9 core stills covering 3 subjects x 3 framings, 3 trail stills, 1 >= 120-frame cadence burst, 5 clips — one per move) with PS2 inputs, save-state slots, and done checkboxes; plus the 8-step session runbook (boot line, X + Triangle progressive-scan experiment with -slowboot and 480i pause/frame-advance fallbacks, calibration-screenshot-first rule, pre-upgrade save-state library, per-row workflow, hotkey cheat sheet, frame naming convention)

## Task Commits

Each task was committed atomically:

1. **Task 1: Gitignore reference media and write TARGET-DEFINITION.md** - `94d3d0a` (chore)
2. **Task 2: Author reference/shot-list.md (capture matrix + session protocol)** - `96b68cc` (docs)

## Files Created/Modified

- `.gitignore` - Appended copyright-comment block ignoring the three reference media subdirectories; existing lines untouched
- `reference/TARGET-DEFINITION.md` - Normative target statement, source-roles table, exclusions table, CRT post-pass rule
- `reference/shot-list.md` - PART A capture matrix (idle, combo3A, launcher, plume, grab x framings x capture types), PART B numbered session protocol

## Decisions Made

- `requirements-completed` left empty: VAL-01 is listed by all four plans of this phase and only becomes true once the capture library and measured criteria exist (plans 01-03/01-04); marking it complete now would falsely check the phase requirement
- Fire close-up subject captured from the idle stance (blades drawn, flames burning) at each framing — matches the PITFALLS P8 catalog subjects while keeping inputs trivial for the human
- Trail mid-swing stills included at all three framings (not just one) per 01-RESEARCH.md Pattern 5 trail-geometry methodology

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. (Worktree base started one commit behind the expected `7276b0f`; corrected via the sanctioned `worktree_branch_check` reset before any work began.)

## User Setup Required

None in this plan — PCSX2 configuration and the FFmpeg DLL install are plan 01-02's scope; the human capture session is plan 01-03.

## Next Phase Readiness

- Plan 01-02 (PCSX2 setup) can proceed: the shot list's hotkey cheat sheet defines what must be bound (Frame Advance, F1/F2/F3/F8)
- Plan 01-03 (capture session) can be executed from `reference/shot-list.md` alone — every row has inputs, framing, slot, capture type, and a done checkbox; the runbook covers boot through rename handoff
- The repo is publish-safe: no capture file can be tracked accidentally (`git check-ignore` passes for all three media dirs)

## Self-Check: PASSED

- FOUND: reference/TARGET-DEFINITION.md
- FOUND: reference/shot-list.md
- FOUND: .gitignore contains all three reference/ ignore rules (git check-ignore exits 0 for all three paths)
- FOUND: commit 94d3d0a (Task 1)
- FOUND: commit 96b68cc (Task 2)
- Grep gates: "not CRT" + "FMGwS-bvNiU" in TARGET-DEFINITION.md; "combo3A", "cadence", "X + Triangle", "60%", "_f<frame#>_" in shot-list.md — all pass
- No TBD/TODO/placeholder content in either tracked doc

---
*Phase: 01-reference-pipeline-validation-criteria*
*Completed: 2026-07-24*
