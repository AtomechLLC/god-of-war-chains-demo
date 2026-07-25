# Capture Shot List — Level-1 Blade Combat (PCSX2)

The complete capture campaign for the reference library. A human with PCSX2 configured
per `reference/SETTINGS.md` (plan 01-02) executes this document verbatim during the
capture session (plan 01-03). Shot IDs reuse the game's own clip names (combo3A, etc. —
the same names kratos-lab's combo tester uses, per `tools/kratos-lab/README.md`), so
Phase 7 gets directly comparable clips: same inputs in-game (PS2 pad) and in kratos-lab
(keyboard J/K/L/Space/Shift/R).

**Hard rule:** every capture is Blades **Level 1, no orbs spent** — all save states are
strictly pre-upgrade (spending red orbs changes the blade stage and invalidates the
stage1-texture target).

## Framing definitions (measurable)

Framings come from arena position (GoW's camera is authored/fixed). Defined by Kratos's
on-screen height as a fraction of frame height:

| Framing | Kratos frame-height | Source save state |
|---------|--------------------|-------------------|
| close | >= 60% | slot 3 (near-wall / tight-camera spot) |
| mid | 35-60% | slot 2 (interior corridor) |
| wide | < 35% | slot 1 (open deck arena) |

If no true close framing (>= 60%) exists in early combat, relax the band and record the
actual measured Kratos-heights in the notes column — label the relaxed definition
**inferred** (per 01-RESEARCH.md Open Question 2).

## PART A — Capture matrix

Coverage encoded below: the three catalog subjects — **chain at rest**, **chain
mid-swing**, **fire close-up** — each appear at all three framings (>= 9 core stills),
plus trail mid-swing stills at all three framings, one >= 120-frame idle cadence burst,
and one clip per move.

### Core stills (subject x framing)

| Shot ID | In-game inputs (PS2) | Subject | Framing | Save-state slot | Capture type | Notes (capture ORDER + observations) | Done |
|---------|---------------------|---------|---------|-----------------|--------------|--------------------------------------|------|
| idle | none — stand, blades drawn (one Square swing first if stowed) | chain-at-rest | close | 3 | still burst | | [ ] |
| idle | none — stand, blades drawn | chain-at-rest | mid | 2 | still burst | | [ ] |
| idle | none — stand, blades drawn | chain-at-rest | wide | 1 | still burst | | [ ] |
| combo3A | Square, Square, Square… (full combo3A→3B→… string) | chain-midswing | close | 3 | still burst | pause + frame-advance to mid-whip frames | [ ] |
| combo3A | Square, Square, Square… (full string) | chain-midswing | mid | 2 | still burst | | [ ] |
| combo3A | Square, Square, Square… (full string) | chain-midswing | wide | 1 | still burst | | [ ] |
| idle | none — stand, blades drawn | fire-closeup | close | 3 | still burst | blade flames; primary fire reference | [ ] |
| idle | none — stand, blades drawn | fire-closeup | mid | 2 | still burst | | [ ] |
| idle | none — stand, blades drawn | fire-closeup | wide | 1 | still burst | | [ ] |

### Trail stills (mid-swing, per framing)

| Shot ID | In-game inputs (PS2) | Subject | Framing | Save-state slot | Capture type | Notes | Done |
|---------|---------------------|---------|---------|-----------------|--------------|-------|------|
| combo3A | Square, Square, Square… (full string) | trail-midswing | close | 3 | still burst | trail arc span, width, edge hardness | [ ] |
| combo3A | Square, Square, Square… (full string) | trail-midswing | mid | 2 | still burst | | [ ] |
| combo3A | Square, Square, Square… (full string) | trail-midswing | wide | 1 | still burst | | [ ] |

### Cadence burst

| Shot ID | In-game inputs (PS2) | Subject | Framing | Save-state slot | Capture type | Notes | Done |
|---------|---------------------|---------|---------|-----------------|--------------|-------|------|
| idle | none — stand, blades drawn | flame-flicker | mid | 2 | cadence burst (>= 120 consecutive frames) | F8 every frame-advance step; 2s @ 60Hz | [ ] |

### Motion clips (one per move)

| Shot ID | In-game inputs (PS2) | Subject | Framing | Save-state slot | Capture type | Notes | Done |
|---------|---------------------|---------|---------|-----------------|--------------|-------|------|
| idle | none — ~10s chain drape at rest, blades drawn | chain drape + flame motion | mid | 2 | clip (~10s) | | [ ] |
| combo3A | Square, Square, Square… (full combo3A→3B→… string) | light chain string | mid | 2 | clip | | [ ] |
| launcher | Triangle (hold) | heavy launcher | mid | 2 | clip | | [ ] |
| plume | Square, Square, Triangle (Plume of Prometheus) | finisher FX | mid | 2 | clip | | [ ] |
| grab | Circle (grab/throw) | white-hot extended-chain state | mid | 2 | clip | chain extends fully — the hot-streak state | [ ] |

## PART B — Session protocol (the runbook)

Follow in order. Steps 1-4 are one-time session setup; step 5 loops over the matrix.

1. **Boot** (PowerShell):
   ```powershell
   & "C:\Program Files\PCSX2\pcsx2-qt.exe" -fastboot -- "C:\Projects\GameDesignSkills\GodOfWarChains\God of War (USA).iso"
   ```

2. **Progressive-scan experiment** (do once; record which route succeeded in the
   matrix notes column). The X + Triangle hold trigger is **inferred** [ASSUMED —
   standard Sony first-party trigger; unverified in-emulator, per 01-RESEARCH.md A1]:
   1. Hold **X + Triangle** on the mapped controller from after the PS2 logo through
      game boot.
   2. If the 480p progressive-scan prompt appears: accept it, then **immediately
      save-state** (slot 0) so the mode persists for every future session.
   3. If no prompt appears: quit and retry with `-slowboot` in place of `-fastboot`
      (fast boot can skip the boot-time trigger window), holding X + Triangle again.
   4. If still no prompt: stay 480i — set Deinterlacing to Auto for playing, and take
      **ALL** stills via **Pause -> Frame Advance -> F8** (a paused internal-res
      screenshot avoids field combing; inspect the first motion still at 800% zoom
      before trusting the workflow).

3. **Calibration screenshot FIRST.** Before any move capture, before any save-state
   scouting: press F8 on any in-game frame. This is always the session's first capture —
   it is the input to the capture-dimension calibration (`magick identify`, 512-vs-640
   width factor) recorded in SETTINGS.md. No measurement exists until this file does.

4. **Build the save-state library** (all strictly pre-upgrade — "Blades Level 1, no
   orbs spent"):
   - Slot 1 — wide arena (open deck, Kratos < 35% frame height)
   - Slot 2 — mid corridor (Kratos 35-60%)
   - Slot 3 — close spot (near wall / tight camera, Kratos >= 60%; if none exists,
     save the closest available and note the measured Kratos-height — **inferred** band)
   - Scout the Aegean Sea opening for these three spots; F1 saves to the current slot,
     F2 advances the slot number.

5. **Capture workflow, per matrix row:**
   1. Load the row's save state (F3 after selecting the slot).
   2. Perform the row's inputs.
   3. Stills: Pause at the target moment -> Frame Advance to the exact frame -> F8.
      For bursts, repeat frame-advance + F8 through the interesting frames.
   4. Clips: Tools -> Video Capture to start, perform the move, stop capture.
   5. Tick the row's done checkbox and note the capture ORDER (e.g. "3rd burst this
      session") plus any observations in the notes column.

6. **Cadence burst:** load slot 2, stand idle with drawn blades, Pause, then
   Frame Advance through **>= 120 consecutive frames** (2 seconds at 60Hz) pressing
   **F8 on every frame**. Do not skip frames — the flicker-cadence count needs an
   unbroken sequence.

7. **Hotkey cheat sheet** (bound during plan 01-02 setup; confirm before starting):

   | Key | Action |
   |-----|--------|
   | F1 | Save state (current slot) |
   | F3 | Load state (current slot) |
   | F2 | Next save-state slot |
   | F8 | Screenshot (internal-res PNG) |
   | Pause + Frame Advance | frame stepping for stills (bound during plan 01-02) |

8. **Frame naming convention** (stated once, applies to the whole library):
   `<clip-id>_f<frame#>_<subject>_<framing>.png`
   (e.g. `combo3A_f0142_chain-midswing_mid.png`).
   The human does **NOT** rename anything — Claude ingests and renames the raw
   screenshots from `Documents\PCSX2\snaps` afterward. The human's only bookkeeping
   is the capture ORDER notes in the matrix notes column, which is what makes the
   deterministic rename possible.

---
*Defined: 2026-07-24 — plan 01-01, from phase research (01-RESEARCH.md Patterns 2-5) + kratos-lab move set (tools/kratos-lab/README.md)*
