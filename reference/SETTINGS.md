# PCSX2 capture settings — Chains of Chaos reference pipeline

Every capture here was produced by PCSX2 2.6.3.0 (`C:\Program Files\PCSX2\pcsx2-qt.exe`),
software renderer, from `God of War (USA).iso` (SCUS-973.99, NTSC-U — 60Hz tick units for
all later rate interpretation), BIOS scph39001.bin.

Status: **CONFIRMED.** The table below was documented from a true clean slate
(`Documents\PCSX2\inis` was empty — PCSX2 had never been configured on this machine),
applied in the one-time first-run GUI configuration (plan 01-02 Task 2, 2026-07-24), and
machine-verified against the live `Documents\PCSX2\inis\PCSX2.ini` (plan 01-02 Task 3).
The verbatim post-configuration ini is snapshotted at `reference/PCSX2.ini`. Where 2.6.3's
actual menu wording differed from the researched row, the row shows the actual wording
with the researched name in parentheses.

## Settings

| Setting | Value | Why |
|---------|-------|-----|
| Graphics → "Graphics API:" (2.6.3 wording; researched as "Renderer") | **Software Renderer** — ini: `Renderer = 13` | Bit-accurate GS blending; the "Blending Accuracy" option is approximate and applies only to hardware renderers [VERIFIED: pcsx2.net docs + project PITFALLS.md P8] |
| Graphics → Rendering → "Software Rendering Threads:" | **3 threads** (default; within the researched 2–4 target) — ini: `extrathreads = 3` | Performance only; no visual effect |
| Graphics → Display → Aspect Ratio | **Auto 4:3/3:2** — ini: `AspectRatio = Auto 4:3/3:2`, `FMVAspectRatioSwitch = Off` | The reference is 4:3; do **NOT** enable the widescreen patch — it alters FOV/aspect and poisons geometry measurements |
| Graphics → Display → Deinterlacing | **Automatic** (default) — ini: `deinterlace_mode = 0`; final mode per progressive-scan outcome, recorded by capture session (plan 01-03) | Irrelevant if in-game 480p progressive is achieved; otherwise the chosen mode must be documented (deinterlacing is display-side processing = contamination if baked into stills) |
| Graphics → Media Capture → "Screenshot Capture Setup" → "Resolution:" (2.6.3 wording; researched as Screenshot/Capture → Screenshot Size) | **Internal Resolution (No Aspect Correction)** — ini: `ScreenshotSize = 2` | Raw framebuffer pixels for measurement [CITED: TCRF / Wizardry-wiki PCSX2 capture guidelines] |
| Graphics → Media Capture → "Screenshot Capture Setup" → Format (same section) | **PNG** — ini: `ScreenshotFormat = 0` | Lossless; all color sampling depends on it |
| Video capture — **System → Video Capture** (NOT "Tools → Video Capture"; 2.6.3's Tools menu does not contain it — verified against pcsx2-qt `MainWindow.ui` at tag v2.6.3) | **MP4 container / H.264 at 99999 kbps — the UI maximum** (probed: entering 999999999 into the bitrate spinbox clamps to 99999) — ini: `CaptureContainer = mp4`, `VideoCaptureBitrate = 99999`. End-to-end verified 2026-07-24: a ~10 s test capture encoded to a 25.5 MB MP4 with no FFmpeg error | True lossless is not available in 2.6.3's capture UI [CITED: pcsx2 issue #11379]; high bitrate + the "color from PNG stills only" policy compensates |
| Settings → Patches / Game Properties | **ALL patches OFF** — SCUS-97399 (CRC `D6385328`) game-properties Patches page lists exactly *Widescreen 16:9 (nemesis2000)* and *Skip Cutscenes (Ezedequias)*, BOTH with Enabled **unchecked**; Cheats page: Enable Cheats unchecked, cheat list empty. Skip Cutscenes remains available (visual-safe) but is NOT enabled — ini: `EnableCheats = false`, `EnableWideScreenPatches = false`, `EnableNoInterlacingPatches = false` | The official SCUS-97399 pnach's widescreen hack alters game code/FOV [VERIFIED: official pnach contains only Widescreen 16:9 + Skip Cutscenes] |
| Settings → Emulation → "Speed Control → Normal Speed:" (2.6.3 wording) | **100% [60 FPS (NTSC) / 50 FPS (PAL)]** — ini: `NominalScalar = 1`, `FramerateNTSC = 59.94` | Timing truth |
| Settings → Hotkeys | Frame Advance = **F7** (newly bound — free key adjacent to F8 for the advance-then-screenshot stills workflow) + Save State **F1** / Load State **F3** / Screenshot **F8** confirmed — ini `[Hotkeys]` section | Frame stepping is the stills workflow; Frame Advance exists in Qt hotkeys but is unbound by default [CITED: PCSX2 PR #13015] |

Boot sanity check (2026-07-24): SCUS-97399 booted to difficulty-select; PCSX2 status bar
read `Software | 512x448 | FPS: 60 | VPS: 60 | Speed: 100%`.

## Observed ini keys

Verbatim key=value lines from the live `Documents\PCSX2\inis\PCSX2.ini` at snapshot time
(named anchors for the session-start drift diff):

```ini
[EmuCore/GS]
Renderer = 13
ScreenshotSize = 2
ScreenshotFormat = 0
AspectRatio = Auto 4:3/3:2
FMVAspectRatioSwitch = Off
deinterlace_mode = 0
extrathreads = 3
CaptureContainer = mp4
VideoCaptureCodec = 
VideoCaptureBitrate = 99999
VideoCaptureWidth = 640
VideoCaptureHeight = 480

[EmuCore]
EnableCheats = false
EnableWideScreenPatches = false
EnableNoInterlacingPatches = false

[Hotkeys]
Screenshot = Keyboard/F8
LoadStateFromSlot = Keyboard/F3
SaveStateToSlot = Keyboard/F1
FrameAdvance = Keyboard/F7

[Filenames]
BIOS = scph39001.bin

[Framerate]
NominalScalar = 1
```

Enum decode (from the GUI labels the values were set through):

- `Renderer = 13` → **Software Renderer**
- `ScreenshotSize = 2` → **Internal Resolution (No Aspect Correction)**
- `ScreenshotFormat = 0` → **PNG**
- `deinterlace_mode = 0` → **Automatic** (default)
- `VideoCaptureCodec` empty → default codec for the mp4 container (**H.264**); the
  99999 kbps test encode confirmed the encoder works
- `VideoCaptureWidth/Height = 640/480` → capture video is display-resolution motion
  reference only; all color/geometry measurement uses the PNG stills (internal-res,
  aspect-uncorrected) per the row above

Note: `[EmuCore] EnablePatches = true` also appears in the ini. That key is PCSX2's
global *compatibility* patch toggle (GameIndex.yaml game fixes required for titles to
run) — it is distinct from the visual pnach patches (widescreen / no-interlacing /
cheats), which are all off as quoted above and unchecked per-game.

## Reproducible launch lines

```powershell
& "C:\Program Files\PCSX2\pcsx2-qt.exe" -fastboot -- "C:\Projects\GameDesignSkills\GodOfWarChains\God of War (USA).iso"
# Boot a capture session directly into a saved combat state:
& "C:\Program Files\PCSX2\pcsx2-qt.exe" -statefile "C:\...\combat-wide.p2s" -- "C:\Projects\GameDesignSkills\GodOfWarChains\God of War (USA).iso"
```

[CITED: pcsx2.net/docs/advanced/cli/ — `-fastboot`, `-statefile`, `--` separator]

## Calibration

One-time capture-dimension calibration, performed before **any** measurement is written
down (PCSX2 internal-res screenshots of 512-wide games have been reported to emit
640×448 — GS CRTC display width — per pcsx2 issue #10922):

- **Actual screenshot dimensions** (`magick identify` output of the first in-game F8
  screenshot): recorded by capture session (plan 01-03)
- **Horizontal scale factor** (512-wide GS framebuffer: 640-wide screenshots ⇒ ×0.8 to
  convert screenshot px → GS px; 512-wide screenshots ⇒ ×1.0): recorded by capture
  session (plan 01-03)

Observed hint (2026-07-24, NOT the calibration measurement): the PCSX2 status bar showed
internal resolution `512x448` while the game ran — consistent with the 512-wide GS
framebuffer expectation. The authoritative numbers above still come from `magick identify`
on an actual F8 screenshot in plan 01-03.

## FFmpeg DLL provenance

PCSX2 2.6.3 does not bundle FFmpeg; System → Video Capture requires the FFmpeg DLLs placed
next to `pcsx2-qt.exe` (only nightlies ≥ 2.7.207 bundle them). **Sole acceptable source**
— DLL loading is code execution inside PCSX2's process, so no other DLL source is ever
acceptable:

> https://github.com/PCSX2/pcsx2-windows-dependencies/releases/tag/FFMPEG
> (official PCSX2 `pcsx2-windows-dependencies` GitHub release, tag `FFMPEG`)

**Asset downloaded:** `ffmpeglibs-8.0.7z` — 35,230,134 bytes (size matches the GitHub API
asset record exactly).
**Archive SHA-256:** `c4f8a5093997445fbb08c694be289b36eed660e46e02078d9371a2481453ae5a`

**Why the 8.0 pack** (the release also offers 6.0.7 and 7.0.2): PCSX2 v2.6.3 is compiled
against libavcodec major **62** [VERIFIED: `#define LIBAVCODEC_VERSION_MAJOR 62` in
`3rdparty/ffmpeg/include/libavcodec/version_major.h` at tag `v2.6.3` of PCSX2/pcsx2].
FFmpeg 8.x is the series that ships `avcodec-62.dll`, and the extracted DLL names match.

Extracted DLL SHA-256 hashes (computed with `sha256sum` after extraction):

| DLL | SHA-256 |
|-----|---------|
| `avcodec-62.dll` | `adf3ec47033f77657ae18fe4cdf74ba868dd9832d3c17e2a6fb00bcb1c248b76` |
| `avdevice-62.dll` | `ec27a16fd4bbcd5f9568d7f2cd0faf79b956424843fa5581245a644851ce64a1` |
| `avfilter-11.dll` | `3978131a2cb1753944a05a253dbf5e9c2b2b16793c183c0790ad523c0f6bc64e` |
| `avformat-62.dll` | `731c1c15f53eb7e0bde0e9f6496c0e7fd205e82d447882c0da14ba36f7fb4d69` |
| `avutil-60.dll` | `c2388e517bfc76bab16ea18f9e894ecfa465ca4806a022d7f3b42dd98d0d1792` |
| `swresample-6.dll` | `b66cf2ddf0573c2a501909abc04bd9a32d95e03f310edea72ce0960575bc730d` |
| `swscale-9.dll` | `7fd8351233a3183c90cef2aef12a48a0364efbbe27bf24469ec2dbfc87d4b83e` |

**Install status: INSTALLED — verified.** All 7 DLLs were copied into
`C:\Program Files\PCSX2\` (elevated copy, performed by the human during the plan 01-02
Task 2 checkpoint). Post-install re-hash of the files in `C:\Program Files\PCSX2\`
(2026-07-24) matched the table above **exactly**, and System → Video Capture completed a
~10 s end-to-end MP4 test encode with no FFmpeg error.

If these DLLs ever need reinstalling: re-download `ffmpeglibs-8.0.7z` from the official
release URL above **only**, verify the archive SHA-256 against this document, extract,
and copy. Do not obtain these DLLs from anywhere else.

## Session start procedure

Before **every** capture session:

1. Diff the live ini against the tracked snapshot `reference/PCSX2.ini` (the authoritative
   post-configuration copy of `Documents\PCSX2\inis\PCSX2.ini`, snapshotted 2026-07-24
   and verified byte-identical at snapshot time):

   ```powershell
   fc.exe "$env:USERPROFILE\Documents\PCSX2\inis\PCSX2.ini" "C:\Projects\GameDesignSkills\GodOfWarChains\reference\PCSX2.ini"
   ```

   (or `diff "$USERPROFILE/Documents/PCSX2/inis/PCSX2.ini" reference/PCSX2.ini` in Git
   Bash. If Documents is OneDrive-redirected, substitute the actual ini path.)
2. Any difference in the `[EmuCore/GS]` section (renderer, screenshot size/format, aspect
   ratio, deinterlacing, capture settings) **must be resolved before capturing** — either
   restore the documented setting in the GUI, or deliberately update the snapshot and this
   document together with a dated note explaining why.
3. Diffs in other sections (window geometry, recent-file lists, UI state) are cosmetic —
   note and ignore. (The snapshot was taken while PCSX2 was still running; the first
   clean exit may rewrite such cosmetic keys — expected, ignorable per this rule.)

---
*Authored: 2026-07-24 — plan 01-02 Task 1, from phase research
(.planning/phases/01-reference-pipeline-validation-criteria/01-RESEARCH.md Pattern 1).
Values confirmed against the live ini, menu wording corrected to actual 2.6.3 labels,
and the ini snapshotted to reference/PCSX2.ini: 2026-07-24 — plan 01-02 Tasks 2–3.*
