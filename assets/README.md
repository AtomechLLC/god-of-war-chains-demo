# assets/ — curated study set for the educational program

This folder is the **minimal, deliberately curated** subset of God of War (2005, PS2)
data that the kratos-lab tool and its course exercises consume: the Level-1 Blades of
Chaos weapon records, the raw weapon WAD, and the extracted Kratos model set.

Provenance and formats are documented in [`extracted/README.md`](../extracted/README.md)
(the full local-only extraction this subset was copied from). Everything here is
re-derivable from a user's own game disc via the pipeline in [`tools/`](../tools/).

## Contents

| Path | What it is |
|------|------------|
| `weapon/` | Carved records from `R_WPN0_0.WAD`: blade model (`MDL_MAIBlade.bin`, `MAIBlade_0.bin`, `maiblade.bin`), FX textures (`GFX_chainlink`, `GFX_chainglow`, `GFX_swordtrail`, `GFX_stage1Btx`, `GFX_stage1Btx2`) and their CLUTs (`PAL_*`) |
| `wads/R_WPN0_0.WAD` | The raw Level-1 weapon WAD — loaded raw in-browser by kratos-lab (record walking, MAT decode); also contains the FX emitter/particle records (`FXC`/`PTC`/shape) that later phases decode |
| `kratos/` | Extracted Kratos ("Hero") set from `R_HERO0.WAD`: `model/`, `textures/`, `materials/`, `fx/`, `animations/`, `scripts/`, `variants/` |

## What is deliberately NOT here (and must never be committed)

- The game ISO / disc contents (`God of War (USA).iso`, `God of War (USA)/`)
- The PS2 BIOS (`ps2bios/`)
- The full WAD set and any other disc data (`extracted/` remains local-only)
- Gameplay captures (`reference/captures|frames|annotated`, local-only)

These stay blocked in `.gitignore`. This subset exists for study and commentary within
the course context; do not redistribute it outside that context.

## perm/ — shared attack FX (added 2026-08-14)

Carved from `R_PERM.WAD`: the goCombo3fExplode Plume-impact composite —
`GFX_explosioncloud.bin` + `PAL_explosioncloud.bin` (128x128 greyscale cloud
sprite; color at draw = the decoded fire color) plus the five emitter/particle
pairs (`FXC/PTC` Flash, Fcloud, sparks, fglow, Deb) and `FXC_gravityField1.bin`
(the explosion's -20 field). Bound by the part1.pak PlayFX instances "Hero
Plume BF/3F/7A" at authored scales 2/1.5/2, 1.5/1/1.5, 1/0.5/1.

## enemy/ — the target dummy (added 2026-08-13)

Impact-VFX chain (added 2026-08-14, carved from `R_SKS.WAD`): `GFX_blood.bin` +
`PAL_blood.bin` (the 64x64 greyscale impact-blood sprite), `MAT_blood.bin`
(material: "usual" alpha blend, linear filter), `FXC_BloodXemitT.bin` +
`PTC_BloodXpartT.bin` (the goSklBlood emitter/particle pair). These are the
records behind the MFX "Zombie Flesh" hit response (goSklBlood + SND_BLOODSPURT)
and the "SKS Blood Top/Mid" PlayFX joint anchors (neck/pelvis).

The undead legionnaire (R_SKS.WAD, extracted via godofwar.toc + part1.pak
sector addressing): `SKS_0.bin` mesh (3,265 verts), `sks.bin` skeleton object
(29 joints — note the WAD holds TWO records named `sks`; the first is the
VAG voice bank, this is the second), `ANM_sks.bin` (93 acts: hit reactions,
deaths, taunts, spawn, his own attacks), `GFX/PAL_SKStextNu.bin` skin, and
the stat tweaks `TWK_goSKS.bin` (/Animation/goSKS/ action bank) +
`TWK_Sold_020.bin` (/TweakTemplates/Sold/020 → goSKS, decode pending).
