---
created: 2026-07-24
source: user request during phase-2 planning
---

# Hitbox / strike-volume visualization in kratos-lab

Debug-toggle layer showing, per attack:
1. **Character collision capsule** — decode `assets/kratos/model/CDV_hero.bin` (real data).
2. **Strike volume** — extrude the existing swing ribbon (trailHist hilt→tip sweep in
   tools/kratos-lab/app.js drawFx) into a translucent swept volume; label **inferred**
   (GoW1 computes strikes at runtime; no decoded per-attack volume record exists).
3. **Active-frames window** — from the decoded TWK branch/window data (design/twk sheets,
   real data): tint the strike volume only during the attack's active window.

Fits naturally with Phase 3 (chain/blade rendering) or Phase 4 (chain motion) planning —
include in that phase's CONTEXT/plan rather than as standalone work.
