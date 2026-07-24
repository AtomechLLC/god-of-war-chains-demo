# Kratos Lab — GoW (2005) previewer & combo tester

Run:

```
node tools/kratos-lab/server.js
```

then open http://localhost:4173/ (redirects to `/tools/kratos-lab/`).

## What it does

- **3D preview** of the real Kratos mesh: `extracted/kratos/model/hero_0.bin` is
  parsed in-browser (PS2 VIF stream walk) into 7,382 vertices / 5,429 textured
  triangles — tri-strips rebuilt from the ADC restart bits in each position's W
  word, UVs (s16/4096, V paged across the three 256×256 skin textures), s8
  normals, and baked vertex-color AO. Drag to orbit, wheel to zoom.
- **Skin textures** decoded live from `GFX_/PAL_MAI0*F` (8bpp + csm1 CLUT).
- **PS2 button pad** — Square (light), Triangle (heavy, hold for launcher), Circle
  (grab), X (jump), L1 modifier, Rage of the Gods toggle. Keyboard: J/K/L/Space/Shift/R.
- **Combo tester** — all chains unlocked. State machine over the real clip inventory
  (names, ids, durations decoded from `ANM_hero.bin`); inputs queue during a move and
  branch at the branch point; L1 block-cancel during the cancel window.
- **Branch panel** — for the running animation, every possible branch and the input
  that triggers it. On transition the finished move's list greys out and the new one
  stacks on top; the previous greyed list is removed on the next transition.
- **Timeline** — playhead over the current clip with queue/cancel windows and branch
  point marked; frame counter at the game's 30 fps.

## Blades of Chaos & ribbons

- `MAIBlade_0` from `R_WPN0_0.WAD` is parsed with the same exact mesh pipeline
  (996 verts, 792 tris) and rigidly attached to the `lWeapIH`/`rWeapIH`
  weapon-in-hand joints, textured with the real `stage1Btx` page.
- Blade flight is **authored data**: each act's type-10 state descriptor holds
  per-frame world-space positions for both blades (stream 0 = left, stream 1 =
  right; header `{u16, u16 nStreams, u32 frames}` + frames × 2 × vec3f),
  verified by matching the idle-clip stream exactly to the hand joint
  positions. The lab samples these tracks directly — combo3A whips the left
  blade ~90 units forward and back, exactly as shipped. Orientation is derived
  (hand frame when gripped, tip leading the track velocity in flight); the
  type-5 descriptor (likely blade show/hide state) is not yet decoded.
- Chain ribbons connect each forearm's `lChain`/`rChain` joint to the authored
  blade pommel, textured with the real 512×32 `chainlink` strip (4bpp PSMT4,
  linear) — taut in flight, sagging when gripped.
- Swing trails record the blade tip/hilt world path each frame during attacks
  and render an additive fading ribbon with the real `swordtrail` texture.

## Data provenance

| element | status |
|---|---|
| clip names, ids, durations | **real** — decoded from `ANM_hero.bin` clip headers |
| per-clip blend-in times ("combo blends") | **real** — clip header +0x04 (0.09s light chain, 0.06s berserk, 0 = hard cut on finishers/air continuations) |
| keyframe sample rates | **real** — 30 Hz for precision combat clips, 15 Hz for idles/berserk/cinematics |
| chain step order (combo3A→3B→…) | **real** — explicit in clip naming |
| named moves (Plume of Prometheus □□△, etc.) | **real** — from `msgs_en.txt` / FLP_HUD move list |
| mesh geometry (tris/UV/normals/AO), skin textures | **real** — decoded from `hero_0.bin`, `GFX_/PAL_*` |
| skeleton | **real** — 111 named joints + parent hierarchy decoded from `hero.bin` (see extracted/README) |
| traversal action events | **real** — `TWK_goHero.bin` `/Animation/goHero/` tweak tree: 175 event sections, 352 named animation slots, 1,744 values (footfall events on `l/rMetatarsal` at phase values, window-sized tunables 0.05/0.1/0.2s) |
| walk/balance/berserk blend trees | **real** — blend-space groups in the `ANM_hero.bin` tail region |
| input→branch placement of mixed strings | **inferred** — reconstructed from naming + move list |
| queue/branch/cancel window extents for attacks | **inferred defaults, adjustable** — searched exhaustively: attack windows are compiled into engine code (hash-keyed), not present as named data in the retail files |

## Skeletal animation playback (decoded!)

Playback of the real keyframe streams is implemented in `anim.js`, with format
knowledge from the open-source [god_of_war_browser](https://github.com/mogaika/god_of_war_browser)
project (pack/wad/obj + pack/wad/anm):

- `hero.bin` is the engine "object": 111 joints (flags, parent links), idle-pose
  local positions (float) and rotations (Q.14 fixed-point quaternion or euler per
  joint flags), plus inverse-bind matrices for skinned joints.
- `ANM_hero.bin` holds groups → acts (clips) → per-datatype states → sample
  streams: absolute s16 samples and additive int8 deltas with power-of-two shift
  scaling, addressed per (joint × quaternion component) through bitmap masks.
- Per frame the tool rebuilds each joint's local quat/pos from the streams, runs
  FK over the hierarchy, and CPU-skins the mesh (joint world × inverse bind).
- Blend-ins between moves use each clip's real blend duration from the ANM data.

The mesh is parsed spec-exact (per god_of_war_browser's gow1 mesh code):
Mesh header (0x50, root joint name at +0x38) → Parts (own joint id) → Groups →
Objects (0x20 header: type, DMA-tag count, material id, joint-map size,
instances, layers). Each object's DMA chain is walked tag-by-tag (REF tags point
at the VIF payload; MSCAL/MSCNT flush a packet), and its joint map is read at
its exact offset (+0x20 + chains×0x10×tags) — no heuristics. Every vertex gets
the game's own two-bone binding: joint pair from the packet's VertexMeta blocks
(with the stitch alternation rule), weight from the position W word (low 15 bits
/4096). 100% of vertices bind this way — zero fallbacks. Joints without a stored
inverse-bind matrix (cloth) use the inverse of their idle FK pose. Frames are
linearly interpolated between the 15/30 Hz keys. The back-blade geometry (part 1,
skinned to rightBladeBack/leftBladeBack) is included.
