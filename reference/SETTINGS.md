# PCSX2 capture settings — Chains of Chaos reference pipeline

Every capture here was produced by PCSX2 2.6.3.0 (`C:\Program Files\PCSX2\pcsx2-qt.exe`),
software renderer, from `God of War (USA).iso` (SCUS-973.99, NTSC-U — 60Hz tick units for
all later rate interpretation), BIOS scph39001.bin.

Status: the table below is the researched target configuration, documented from a true
clean slate (`Documents\PCSX2\inis` was empty — PCSX2 had never been configured on this
machine). Rows marked `[PENDING CONFIRM]` await the one-time first-run GUI configuration
(plan 01-02 Task 2); every token is removed once the live
`Documents\PCSX2\inis\PCSX2.ini` confirms the value (plan 01-02 Task 3). Where 2.6.3's
actual menu wording differs from a row, the row is updated to the actual wording.

## Settings

| Setting | Value | Why |
|---------|-------|-----|
| Graphics → Renderer | **Software** [PENDING CONFIRM] | Bit-accurate GS blending; the "Blending Accuracy" option is approximate and applies only to hardware renderers [VERIFIED: pcsx2.net docs + project PITFALLS.md P8] |
| Graphics → Rendering → Software Rendering Threads | 2–4 [PENDING CONFIRM] | Performance only; no visual effect |
| Graphics → Display → Aspect Ratio | Auto 4:3/3:2 (or 4:3) [PENDING CONFIRM] | The reference is 4:3; do **NOT** enable the widescreen patch — it alters FOV/aspect and poisons geometry measurements |
| Graphics → Display → Deinterlacing | Auto as starting point [PENDING CONFIRM] — final mode per progressive-scan outcome, recorded by capture session (plan 01-03) | Irrelevant if in-game 480p progressive is achieved; otherwise the chosen mode must be documented (deinterlacing is display-side processing = contamination if baked into stills) |
| Graphics → Screenshot/Capture → Screenshot Size | **Internal Resolution (Aspect Uncorrected)** [PENDING CONFIRM] | Raw framebuffer pixels for measurement [CITED: TCRF / Wizardry-wiki PCSX2 capture guidelines] |
| Graphics → Screenshot/Capture → Screenshot Format | **PNG** [PENDING CONFIRM] | Lossless; all color sampling depends on it |
| Video capture (Tools → Video Capture) | MP4 container / H.264, **maximum bitrate the UI allows** [PENDING CONFIRM] | True lossless is not available in 2.6.3's capture UI [CITED: pcsx2 issue #11379]; high bitrate + the "color from PNG stills only" policy compensates |
| Settings → Patches / Game Properties | **ALL patches OFF** [PENDING CONFIRM] (Skip Cutscenes is optional and visual-safe — if enabled, document it here) | The official SCUS-97399 pnach's widescreen hack alters game code/FOV [VERIFIED: official pnach contains only Widescreen 16:9 + Skip Cutscenes] |
| Settings → Emulation → Speed | 100% (NTSC 59.94 Hz) [PENDING CONFIRM] | Timing truth |
| Settings → Hotkeys | Frame Advance **bound** (key recorded at confirmation) + Save State F1 / Load State F3 / Screenshot F8 confirmed [PENDING CONFIRM] | Frame stepping is the stills workflow; Frame Advance exists in Qt hotkeys but may be unbound by default [CITED: PCSX2 PR #13015] |

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

## FFmpeg DLL provenance

PCSX2 2.6.3 does not bundle FFmpeg; Tools → Video Capture requires the FFmpeg DLLs placed
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

**Install status: STAGED — elevated copy pending.** The unelevated copy into
`C:\Program Files\PCSX2\` failed with access denied (Program Files requires admin).
The extracted DLLs are staged at:

```
C:\Users\alexy\AppData\Local\Temp\claude\C--Projects-GameDesignSkills-GodOfWarChains\50ef7db8-0c21-4ffa-8707-5d00e2dd8c0e\scratchpad\ffmpeg-dlls\
```

Elevated copy (run in an **Administrator** PowerShell):

```powershell
Copy-Item "C:\Users\alexy\AppData\Local\Temp\claude\C--Projects-GameDesignSkills-GodOfWarChains\50ef7db8-0c21-4ffa-8707-5d00e2dd8c0e\scratchpad\ffmpeg-dlls\*.dll" "C:\Program Files\PCSX2\"
```

If the staging folder has been cleaned up: re-download `ffmpeglibs-8.0.7z` from the
official release URL above **only**, verify the archive SHA-256 against this document,
extract, and copy. Do not obtain these DLLs from anywhere else.

## Session start procedure

Before **every** capture session:

1. Diff the live ini against the tracked snapshot `reference/PCSX2.ini` (the authoritative
   post-configuration copy of `Documents\PCSX2\inis\PCSX2.ini`):

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
   note and ignore.

---
*Authored: 2026-07-24 — plan 01-02 Task 1, from phase research
(.planning/phases/01-reference-pipeline-validation-criteria/01-RESEARCH.md Pattern 1);
values confirmed in-GUI and the ini snapshotted by plan 01-02 Tasks 2–3.*
