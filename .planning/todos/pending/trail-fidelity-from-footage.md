---
created: 2026-07-25
source: user feedback on live lab + orchestrator analysis of user's PCSX2 combat clips
---

# Trail fidelity — footage-grounded improvements for Phase 3 planning

User verdict on the current lab: "trails still look too thin, there are no particle
emitters and it seems relatively basic." Footage analysis (clip
`God of War_SCUS-97399_20260724212336.mp4`, ~t=20s vertical combo3A swing; extracted
frames in the Phase-1 session context) vs current `tools/kratos-lab/app.js` drawFx:

1. **Ribbon cross-section**: real trail hugs the blade-tip arc (outer ~third of the
   sweep), NOT the full hilt→tip sheet the lab draws. Bias the inner ribbon edge toward
   ~lerp(hilt, tip, 0.6).
2. **Age→color ramp**: real trail runs white-hot (newest) → orange → dark ember red
   (tail). Lab fades alpha only, flat color. FIRST decode and inspect the actual
   `GFX_swordtrail` texture (data-first): the gradient and cross-falloff may be painted
   in the asset, making this a UV-mapping fix (u=age vs u=path, REPEAT vs stretch),
   not new code.
3. **Persistence**: trail fully gone within ~30 frames post-swing in footage. Measure
   exact per-swing lifetime during the Phase-1 polish pass (frame bursts); tune
   TRAIL_AGE/sample count to measured values, label measured-vs-inferred.
4. **Sparkle/particles along the arc**: discrete bright specks ride the real trail —
   spark particles, not ribbon texture. Phase 5 decodes FXC_*/PTC_* records
   (assets/kratos/fx/ + records inside assets/wads/R_WPN0_0.WAD); Phase 6 runtime
   plays them. This is the largest "less basic" lever.

Related: [[hitbox-visualization]] todo (also Phase 3/4 input). Per-tick trail recording
landed with Phase 2 Wave 3 (loop.js accumulator) as the timing substrate.
