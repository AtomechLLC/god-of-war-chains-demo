# Phase 1: Reference Pipeline & Validation Criteria - Research

**Researched:** 2026-07-24
**Domain:** PCSX2 emulator capture pipeline (software renderer, native res), freeze-frame measurement methodology, acceptance-criteria authoring
**Confidence:** HIGH (environment verified locally; PCSX2 facilities verified against official sources) / MEDIUM (progressive-scan trigger specifics, exact 2.6.3 menu layout — empirical verification steps included)

> No CONTEXT.md exists for this phase — there are no locked user decisions beyond PROJECT.md/ROADMAP.md. Research scope follows the phase description and the project-level research (`.planning/research/PITFALLS.md` Pitfalls 8 & 9, which fully specify the capture-contamination rules this phase exists to enforce).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VAL-01 | An uncontaminated reference library exists — native-res, software-renderer (or verified-clean) captures of Level-1 blade combat with freeze-frames catalogued for link pitch, glow hues, flame shapes, trail geometry | PCSX2 2.6.3 verified installed with never-touched config (clean slate to document settings from scratch); NTSC-U disc + US BIOS verified present; screenshot/video capture facilities confirmed with exact settings paths; measurement toolchain (ImageMagick verified installed, ffmpeg install path defined); freeze-frame library structure and measurement methodology specified below |
</phase_requirements>

## Summary

Everything needed for this phase already exists on the machine or is one documented download away. PCSX2 **2.6.3** (Qt) is installed at `C:\Program Files\PCSX2\pcsx2-qt.exe` but has **never been configured** (`Documents\PCSX2\inis` is empty) — first-time setup is a real task in this phase, and it is an advantage: the settings document can be written from a true clean slate with nothing inherited. The disc image in the repo root is confirmed **NTSC-U (SCUS-973.99, "God of War (USA)")**, which resolves the NTSC-vs-PAL region question (STATE.md blocker for Phase 5) as a free byproduct: all rates are 60Hz-tick NTSC. A matching **US BIOS (scph39001.bin)** is already in `Documents\PCSX2\bios`.

The capture pipeline is: software renderer (bit-accurate GS blending — the "Blending Accuracy" setting only applies to hardware renderers), screenshots via F8 at "Internal Resolution (Aspect Uncorrected)" PNG for all pixel measurements, and built-in video capture (Tools → Video Capture) for motion clips — with one gotcha: **PCSX2 2.6.3 requires FFmpeg DLLs dropped into its folder for video capture** (only nightlies ≥ 2.7.207 bundle them). The official DLL package lives in PCSX2's own `pcsx2-windows-dependencies` repo. A second gotcha: internal-res screenshots of 512-wide games have been reported to emit **640×448** (GS CRTC display width) rather than 512×448 — the plan must include a one-time calibration step that records actual capture dimensions and the horizontal scale factor before any link-pitch numbers are written down.

The cleanest route to uncontaminated stills is the game's own **480p progressive scan mode** (GoW1 NTSC supports it; the game renders 512×448 internally in both 480i and 480p per the project's prior research), which eliminates deinterlacing questions entirely. There is **no official no-interlace patch** for SCUS-97399 (verified: the official pnach contains only Widescreen and Skip Cutscenes), so if progressive mode fails to trigger under emulation, fall back to documented 480i + deinterlacing with stills taken via pause + frame advance. Measurement tooling is ImageMagick (already installed) for pixel sampling/annotation and frame-advance screenshot bursts (or ffmpeg-extracted frames from clips) for flame-flicker cadence counting. The phase's written deliverables — settings doc, target definition, measurements, acceptance checklist — should live in a top-level `reference/` directory with media gitignored (captures are copyrighted game output; same policy as `extracted/`).

**Primary recommendation:** Configure PCSX2 2.6.3 software renderer from scratch and document every setting as you set it; capture progressive-scan native-res PNG stills as the pixel ground truth and high-bitrate 60fps clips as the motion ground truth; run a capture-dimension calibration before recording any measurement; write the four tracked documents (`SETTINGS.md`, `TARGET-DEFINITION.md`, `MEASUREMENTS.md`, `ACCEPTANCE.md`) into `reference/` for Phases 3, 4, 5, and 7 to consume.

## Project Constraints (from CLAUDE.md)

Directives that bind this phase:

- **Data-first:** where the game stores a value, use it; hand-tuning only for runtime-computed quantities, labeled inferred. For Phase 1 this means: measured values must cite the exact frame/coordinates they came from (evidence discipline), and color anchors must come from PNG stills, never video frames.
- **External verification tools are sanctioned:** CLAUDE.md's own verification-tools table lists PCSX2 ≥ 2.0 and side-by-side capture as project tooling — installing/configuring emulator capture tooling does not violate the "no external libraries" constraint, which applies to the kratos-lab *runtime* only.
- **Budget unconstrained:** favor real captures over reusing possibly-contaminated footage every time.
- **Target: Level 1 blades** — captures must be from early game (blades are Level 1 at game start) before any Orb upgrades are spent.
- **Never commit game data** (existing `.gitignore` policy for the ISO, `God of War (USA)/`, `ps2bios/`, `extracted/`): captured frames/clips are game output and must be gitignored the same way; only the measurement/criteria documents are tracked.
- **GSD workflow enforcement:** file changes happen through GSD commands (this research is part of `/gsd:plan-phase`).
- **What NOT to do** (CLAUDE.md anti-features, relevant here as validation-criteria content): no bloom/tonemap/sRGB expectations in the acceptance checklist — the target is clamped-LDR GS output ("GS output as captured, not CRT" per Pitfall 9).

## Architectural Responsibility Map

This phase has no runtime code tiers; the "architecture" is a capture-and-measurement pipeline. Tier ownership:

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ground-truth pixel generation | PCSX2 (software renderer, native res) | — | Only the emulator's software GS produces bit-faithful GS output; anything downstream can only degrade it |
| Still capture (pixel/color truth) | PCSX2 built-in screenshot (F8, PNG, internal-res) | — | Pre-window-scaling, pre-compositor; OS screenshots and OBS would add display scaling + colorspace conversion |
| Motion clip capture (timing truth) | PCSX2 built-in video capture (Tools → Video Capture) | ffmpeg CLI (re-encode/trim) | Captures at emulator level at 59.94fps; clips are motion/timing reference only, never color reference |
| Measurement (pitch, hue, cadence) | Offline tools: ImageMagick + frame-advance stepping | Python 3.14 (scripting, no new packages) | Measurements are one-time offline analysis, not kratos-lab runtime features |
| Reference library + criteria docs | Repo filesystem (`reference/`, tracked MD + gitignored media) | `.planning/` (phase bookkeeping) | Phases 3/4/5/7 consume these artifacts; must be discoverable at repo top level |
| Acceptance judgment (later) | Phase 7 harness in kratos-lab | — | Phase 1 only *writes* the checklist; no comparison code is built here |

**Explicitly NOT in this phase:** no kratos-lab code changes, no WebGL work, no comparison harness (Phase 7 builds it), no GS-register dumps (Phase 5's success criterion).

## Standard Stack

This is a tools-and-process phase — no runtime libraries, no npm/pip packages. All items are external tools per CLAUDE.md's verification-tools precedent.

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| PCSX2 (Qt) | 2.6.3.0 [VERIFIED: local install, `C:\Program Files\PCSX2\pcsx2-qt.exe` VersionInfo] | Software-renderer native-res gameplay, F8 screenshots, built-in video capture, save states, frame advance | The project's designated ground-truth tool (CLAUDE.md verification table); software renderer is the only GS-accurate blend path |
| US BIOS scph39001.bin | present [VERIFIED: `Documents\PCSX2\bios` listing] | Boot the NTSC-U disc under a region-matched BIOS | Region-matched BIOS avoids 50Hz system-setting side effects from the PAL BIOSes also present |
| ImageMagick | 7.1.1-Q16-HDRI [VERIFIED: `magick` on PATH] | Pixel sampling (`%[pixel:p{x,y}]`), crops, 800% nearest-neighbor zooms for annotation | Already installed; scriptable; no GUI editor color management to worry about |
| FFmpeg DLLs for PCSX2 | official release from `PCSX2/pcsx2-windows-dependencies`, tag `FFMPEG` [CITED: github.com/PCSX2/pcsx2-windows-dependencies/releases/tag/FFMPEG] | Enables Tools → Video Capture in 2.6.3 | PCSX2 2.6.3 does not bundle them; only nightlies ≥ 2.7.207 do [CITED: PCSX2 announcement, x.com/PCSX2/status/2040304799615520786] |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| ffmpeg CLI | via `winget install Gyan.FFmpeg` [ASSUMED — standard winget id; verify with `winget search ffmpeg` before install] | Extract PNG frame sequences from captured clips (`ffmpeg -i clip.mp4 frames/f%05d.png`) for cadence counting | Only if frame-advance + F8 screenshot bursts prove too tedious for cadence measurement; not required for the stills library |
| Python 3.14 | [VERIFIED: `C:\Python314\python` on PATH] | Optional measurement scripting (tally tables, checklist generation) | Stdlib only — do not pip-install imaging packages; ImageMagick covers pixel work |
| Node.js | [VERIFIED: on PATH] | Already runs kratos-lab's static server; not needed by this phase | — |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PCSX2 2.6.3 + official FFmpeg DLLs | Upgrade to PCSX2 nightly ≥ 2.7.207 (bundles ffmpeg) | Nightly churn vs. one DLL download; 2.6.3 stable is already installed and its GS software renderer is fully adequate — **stay on 2.6.3**; note the nightly path as fallback if the DLL drop fails |
| PCSX2 built-in video capture | OBS / screen recording | OBS captures the scaled window through the OS compositor — adds scaling, colorspace conversion, and window-size dependence; never acceptable for this project's ground truth |
| In-game 480p progressive mode | 480i + PCSX2 deinterlacing (Auto) | Progressive eliminates field artifacts at the source; deinterlacing is a processing step applied to the target (mild contamination). Use 480i+deinterlace only if the progressive prompt cannot be triggered, and document the deinterlace mode used |
| Existing YouTube footage (FMGwS-bvNiU) as reference | — | Demoted to motion/timing-only per success criterion 1 and Pitfall 8 (4:2:0 chroma subsampling, BT.601/709 ambiguity). It remains useful for move selection and comparing whip arcs — never for color/brightness |
| Frame-advance + F8 screenshots for cadence | ffmpeg frame extraction from clips | Screenshots are lossless and native-res but manual (one keypress per frame); ffmpeg extraction is bulk but samples the encoded (lossy) clip. For **cadence** (a timing count, not a color read) either is valid; for **color**, only screenshots |

**Installation (both are one-time, documented in SETTINGS.md):**
```powershell
# 1. FFmpeg DLLs for PCSX2 video capture (needs admin — C:\Program Files\PCSX2)
#    Download from the OFFICIAL PCSX2 dependencies repo only:
#    https://github.com/PCSX2/pcsx2-windows-dependencies/releases/tag/FFMPEG
#    Extract the DLLs next to pcsx2-qt.exe

# 2. Optional: ffmpeg CLI for frame extraction
winget search ffmpeg     # verify the Gyan.FFmpeg id exists first
winget install Gyan.FFmpeg
```

**Version verification performed this session:** PCSX2 2.6.3.0 read from the exe's VersionInfo; ImageMagick 7.1.1 from install path; Python 3.14 / Node from PATH probes; ffmpeg CLI confirmed absent.

## Package Legitimacy Audit

**This phase installs no registry packages** (no npm, PyPI, or crates installs — kratos-lab is dependency-free by project constraint, and all Phase-1 tooling is external binaries). slopcheck run: not applicable.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none — no registry packages installed in this phase)* | | | | | | |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Note for the planner: the two binary downloads (PCSX2 FFmpeg DLLs, ffmpeg CLI) must come only from the sources named above — the official PCSX2 dependencies GitHub release and winget's `Gyan.FFmpeg` (the ffmpeg.org-endorsed Windows builder). Any other DLL source is a supply-chain risk and must not be used.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PCSX2 (Qt) | all capture work | ✓ | 2.6.3.0 at `C:\Program Files\PCSX2\pcsx2-qt.exe` | — |
| PCSX2 first-run config | launching the game | ✗ (`Documents\PCSX2\inis` is **empty** — never configured) | — | First-time setup wizard is a Phase-1 task (BIOS select, controller, game dir); this is expected work, not a blocker |
| Game disc image | capture source | ✓ | `God of War (USA).iso` in repo root; serial SCUS-973.99 → **NTSC-U confirmed** [VERIFIED: `SCUS_973.99` in extracted disc dir] | — |
| PS2 BIOS | PCSX2 boot | ✓ | `Documents\PCSX2\bios\scph39001.bin` (US) + PAL/JP sets [VERIFIED: dir listing] | Use scph39001 (US); PAL BIOSes present but wrong region for this disc |
| FFmpeg DLLs in PCSX2 dir | Tools → Video Capture | ✗ (no av*.dll in PCSX2 install dir) | — | Official `pcsx2-windows-dependencies` FFMPEG release (admin copy); or upgrade to nightly ≥ 2.7.207 which bundles them |
| ffmpeg CLI | bulk frame extraction from clips | ✗ | — | `winget install Gyan.FFmpeg`; or skip entirely (frame-advance + F8 bursts substitute) |
| ImageMagick | pixel sampling, annotation | ✓ | 7.1.1-Q16-HDRI | — |
| Python 3 | optional scripting | ✓ | 3.14 | — |
| Node.js | kratos-lab server (not needed this phase) | ✓ | on PATH | — |
| Gamepad / input device | human plays combat for captures | unknown | — | PCSX2 default keyboard bindings work; a gamepad is strongly preferable for producing clean combat takes — **ask the user** |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** FFmpeg DLLs (official download), ffmpeg CLI (optional, winget), PCSX2 configuration (wizard is part of the work).

**Human-in-the-loop dependency:** this phase inherently requires a human to play GoW1 to the first combat and perform specific moves on cue. Plans must model capture sessions as human tasks (checkpoint-style), with Claude preparing exact settings, shot lists, and hotkey cheat sheets beforehand and doing all measurement/cataloguing after.

## Architecture Patterns

### Capture Pipeline (data flow)

```
God of War (USA).iso  ──►  PCSX2 2.6.3 (software renderer, 2–4 SW threads,
      NTSC-U 60Hz            no upscaling — SW is always native-res)
                                   │
                     ┌─────────────┼───────────────────┐
                     │             │                   │
              [480p progressive]  [F8 screenshot]   [Tools → Video Capture]
              in-game mode, or     PNG @ internal     59.94fps, high bitrate
              480i + documented    res, uncorrected   (FFmpeg DLLs required)
              deinterlace          aspect             │
                     │             │                   │
                     │      reference/frames/*.png   reference/captures/*.mp4
                     │      (pixel & color truth)    (motion & timing truth)
                     │             │                   │
                     │      ImageMagick sampling      frame stepping / ffmpeg
                     │      + crops + zooms           extraction (cadence only)
                     │             │                   │
                     │             ▼                   ▼
                     │      reference/MEASUREMENTS.md (link pitch, glow hex,
                     │      cadence, trail geometry — each value cites its
                     │      source frame + coordinates)
                     │             │
                     ▼             ▼
              reference/SETTINGS.md      reference/TARGET-DEFINITION.md
              (every PCSX2 setting,      ("GS output as captured, not CRT")
               calibration results)              │
                                                 ▼
                                    reference/ACCEPTANCE.md
                                    (the 80–90% checklist Phase 7 judges against)
```

### Recommended Project Structure

```
reference/
├── SETTINGS.md            # tracked — every PCSX2 setting + calibration results
├── TARGET-DEFINITION.md   # tracked — "GS output as captured, not CRT"; footage roles
├── MEASUREMENTS.md        # tracked — link pitch, glow hex samples, flicker cadence,
│                          #           trail geometry; every value cites frame + coords
├── ACCEPTANCE.md          # tracked — the Phase-7 80–90% checklist
├── shot-list.md           # tracked — moves/framings to capture, with in-game inputs
├── captures/              # GITIGNORED — video clips (copyrighted game output)
├── frames/                # GITIGNORED — PNG freeze-frames
└── annotated/             # GITIGNORED — zoomed/marked-up crops
```

Add to `.gitignore`:
```
reference/captures/
reference/frames/
reference/annotated/
```

Rationale: top-level `reference/` (not buried in `.planning/`) because Phases 3, 4, 5, and 7 all consume it (ROADMAP dependency notes); media gitignored under the same copyright policy the repo already applies to `extracted/`; docs tracked because they are the project's own measurements. Naming convention for frames: `frames/<clip-id>_f<frame#>_<subject>_<framing>.png` (e.g., `combo1-square_f0142_chain-midswing_mid.png`) so MEASUREMENTS.md citations are self-locating.

### Pattern 1: PCSX2 clean-capture configuration (the settings that matter)

**What:** The documented, reproducible PCSX2 configuration for uncontaminated captures.
**When to use:** Set once during first-run configuration; recorded verbatim in SETTINGS.md.

Settings (menu paths per PCSX2 2.x Qt; verify exact wording in 2.6.3 while documenting):

| Setting | Value | Why |
|---------|-------|-----|
| Graphics → Renderer | **Software** | Bit-accurate GS blending; hardware "Blending Accuracy" is approximate and irrelevant in SW mode [CITED: pcsx2.net docs + project PITFALLS.md P8] |
| Graphics → Rendering → Software Rendering Threads | 2–4 | Performance only; no visual effect |
| Graphics → Display → Aspect Ratio | Auto 4:3/3:2 (or 4:3) | The reference is 4:3; **do not** enable the widescreen patch |
| Graphics → Display → Deinterlacing | irrelevant if 480p progressive achieved; else document chosen mode (start with Auto) | Deinterlacing is display-side processing = contamination if baked into stills |
| Graphics → Screenshot/Capture → Screenshot Size | **Internal Resolution (Aspect Uncorrected)** | Raw framebuffer pixels for measurement [CITED: TCRF/Wizardry capture guidelines for PCSX2] |
| Graphics → Screenshot/Capture → Format | **PNG** | Lossless; color sampling depends on it |
| Graphics → Recording (video) | container MP4/MKV, H.264, **maximum bitrate the UI allows** | True lossless is not available in 2.6.3's capture UI [CITED: pcsx2 issue #11379]; high bitrate + "color from PNG only" policy compensates |
| Settings → Patches / Game Properties | **All patches OFF** (no widescreen; Skip Cutscenes optional and visual-safe) | Widescreen changes FOV/aspect — silently poisons geometry measurements [VERIFIED: official SCUS-97399 pnach contains a widescreen hack that alters game code] |
| Emulation → speed | 100% (NTSC 59.94Hz) | Timing truth |
| Hotkeys | bind **Frame Advance** + confirm Pause, Save State (F1), Load State (F3), Screenshot (F8) | Frame stepping is the stills workflow; Frame Advance exists in Qt hotkeys but confirm binding [CITED: PCSX2 PR #13015 hotkey organization] |

**Reproducible launch line** (document in SETTINGS.md):
```powershell
& "C:\Program Files\PCSX2\pcsx2-qt.exe" -fastboot -- "C:\Projects\GameDesignSkills\GodOfWarChains\God of War (USA).iso"
# with a saved state at the combat arena:
& "C:\Program Files\PCSX2\pcsx2-qt.exe" -statefile "<path>.p2s" -- "<iso>"
```
[CITED: pcsx2.net/docs/advanced/cli/ — `-fastboot`, `-statefile`, `--` separator]

### Pattern 2: Capture-dimension calibration (do this before ANY measurement)

**What:** Verify what pixel space the screenshots actually live in.
**Why:** PCSX2 internal-res screenshots of 512-wide games have been reported to emit **640×448** (GS CRTC display width, 512→640 = ×1.25 horizontal scaling); the issue was closed "not planned" so 2.6.3 may behave this way [CITED: github.com/PCSX2/pcsx2/issues/10922].
**How:**
1. Capture one F8 screenshot in-game.
2. `magick identify frames/calib.png` → record actual W×H in SETTINGS.md.
3. If 640×448: all horizontal pixel measurements convert to GS pixels by ×(512/640) = ×0.8; record the factor and apply it consistently. If 512×448: factor 1.0.
4. Either way, kratos-lab's Phase-2 native-res FBO (512×448) comparisons must use the same documented mapping.

### Pattern 3: Progressive-scan capture mode (preferred still-capture route)

**What:** GoW1 NTSC-U supports 480p progressive scan; the game renders 512×448 internally in both 480i and 480p (project research, psdevwiki "Games With Alternative Display Modes"). Progressive output removes every deinterlacing question from the stills pipeline.
**How:** Hold **X + Triangle** (mapped controller buttons) from after the PS2 logo through game boot; a progressive-scan prompt should appear [ASSUMED — standard Sony first-party trigger, corroborated by community lists (ConsoleMods wiki, Bordersdown NTSC-uk progressive list naming GoW1 US); exact GoW1 prompt behavior unverified in emulator]. Save a save state *after* accepting progressive mode so the mode persists for every future session.
**Fallback:** If no prompt appears under PCSX2 (fast boot can affect boot-time triggers — try `-slowboot`), stay 480i: set Deinterlacing to Auto for playing, and take all measurement stills via **Pause → Frame Advance → F8** (a paused internal-res screenshot of GoW's full-height framebuffer avoids field-comb artifacts in practice; verify on the first motion still). There is **no official no-interlace pnach for SCUS-97399** [VERIFIED: fetched `patches/SCUS-97399_D6385328.pnach` from PCSX2/pcsx2_patches — contains only Widescreen 16:9 and Skip Cutscenes sections].

### Pattern 4: Getting to Level-1 blade combat quickly

**What:** A repeatable path to capture-ready combat.
**How:**
- New Game → the Aegean Sea opening puts Kratos in blade combat vs. undead legionnaires within the first minutes; blades are Level 1 at game start (no Orb upgrades spent = stage1 tier guaranteed) [ASSUMED — well-known game structure; trivially self-verifying at capture time].
- No memory card needed — save states replace game saves for this workflow (F1/F3, multiple slots via F2).
- The official pnach's `[Skip Cutscenes]` patch (skip with any action button) can shorten the runway; it patches cutscene logic only, not rendering — safe for captures, but document if enabled.
- Create a **save-state library**: one state at combat start (wide arena), one in a tighter corridor (mid framing), one near a wall/close camera moment (close framing). These states are the repeatable entry points for every later capture session (and for Phase 5's GS-dump session).
- Shot list should mirror kratos-lab's implemented move set (from `tools/kratos-lab/README.md`): Square light chain (combo3A→3B→…), Triangle launcher, Plume of Prometheus (□□△), Circle grab/throw (chain extends — the white-hot chain state), plus ~10s of idle standing (chain drape at rest). Same inputs in-game and in kratos-lab → directly comparable clips for Phase 7.

### Pattern 5: Measurement methodology (per success-criterion metric)

**Link pitch / on-screen link counts** (consumed by Phase 3):
- From a paused mid-swing still and an at-rest still, at each of the three framings: count visible links along one chain and measure the pixel distance between N link centers with ImageMagick crops/zooms; pitch = distance/(N−1), converted to GS pixels via the calibration factor.
- Record: links visible per chain (at rest and extended), pitch in GS px, chain on-screen width in GS px, alongside the known texture ground truth (32 px/link, 16 links/tile in the 512×32 `chainlink` strip) so Phase 3 can derive the ribbon's UV tiling rate.

**Glow hue sampling** (consumed by Phases 3/5/7):
- Sample ONLY from PNG stills (never video frames — 4:2:0 chroma smears exactly these saturated edges, Pitfall 8).
- `magick frames/<f>.png -format "%[pixel:p{X,Y}]" info:` at annotated coordinates; record hex sRGB values at: hot core of the chain glow streak, glow falloff mid-point, dark link at rest, flame core, flame tip, trail edge.
- Cross-anchor against the decoded `chainglow` ramp (#FEE500 → #FCBE00 → #E44C00 → #360600 from project research): captured hues should land on/near this ramp; a systematic offset would indicate a capture or decode problem — investigate before recording.

**Flame flicker cadence** (consumed by Phases 6/7):
- Pause during idle-with-drawn-blades; Frame Advance through ≥120 frames (2 seconds at 60Hz), noting frame numbers where the flame pulse peaks (or F8 every frame for a burst and review offline; or ffmpeg-extract from a clip).
- Report cycles/second = 60 / mean-frames-per-cycle, over ≥5 cycles, with the frame numbers listed as evidence. Do the same for any visible flipbook frame-advance rate.

**Trail geometry** (consumed by Phases 6/7):
- Mid-swing stills at three framings: trail arc span (as fraction of screen width), trail width vs. blade length, edge hardness (hard sprite edge expected — no halation), and fade duration measured by frame-advancing from swing end until the trail is gone (report in frames @60Hz).

**Three framings — define them measurably:** GoW's camera is authored/fixed, so framings come from arena position. Define by Kratos's on-screen height: **close** ≥ 60% of frame height, **mid** 35–60%, **wide** < 35%. Record which save state/arena produces each. This gives Phase 7 an objective way to match kratos-lab's camera to each reference framing.

### Pattern 6: Acceptance checklist structure (ACCEPTANCE.md)

The checklist Phase 7 judges against. Structure it as binary checks grouped per element, each citing its MEASUREMENTS.md value, plus the global renderer checks from project research:

- **Chain links:** on-screen link count within ±10% of measured; alpha gaps visible; links read dark (near-black warm metal) at rest at all three framings.
- **Chain glow:** hue at hot core within the measured hex range; glow confined to asset-driven streak (no screen-space halo); dark-at-rest / hot-in-attack state behavior matches captures.
- **Chain motion:** drape shape at rest ≈ capture overlay; whip C-curvature present mid-swing; settle without popping (A/B at 60fps).
- **Fire:** flicker cadence within ±0.5 cycles/s of measured; flame silhouette hard-edged; hugs blade in every combat frame.
- **Trails:** fade duration within ±20% of measured frames; stepped extrusion (no spline smoothness); crimson tint + white-hot core reads as in stills.
- **Renderer invariants (from PITFALLS "Looks Done But Isn't"):** magenta-background test passes; particle density identical at 60Hz vs 144Hz display; native-res toggle active during all judgments; additive stacks saturate to flat white.
- **Global:** side-by-side at three framings, same moves, judged 80–90% in motion; YouTube footage consulted for motion only.

Each item gets: metric, measured target value (link to MEASUREMENTS.md), tolerance, and test method (A/B flicker, overlay, or count). Phase 1's exit is this document existing with every field filled from real measurements — no TBDs.

### Anti-Patterns to Avoid

- **Hardware renderer for anything reference-related:** GoW has known upscaling artifacts (vertical lines, interlace-offset blur) and approximate blending — the exact contamination this phase exists to eliminate (PITFALLS P8).
- **OS-level screenshots / OBS window capture:** samples the scaled, composited window, not the GS framebuffer.
- **Widescreen patch enabled during capture:** alters FOV and aspect; geometry measurements become non-comparable to kratos-lab's 4:3-equivalent view.
- **Color sampling from video frames:** 4:2:0 chroma subsampling smears saturated red/orange edges — PNG stills only.
- **Writing measurements without frame citations:** every number in MEASUREMENTS.md must name its source frame file and coordinates, or downstream phases can't audit disagreements between decode and footage.
- **Building any comparison tooling now:** the side-by-side harness is Phase 7 (VAL-02); Phase 1 delivers artifacts and criteria only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Video encoding/decoding | any custom frame dumper | PCSX2 built-in capture + ffmpeg CLI | Codec correctness, A/V sync, 59.94fps handling are solved problems |
| Deinterlacing | any post-hoc deinterlace script | In-game 480p progressive mode (avoid the problem at the source); else PCSX2's deinterlacer, documented | Post-hoc deinterlacing IS contamination; the fix is capture-side |
| Pixel sampling / annotation | custom canvas/Python imaging code | ImageMagick (`identify`, `-crop`, `-format "%[pixel:...]"`, `-scale N%` point zooms) | Installed, scriptable, no color management surprises |
| Emulator input automation | scripted TAS-style input playback | Save-state library + human capture sessions | PCSX2 mainline has no supported input-movie workflow; states + a shot list are cheaper and sufficient |
| Reference storage/versioning | a database or asset manager | Flat files + tracked markdown + gitignore rules | Five documents and a few dozen PNGs; git already does this |

**Key insight:** every capture-side transformation you write yourself is a new contamination vector. The discipline of this phase is choosing settings that make processing unnecessary, then documenting them.

## Common Pitfalls

### Pitfall 1: Measuring before calibrating capture dimensions
**What goes wrong:** Link pitch and particle sizes recorded in 640-wide screenshot pixels get treated as GS pixels; every downstream size check is silently 25% off.
**Why it happens:** PCSX2's "internal resolution" screenshots may emit CRTC display width (640) for 512-wide games; the GitHub issue was closed not-planned [CITED: pcsx2#10922].
**How to avoid:** Calibration step (Pattern 2) is the first capture task; the scale factor is written into SETTINGS.md and cited by every horizontal measurement.
**Warning signs:** measured link pitch that isn't a clean multiple relative to the 32px/link texture ground truth; chain width numbers that disagree between screenshot and (later) GS dump.

### Pitfall 2: Interlace artifacts baked into "ground truth" stills
**What goes wrong:** 480i stills taken during fast motion show field combing; annotated as "trail geometry," the combing becomes a fake target.
**Why it happens:** Two fields = two moments in time in one frame.
**How to avoid:** Progressive mode first (Pattern 3); else pause + frame advance before every still and inspect the first motion still at 800% zoom for combing before trusting the workflow.
**Warning signs:** horizontal double-edges on the blade or chain in stills; trail edges that look serrated.

### Pitfall 3: PCSX2 config drift between sessions
**What goes wrong:** A later capture session runs with different settings (e.g., someone flipped to hardware renderer to play faster), and new frames silently disagree with the library.
**Why it happens:** Emulator settings are global mutable state; `inis/PCSX2.ini` changes with every UI toggle.
**How to avoid:** SETTINGS.md documents every relevant setting; after configuration, copy `Documents\PCSX2\inis\PCSX2.ini` (and the game-specific ini if created) into `reference/` as the authoritative snapshot; start each capture session by diffing current ini against the snapshot.
**Warning signs:** new captures differing in dimensions, brightness, or smoothness from library frames of the same scene.

### Pitfall 4: Letting the YouTube reference creep back into color decisions
**What goes wrong:** The convenient existing footage gets cited for a hue judgment; Pitfall 8 (project research) re-opens.
**How to avoid:** TARGET-DEFINITION.md explicitly assigns roles: PCSX2 PNG stills = color/brightness/geometry truth; PCSX2 clips = motion/timing truth; YouTube = move-selection and motion cross-check only. ACCEPTANCE.md items each name which source class they judge against.
**Warning signs:** any MEASUREMENTS.md or ACCEPTANCE.md entry citing a YouTube timestamp for a color value.

### Pitfall 5: Capturing with upgraded blades
**What goes wrong:** Spending red orbs upgrades the Blades (stage change) — glow/trail tier no longer matches the Level-1 target assets (stage1 textures).
**How to avoid:** Capture everything in the opening sequence before any upgrade is purchased; note "Blades Level 1, no orbs spent" in each capture's metadata; keep the save-state library strictly pre-upgrade.
**Warning signs:** captures from later save states; visibly different trail/glow character between library frames.

### Pitfall 6: Treating the settings doc as an afterthought
**What goes wrong:** Captures exist but settings weren't recorded as they were set; six months later nobody can reproduce or extend the library (success criterion 1 explicitly requires "documented settings").
**How to avoid:** Write SETTINGS.md *during* first-run configuration, not after; the ini snapshot (Pitfall 3) is the machine-checkable backup.

## Code Examples

Verified working command patterns for the measurement workflow (Windows, Git Bash / PowerShell):

### Pixel sampling and annotation (ImageMagick 7, installed)
```bash
# Confirm capture dimensions (calibration step)
magick identify reference/frames/calib.png

# Sample a pixel's hex color at (x,y)
magick reference/frames/combo1_f0142_chain-midswing_mid.png \
  -format "%[hex:p{231,187}]" info:

# 800% nearest-neighbor zoom of a crop for link-pitch counting / annotation
magick reference/frames/rest_f0300_chain-drape_close.png \
  -crop 128x64+200+150 +repage -scale 800% reference/annotated/drape-links-x8.png
```

### Frame extraction from a captured clip (ffmpeg CLI, if installed)
```bash
# Extract all frames as PNG (cadence counting; NOT for color sampling)
ffmpeg -i reference/captures/idle-flames.mp4 reference/frames/idle/f%05d.png
# Extract a 2-second window starting at 0:12
ffmpeg -ss 12 -t 2 -i reference/captures/idle-flames.mp4 reference/frames/idle/f%05d.png
```

### Reproducible PCSX2 launch (documented in SETTINGS.md)
```powershell
& "C:\Program Files\PCSX2\pcsx2-qt.exe" -fastboot -- "C:\Projects\GameDesignSkills\GodOfWarChains\God of War (USA).iso"
# Boot a capture session directly into a saved combat state:
& "C:\Program Files\PCSX2\pcsx2-qt.exe" -statefile "C:\...\combat-wide.p2s" -- "...\God of War (USA).iso"
```
[CITED: pcsx2.net/docs/advanced/cli/]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| wxWidgets PCSX2 1.6, plugins, PCSX2_keys.ini hotkey file | Qt PCSX2 2.x, integrated settings + Hotkeys tab | PCSX2 2.0 (2024) | Old wiki hotkey/config guidance is partially stale; document what 2.6.3 actually shows |
| Hunt for FFmpeg DLLs to enable video capture | Bundled ffmpeg in nightlies | PCSX2 2.7.207 (2026) [CITED: official PCSX2 announcement] | Installed 2.6.3 stable still needs the DLL drop from the official deps repo |
| "Blending Accuracy: maximal" advice for accurate captures | Software renderer = always fully accurate; blending accuracy is a hardware-renderer setting | — | Simplifies SETTINGS.md: renderer=Software is the whole accuracy story |
| Deinterlacing-mode fiddling for clean stills | No-interlace patches DB, or in-game progressive modes | 2021+ | GoW1 NTSC-U has **no official no-interlace patch** — the in-game 480p mode is the clean route |

**Deprecated/outdated:** `PCSX2_keys.ini` customization (wx-era); plugin-based GS configuration; any capture guidance predating PCSX2 2.0.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | GoW1 NTSC-U's 480p progressive mode triggers by holding X+Triangle after the PS2 logo, and works under PCSX2 | Pattern 3 | LOW — fallback (480i + pause/frame-advance stills, documented deinterlace for clips) is fully specified; costs one experiment |
| A2 | Level-1 blade combat is reachable within minutes of New Game (Aegean Sea opening), blades stage-1 until orbs spent | Pattern 4 | Negligible — self-verifying on first play session |
| A3 | winget package id `Gyan.FFmpeg` provides ffmpeg CLI | Standard Stack | LOW — `winget search ffmpeg` before install; ffmpeg is optional anyway |
| A4 | PCSX2 2.6.3's Graphics settings expose Screenshot Size = "Internal Resolution (Aspect Uncorrected)" + PNG format (2.x-line facility; exact menu naming in 2.6.3 unconfirmed) | Pattern 1 | LOW — verified for the 2.x line via community capture guidelines; documenting actual menu text is itself a Phase-1 task |
| A5 | Paused internal-res screenshots in 480i mode capture GoW's full-height framebuffer without field combing | Pattern 3 fallback | MEDIUM — must be empirically checked at 800% zoom on the first motion still; if wrong, progressive mode becomes mandatory |
| A6 | PCSX2 2.6.3 video capture records at the configured recording resolution independent of window size | Architecture diagram | LOW — clips are motion/timing truth only; resolution matters less there; verify in Recording settings tab |
| A7 | Frame Advance hotkey exists (possibly unbound by default) in 2.6.3's Hotkeys settings | Pattern 1 | LOW — grouped with Toggle Pause per upstream PR; binding it is a setup step |

## Open Questions (RESOLVED)

1. **Does the 480p prompt appear under PCSX2 fast boot?**
   - What we know: the trigger is game-level (works on hardware); `-slowboot` exists if boot-flow timing matters.
   - What's unclear: emulated boot timing vs. the hold window; whether GoW1's prompt needs the full boot sequence.
   - Recommendation: try fastboot-with-hold first, then slowboot; budget one 15-minute experiment; fall back per Pattern 3. Record the outcome in SETTINGS.md either way.
   - **RESOLVED:** Adopted the Pattern-3 experiment-plus-fallback: try fastboot-with-hold, then `-slowboot`, else the 480i fallback (paused frame-advance stills; documented deinterlace for clips). The outcome is recorded in SETTINGS.md (plans 01-02/01-03).

2. **What exact framings does the opening level offer?**
   - What we know: GoW's camera is authored per-location; the Aegean Sea sequence has deck (wide), interior corridors (mid/close).
   - What's unclear: whether a true close framing (Kratos ≥60% frame height) with active combat exists early.
   - Recommendation: during the first capture session, scout and save-state the best three spots; if a strict close framing doesn't exist in combat, relax the band and record actual measured Kratos-heights as the definition.
   - **RESOLVED:** Adopted scout-and-save-state during the first capture session; if no strict close framing exists in combat, the band is relaxed and the actual measured Kratos-heights are recorded as the definition, labeled **inferred** (plan 01-03 Task 2 + the shot-list framing-relaxation rule).

3. **Video capture color fidelity at max UI bitrate** — H.264 at the capture UI's max bitrate should be visually clean for motion judgment, but the "color from PNG only" rule makes this a non-blocking question. No action needed beyond keeping the rule.
   - **RESOLVED:** Non-blocking — the colors-from-PNG-stills-only rule (TARGET-DEFINITION.md, enforced in plan 01-04 Task 2) makes clip color fidelity irrelevant to measurements; no further action.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none — this is a capture/documentation phase producing artifacts, not code (kratos-lab has no test framework and this phase adds no runtime code) |
| Config file | none — see Wave 0 |
| Quick run command | `bash -c 'for f in reference/SETTINGS.md reference/TARGET-DEFINITION.md reference/MEASUREMENTS.md reference/ACCEPTANCE.md; do test -f "$f" && echo "OK $f" || echo "MISSING $f"; done'` |
| Full suite command | same artifact check + human review of measurement citations |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VAL-01 | Documented PCSX2 capture setup exists | artifact check | `test -f reference/SETTINGS.md && grep -qi "renderer" reference/SETTINGS.md` | ❌ Wave 0 (created by this phase) |
| VAL-01 | Freeze-frame library catalogued (rest / mid-swing / fire close-ups × three framings) | artifact check + manual | `ls reference/frames/*.png \| wc -l` (≥ shot-list count) + human spot-check against shot-list.md | ❌ created by this phase |
| VAL-01 | Written target definition + measured link counts + flicker cadence | artifact check + manual | `grep -q "cycles/s" reference/MEASUREMENTS.md && grep -qi "not CRT" reference/TARGET-DEFINITION.md` | ❌ created by this phase |
| VAL-01 | 80–90% acceptance checklist written for Phase 7 | artifact + manual (no TBD fields) | `test -f reference/ACCEPTANCE.md && ! grep -q "TBD" reference/ACCEPTANCE.md` | ❌ created by this phase |

Capture quality checks (calibration factor recorded, no combing at 800% zoom, colors sampled from PNG only) are **manual-only** — they are visual judgments; justification: no code can decide "combing visible" reliably, and the phase's whole point is human-verified ground truth.

### Sampling Rate
- **Per task commit:** artifact-existence quick check (above)
- **Per wave merge:** full artifact check + citation spot-check (every MEASUREMENTS.md value names a frame file that exists)
- **Phase gate:** all four tracked documents complete, no TBDs; freeze-frame library covers the full shot list; calibration factor recorded

### Wave 0 Gaps
- [ ] `reference/` directory + `.gitignore` entries for `reference/captures/`, `reference/frames/`, `reference/annotated/`
- [ ] `reference/shot-list.md` — the capture plan (moves × framings), authored before the first capture session
- No test-framework install needed — none applies to this phase.

## Security Domain

`security_enforcement` is not set in config (treated as enabled), but this phase is offline local tooling with no code, no network services, no auth, and no user input surfaces. ASVS applicability:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no (no code written this phase) | — |
| V6 Cryptography | no | — |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious "FFmpeg DLL pack" from a random site dropped into PCSX2's folder (DLL loading = code execution) | Tampering/Elevation | Download DLLs ONLY from the official `PCSX2/pcsx2-windows-dependencies` GitHub release; ffmpeg CLI only via winget `Gyan.FFmpeg` |
| Committing copyrighted game captures to the public repo (GitHub Pages is enabled on this repo) | Information Disclosure (legal) | Gitignore all `reference/` media before the first capture lands; tracked files are project-authored text only |

## Sources

### Primary (HIGH confidence)
- Local environment probes this session — PCSX2 2.6.3.0 exe VersionInfo; empty `Documents\PCSX2\inis`; BIOS inventory; `SCUS_973.99` disc serial; ImageMagick/Node/Python presence; ffmpeg absence; repo `.gitignore` policy
- [PCSX2/pcsx2_patches `SCUS-97399_D6385328.pnach`](https://github.com/PCSX2/pcsx2_patches) — fetched raw: Widescreen 16:9 + Skip Cutscenes only; **no no-interlace patch** for GoW1 NTSC-U
- [PCSX2 official CLI docs](https://pcsx2.net/docs/advanced/cli/) — `-fastboot`, `-batch`, `-statefile`, `--` separator
- [PCSX2/pcsx2-windows-dependencies FFMPEG release](https://github.com/PCSX2/pcsx2-windows-dependencies/releases/tag/FFMPEG) — official DLL source for 2.6.3 video capture
- Project research `.planning/research/PITFALLS.md` (P8/P9 capture methodology), `FEATURES.md` (decoded texture ground truths: chainlink 512×32 @32px/link, chainglow ramp hex values), `SUMMARY.md` — this phase's authoritative internal spec

### Secondary (MEDIUM confidence)
- [PCSX2 announcement — ffmpeg bundled from v2.7.207](https://x.com/PCSX2/status/2040304799615520786) — confirms 2.6.3 still needs the DLL drop
- [pcsx2 issue #10922](https://github.com/PCSX2/pcsx2/issues/10922) — 512-wide games screenshot at 640×448 at internal res; closed not-planned → calibration step required
- [pcsx2 issue #11379](https://github.com/PCSX2/pcsx2/issues/11379) — no lossless H.264 in capture UI → high-bitrate + PNG-for-color policy
- [TCRF](https://tcrf.net/Help:Contents/Taking_Screenshots) / [Wizardry wiki](https://wizardry.wiki.gg/wiki/Help:Screenshot_guidelines) capture guidelines — software renderer + "Internal Resolution (Aspect Uncorrected)" screenshot workflow for PCSX2 2.x
- [PCSX2 hotkeys PR #13015](https://github.com/PCSX2/pcsx2/pull/13015) — Frame Advance exists, grouped with Toggle Pause in Qt hotkeys
- [PCSX2 Wiki — God of War](https://wiki.pcsx2.net/God_of_War) (cited via project research; page 403'd this session) — upscaling artifacts, software-renderer fix, progressive support noted
- [psdevwiki — Games With Alternative Display Modes](https://www.psdevwiki.com/ps2/Games_With_Alternative_Display_Modes) (cited via project research) — GoW renders 512×448 in both 480i/480p

### Tertiary (LOW confidence)
- Community progressive-scan lists ([ConsoleMods wiki](https://consolemods.org/wiki/PS2:Games_with_Alternative_Display_Modes), Bordersdown NTSC-uk forum, Electron Shepherd list) — GoW1 US supports 480p; X+Triangle hold method — flagged A1, verified empirically at capture time
- GoW1 opening-sequence structure (training knowledge) — flagged A2, self-verifying

## Metadata

**Confidence breakdown:**
- Environment & tooling availability: HIGH — probed directly this session
- PCSX2 capture facilities & settings: HIGH for the 2.x line facilities (official sources), MEDIUM for exact 2.6.3 menu wording (documenting it is a phase task)
- Progressive-scan trigger: MEDIUM — multiple community corroborations, unverified in-emulator; low-cost fallback specified
- Measurement methodology: HIGH — pure application of installed tools + project PITFALLS.md discipline
- Library/checklist structure: HIGH — derived from downstream phases' documented consumption needs

**Research date:** 2026-07-24
**Valid until:** ~2026-10-24 (stable domain; PCSX2 2.6.3 is pinned locally — only revisit if the emulator is upgraded)
