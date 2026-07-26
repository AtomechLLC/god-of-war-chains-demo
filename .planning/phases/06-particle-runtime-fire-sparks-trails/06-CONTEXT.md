# Phase 6: Particle Runtime — Fire, Sparks & Trails - Context

**Gathered:** 2026-07-26
**Status:** Ready for planning — decisions auto-selected while operator was away (see Claude's Discretion; adjust before planning)

<domain>
## Phase Boundary

Build the **world-space particle runtime** that renders the Phase-5 `FxDb` values as the actual on-screen effects: layered blade fire (flame3 + flame6), impact sparks (BDEsparkemit), dual swing trails (BFT crimson fire + BGT neutral swoosh) with the real `GFX_swordtrail` texture, state-dependent chain glow (CNG), and per-blade warm point lights — all on the **locked Phase-2 pass architecture** (decoded MAT/ABCD blend via `Fx.applyMaterial`/DEC-01, `alpha:false` canvas, 0x80=1.0 MODULATE, fixed 60Hz tick).

**This is the render/runtime payoff phase** — it consumes decoded values, it does not re-decode formats (thin decode top-ups are allowed only where an SC's source record is not yet an FxDb key; see D-09). It is the fast-tracked answer to the user's verdict that the current lab trails read "too thin… relatively basic."

**Requirements:** FIRE-01, FIRE-02, TRL-01, TRL-02, CHAIN-03, REND-02. **Mode:** mvp.

**Out of scope:** re-decoding FX formats (Phase 5 owns that); chain motion (Phase 4, still deferred); the side-by-side validation harness + inferred-tuning pass (Phase 7).
</domain>

<decisions>
## Implementation Decisions

### Effect priority / MVP slice order
- **D-01:** Payoff-first, carrying Phase-5's D-01. Slice order: **(1) dual swing trails + trail-spark particles** (the biggest "less basic" lever per footage), **(2) blade fire** flame3/flame6 world-space, **(3) impact sparks** on hit events, **(4) chain-glow state gating** (CNG), **(5) per-blade point lights**. Each slice is a vertical MVP slice that renders from real `FxDb` values and is judged against footage. Trails first because the user's top complaint is trail thinness/particle-sparseness.

### Particle system architecture
- **D-02:** One shared **world-space billboard particle pool** per CLAUDE.md Part 3 — a single interleaved `Float32Array` + one `gl.ARRAY_BUFFER` `DYNAMIC_DRAW`, rewritten per frame via `bufferSubData`; 4 verts/particle; static index buffer built once; VS billboarding from the view-matrix columns (no per-particle CPU matrices). **Velocity-aligned stretched billboards** for sparks. **No `ANGLE_instanced_arrays`** (budget is hundreds of particles — GoW1-era emitter scale). Draws **batched by blend group + texture**; additive commutes so **no depth sort**.

### World-space simulation & blade-lag
- **D-03:** Fire/trail/spark particles **spawn at the decoded FXC emitter matrix in WORLD space**, then advect by their own velocity + gravity for their decoded lifetime, **decoupled from the blade after spawn** — this is what makes fire *lag* a whipping blade (SC1) instead of sticking to it. Integration is **fixed 60Hz Euler** on the existing `loop.js` accumulator (`pos += vel·dt`, `vel += g·dt`); rates/lifetimes read as **NTSC 60Hz tick units** (Phase-5 D-05). **No spline smoothing anywhere** (SC3 explicit — stepped extrusion only).

### Trails — extend the existing ribbon + add sparks
- **D-04:** Keep `app.js drawFx`'s **stepped-quad `swordtrail` ribbon** (it *is* the game's trail mechanism — a textured strip, additive, depth-write off, already MAT-decoded), but drive it from real/decoded values and fix the three footage gaps: (a) real `GFX_swordtrail` texture with **runtime crimson tint + white-hot core** applied as a **RUNTIME/INFERRED age→color ramp** — Phase-5 05-04 PROVED the texture carries **no painted length-wise ramp**, so the white-hot→orange→ember ramp is runtime, clearly labeled INFERRED; (b) **inner edge biased toward the tip arc** (outer ~third of the sweep, `TRAIL_INNER_T ≈ 0.6`, from the footage todo); (c) **add trail-spark particles** riding the arc via the D-02 pool (the priority lever). **Dual variant:** BFT (crimson fire trail) vs BGT (neutral swoosh) selected **per move** by the combat state (TRL-02).

### Chain-glow state gating (CHAIN-03)
- **D-05:** Drive **CNG chain-glow intensity from combat state** — dark links at rest → hot streak during **attack/throw active windows** (from `combat.js` state + TWK window timings), using the decoded `FXC_CNGemit`/`PTC_CNGpart` color/blend. If the Phase-5 CNG decode exposed a real state gate, use it (real); otherwise the state-transition **rule is INFERRED** (footage-calibrated, labeled). Apply the **alpha-over-1.0 intensity fix** carried from 03-02 (glow currently reads too subtle — recover true brightness via shader-premultiply of raw `alpha128` + `blendFunc(ONE, ONE)`, not hand-tuning).

### Per-blade point lights (REND-02)
- **D-06:** Per-blade **warm point light as a vertex-lit term in the existing mesh shader** (per-vertex Lambert + range attenuation), **no shadow maps**. Values `color (1.0, 0.622, 0.288)`, `intensity 2.5`, `range 160` — treat as **real/decoded**. Source from a decoded LIGHT record if one is found in the WAD; otherwise treat these roadmap-documented values as the decoded reference (see D-09 — the values are not yet present anywhere in the codebase).

### Emission & blend authenticity
- **D-07:** Emission is **stochastic** — the *runtime renderer* may use per-particle randomness (jitter position/velocity/size within decoded ranges); the pure Phase-5 decoders stay deterministic/tested. **All blend modes come from the decoded MAT/ABCD table via `Fx.applyMaterial` (DEC-01)** — never a hardcoded `blendFunc`. Additive fire/sparks/trail = `SRC_ALPHA, ONE` + depth-write off; premultiply in-shader for the alpha-over-1.0 (>0x80) brightness cases (fire/glow).

### FxDb binding contract (carried from Phase 5)
- **D-08:** Bind emitter→particle→shape/texture via the FxDb **authoritative shape refs + `shapeRef` NAME discriminator (A4)**. Treat `db.refs` **slot pairs as corroboration only** — they now carry `corroborationOnly`/`shapeNameMatch`/`confidence` markers (Phase-5 WR-03 fix); do NOT bind on a slot pair whose `shapeNameMatch` is false. Effect **color comes from `MAT_pticleMat.blendColor`** (real); the age→color ramp is runtime INFERRED.

### Decode top-ups this phase must confirm (scope honesty)
- **D-09:** Two SCs reference sources **not yet surfaced in the FxDb / codebase** — the planner MUST resolve these before or during the relevant slice, and label the outcome real-vs-INFERRED:
  - **BDEsparkemit** (FIRE-02): the subtype-0x3 spark decoder branch exists in `fxparse.js`, but the record is **in-WAD only** (`R_WPN0_0.WAD`; no standalone `.bin`) and was NOT among Phase-5's surfaced families (BFT/BGT/flame/CNG/FXCF). Confirm/ingest `FXC_BDEsparkemit` as a real `db.fxc` key (thin decode top-up, mirroring the standalone-merge pattern).
  - **Blade-light values** (REND-02): `LeftBladeLight`/`RightBladeLight` are **not present anywhere in code** yet. Find the decoded LIGHT record if one exists; else adopt the roadmap-documented values as the decoded reference and label provenance honestly.

### Claude's Discretion
Operator was away ("do what you can with 4 hours") and invoked `/gsd-discuss-phase 6`. Following the **Phase-5 precedent** (the user answered "no preference" and had all decisions made on their behalf under the data-first ethos), every decision above was **auto-selected in auto-mode**, grounded in: CLAUDE.md Part 1 (GS→WebGL blend, 0x80=1.0, alpha-over-1.0) and Part 3 (billboard particles, ribbon trails, texture state); the Phase-5 `FxDb` contract + 05-04/05-05 findings; carried-forward items from 03-02 (glow intensity + trail richness); and the user's stated fidelity bar (thick, particle-rich trails and prominent fire vs. footage — see [[user-visual-fidelity-bar]]). **The operator can adjust any decision before planning proceeds.** Highest-value items to review on return: D-04 (trail approach), D-05 (glow-state rule INFERRED), D-01 (slice order).

### Folded Todos
- **`trail-fidelity-from-footage`** — folded into this phase's runtime scope (it was always the "Phase-6 runtime plays them" half). Concrete inputs: (1) trail hugs the **tip arc / outer third** → D-04(b); (2) **age→color ramp** white-hot→orange→ember → D-04(a), runtime/INFERRED per 05-04 (no painted ramp); (3) trail fully gone **~30 frames** post-swing → a lifetime anchor to corroborate decoded PTC lifetimes and tune `TRAIL_AGE`; (4) **discrete spark specks ride the trail** = spark particles → D-04(c), the priority lever (D-01).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rendering technique + blend (the how)
- `CLAUDE.md` §"Part 1: PS2 GS Blending → WebGL1" — ABCD→WebGL blend table, `0x80 = 1.0`, the alpha-over-1.0 shader-premultiply rule (fire/glow brightness). Governs every additive FX draw and the glow intensity fix.
- `CLAUDE.md` §"Part 3: Rendering techniques (raw WebGL1)" — billboard particle buffer layout, VS billboarding, velocity-aligned spark stretch, ribbon-vs-glow passes, FX texture state (LINEAR, REPEAT vs CLAMP, no mipmaps). The blueprint for D-02/D-03/D-04.
- `CLAUDE.md` §"What NOT to Use" — no post-process bloom, no `gl.POINTS`, no libraries, no sRGB/tone-map, no mipmaps on FX, no depth-sorted additive. Hard constraints.

### Requirements & roadmap
- `.planning/ROADMAP.md` §"Phase 6: Particle Runtime — Fire, Sparks & Trails" — goal + 5 success criteria (exact acceptance wording).
- `.planning/REQUIREMENTS.md` — FIRE-01, FIRE-02, TRL-01, TRL-02, CHAIN-03, REND-02 (exact acceptance text; blade-light values live here).

### Decoded data source (Phase 5 hand-off)
- `tools/kratos-lab/fxparse.js` — the `FxDb` (`parseMsh`/`parsePtc`/`parseFxc`/`parseAnmType5`/`buildFxDb`): emitter→particle→shape graph, `db.meta.colorSource → MAT_pticleMat.blendColor`, slot-ref markers (`corroborationOnly`/`shapeNameMatch`). The value source for the whole runtime.
- `.planning/phases/05-fx-record-decode/05-03-SUMMARY.md` — FXC subtype branch (0x2/0x3/0xd) + cross-ref graph; confirms the spark (0x3) decode path.
- `.planning/phases/05-fx-record-decode/05-04-SUMMARY.md` — color provenance (MAT_pticleMat.blendColor; `GFX_swordtrail` has **no painted ramp** → runtime ramp is INFERRED); fire/chain-glow corpus.
- `.planning/phases/05-fx-record-decode/05-05-SUMMARY.md` — type-5 `gomaiblade` blade-state (in-hand/on-back) — relevant if blade presentation gates any FX visibility.

### Existing render code (extend, don't rewrite)
- `tools/kratos-lab/app.js` — `drawFx(mvp)` (current trail ribbon + chainglow passes, ~L593), `trailHist`/`TRAIL_AGE`/`TRAIL_INNER_T` (ribbon substrate to extend), `renderFrame`. Where the particle pool + new passes slot in.
- `tools/kratos-lab/fx.js` — `Fx.applyMaterial` (the DEC-01 MAT→GL blend applier — every FX draw goes through this).
- `tools/kratos-lab/loop.js` — the fixed **60Hz accumulator** (per-tick sim substrate for particle integration).
- `tools/kratos-lab/combat.js` — combat state machine: `st.hits` counter + `queue/branch/cancel` active windows → hit events for sparks (FIRE-02) and glow state-gating (CHAIN-03).
- `tools/kratos-lab/parsers.js` — `parseWad` record access for the BDEsparkemit / LIGHT decode top-ups (D-09).

### Source assets
- `assets/kratos/fx/` — FXC/PTC records (BFT/BGT/CNG/FXCF families). Note: `FXC_BDEsparkemit` is **in-WAD only** (`assets/wads/R_WPN0_0.WAD`), not a standalone `.bin`.
- `assets/weapon/GFX_swordtrail.bin` + `PAL_swordtrail.bin` — the trail texture (confirmed no painted length-wise ramp).

### Carried context
- `.planning/phases/03-chain-link-ribbon-glow/03-02-SUMMARY.md` — the two open levers this phase must close: **glow intensity** (alpha-over-1.0) and **trail richness** (thin ribbon → thick + particle-dense).
- `.planning/phases/05-fx-record-decode/05-CONTEXT.md` — Phase-5 decisions D-01..D-08 (fast-track framing, NTSC-U region, INFERRED tolerance) that carry forward.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app.js drawFx` + `trailHist` ribbon extrusion — the swordtrail substrate; extend (color ramp, tip-arc bias, dual variant) rather than replace. Per-tick trail recording already lands via `loop.js` (Phase-2 Wave 3).
- `Fx.applyMaterial` (`fx.js`) — single decoded-blend applier; all new FX passes use it (no hardcoded `blendFunc`/`depthMask`).
- `loop.js` — fixed 60Hz accumulator: the integration clock for the particle sim.
- `combat.js` — `st.hits` and active windows: spark triggers + glow state.
- `fxparse.js` `FxDb` — the decoded value source (emitter/particle/shape/color).

### Established Patterns
- Decoded-blend-only rendering (DEC-01): every FX draw's blend/depth comes from the MAT/ABCD table, never hardcoded — verified via the magenta-background test.
- Fixed 60Hz tick (Phase 2) + NTSC tick-unit interpretation (Phase 5 D-05).
- Data-first + real/INFERRED labeling on every runtime-computed quantity (the tuning bar for Phase 7).
- `alpha:false` canvas, 0x80=1.0 MODULATE, saturation-to-white — the PS2 compositing invariants must not be broken by new additive passes.

### Integration Points
- `drawFx(mvp)` in `app.js` is the single insertion site for the particle pool draw + the fire/spark/trail/glow/light passes.
- `combat.js` hit/window events drive spark emission and chain-glow state.
- `fxparse.js` `buildFxDb` output is the runtime's value source — the renderer resolves emitter→particle→shape/texture through it (authoritative refs + name discriminator, D-08).
- `parsers.js` `parseWad` is the entry for the two D-09 decode top-ups (BDEsparkemit, blade lights).
</code_context>

<specifics>
## Specific Ideas

- The **trail spark particles** remain the user's #1 lever ("thick, rich and full of particles… we are way off") — D-01 front-loads them.
- **Fire must lag the blade** (world-space sim, D-03) — a blade-locked fire is a known failure mode to avoid.
- **Glow must read hot on attacks** — the current chainglow is too subtle; the alpha-over-1.0 fix (D-05) is the data-grounded brightness recovery, not a hand-tuned multiplier.
- Region is **NTSC-U (SCUS-97399)** — rates/lifetimes are 60Hz tick units, never PAL 50Hz.
</specifics>

<deferred>
## Deferred Ideas

- **Phase 4 — chain motion** — still deferred by the fast-track pivot; parallel-capable, revisit after the particle payoff (chain span/whip-lag solver).
- **Phase 7 — side-by-side validation + inferred tuning** — the A-B flicker harness and the "only tune INFERRED values" pass judge this phase's output; not built here.
- **Advanced fire simulation** (curl-noise/turbulence, inter-particle forces) — beyond GoW1-era emitter fidelity and the hundreds-of-particles budget; not needed for the 80–90% bar.

### Reviewed Todos (not folded)
- **`hitbox-visualization`** — reviewed, NOT folded. It is a **debug strike-volume visualization** (character collision capsule from `CDV_hero.bin`, extruded swing-ribbon strike volume, active-frames tint) — a separate debug capability, not part of "fire/sparks/trails/glow/lights render from decoded values." It shares the trail-ribbon substrate but belongs in a Phase-3/4 or standalone debug pass, not the particle-runtime phase. Kept for the roadmap backlog.
</deferred>

---

*Phase: 6-particle-runtime-fire-sparks-trails*
*Context gathered: 2026-07-26*
