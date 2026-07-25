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
