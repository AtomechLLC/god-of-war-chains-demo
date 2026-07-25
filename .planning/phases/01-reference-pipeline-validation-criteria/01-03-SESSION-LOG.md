# Plan 01-03 Capture Session Log (live)

Session date: 2026-07-24 evening. Orchestrator drove PCSX2 via computer-use at user request
("try your best"); user assists intermittently with the gamepad.

## Pipeline / environment facts (verified)

- PCSX2 2.6.3, software renderer, fullscreen borderless during session (display mode does not affect F8 internal-res capture).
- Input: new PCSX2 input profile **capture-bot** (assigned to SCUS-97399 via Game Properties → Input Profile). Contains user's SDL-0 PS4 pad bindings PLUS keyboard: Cross=K, Triangle=I, Square=J, Circle=L, Start=Return, Select=BackSpace, L1=Q, R1=E, LStick=WASD, RStick=TFGH, DPad=arrow keys, and P = Cross+Triangle chord (for boot-hold experiments). L2/R2 pad-only. User's "Shared" profile untouched.
- Per-profile hotkeys enabled (copied): SaveState=F1, NextSlot=F2, LoadState=F3, Screenshot=F8, FrameAdvance=F7 (bound this session), **ToggleVideoCapture=F10 (bound this session, per-profile)**.

## Progressive scan outcome (for shot-list/SETTINGS.md)

- Boot-hold X+Triangle: attempted 3× (fastboot Reset, full-boot Reset, full boot from game list with P chord held across the entire boot incl. PS2 logo) — **no prompt ever appears in PCSX2 2.6.3**. Full boot sequence mapped: SCE splash 640x448 (~t+3s) → PS2 logo (~t+9s) → GoW legal text 512x448 (~t+14s) → title.
- **GoW1 exposes Progressive Scan in the in-game OPTIONS menu** (title → OPTIONS → "PROGRESSIVE SCAN: OFF"). Shot-list's "Tools → Video Capture"-style boot-hold instruction is the wrong method for this title.
- Enabling it: warning dialog → YES → screen switches → **auto-reverts to OFF after a few seconds** (multiple attempts incl. blind confirm presses). Consistent with the game's own "screen will go dark ... menu will return" fallback — the 480p test mode appears not to survive under the software renderer.
- **DECISION: 480i fallback per shot list.** Deinterlacing = Automatic (Default). ALL stills taken paused via F7 before F8.
- Other options observed: WIDE SCREEN: OFF (required), SOFTEN: ON (game default, in-engine filter — left at default; note for MEASUREMENTS).

## Calibration (shot-list step 3) — DONE

- First F8 file: `God of War_SCUS-97399_20260724220549.png` → **PNG 512x448, 8-bit sRGB** (~263 KB).
- **Screenshot width = 512 → horizontal scale factor ×1.0** (screenshot px = GS px; the 640-wide CRTC trap did NOT occur). Internal res on status bar: 512x448; BIOS/splash phases render 640x448.

## Critical capture mechanic discovered

- PCSX2 **queues** screenshots until the next presented frame. While paused, F8 (or System → Screenshot) writes NOTHING until a Frame Advance (F7) presents a frame.
- Therefore the still/burst loop is: pause → position via F7 → then alternate **F8, F7** — each F7 flushes the previous F8 and advances exactly one frame. Verified: 12-frame burst produced 12 unique PNGs (~2s wall time). Filenames get `_(N)` suffixes within the same second.
- Note: the captured frame is the one presented by the flushing F7 (consistent one-frame offset; harmless since uniform).

## Save state slot map (sstates folder)

| Slot | Content | By | Time |
|------|---------|----|------|
| 1 | User's original early-deck state (Level 1 blades) | user | 21:22 |
| 2 | Mid-framing combat anchor (~34% Kratos height, 4 legionnaires) | Claude | 22:08 |
| 3 | User's "Kratos mid-deck" setup (grab-tutorial banner active, ~27%) | user | 22:10 |
| 4 | Wide framing (~20-25%), restored from `.03.p2s.backup` via file copy | Claude | 22:13 |
| resume | User's resume state | user | 21:24 |

- Close framing (≥60%): deck camera is rail-locked ~25-40%; **no true close spot on deck**. Plan: use grab-zoom moments and/or later corridor cameras; otherwise record closest + measured height per shot-list relaxation.

## Media inventory so far (Documents\PCSX2\)

**snaps/** (13 PNGs, all 512x448):
- `...220549.png` — CALIBRATION frame (paused combat, mid framing) [capture order #1]
- `...221411*.png` .. `...221413_(3).png` (12 files) — **chain-midswing burst, mid framing, 12 consecutive frames** (Kratos mid combo swing w/ blood arc, 4 legionnaires) [order #2]

**videos/** (99999 kbps MP4/H.264 + audio):
- `...211326.mp4` (52 MB) — USER pre-session clip #1 (content: user to identify; Blades attacking enemies)
- `...212336.mp4` (78 MB) — USER pre-session clip #2 (content: user to identify)
- `...221001.mp4` (261 bytes) — stub from accidental F10 during user setup; DELETE at ingest
- `...221205.mp4` (~6 MB) — Take 1: **Circle grab kill** (incl. grab camera), mid framing, slot-3 scene [order #3]
- `...221228.mp4` (~6.5 MB) — Take 2: combo3A Square strings attempt (content unverified — review at ingest) [order #4]

## Remaining checklist

- [ ] 120-frame cadence burst (idle, drawn blades, minimal motion) — NEXT PRIORITY (10× batches of 12 F8/F7 pairs)
- [ ] Stills: chain-at-rest ×3 framings; chain-midswing at wide (+closest); fire close-up ×3; trail mid-swing ×3 framings
- [ ] Motion clips: launcher (Triangle), plume (Square-Square-Triangle), idle drape ~10s; clean combo3A take if 221228 is unusable
- [ ] Close-framing captures via grab-zoom or corridor
- [ ] User to identify their 2 pre-session clips (move + framing + Level-1/no-orbs confirmation) or mark ignored

## Status

- 22:21-22:24: user repositioned to below-deck corridor (no enemies, ~47% framing, save-point glow), re-saved slot 3 there, switched to windowed mode.
- Cadence burst executed at corridor spot: armed-idle w/ both blades burning, paused, F8/F7 pairs.
  **36 of 120 frames captured** (`...2221xx` and `...2222xx` series, files 14-49 in snaps/) before focus was lost and the user redirected the session.
- 22:25: USER REDIRECT — pause capture work entirely, pivot to kratos-lab implementation using extracted game data; "circle back to video in a polish pass."
- Remaining for polish pass: 84 more cadence frames (same spot, slot 3, ~40s hands-off), chain-at-rest stills ×3 framings, fire close-ups, trail stills, launcher/plume/idle-drape clips, user's 2 clip identifications.
- Plan 01-03 checkpoint remains OPEN. All media safely on disk (49 PNGs + 4 clips + 1 stub). Nothing committed to git (media is gitignored by design).
