---
phase: 01-reference-pipeline-validation-criteria
plan: 02
subsystem: infra
tags: [pcsx2, ffmpeg, emulator-config, capture-pipeline, software-renderer, sha256-provenance]

# Dependency graph
requires: []
provides:
  - reference/SETTINGS.md — confirmed PCSX2 2.6.3 capture configuration (zero pending markers, actual 2.6.3 menu wording, Observed ini keys drift anchors)
  - reference/PCSX2.ini — verbatim byte-identical snapshot of the live post-configuration ini for session drift-diffing
  - FFmpeg 8.0 DLLs (avcodec-62 et al.) installed beside pcsx2-qt.exe, SHA-256-verified against the official pcsx2-windows-dependencies release
  - Working end-to-end MP4/H.264 video capture at the UI-maximum 99999 kbps
  - Frame Advance bound to F7 (advance-then-F8-screenshot stills workflow)
affects: [01-03 capture session, calibration, validation-criteria, all later footage-comparison phases]

# Tech tracking
tech-stack:
  added: [PCSX2 2.6.3.0 (external emulator, software renderer), FFmpeg 8.0 DLL pack (official pcsx2-windows-dependencies FFMPEG release)]
  patterns:
    - "Provenance-first reference docs (SETTINGS.md opens with emulator/ISO/BIOS identity, modeled on extracted/README.md)"
    - "Session-start ini drift diff: fc.exe live ini vs reference/PCSX2.ini; any [EmuCore/GS] diff blocks capturing"
    - "PENDING-CONFIRM token lifecycle: researched value -> GUI application -> ini-confirmed value, tokens fully removed at confirmation"

key-files:
  created: [reference/PCSX2.ini]
  modified: [reference/SETTINGS.md]

key-decisions:
  - "Frame Advance bound to F7 — free key adjacent to F8 (Screenshot) for the advance-then-screenshot stills workflow"
  - "Video capture bitrate set to 99999 kbps — probed as the actual UI maximum (999999999 input clamps to 99999)"
  - "ini snapshotted while PCSX2 was still running — PCSX2 Qt flushes settings on change (verified); cosmetic post-exit drift is covered by the session-start diff procedure"
  - "FFmpeg 8.0 pack chosen over 6.0.7/7.0.2 because PCSX2 v2.6.3 links libavcodec major 62 (avcodec-62.dll)"
  - "EnablePatches=true left as-is and documented: it is PCSX2's global compatibility-patch (GameIndex) toggle, distinct from the visual pnach patches which are all off/unchecked"

patterns-established:
  - "Data-first settings documentation: every table row cites the observed ini key=value, GUI wording recorded as actually labeled in 2.6.3"
  - "DLL supply-chain rule: sole acceptable FFmpeg source is the official pcsx2-windows-dependencies release; archive + per-DLL SHA-256 recorded; post-install re-hash verified"

requirements-completed: [VAL-01]

# Metrics
duration: ~6 min continuation (Task 1 in a prior session; Task 2 was a human GUI checkpoint)
completed: 2026-07-24
---

# Phase 01 Plan 02: Uncontaminated Capture Pipeline Summary

**PCSX2 2.6.3 configured from a clean slate as a software-renderer, native-res, patch-free capture rig — every setting ini-verified (Renderer=13), snapshotted to reference/PCSX2.ini, with SHA-256-verified official FFmpeg DLLs powering working MP4 capture at the 99999 kbps UI max**

## Performance

- **Duration:** ~6 min (this continuation session, Task 3 + summary); Task 1 executed in a prior session; Task 2 spanned a human-action checkpoint (GUI first-run configuration)
- **Started (continuation):** 2026-07-25T04:20:41Z
- **Completed (continuation):** 2026-07-25T04:28:00Z
- **Tasks:** 3/3 (2 auto + 1 human-action checkpoint)
- **Files modified:** 2 (reference/SETTINGS.md, reference/PCSX2.ini) + 7 external DLLs installed

## Accomplishments

- **Capture pipeline is live and verified end-to-end:** God of War SCUS-97399 boots under the software renderer (status bar: `Software | 512x448 | FPS: 60 | VPS: 60 | Speed: 100%`), and System → Video Capture encoded a ~10 s test MP4 with no FFmpeg error
- **reference/PCSX2.ini snapshot** created and `cmp`-verified byte-identical to the live `Documents\PCSX2\inis\PCSX2.ini` at snapshot time — the drift-diff anchor for every future capture session
- **SETTINGS.md finalized:** zero `PENDING CONFIRM` tokens remain; all six 2.6.3 menu-wording corrections applied (Graphics API:, Media Capture → Resolution:, "Internal Resolution (No Aspect Correction)", System → Video Capture, Speed Control → Normal Speed, Rendering → Software Rendering Threads); `## Observed ini keys` section quotes the exact live key=value lines
- **Machine-verified ini values:** `Renderer = 13` (Software), `ScreenshotSize = 2`, `ScreenshotFormat = 0` (PNG), `AspectRatio = Auto 4:3/3:2`, `FMVAspectRatioSwitch = Off`, `deinterlace_mode = 0`, `extrathreads = 3`, `CaptureContainer = mp4`, `VideoCaptureBitrate = 99999`, `EnableCheats/EnableWideScreenPatches/EnableNoInterlacingPatches = false`, `FrameAdvance = Keyboard/F7`, F1/F3/F8 confirmed, `BIOS = scph39001.bin`
- **Patch hygiene confirmed per-game:** SCUS-97399 (CRC D6385328) properties list exactly Widescreen 16:9 and Skip Cutscenes, both UNCHECKED; cheat list empty
- **DLL supply chain closed (T-1-02):** post-install SHA-256 of all 7 FFmpeg DLLs in `C:\Program Files\PCSX2\` matches the provenance table from the official pcsx2-windows-dependencies FFMPEG release exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Author SETTINGS.md and stage official FFmpeg DLLs** - `3620714` (docs) — prior session
2. **Task 2: Human performs PCSX2 first-run configuration** - checkpoint:human-action, no commit (external state: `Documents\PCSX2\inis\PCSX2.ini` created by the GUI; elevated DLL copy into Program Files). Resolved with user reply "configured"; orchestrator machine-verified the live ini and emulator state
3. **Task 3: Verify ini, snapshot it, finalize SETTINGS.md** - `2fa9e5c` (docs)

## Files Created/Modified

- `reference/PCSX2.ini` - Verbatim snapshot of the live post-configuration ini (byte-identical at snapshot time; CRLF round-trips cleanly under core.autocrlf=true)
- `reference/SETTINGS.md` - Confirmed Setting | Value | Why table with actual 2.6.3 wording, Observed ini keys drift anchors, launch lines, DLL provenance (now INSTALLED — verified), calibration stub for 01-03, session-start diff procedure

## Decisions Made

- **Frame Advance = F7** — chosen as the free key adjacent to F8 for the advance-then-screenshot stills workflow
- **99999 kbps is the documented capture bitrate** — probed as the true UI maximum (spinbox clamps 999999999 → 99999), satisfying the "maximum bitrate the UI allows" research row
- **Snapshot taken with PCSX2 still running** — PCSX2 Qt flushes settings on change (verified by reading the file); the session-start procedure already classifies post-exit cosmetic diffs ([UI]/[GameList]) as ignorable
- **`EnablePatches = true` documented, not changed** — it is the global compatibility-patch (GameIndex.yaml) toggle, distinct from visual pnach patches, which are confirmed off

## Deviations from Plan

**1. [Minor — checkpoint step not literally performed] Task 2 step 6 said "Close PCSX2 (settings persist to the ini on exit)"; PCSX2 was left RUNNING**
- **Found during:** Task 3 (ini verification)
- **Issue:** The user kept PCSX2 open (creating save states); the plan assumed exit-flush
- **Resolution:** PCSX2 Qt writes settings to the ini on change, not only on exit — verified by reading the live file, which already contained every configured value. The Task 3 byte-identical gate passed. Post-exit cosmetic drift is explicitly covered by SETTINGS.md's session-start diff rule (step 3)
- **Files modified:** none (documented in SETTINGS.md session-start section)
- **Committed in:** 2fa9e5c

No other deviations — plan executed as written; all researched values were confirmed unchanged by the live ini (only menu *wording* needed correction, which the plan anticipated).

**Total deviations:** 1 documented (no rule-triggered auto-fixes)
**Impact on plan:** None — all gates passed; no scope creep.

## Issues Encountered

- Worktree base drift at continuation start: the executor worktree branch was based on a stale commit (`cc91741`); reset to the orchestrator-specified base `ab71960` per the worktree branch-check protocol before executing. No work was lost (worktree was clean)

## User Setup Required

None beyond what Task 2's checkpoint already completed — PCSX2 is configured, DLLs installed, and capture verified. (The user's own capture `God of War_SCUS-97399_20260724211326.mp4` in Documents\PCSX2\videos was left untouched.)

## Known Stubs

- `reference/SETTINGS.md` **Calibration** section: the two fields (actual screenshot dimensions via `magick identify`, horizontal scale factor) are intentional deferrals labeled "recorded by capture session (plan 01-03)" per the plan spec — plan 01-03 fills them. A status-bar hint (512x448 internal res) was recorded as a non-authoritative note.
- `reference/SETTINGS.md` **Deinterlacing** row: value confirmed as Automatic (`deinterlace_mode = 0`); the *final* mode is contingent on plan 01-03's progressive-scan outcome, as the plan specifies.

## Next Phase Readiness

- Plan 01-03's capture session can start immediately: diff the live ini against `reference/PCSX2.ini`, boot via the documented `-fastboot` line, and use F7/F8 for frame-stepped stills
- Calibration inputs staged: 01-03 must run `magick identify` on the first F8 screenshot to fill the two Calibration fields (status-bar hint suggests a 512-wide framebuffer → likely ×1.0 if screenshots emit 512, ×0.8 if 640)
- PCSX2 may still be running with the user creating save states — future sessions should expect (and ignore) cosmetic ini diffs after its first clean exit

## Self-Check: PASSED

- `reference/PCSX2.ini` — FOUND
- `reference/SETTINGS.md` — FOUND
- `.planning/phases/01-reference-pipeline-validation-criteria/01-02-SUMMARY.md` — FOUND
- Commit `3620714` (Task 1) — FOUND
- Commit `2fa9e5c` (Task 3) — FOUND
- Gate `! grep -q "PENDING CONFIRM" reference/SETTINGS.md` — PASSED
- `cmp` live ini vs snapshot — BYTE-IDENTICAL

---
*Phase: 01-reference-pipeline-validation-criteria*
*Completed: 2026-07-24*
