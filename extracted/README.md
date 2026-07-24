# God of War (2005, PS2) — Kratos model / animation / chain-data extraction

Everything here was pulled from `God of War (USA)/part1.pak` using the index in
`God of War (USA)/godofwar.toc`.

## Where things came from

**TOC format** (`godofwar.toc`): flat array of 24-byte entries —
`char name[16]`, `u32 size`, `u32 offset` (offset in 2048-byte sectors into `part1.pak`).
1,669 entries. Duplicate names are the same file duplicated across disc regions for
streaming locality.

**WAD format** (files inside the PAK): 16-byte-aligned records —
`u32 type`, `u32 size`, `char name[24]`, then `size` bytes of data,
next record at `align16(offset + 32 + size)`. Exceptions: type `0x18` records
(`*_HEAP_SIZE`) declare a heap reservation in the size field and carry **no** data.
`GroupStart`/`GroupEnd` (types `0x28`/`0x32`) are structural markers. Records with
size 0 and a repeated name are back-references, not content.

Kratos is called **"Hero"** throughout the engine. Relevant WADs:

| WAD | Contents |
|---|---|
| `R_PERM.WAD` | Permanent (always resident): global tweaks, HUD, message text, hero runtime data |
| `R_HERO0.WAD` … `R_HERO5.WAD` | Kratos per blade-upgrade level 0–5 (model, textures, animation set, FX) |
| `R_WPN0_0.WAD` … `R_WPN5_5.WAD` | Weapon WADs (weapon × upgrade level) — not extracted |

Raw WADs are kept in `wads/`.

## What was extracted

### `kratos/model/` — the Kratos model (from R_HERO0)
- `MDL_hero.bin` — model header record (72 B)
- `hero_0.bin` — mesh/vertex data (~170 KB; PS2 VIF packet geometry)
- `hero.bin` — model object data (~25 KB)
- `SHG_hero.bin` — shadow geometry
- `CDV_hero.bin` — collision volume data
- `gohero.bin` — game-object binding ("go" = game object)

### `kratos/textures/`, `kratos/materials/`, `kratos/fx/`
`GFX_*` = texture pixel data, `PAL_*` = palettes, `TXR_*` = texture descriptors
(`MAI*` = the Kratos skin/cloth maps). `MAT_*` = material definitions.
`FXC_*`/`PTC_*` = blade-fire emitter/particle definitions.

### `kratos/animations/` — the animation set
- `ANM_hero.bin` (1.49 MB) — all 300+ named Kratos animation clips: keyframe data
  plus per-clip metadata. Header: `u32 version(3)`, pad, `u32`, `u32 totalSize`,
  `u16 u16`, `u32 clipCount≈499`, `u32`, then an offset table into per-clip blocks.
  Clip name fields sit at offsets ≡ 4 (mod 16) inside their blocks.
- `ANM_hero_clip_names.txt` — cleaned offset → clip-name index (332 names)
- `ANM_hero_strings.txt` — raw string dump (includes noise; kept for completeness)

The clip names document the **combo/animation chains** directly:
- Ground chains: `combo3A–F`, `combo4A–D`, `combo5A–B`, `combo6A`, `combo7A`,
  `comboLR2–4`, `comboJump`
- Air chains: `airH1–H3`, `airV1`, `air360`, `airDash`, `airBlock`
- Rage of the Gods: `berComboH1–H4`, `berComboV1–V4`, `berAir*`, `berserkEnter/Idle/Exit`
- Defense/reactions: `block*`, `parry01/02`, `evade{Back,Front,Left,Right}`, `hit*`
- Magic: `bolt*` (Zeus' Fury), `raiseTheDead` (Army of Hades), `useHead*` (Medusa's Gaze)
- Traversal, swim, rope, wall, cinematic (`Athn*`/`Pand*`/`Dest*`) clips

### `kratos/variants/level1–5/`
Same records from `R_HERO1–5.WAD` where they differ from level 0. The **animation
data is effectively identical across all 6 levels** (~1.6 KB of 1.49 MB differs —
FX/material bindings only); the real differences are the mesh (`hero_0.bin`) and
blade textures. `TWK_goHero` is byte-identical across all levels.

### `kratos/scripts/` — the closest thing to "scratch files"
Nothing in the game data is literally named "scratch"; the engine's data that
*drives* the animation/input chains is spread across:
- `TWK_goHero.bin` (34 KB) — the hero's tweak table; starts with the path string
  `/Animation/goHero/` followed by packed float parameters. This is the designer
  tuning data for Kratos' animation behavior.
- `SCR_cloth.bin` — cloth sim script; `TWK_Cloth_195.bin`, `TWK_MFX_501/502.bin`
- Per-move frame data (cancel windows, transitions) is embedded in each clip's
  block inside `ANM_hero.bin`.

### `perm/` — from R_PERM.WAD
- `Hero.bin` (99 KB) — hero permanent runtime data; leads with the combat
  voice/SFX bank (`H_ATTKL1/2`, `H_ATTKS1–4`, `H_DMG1–6`, `JUMPVOC*`, …)
- `GENERAL.bin` / `GENERAL2.bin` — global game data blob
- `msgs_en.txt` (36 KB, **plain text**) — every in-game message including the full
  input tutorials and the move list with button strings
  (`Plume of Prometheus [SquareButton] [SquareButton] [TriangleButton]`, …)
- `FLP_HUD.bin` (479 KB) — HUD flash-like UI package (`HitCounter_Value`,
  `Combo_Amount`, `Combo_Message`, power-up move-list text boxes)
- `input_tweaks/` — `TWK_ForceFeedback_*` and `TWK_CameraShake_*` records
  (controller rumble / camera shake tuning per event id)

## Section types seen in WADs

`GFXX/TXRX/MATX/SNDX/LGTX/FLPX/LINE/CXT/ANMX/SCRX/BHVX/MDLX/PRTX/CAMX/EEPR/EMTX/COLX/SHGX/FX/WYPX`
are per-category group headers; the payload records are `GFX_`, `PAL_`, `TXR_`,
`MAT_`, `ANM_`, `MDL_`, `CDV_`, `SHG_`, `FXC_`, `PTC_`, `TWK_`, `SCR_`, `FLP_`, plus
free-named object records (`hero`, `gohero`, `GENERAL`, …).
