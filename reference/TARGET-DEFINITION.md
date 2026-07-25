# Reference Target Definition

**Target statement:** The fidelity target for every visual comparison in this project is the PS2 Graphics Synthesizer's digital output as captured by the reference pipeline — **GS output as captured, not CRT**.

This is the definition Phases 3 (chain visuals), 5 (FX decode), and 7 (side-by-side judgment) cite. It is locked now so the 80–90%-vs-footage bar cannot drift mid-project (PITFALLS.md P9: "authentic PS2" is ambiguous between what the GS output and what a 2005 CRT displayed — the reference footage is a digital capture, so only the first target is falsifiable).

## Source Roles

Every footage source has exactly one role. Citing a source outside its role — especially YouTube for a color judgment — re-opens Pitfall 8 (contaminated ground truth) and is treated as an error, not a shortcut.

| Source | Role | Never Used For |
|--------|------|----------------|
| PCSX2 PNG stills (F8 screenshots, software renderer, internal-res, `reference/frames/`) | **Color / brightness / geometry truth** — all hue sampling, link-pitch counts, particle sizes, and trail-geometry measurements come from these and only these | — |
| PCSX2 video clips (Tools → Video Capture, `reference/captures/`) | **Motion / timing truth only** — whip arcs, flicker cadence, fade durations, particle burst rhythm | Color or brightness judgments — H.264 capture is lossy (no lossless option in the 2.6.3 capture UI); colors come from PNG stills only |
| YouTube reference video [FMGwS-bvNiU](https://www.youtube.com/watch?v=FMGwS-bvNiU) | **Move selection + motion cross-check only** — which moves matter, and cross-checking whip-arc character against our own captures | Color, brightness, or geometry — 4:2:0 chroma subsampling smears exactly the saturated orange/red glow edges this project cares about, BT.601/709 ambiguity shifts reds, and the footage appears to be the PS3 God of War Collection port (720p/16:9, per .planning/research/FEATURES.md) — an additional reason it can never be color truth |

## Exclusions (anti-targets)

These never appear in the renderer, the reference pipeline, or the acceptance checklist:

| Exclusion | Reason |
|-----------|--------|
| CRT simulation / shaders (scanlines, phosphor bloom, composite blur, interlace shimmer) | The agreed reference is a digital GS capture — no CRT exists anywhere in the comparison loop; chasing CRT memory moves the target and makes the 80–90% judgment unfalsifiable (PITFALLS.md P9) |
| HDR bloom, tonemapping, soft particles, motion blur, DoF | Not present on PS2; each one breaks the period look (locked anti-features — REQUIREMENTS.md Out of Scope, CLAUDE.md) |
| sRGB color management / gamma-correct rendering | The GS pipeline is linear-ish 8-bit with no gamma management — the PS2 look IS the naive math; adding "correct" color management makes output match footage worse (CLAUDE.md What NOT to Use) |

## CRT flavor rule

If CRT flavor is ever wanted, it goes in as a clearly separated, clearly labeled **optional post-pass** — never mixed into the data-driven layers, and **never active during validation comparisons**.

---
*Defined: 2026-07-24 — plan 01-01, from .planning/research/PITFALLS.md (P8/P9), .planning/REQUIREMENTS.md Out of Scope, and phase research (01-RESEARCH.md)*
