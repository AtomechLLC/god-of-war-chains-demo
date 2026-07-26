# Phase 6: Particle Runtime — Fire, Sparks & Trails - Research

**Researched:** 2026-07-26
**Domain:** Real-time WebGL1 particle/FX rendering driven by decoded PS2 game data (billboard particle pool, world-space Euler sim on a fixed 60Hz accumulator, ribbon trail extension, additive GS-blend compositing, vertex point-lighting)
**Confidence:** HIGH — the render techniques are pinned by CLAUDE.md's first-party PS2/WebGL research (Part 1–4) and the existing `drawFx` implementation; every D-09 data-coverage question was resolved by direct first-party probing of the WAD + FxDb this session.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (slice order):** Payoff-first. **(1) dual swing trails + trail-spark particles**, **(2) blade fire** flame3/flame6 world-space, **(3) impact sparks** on hit events, **(4) chain-glow state gating** (CNG), **(5) per-blade point lights**. Each slice is a vertical MVP slice rendering from real `FxDb` values, judged against footage. Trails first (user's top complaint = trail thinness/sparseness).
- **D-02 (particle architecture):** One shared **world-space billboard particle pool** per CLAUDE.md Part 3 — single interleaved `Float32Array` + one `gl.ARRAY_BUFFER` `DYNAMIC_DRAW`, rewritten per frame via `bufferSubData`; 4 verts/particle; static index buffer built once; VS billboarding from the view-matrix columns (no per-particle CPU matrices). **Velocity-aligned stretched billboards** for sparks. **No `ANGLE_instanced_arrays`.** Draws **batched by blend group + texture**; additive commutes → **no depth sort**.
- **D-03 (world-space sim & blade-lag):** Particles **spawn at the decoded FXC emitter matrix in WORLD space**, then advect by their own velocity + gravity for their decoded lifetime, **decoupled from the blade after spawn** (makes fire *lag* a whipping blade). Integration is **fixed 60Hz Euler** on the existing `loop.js` accumulator (`pos += vel·dt`, `vel += g·dt`); rates/lifetimes are **NTSC 60Hz tick units** (Phase-5 D-05). **No spline smoothing anywhere.**
- **D-04 (trails):** Keep `app.js drawFx`'s **stepped-quad `swordtrail` ribbon** but drive it from real/decoded values and fix three footage gaps: (a) real `GFX_swordtrail` texture with **runtime crimson tint + white-hot core** applied as a **RUNTIME/INFERRED age→color ramp** (05-04 PROVED no painted length-wise ramp); (b) **inner edge biased toward the tip arc** (`TRAIL_INNER_T ≈ 0.6`); (c) **add trail-spark particles** riding the arc via the D-02 pool. **Dual variant:** BFT (crimson fire) vs BGT (neutral swoosh) selected **per move** by combat state (TRL-02).
- **D-05 (chain-glow state gating):** Drive **CNG chain-glow intensity from combat state** — dark at rest → hot during **attack/throw active windows** (`combat.js` state + TWK window timings), using decoded `FXC_CNGemit`/`PTC_CNGpart` color/blend. If a real state gate was decoded use it (real); otherwise the state-transition **rule is INFERRED** (footage-calibrated). Apply the **alpha-over-1.0 intensity fix** (03-02 carry-forward) via shader-premultiply of raw `alpha128` + `blendFunc(ONE, ONE)`, not hand-tuning.
- **D-06 (blade point lights):** Per-blade **warm point light as a vertex-lit term in the existing mesh shader** (per-vertex Lambert + range attenuation), **no shadow maps**. Values `color (1.0, 0.622, 0.288)`, `intensity 2.5`, `range 160` — treat as **real/decoded**. Source from a decoded LIGHT record if found; else adopt roadmap values.
- **D-07 (emission & blend authenticity):** Emission is **stochastic** — the *runtime* may use per-particle randomness within decoded ranges; the Phase-5 decoders stay deterministic/tested. **All blend modes come from the decoded MAT/ABCD table via `Fx.applyMaterial` (DEC-01)** — never a hardcoded `blendFunc`. Additive = `SRC_ALPHA, ONE` + depth-write off; premultiply in-shader for alpha-over-1.0 (>0x80) brightness cases.
- **D-08 (FxDb binding contract):** Bind emitter→particle→shape/texture via FxDb **authoritative shape refs + `shapeRef` NAME discriminator (A4)**. Treat `db.refs` slot pairs as **corroboration only** (`corroborationOnly`/`shapeNameMatch`/`confidence` markers); do NOT bind on a slot pair whose `shapeNameMatch` is false. Effect **color comes from `MAT_pticleMat.blendColor`** (real); the age→color ramp is runtime INFERRED.
- **D-09 (decode top-ups to confirm):** Two SCs reference sources not-yet-surfaced — resolve before/during the relevant slice, label real-vs-INFERRED: **BDEsparkemit** (confirm/ingest `FXC_BDEsparkemit` as a real `db.fxc` key) and **Blade-light values** (find the decoded LIGHT record or adopt roadmap values). *(Both RESOLVED this session — see "Decoded Data Inventory" below.)*

### Claude's Discretion

Every decision above was **auto-selected in auto-mode** (operator away, Phase-5 precedent). Grounded in CLAUDE.md Part 1 (GS→WebGL blend, 0x80=1.0, alpha-over-1.0) + Part 3 (billboard particles, ribbon trails, texture state), the Phase-5 FxDb contract + 05-04/05-05 findings, 03-02 carry-forwards (glow intensity + trail richness), and the user's fidelity bar. **The operator can adjust any decision before planning.** Highest-value review items: D-04 (trail approach), D-05 (glow-state rule INFERRED), D-01 (slice order).

### Deferred Ideas (OUT OF SCOPE)

- **Phase 4 — chain motion** — still deferred by the fast-track pivot (chain span/whip-lag solver).
- **Phase 7 — side-by-side validation + inferred tuning** — the A-B flicker harness and the "only tune INFERRED values" pass; not built here.
- **Advanced fire simulation** (curl-noise/turbulence, inter-particle forces) — beyond GoW1-era emitter fidelity and the hundreds-of-particles budget.
- **`hitbox-visualization`** — reviewed, NOT folded (separate debug capability; roadmap backlog).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **FIRE-01** | Both layered flame systems per blade (flame3 + flame6) render with the game's textures and runtime particle colors from decoded PTC records, hugging the blade in every combat frame | `PTC_flame3`/`PTC_flame6` are **real `db.ptc` keys** (632 B, shapeRef `flame3Shape`/`flame6Shape`); emitters `FXC_BDEsparkemit`(→flame6Shape) + `FXC_BDEsparkemit.0`(→flame3Shape) are **real `db.fxc` keys** with real blade-local spawn matrices. Color = `MAT_pticleMat.blendColor` `[2,2,2,1]` (real, overbright). Param field *semantics* undetermined (see Open Q1). |
| **FIRE-02** | Impact sparks (BDEsparkemit) fire on hit events from the combat state machine with decoded rate/velocity/color | `FXC_BDEsparkemit` family (4 variants, subtype 0x3 spark) confirmed as **real `db.fxc` keys** — NO decode top-up needed (D-09 resolved). Hit events available via `combat.js` `st.hits`. Velocity-aligned stretched billboards per CLAUDE.md Part 3. Rate/velocity params INFERRED (Open Q1). |
| **TRL-01** | Swing trails use the real swordtrail texture, runtime crimson tint + white-hot core, additive, fast fade, stepped 60Hz extrusion (no spline smoothing) | `GFX_swordtrail` already loaded (`trailTex`); ribbon substrate exists in `drawFx` (`trailHist`/`pushRibbon`). Additive+depth-off is the decoded `MAT_swordtrail` state (`0x48090080`). Age→color ramp is runtime INFERRED (05-04 proof: no painted ramp). |
| **TRL-02** | Dual trail system (crimson fire BFT + neutral swoosh BGT) decoded, both variants render on correct moves | `FXC_BFTemit1/2`→`PTC_BFTpart1/2` and `FXC_BGTemit1/2`→`PTC_BGTpart1/2` are **name-confirmed slot pairs** in `db.refs`. Move→variant selection reads `combat.js` state. |
| **CHAIN-03** | Chain glow state-dependent (dark at rest, hot on attacks/throws) via decoded mechanism if found, else footage-calibrated INFERRED | `FXC_CNGemit`→`PTC_CNGpart` is a **name-confirmed pair** (slot 0x1, ref `CNGpartShape`). **No decoded state-gate field exists** → the dark↔hot rule is INFERRED on `combat.js` windows (D-05). Intensity via alpha-over-1.0 premultiply. |
| **REND-02** | Per-blade warm point lights use decoded LeftBladeLight/RightBladeLight (color 1.0/0.622/0.288, intensity 2.5, range 160), vertex-lit, no shadows | **`LeftBladeLight`/`RightBladeLight` are REAL 88-byte WAD records** (tag 0x1e, @0x6a60/0x6b20). Byte-decoded values are EXACT: color `(1.0,0.622,0.288)`@+0x2c, intensity `2.5`@+0x38, range `160`@+0x44, anchor `(-0.32,-8.0,1.0)`@+0x10. **Values are REAL, not INFERRED** (D-09 resolved). |
</phase_requirements>

## Summary

This is the **render/runtime payoff phase**: it consumes the Phase-5 `FxDb` and turns decoded values into on-screen fire, sparks, trails, state-gated chain glow, and blade lights, on the locked Phase-2 pass architecture (decoded MAT/ABCD blend via `Fx.applyMaterial`, `alpha:false` canvas, 0x80=1.0 MODULATE, fixed 60Hz tick). It does not re-decode formats — Phase 5 owns that — but the two D-09 "decode top-ups" flagged in CONTEXT were both investigated this session and **resolved before planning**, materially simplifying scope.

**The two D-09 questions are answered, and both answers reduce risk:**
1. **`FXC_BDEsparkemit` is already a real `db.fxc` key** — four variants (`FXC_BDEsparkemit`, `.0`, `0`, `2`) were surfaced when 05-03 populated `db.fxc` from the WAD. **No spark decode top-up is required.** The impact-spark emitters reference `flame3Shape`/`flame6Shape`, so FIRE-01 (blade fire) and FIRE-02 (impact sparks) are the *same emitter family* distinguished only by emission trigger (continuous vs on-hit).
2. **`LeftBladeLight`/`RightBladeLight` are real, fully-decodable 88-byte WAD records** whose bytes match the roadmap values **exactly** (color `1.0/0.622/0.288`, intensity `2.5`, range `160`, plus a `-8.0`-Z blade anchor that agrees with the type-5 ANM anchor). REND-02's values become **real/decoded, not INFERRED** — the planner should schedule a thin `parseLight` decode (mirroring `parseTxr`) rather than hardcoding roadmap constants.

The one genuine data gap is **PTC particle-param *semantics***: the param float region is real and byte-decoded, but Phase 5 explicitly left the field-to-meaning mapping INFERRED (A2). Direct probing shows the region is a mixed blob (a differentially-varying scalar at param idx 3 — flame3=0.05, flame5=0.12, BFT=0.1, BGT=0.3, CNG=0.3 — a constant `16` at idx 4, `-1,-1` sentinels, and NaN words interleaved). So the runtime **cannot read a labeled `rate`/`velocity`/`lifetime`/`size` schema**; it must either (a) run a small differential-decode top-up to assign meaning to idx-3-class scalars, or (b) treat rates/velocities/sizes/lifetimes as **INFERRED footage-calibrated values anchored to the folded-todo `~30-frame` trail-gone timing**, clearly labeled. Both are legitimate under the data-first mandate; (b) is the MVP-honest default with (a) as the upgrade path. Effect *color* is settled: `MAT_pticleMat.blendColor` (real), age→color ramp INFERRED.

**Primary recommendation:** Build one world-space billboard particle pool (CLAUDE.md Part 3 blueprint) integrated on the existing `simStep()` 60Hz accumulator; spawn every family at its real decoded FXC placement-matrix translation transformed by the live blade world matrix; drive all blend state through `Fx.applyMaterial` (never a literal `blendFunc`); add an in-shader premultiply path (`rgb *= alpha128; blendFunc(ONE,ONE)`) so additive fire/glow recover true GS brightness (alpha up to ~1.99); add a `parseLight` decode + a point-light term in the existing mesh fragment shader. Treat particle color as real (`MAT_pticleMat`) and every rate/velocity/size/lifetime/age-ramp as INFERRED until a param-semantics decode lands.

## Architectural Responsibility Map

The "tiers" here are the render/sim architecture layers of kratos-lab, not web tiers. Capabilities map to the module that must own them.

| Capability | Primary Tier (owner) | Secondary Tier | Rationale |
|------------|---------------------|----------------|-----------|
| Particle integration (`pos += vel·dt`, gravity, aging, cull) | **Sim — `simStep()` in `app.js` on `loop.js` 60Hz accumulator** | — | Deterministic per-tick sim; SC1 blade-lag depends on 60Hz spawn/advect, same clock as `trailHist` recording. Must be a pure-testable helper. |
| Particle spawn anchor (world-space emitter origin) | **Sim — reads `bladeSim[key].mat` × decoded FXC matrix** | Decode (`db.fxc[...].matrix`) | Spawn is blade-local→world at spawn instant, then decoupled (D-03). Anchor value is decoded/real. |
| Emitter→particle→shape/texture binding | **Decode — `FxDb` (`db.fxc`/`db.ptc`/`db.refs`)** | — | D-08 authoritative refs + `shapeRef` name discriminator. Pure JSON graph built in Phase 5. |
| Particle GPU submission (buffer, VS billboard, draw batch) | **Render — new pool draw inside `drawFx(mvp)` in `app.js`** | `fx.js` (`applyMaterial`) | One `DYNAMIC_DRAW` buffer, `bufferSubData` per frame; batched by blend+texture. |
| Blend/depth state for every FX pass | **Render — `Fx.applyMaterial` (`fx.js`, DEC-01)** | Decode (`matDb.byName`) | Locked invariant: no hardcoded `blendFunc`. New alpha-over-1.0 premultiply entry lives here. |
| Swing-trail ribbon (extend, not replace) | **Render — `drawFx` `pushRibbon` + `trailHist`** | Sim (`trailHist` recording in `simStep`) | Ribbon is the authentic game trail mechanism; extend with runtime tint + tip-arc bias + spark riders. |
| Trail/glow variant selection (BFT vs BGT; dark vs hot) | **State — `combat.js` (`st.current`, `st.hits`, `isIdle()`, windows)** | Sim | Move-dependent + attack-window-dependent gating; INFERRED rules read combat state. |
| Chain-glow intensity recovery | **Render — mesh/FX fragment shader premultiply** | `fx.js` | alpha-over-1.0 (03-02 carry-forward): data-grounded brightness, not hand-tuning. |
| Per-blade point light | **Render — existing mesh vertex+fragment shader (`prog`)** | Decode (`parseLight`) | Vertex-lit Lambert + range attenuation; anchored at decoded light offset relative to `bladeSim[key].mat`. |
| Hit-event → spark burst trigger | **State — `combat.js` `st.hits` counter** | Sim (spawn burst) | `st.hits` increments on each non-idle move `start()`; the runtime watches it edge-triggered. |

## Standard Stack

This project **bans all external runtime libraries** (CLAUDE.md: "Vanilla WebGL1 + JS … no build step, no external libraries"). The "stack" is the in-repo module set + WebGL1 core APIs. There are **no packages to install** and **no Package Legitimacy Audit is applicable** (see that section).

### Core (existing in-repo modules — extend, do not replace)

| Module | Purpose | Why standard (this repo) | Provenance |
|--------|---------|--------------------------|------------|
| `tools/kratos-lab/app.js` `drawFx(mvp)` | Single FX insertion site: chain/glow/trail passes today; particle pool + fire/spark/light passes added here | The one place FX draws live; `renderFrame`→`drawFx` already wired | [VERIFIED: codebase, app.js:593,756] |
| `tools/kratos-lab/app.js` `simStep()` | Fixed 60Hz sim tick; already advances combat, pose, blade tracks, `trailHist` | SC1 blade-lag & trail extrusion depend on this exact clock | [VERIFIED: codebase, app.js:1047] |
| `tools/kratos-lab/loop.js` `Loop.makeAccumulator` | "Fix Your Timestep" accumulator; `advance(dt)`→integer step count, `STEP=1/60` | Pure, Node-testable; the integration clock for the particle sim | [VERIFIED: codebase, loop.js] |
| `tools/kratos-lab/fx.js` `Fx.applyMaterial(gl, mat)` / `restoreFxState(gl)` | DEC-01 MAT→GL blend applier; **every** FX pass goes through it | Locked invariant; asserts on unmapped mode | [VERIFIED: codebase, fx.js:48] |
| `tools/kratos-lab/fxparse.js` `FxParse.buildFxDb(...)` | The decoded value source (emitter/particle/shape/color graph) | Phase-5 hand-off; JSON-dumpable, pure | [VERIFIED: codebase + probe] |
| `tools/kratos-lab/combat.js` `Combat.makeMachine` | `st.hits`, `st.current`, `isIdle()`, `windows{queue,branch,cancel}` | Spark triggers + glow/variant gating | [VERIFIED: codebase, combat.js:144] |
| `tools/kratos-lab/parsers.js` `Parsers.{parseWad,resolve,decodeTexture}` | WAD record access + CLUT texture decode for any FX texture/light top-up | Reused as-is for the `parseLight` top-up + FX textures | [VERIFIED: codebase, parsers.js:326] |

### Supporting (WebGL1 core APIs — no extensions required)

| API | Purpose | When to use | Provenance |
|-----|---------|-------------|------------|
| `gl.ARRAY_BUFFER` + `gl.DYNAMIC_DRAW` + `bufferSubData` | Per-frame particle vertex rewrite | The pool's single interleaved buffer | [CITED: CLAUDE.md Part 3] |
| `gl.drawArrays(TRIANGLES, …)` + static index reuse (or 6 verts/quad) | Quad expansion | 4 verts/particle, static indices built once | [CITED: CLAUDE.md Part 3] |
| `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE)` (additive) / `(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE)` (usual) | The decoded blend modes | Emitted by `Fx.applyMaterial`, not called directly | [VERIFIED: codebase, fx.js:25-32] |
| `blendFunc(ONE, ONE)` + in-shader premultiply | alpha-over-1.0 brightness recovery (fire/glow) | The 03-02 glow-intensity fix; new `additivePremult` mode | [CITED: CLAUDE.md Part 1] |
| `gl.depthMask(false)` for additive passes | Depth-write off for glow/fire/trail | Set by `applyMaterial` from MAT bit 19; **must restore** | [VERIFIED: codebase, fx.js:52] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CPU quad expansion + VS billboard | `ANGLE_instanced_arrays` | Rejected by D-02/CLAUDE.md — GoW1 emitter budgets are hundreds; instancing adds complexity for no win below ~10k particles. |
| One shared pool, batched by blend+texture | One buffer per effect family | Rejected — a shared pool with additive commutativity needs no sort; per-family buffers multiply state changes. |
| Twisted single-ribbon trail (extend existing) | Per-link 3D torus / velocity-aligned particle sheet | Ribbon is the authentic mechanism (CLAUDE.md); only revisit if footage reads wrong at gameplay distance. |
| Runtime age→color ramp (INFERRED) | Baked texture gradient | Impossible — 05-04 proved `GFX_swordtrail` has NO painted length-wise ramp. |
| Vertex-lit point light in existing shader | Deferred/forward+ lighting, shadow maps | Rejected by D-06 — two point lights, vertex Lambert + attenuation, no shadows; PS2-authentic. |

**Installation:** None. `node` (already present) runs the pure-module tests; the browser loads classic `<script>` tags. If any browser-consumed JS changes, bump the `?v=` query on **all** `<script>` tags in `index.html` in lockstep (currently `?v=23`) — [VERIFIED: codebase, 05-PATTERNS "Script-tag versioning"].

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** CLAUDE.md hard-bans all npm/runtime dependencies ("no external libraries; all assets loaded from the git-tracked `assets/`"). All code is vanilla WebGL1 + JS in `tools/kratos-lab/`. Tests use only the Node built-in `node:assert`. There is no `package.json` at the repo root (verified). slopcheck / registry verification is moot because nothing is fetched from any registry.

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages).
**Packages flagged as suspicious [SUS]:** none (no packages).

## Decoded Data Inventory (D-09 resolution + FxDb coverage)

> This replaces the "Runtime State Inventory" (not a rename/refactor phase). It is the equivalent for this phase: *what decoded data actually exists to render from, verified by probing the live FxDb this session.* All rows are `[VERIFIED: probe]` unless marked.

| Source record | In FxDb? | Real fields available | Field *semantics* | Action for planner |
|---------------|----------|-----------------------|-------------------|--------------------|
| `PTC_flame3` / `PTC_flame6` | ✅ `db.ptc` keys (632 B) | slot 0x0, shapeRef `flame3Shape`/`flame6Shape`, 4×4 matrix, `params[133]` (raw f32), `texFormat "1555?"` | **params meaning INFERRED (A2)** — mixed blob; idx3 differentially-varying scalar (0.05), idx4=16, idx5/6=-1 sentinels, NaN words interleaved | Bind FXC→PTC by shapeRef name; use real color (`MAT_pticleMat`); rates/sizes/lifetimes INFERRED or param-semantics top-up (Open Q1) |
| `FXC_BDEsparkemit` (+`.0`,`0`,`2`) | ✅ `db.fxc` keys | subtype 0x3 spark (`2`=emitter), slot 0x0/0x2, shapeRef `flame6Shape`/`flame3Shape`/`flame5Shape`, real blade-local spawn matrix (e.g. T=(0,0.226,-9.172)) | subtype/slot/matrix/shapeRef all real | **D-09(a) RESOLVED — no top-up.** Pick canonical variant(s); flag odd names in Open Q2 |
| `FXC_BFTemit1/2` → `PTC_BFTpart1/2` | ✅ name-confirmed slot pairs (0x1d) | crimson fire trail emitter/particle | binding real (A4 name-confirmed) | Bind via `db.refs` where `shapeNameMatch===true` |
| `FXC_BGTemit1/2` → `PTC_BGTpart1/2` | ✅ name-confirmed slot pairs (0x1d) | neutral swoosh trail | binding real | Same; select BFT vs BGT per move |
| `FXC_CNGemit` → `PTC_CNGpart` | ✅ name-confirmed pair (slot 0x1, ref `CNGpartShape`) | emitter/particle color/blend real | **NO decoded state-gate field** | Dark↔hot rule is INFERRED on combat windows (D-05) |
| `LeftBladeLight` / `RightBladeLight` | ⚠️ **NOT yet decoded** — raw WAD records only | **REAL 88-B records** @0x6a60/0x6b20: color `(1.0,0.622,0.288)`@+0x2c, intensity `2.5`@+0x38, range `160`@+0x44, anchor `(-0.32,-8.0,1.0)`@+0x10; Left≡Right byte-identical | roadmap values byte-EXACT | **D-09(b) RESOLVED — values are REAL.** Add a thin `parseLight` decode (mirror `parseTxr`); do NOT hardcode |
| `MAT_pticleMat.blendColor` | ✅ `db.meta.colorSource` | `[2,2,2,1]` (real, overbright RGB=2.0) | value real, ramp INFERRED | The one sanctioned real effect color |
| `GFX_swordtrail` texture | ✅ loaded as `trailTex` | 64×32 additive streak, uniform amber, hot at cross-strip V-edge | **no painted length-wise ramp** (05-04) | Age→color ramp is runtime INFERRED |
| `MSH_BDepoly3Shape`/`6Shape` | ✅ `db.msh` keys (768 B, 24 verts) | blade-fire poly shapes | real geometry | Available if fire uses poly sheets vs pure billboards |

**Nothing found in category — stated explicitly:**
- **Decoded CNG state-gate field:** None — verified by param probe (no boolean/enum field varies with a rest/attack distinction; the params are position/scalar/sentinel floats). The dark↔hot transition is therefore INFERRED/footage-calibrated on `combat.js` (D-05).
- **Labeled particle rate/velocity/lifetime schema:** None — verified by cross-family param probe. Phase 5 tagged param *meaning* INFERRED (A2); this session confirmed the region is a mixed blob, not a labeled struct.

## Architecture Patterns

### System Architecture Diagram

```
                 decoded (Phase 5, pure)                  live state
        ┌──────────────────────────────────┐      ┌────────────────────┐
        │  FxDb (fxparse.buildFxDb)         │      │ combat.js machine  │
        │  db.fxc  emitter matrix, subtype  │      │  st.current        │
        │  db.ptc  params (INFERRED sem.)   │      │  st.hits  ◄─hit evt │
        │  db.refs name-confirmed bindings  │      │  isIdle(), windows  │
        │  db.meta.colorSource (real color) │      └─────────┬──────────┘
        │  parseLight → blade light (real)  │                │ gate: variant / dark↔hot / burst
        └───────────────┬──────────────────┘                │
                        │ decoded values                    │
                        ▼                                    ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │  simStep()  — FIXED 60Hz accumulator (loop.js)                     │
   │                                                                    │
   │  blade world matrix  bladeSim[key].mat  (driveBlade, per tick)     │
   │        │                                                           │
   │        ├─► SPAWN at (bladeSim.mat × FXC.matrix.translation)  ──┐   │
   │        │      world-space, then DECOUPLE (D-03)               │   │
   │        │                                                      ▼   │
   │        │   PARTICLE POOL (world space)                             │
   │        │   pos += vel·dt ; vel += g·dt ; age += dt ; cull age>life │
   │        │      fire | trail-spark | impact-spark (stochastic D-07)  │
   │        │                                                           │
   │        └─► trailHist[l|r].push({tip,hilt,age}) every attacking tick│
   └───────────────────────────────┬───────────────────────────────────┘
                                    │ per RENDERED frame
                                    ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │  drawFx(mvp)  — all state via Fx.applyMaterial (DEC-01)            │
   │                                                                    │
   │  PASS chain-links   usual, depth-write ON                          │
   │  PASS chain-glow    additive, depth OFF, CNG intensity ×combat-gate│  ← CHAIN-03
   │  PASS trail ribbon  additive, depth OFF, runtime age→color ramp,   │  ← TRL-01/02
   │                     tip-arc bias, BFT|BGT per move                 │
   │  PASS particle pool additive(premult), depth OFF, batched by       │  ← FIRE-01/02
   │                     blend+texture, VS billboard, velocity-stretch  │
   │  restoreFxState()   depthMask true, blend off  (leak guard)        │
   │                                                                    │
   │  mesh shader (prog): + per-blade point light term (Lambert+atten)  │  ← REND-02
   └───────────────────────────────────────────────────────────────────┘
```

Trace the primary use case (a whipping light-combo swing): `combat.press("S")` advances `st.current` → `simStep` drives `bladeSim.mat` along the authored track → each tick spawns fire particles at the blade-local FXC anchor transformed to world, which then advect and *lag* the moving blade; `trailHist` records the tip/hilt arc; on a hit `st.hits` edges and a spark burst spawns → `drawFx` renders links, glow (hot because `!isIdle()`), the BFT trail ribbon (crimson, tip-biased), and the particle pool (fire + sparks, additive-premult) → `restoreFxState` prevents depth/blend leaks.

### Recommended Structure (files touched)

```
tools/kratos-lab/
├── app.js          # drawFx: + particle pool draw; simStep: + particle integrate & spawn; mesh shader: + light term
├── fx.js           # + "additivePremult" blend entry (alpha-over-1.0); applyMaterial unchanged contract
├── fxparse.js      # + parseLight (thin, mirrors parseTxr); optional param-semantics helper
├── particles.js    # NEW (recommended): pure particle-pool sim (spawn/integrate/cull) — Node-testable
├── index.html      # bump ?v= on ALL <script> tags in lockstep (new particles.js tag)
└── test/
    ├── particles.test.js   # NEW: pure sim known-answers (spawn anchor, euler advect, cull, blade-lag)
    ├── light.test.js       # NEW (or extend fxdb): LeftBladeLight byte-exact known-answers
    └── fxdb.test.js        # extend: BDEsparkemit/CNG binding assertions
```

**Why a new pure `particles.js`:** the integration math (`pos+=vel·dt`, gravity, aging, cull, spawn-anchor transform, velocity-stretch axis) is the automatable core of SC1/SC2 and can be a pure module (like `loop.js`/`chain.js`) that returns particle arrays with **no GL/DOM** — Node-testable, mirroring the established scaffold. The GL submission (buffer/attributes/draw) stays in `app.js`. [CITED: 05-PATTERNS module-scaffold pattern]

### Pattern 1: World-space billboard particle pool

**What:** One interleaved `Float32Array`, one `gl.ARRAY_BUFFER` (`DYNAMIC_DRAW`), 4 verts/particle, static index buffer built once, rewritten per frame with `bufferSubData`. Billboarding done in the vertex shader from the view/camera-right/up vectors — no per-particle CPU matrices.
**When:** All particle families (fire, trail-sparks, impact-sparks) share it; draw calls batched by blend group + texture; additive commutes so no depth sort.
**Example:** see Code Examples → "Billboard vertex shader" and "Velocity-aligned stretch".
[CITED: CLAUDE.md Part 3 "Billboard particles"]

### Pattern 2: Blade-local spawn → world-space decouple (SC1 blade-lag)

**What:** At spawn time, take the emitter's decoded FXC placement-matrix translation (blade-local, e.g. `FXC_BDEsparkemit` T=(0,0.226,−9.172)), transform it by the live blade world matrix `bladeSim[key].mat` (`xformM`), and write that as the particle's world position. After spawn the particle integrates in world space only (`pos+=vel·dt`) — it never re-reads the blade. A fast blade outruns its already-spawned particles → fire *lags*. Integrate on `simStep()` at exactly `Loop.STEP`, alongside the existing `trailHist` recording.
**When:** Fire (continuous, every attacking tick) and impact-sparks (burst on `st.hits` edge).
**Anti-pattern avoided:** parenting live particles to the blade matrix (blade-locked fire = a known failure mode, CONTEXT specifics).
[VERIFIED: codebase `xformM` app.js:540, `bladeSim.mat` app.js:499; CITED: CONTEXT D-03]

### Pattern 3: Decoded-blend-only + alpha-over-1.0 premultiply

**What:** Never call `blendFunc`/`depthMask` directly in a new pass — call `Fx.applyMaterial(gl, mat)`. For the fire/glow brightness (GS allows source alpha up to ~1.99; `MAT_pticleMat` RGB is already `2.0` overbright), add ONE new mode to `fx.js`'s `MATGL` table: `additivePremult` → `blendFunc(ONE, ONE)`, and in the fragment shader output `gl_FragColor.rgb = color.rgb * alpha128` (alpha128 unclamped). Mathematically identical to `Cs·As + Cd` with no clamp. Keep the existing `additive` (SRC_ALPHA,ONE) for the ≤0x80 cases.
**When:** Chain glow (CHAIN-03 intensity recovery), fire particles. This is the data-grounded fix for the 03-02 "glow reads too subtle" lever — **not** a hand-tuned multiplier.
[CITED: CLAUDE.md Part 1 "alpha-over-1.0 problem"; VERIFIED: codebase fx.js:14-19 comment already anticipates this entry]

### Pattern 4: Trail ribbon extension (not replacement)

**What:** Keep `pushRibbon`/`trailHist`. Add: (a) a runtime age→color ramp uniform (white-hot core → orange → ember) applied in the trail fragment shader, driven by row age (INFERRED, tune to the ~30-frame trail-gone anchor); (b) keep/verify `TRAIL_INNER_T≈0.6` tip-arc bias; (c) spawn trail-spark particles along the recorded arc via the shared pool; (d) select `MAT`/texture + ramp for BFT (crimson) vs BGT (neutral) from `combat.js` move state.
**When:** Every attacking swing; variant per move (TRL-02).
[VERIFIED: codebase app.js:624-634, 1069-1079]

### Pattern 5: Combat-gated intensity/variant (INFERRED rules)

**What:** Read `machine.st` in `drawFx`/`simStep`: `isIdle()` false ⇒ chain glow hot + trail active; `st.hits` edge ⇒ spark burst; `st.current` name ⇒ BFT vs BGT selection; `windows.branch`/attack fraction ⇒ ramp the glow up/down. All these transition rules are **INFERRED** (footage-calibrated) — labeled as such — because no decoded state-gate exists.
**When:** CHAIN-03 dark↔hot, TRL-02 variant, FIRE-02 burst.
[VERIFIED: codebase combat.js `st.hits`:172, `isIdle`:157, `windows`:145]

### Pattern 6: Per-blade point light in the existing mesh shader

**What:** Decode `LeftBladeLight`/`RightBladeLight` (thin `parseLight`). Pass two uniforms (light world position = blade anchor transformed by `bladeSim[key].mat`, color, intensity, range) into `prog`. In the vertex shader compute a per-vertex Lambert term with linear range attenuation `atten = max(0, 1 − dist/range)`; add `lightColor * intensity * lambert * atten` to the existing lit color. No shadows.
**When:** REND-02, applied to hero + blade meshes.
[VERIFIED: codebase mesh shader app.js:124-152, decoded light values this session]

### Anti-Patterns to Avoid

- **Hardcoding a `blendFunc` in a new pass** — violates DEC-01; use `Fx.applyMaterial`. The `additivePremult` mode must be added to the table, not inlined.
- **Leaving `depthMask(false)` or a non-`FUNC_ADD` `blendEquation` set after the pool draw** — Spector-catchable state leak; the next frame's depth clear breaks. Call `Fx.restoreFxState(gl)` after all FX passes (already the pattern). [CITED: CLAUDE.md Part 3 "Frame/state ordering"]
- **Parenting live particles to the blade** — kills the blade-lag (SC1). Spawn-then-decouple only.
- **`gl.POINTS` point sprites** — size caps / center-clipping / no rotation (CLAUDE.md What-NOT-to-Use). Use quads.
- **Mipmaps / trilinear on FX textures** — smears the strip; NEAREST/LINEAR only, no mips.
- **Depth-sorting additive particles** — addition commutes; sorting costs CPU for zero visual change.
- **Post-process bloom for glow** — banned; glow is asset-driven (`chainglow` texture on additive geometry) + alpha-over-1.0.
- **Fabricating a "crimson" PTC color field** — color is `MAT_pticleMat.blendColor` (real) tinted by a runtime INFERRED ramp; never invent a real-tagged effect color (Pitfall 4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MAT→GL blend/depth mapping | A per-pass `blendFunc` switch | `Fx.applyMaterial(gl, mat)` | DEC-01 locked; asserts on unknown mode; single source of PS2 blend truth |
| Fixed-timestep integration | A `requestAnimationFrame`-delta sim | `Loop.makeAccumulator` on `simStep()` | Spiral-of-death clamp + exact 60Hz on any refresh; already Node-tested |
| WAD record location / same-name copy selection | A new byte scanner | `Parsers.parseWad` + `Parsers.resolve` | Nearest-preceding, tag/size rules byte-verified over 283 records |
| CLUT texture decode (light/FX textures) | A palette unpacker | `Parsers.decodeTexture(gfx, pal)` | 0x80-alpha ×255/128 handled; used by `fxTexFromMat` |
| Emitter→particle→shape binding | A slot cross-multiply | `db.refs` where `shapeNameMatch===true` (+ shapeRef name match for slot-0x0 fire) | A4: slot is a GROUP id; name is the real discriminator; off-diagonal slot pairs are false links |
| Effect color source | A hand-picked crimson | `db.meta.colorSource` (`MAT_pticleMat.blendColor`) | The one sanctioned real color; ramp is INFERRED |
| Light record decode | A bespoke struct reader | New `parseLight` mirroring `parseTxr` (size-gate→named reads) | Same fail-loud idiom; keeps decode pure/testable |
| NUL-terminated name reads | Inline string loops | `readName(buf, off, len)` in `fxparse.js` | Reused everywhere; dev-garbage-after-NUL handled |

**Key insight:** almost every "primitive" this phase needs already exists as a tested pure helper. The genuinely new code is (1) the particle pool sim + GL submission, (2) the `additivePremult` blend entry, (3) `parseLight`, (4) the mesh-shader light term, (5) the trail ramp/variant/spark wiring — everything else is composition of existing, verified pieces.

## Common Pitfalls

### Pitfall 1: Reading PTC params as a labeled rate/velocity/lifetime struct
**What goes wrong:** Treating `db.ptc[x].params[i]` as `params.rate`, `params.velocity`, etc. produces garbage (NaN words, sentinels) and silently wrong emission.
**Why it happens:** Phase 5 decoded the param *bytes* (real) but explicitly left field *meaning* INFERRED (A2); the region is a mixed blob, not a struct.
**How to avoid:** Use the differentially-varying scalars as anchors only (idx-3-class), and either (a) run a small differential top-up to assign meaning, or (b) drive rate/velocity/lifetime from INFERRED footage-calibrated constants (label them). Never present them as real.
**Warning signs:** `NaN` in a value you expected to use; identical values across families you expected to differ.

### Pitfall 2: Additive passes washed out by page compositing
**What goes wrong:** Additive fire/glow looks milky or clipped.
**Why it happens:** A premultiplied-alpha canvas or `{alpha:true}` context lets the page composite over additive output.
**How to avoid:** The context is already `{alpha:false}` (app.js:123) — do not change it; verify with the magenta-background additive test (put a magenta clear behind an FX-only render; additive output must add to magenta, not blend over it).
**Warning signs:** FX intensity changes when the page background changes.

### Pitfall 3: State leak from the pool draw
**What goes wrong:** Chain/blade depth breaks next frame, or a later pass blends wrong.
**Why it happens:** `depthMask(false)` or `blendEquation` left un-restored after the additive pool.
**How to avoid:** Route every pass through `Fx.applyMaterial` and end `drawFx` with `Fx.restoreFxState(gl)` (existing pattern). Add the pool draw *inside* `drawFx` before the restore. Verify with `KratosLab.fxState()` (blendEnabled false, FUNC_ADD, depthMask true between frames) and Spector.js.
**Warning signs:** `fxState()` shows depthMask false or non-FUNC_ADD equation between frames.

### Pitfall 4: Blade-locked fire (no lag)
**What goes wrong:** Fire sticks rigidly to the blade; the whip has no trailing flame.
**Why it happens:** Sampling the blade matrix every frame for live particles instead of only at spawn.
**How to avoid:** Spawn-anchor once, then integrate in world space (Pattern 2).
**Warning signs:** Fire particle positions track the blade tip exactly during a fast swing.

### Pitfall 5: Sim coupled to render frame rate
**What goes wrong:** More/less fire on 144Hz vs 60Hz; trail cadence differs by display.
**Why it happens:** Spawning/integrating in `renderFrame(wallDt)` instead of `simStep()`.
**How to avoid:** All spawn + integrate in `simStep()` (exactly `Loop.STEP`); `renderFrame` only submits the current pool state. Mirrors how `trailHist` is already recorded per tick, not per frame.
**Warning signs:** `KratosLab.simStepCount` drift vs particle count; different look at different refresh rates.

### Pitfall 6: Binding fire on the slot pair
**What goes wrong:** `FXC_BDEsparkemit` (slot 0x0) fails to pair with `PTC_flame6`, or pairs with the wrong particle.
**Why it happens:** WAD-native fire uses the **placeholder slot 0x0**, which `buildFxDb` deliberately does NOT pair (avoids false 0x00×0x00 links). The binding is via **shapeRef name** (`FXC_BDEsparkemit.shapeRef "flame6Shape"` == `PTC_flame6.shapeRef "flame6Shape"`).
**How to avoid:** For the fire family, join emitter→particle by matching `shapeRef` strings (both point at `flameNShape`), not by `db.refs` slot pairs. Slot pairs cover only the standalone 0x1d/0x1 families (BFT/BGT/CNG/FXCF).
**Warning signs:** Empty binding for `FXC_BDEsparkemit`; using a `db.refs` slot entry with `shapeNameMatch:false`.

### Pitfall 7: Choosing the wrong BDEsparkemit variant
**What goes wrong:** Rendering an empty/duplicate emitter, or mixing level-1 and god-tier.
**Why it happens:** Four similarly-named records exist (`FXC_BDEsparkemit`, `.0`, `0`, `2`) plus size-0 back-references; keep-first already drops the size-0 dupes but the meaning of the suffixed names is unconfirmed.
**How to avoid:** Treat `FXC_BDEsparkemit` (→flame6Shape) and `FXC_BDEsparkemit.0` (→flame3Shape) as the flame3/flame6 pair for FIRE-01; confirm variant selection against footage (Open Q2). Level-1 keep-first is already enforced.
**Warning signs:** A spark emitter whose shapeRef resolves to `flame5Shape` (god/other tier) being used for level-1 blade fire.

## Code Examples

Verified patterns. GL snippets follow the existing `drawFx`/`fx.js` idioms; the billboard VS is the CLAUDE.md Part 3 blueprint.

### Billboard vertex shader (view-matrix columns → camera right/up)
```glsl
// Source: CLAUDE.md Part 3 "Vertex shader billboarding"
attribute vec3 aCenter;   // particle world center
attribute vec2 aCorner;   // ±halfSize (x,y)
attribute vec2 aUV;
attribute vec4 aColor;     // rgb + alpha128 (normalized at decode; may exceed 1.0)
uniform mat4 uMVP;
uniform vec3 uCamRight;    // = normalize(view row 0)  (columns of the view's transpose)
uniform vec3 uCamUp;       // = normalize(view row 1)
varying vec2 vUV; varying vec4 vColor;
void main() {
  vec3 world = aCenter + uCamRight * aCorner.x + uCamUp * aCorner.y;
  gl_Position = uMVP * vec4(world, 1.0);
  vUV = aUV; vColor = aColor;
}
```

### Velocity-aligned stretched spark (axis built in VS from projected velocity)
```glsl
// Source: CLAUDE.md Part 3 "Spark stretching"
attribute vec3 aVel;       // per-particle world velocity
// build the stretch axis from velocity; corner.x rides the axis, corner.y the perpendicular
vec3 axis = length(aVel) > 1e-4 ? normalize(aVel) : uCamUp;
vec3 perp = normalize(cross(axis, /*view dir*/ uCamRight));
vec3 world = aCenter + axis * aCorner.x + perp * aCorner.y;
```

### alpha-over-1.0 additive premultiply (new fx.js entry + fragment)
```js
// Source: CLAUDE.md Part 1; extends fx.js MATGL table (fx.js:24)
additivePremult: (gl) => {
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE);           // premultiplied source
},
```
```glsl
// fragment: alpha128 may exceed 1.0 (GS As up to ~1.99); no clamp
gl_FragColor = vec4(vColor.rgb * vColor.a, 0.0);  // Cs·As + Cd, dest untouched
```

### Blade-local spawn → world (SC1)
```js
// Source: VERIFIED codebase — xformM (app.js:540), bladeSim[key].mat (app.js:499)
// at spawn, inside simStep(), for the attacking blade:
const m = bladeSim[key].mat;                 // live blade world matrix this tick
const anchorLocal = fxc.matrix.slice(12, 15); // decoded FXC placement translation (blade-local)
const spawnWorld = xformM(m, anchorLocal);    // world position; particle decouples after this
pool.spawn({ pos: spawnWorld, vel: jitter(inferredVel), age: 0, life: inferredLife });
```

### parseLight (thin decode, mirrors parseTxr) — REND-02
```js
// Source: VERIFIED probe — LeftBladeLight @0x6a60, 88 B; fields byte-exact
// mirror parseTxr idiom (fxparse.js:159): size-gate BEFORE reads, name the record
function parseLight(buf, rec) {
  if (rec.size < 0x48) throw new Error(`LIGHT ${rec.name}: size ${rec.size} < 0x48`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const b = rec.dataOff;
  return {
    anchor:    [dv.getFloat32(b+0x10,true), dv.getFloat32(b+0x14,true), dv.getFloat32(b+0x18,true)], // (-0.32,-8.0,1.0)
    color:     [dv.getFloat32(b+0x2c,true), dv.getFloat32(b+0x30,true), dv.getFloat32(b+0x34,true)], // (1.0,0.622,0.288)
    intensity:  dv.getFloat32(b+0x38,true),  // 2.5
    range:      dv.getFloat32(b+0x44,true),  // 160
  };
  // NOTE: exact field boundaries at +0x24..+0x44 (two RGB-ish triples + 8.0 + 1.5)
  // warrant a short differential/evidence pass; the four values above are unambiguous.
}
```

### Combat-gated spark burst (FIRE-02) + glow state (CHAIN-03)
```js
// Source: VERIFIED codebase — combat.js st.hits (:172), isIdle() (:157)
// in simStep(): edge-detect hits for spark bursts
if (machine.st.hits !== prevHits) { pool.burstSparks(bladeSim, fxcSpark, /*INFERRED count*/); prevHits = machine.st.hits; }
// in drawFx(): glow intensity gated by attack state (INFERRED rule)
const glowGain = machine.isIdle() ? GLOW_REST : GLOW_HOT;   // alpha128 scale into premult path
```

## State of the Art

The render domain is fixed by hard project constraints (WebGL1, no libraries, PS2-authentic math), so there is little "moving" state of the art. The relevant shifts are internal to this project:

| Old Approach (current lab) | Current Approach (this phase) | When Changed | Impact |
|----------------------------|-------------------------------|--------------|--------|
| Hardcoded thin trail ribbon, `trailImg` blade texture | Real `GFX_swordtrail` + runtime INFERRED age→color ramp + tip bias + spark riders | Phase 6 | The user's #1 "too thin/basic" complaint |
| Chain glow at clamped alpha≤1.0 (reads subtle) | alpha-over-1.0 premultiply (ONE,ONE) — true GS brightness | Phase 6 (03-02 lever) | Glow reads hot on attacks |
| No particle system | Shared world-space billboard pool, 60Hz Euler | Phase 6 | Fire, sparks, trail density |
| Blade-light values undecoded (roadmap only) | Real `parseLight` decode (byte-exact) | Phase 6 | REND-02 values become real, not INFERRED |
| Effect color unknown | `MAT_pticleMat.blendColor` (real) + INFERRED ramp | Phase 5 (05-04) | Data-first color provenance settled |

**Deprecated/outdated:**
- The `bladeSim`/`driveBlade`/`rig.bladePos` blade motion is a **pre-existing approximation** with a known chain-span spike during fast combos (STATE blockers: Phase 4 owns the real solver). Particle spawn rides `bladeSim[key].mat` as-is; do not attempt to fix blade motion here (out of scope — Phase 4).
- `TRAIL_INNER_T=0.6` and `LINK_PITCH=0.9` are INFERRED values flagged for footage re-judging (Phase 7); keep, don't re-derive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Particle rate/velocity/size/lifetime driven by **INFERRED footage-calibrated constants** (param semantics undecoded) | Decoded Data Inventory, Pitfall 1 | Fire/spark density or motion reads wrong vs footage; mitigated by Phase-7 tuning + optional param-semantics top-up |
| A2 | The dark↔hot **chain-glow transition rule is INFERRED** on `combat.js` windows (no decoded state gate) | CHAIN-03, D-05 | Glow timing/threshold off vs footage; tunable INFERRED value (Phase 7) |
| A3 | Trail **age→color ramp** (white-hot→orange→ember) is runtime INFERRED (no painted ramp — 05-04 proven) | TRL-01, Pattern 4 | Ramp shape/colors mis-tuned; label INFERRED, calibrate to ~30-frame anchor |
| A4 | `FXC_BDEsparkemit` (→flame6Shape) + `FXC_BDEsparkemit.0` (→flame3Shape) are the **canonical level-1 flame3/flame6 emitters** | FIRE-01, Pitfall 7 | Wrong variant → empty/duplicate/god-tier fire; confirm vs footage (Open Q2) |
| A5 | `parseLight` **field offsets** at +0x24..+0x44 (beyond the 4 unambiguous values) are as read; a short evidence pass may refine | parseLight example, REND-02 | The 4 core values (color/intensity/range/anchor) are byte-exact and safe; only ancillary fields at risk |
| A6 | Continuous blade fire and impact sparks are the **same emitter family** (BDEsparkemit) differing by trigger | FIRE-01/02, Summary | If footage shows a distinct impact-spark asset, FIRE-02 may need a different emitter; low risk (naming + refs support this) |
| A7 | The `additivePremult` (ONE,ONE) path is the correct WebGL1 equivalent for `MAT_pticleMat` RGB=2.0 overbright fire | Pattern 3 | If a specific effect's real GS ABCD differs, brightness could over/undershoot; GS-dump is the upgrade path (D-06 SKIP kept blend MEDIUM) |

**If this table is empty:** it is not — every INFERRED/assumed item above needs user/footage confirmation before it becomes a locked value (Phase 7 tuning gate). Real/decoded items (BDEsparkemit presence, blade-light values, color source, bindings) are NOT in this table — they are verified fact.

## Open Questions

1. **Particle param semantics (rate/velocity/lifetime/size mapping).**
   - What we know: param bytes are real; a scalar at idx 3 varies per family (flame3=0.05, flame5=0.12, BFT=0.1, BGT=0.3, CNG=0.3), idx 4=16 constant, idx 5/6=−1 sentinels; NaN words interleaved.
   - What's unclear: which offset is rate vs velocity vs lifetime vs size.
   - Recommendation: MVP drives these from INFERRED constants (label them); optionally schedule a thin differential-decode top-up (across flame3/5/6, BFT/BGT, CNG) to promote idx-3-class scalars to real. Do not block the payoff slices on it.

2. **Which `FXC_BDEsparkemit` variant is canonical for level-1 blade fire vs impact spark.**
   - What we know: `FXC_BDEsparkemit`→flame6Shape, `.0`→flame3Shape, `0`(slot 0x2)→flame3Shape, `2`(subtype 0x2)→flame5Shape; size-0 dupes dropped by keep-first.
   - What's unclear: the suffix semantics (`.0`/`0`/`2`) and whether one variant is the on-hit burst.
   - Recommendation: use `FXC_BDEsparkemit` + `.0` as the flame6/flame3 pair (FIRE-01); reuse the same family for the on-hit burst (FIRE-02) with an INFERRED higher rate; confirm against footage in Phase 7.

3. **`parseLight` full field map.**
   - What we know: color(+0x2c), intensity(+0x38), range(+0x44), anchor(+0x10) are byte-exact; +0x00=6, +0x08=1 (type/flags), +0x24..+0x2c=(1,1,1), +0x3c=8.0, +0x40=1.5 also present.
   - What's unclear: whether +0x24 triple is ambient, +0x3c/+0x40 are falloff exponents/inner-range.
   - Recommendation: decode the 4 core values as real now; a short evidence pass can attribute the ancillary fields (low priority — REND-02 only needs color/intensity/range/anchor).

4. **How much of "fire hugs the blade in every combat frame" (FIRE-01) needs the blade-fire poly shapes (`MSH_BDepoly3/6Shape`) vs pure billboards.**
   - What we know: 24-vert blade-fire shapes exist and are decoded; the emitters reference flame *particle* shapes.
   - What's unclear: whether GoW1 draws the flame as billboard particles, as the BDepoly sheets, or both layered.
   - Recommendation: MVP uses billboards from the shared pool (simplest, matches "layered flame3+flame6"); keep BDepoly sheets as a fallback if footage reads wrong at gameplay distance.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Pure-module tests (`particles.test.js` etc.) | ✓ | present (runs existing suite green) | — |
| WebGL1 (`alpha:false` context) | All render passes | ✓ (assumed browser target) | core WebGL1, no extensions | — |
| `assets/wads/R_WPN0_0.WAD` | Blade light + spark/flame/CNG decode | ✓ | git-tracked curated subset | — |
| `assets/kratos/fx/*.bin` (BFT/BGT/CNG/FXCF) | Trail + chain-glow standalone families | ✓ | git-tracked | — |
| `assets/weapon/GFX_swordtrail.bin` + `PAL_swordtrail.bin` | Trail texture | ✓ | git-tracked | — |
| PCSX2 GS dump | Per-effect blend ground truth (optional) | ✗ (D-06 SKIP) | — | Keep MAT-decoded blend at documented MEDIUM; GS-dump is the non-blocking upgrade path |

**Missing dependencies with no fallback:** none — all render inputs are present and verified.
**Missing dependencies with fallback:** GS dump (declined by user in Phase 5; per-effect blend stays MEDIUM, MAT-decoded blend is authoritative for now).

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in `node:assert` (zero-dependency, project constraint) |
| Config file | none — each `test/*.test.js` is a standalone runnable |
| Quick run command | `node tools/kratos-lab/test/particles.test.js` (per-slice pure sim) |
| Full suite command | `node tools/kratos-lab/test/fxdb.test.js && node tools/kratos-lab/test/wad.test.js && node tools/kratos-lab/test/fx.test.js && node tools/kratos-lab/test/loop.test.js && node tools/kratos-lab/test/chain.test.js && node tools/kratos-lab/test/anm.test.js && node tools/kratos-lab/test/particles.test.js && node tools/kratos-lab/test/light.test.js` |

*(Baseline confirmed green this session: all six existing suites exit 0.)*

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FIRE-01 | flame3/flame6 emitters bind to real PTC by shapeRef; spawn anchor = FXC matrix × blade matrix | unit (pure) | `node tools/kratos-lab/test/particles.test.js` (spawn-anchor known-answer) + `fxdb.test.js` (binding) | ❌ Wave 0 |
| FIRE-01 | Fire lags a moving blade (spawn-decouple): after N ticks a particle's world pos ≠ blade tip when blade moves | unit (pure) | `particles.test.js` (blade-lag: move blade between spawn and integrate; assert divergence) | ❌ Wave 0 |
| FIRE-02 | `st.hits` edge triggers a spark burst; burst count/velocity from decoded/INFERRED | unit (pure) | `particles.test.js` (hit-edge → burst-count assertion) | ❌ Wave 0 |
| FIRE-02 | `FXC_BDEsparkemit` is a real `db.fxc` key (subtype 0x3, shapeRef flameNShape) | unit | `fxdb.test.js` (extend: assert key + subtype + shapeRef) | ⚠️ extend |
| TRL-01 | Ribbon extrusion stepped at 60Hz (no spline); age fade monotonic | unit (pure) | `particles.test.js`/existing chain-walker style (row age→alpha ramp) | ❌ Wave 0 |
| TRL-01 | Trail material decodes additive + depth-off (`MAT_swordtrail` 0x48090080) | unit | `fx.test.js`/`wad.test.js` (already covers MAT decode) | ✅ |
| TRL-02 | Move name → BFT vs BGT selection is deterministic | unit (pure) | `particles.test.js` (variant-select table) | ❌ Wave 0 |
| CHAIN-03 | `isIdle()` false ⇒ glow gain HOT, true ⇒ REST (INFERRED rule) | unit (pure) | `particles.test.js`/small combat-gate test | ❌ Wave 0 |
| CHAIN-03 | `FXC_CNGemit`→`PTC_CNGpart` name-confirmed pair present | unit | `fxdb.test.js` (extend: assert name-confirmed ref) | ⚠️ extend |
| REND-02 | `LeftBladeLight`/`RightBladeLight` decode to color(1.0,0.622,0.288), intensity 2.5, range 160, anchor(-0.32,-8.0,1.0) | unit | `node tools/kratos-lab/test/light.test.js` (byte-exact known-answer) | ❌ Wave 0 |
| REND-02 | Range attenuation math: `atten(dist=range)=0`, `atten(0)=1` | unit (pure) | `light.test.js` or `particles.test.js` | ❌ Wave 0 |
| All (visual) | Additive passes add over a magenta clear (no wash); no state leak (`fxState()` clean) | manual/browser | `window.KratosLab.fxState()` + magenta-bg + Spector.js | manual (Phase-7 harness) |
| All (cadence) | Same particle count at 60Hz vs 144Hz (sim on `simStep`) | manual/scripted | `KratosLab.step()` N times, count particles; `simStepCount` witness | semi-auto |

### Sampling Rate
- **Per task commit:** the slice's pure test (`node tools/kratos-lab/test/particles.test.js` or `light.test.js`) — < 1s.
- **Per wave merge:** full suite command above — all suites exit 0.
- **Phase gate:** full suite green + the manual magenta/Spector/cadence checks before `/gsd:verify-work`. The full footage side-by-side judgment is **Phase-7** (VAL-02) — this phase asserts the *automatable* invariants (binding, spawn math, decode values, blend/depth state, cadence) and defers the perceptual 80–90% match.

### Wave 0 Gaps
- [ ] `tools/kratos-lab/test/particles.test.js` — pure sim known-answers: spawn-anchor transform, Euler advect, cull, blade-lag divergence, hit-edge burst, ramp monotonicity, variant-select, glow-gate (covers FIRE-01/02, TRL-01/02, CHAIN-03 sim halves)
- [ ] `tools/kratos-lab/test/light.test.js` — `parseLight` byte-exact known-answers for `LeftBladeLight`/`RightBladeLight` + attenuation math (covers REND-02) — *or* fold into `fxdb.test.js`
- [ ] Extend `tools/kratos-lab/test/fxdb.test.js` — assert `FXC_BDEsparkemit` key/subtype/shapeRef, `FXC_CNGemit`→`PTC_CNGpart` name-confirmed ref, fire shapeRef-name binding
- [ ] New pure module `tools/kratos-lab/particles.js` so the sim is Node-testable (GL submission stays in `app.js`)
- [ ] Framework install: none needed (`node:assert` only)

*(Existing infra covers MAT/blend decode, WAD access, accumulator, ribbon-walker; the gaps above are the new particle/light surface.)*

## Security Domain

> `security_enforcement` is not set in `.planning/config.json` (absent ⇒ treated as enabled). This is a **local, offline, single-user browser tool** with no auth, no network I/O at runtime, no user accounts, and no untrusted external input — most ASVS categories are N/A. Retained the input-validation category because the code parses binary game files.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface (local tool) |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No multi-user / resources |
| V5 Input Validation | **yes** | Fail-loud size-gate-before-read on every decoder (`parseLight` must mirror `parseTxr`: size-gate BEFORE any field read, name the record) — prevents OOB reads into adjacent WAD records (WR-01) |
| V6 Cryptography | no | No crypto |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| OOB read past a short/corrupt WAD record into the next record | Information disclosure / Tampering | Size-gate before reads, bound every loop by `rec.size` (existing decoder discipline; apply to `parseLight` + any param reader) |
| Malformed float region → `NaN`/`Infinity` propagating into GL uniforms | Denial of Service (render corruption) | Guard/skip non-finite params; never feed `NaN` to `bufferSubData`/uniforms (relevant to the PTC param blob) |
| Unbounded particle growth (spawn without cull) | Denial of Service (perf) | Hard pool cap + lifetime cull; the `maxFrame` accumulator clamp already bounds catch-up steps |

*No secrets, tokens, PII, or network calls are introduced by this phase. The only "external input" is the git-tracked disc-derived asset bytes, already parsed by the fail-loud decoders.*

## Sources

### Primary (HIGH confidence)
- **First-party codebase probing this session** (`node` against `tools/kratos-lab/` + `assets/`): `buildFxDb` key dump; `PTC_flame3/6/5`, `CNG`, `BFT`, `BGT` param dumps; `FXC_BDEsparkemit` variant enumeration; `LeftBladeLight`/`RightBladeLight` byte decode (color/intensity/range/anchor); fire shapeRef-name binding; full test suite green — all `[VERIFIED: probe]`.
- `CLAUDE.md` Part 1 (GS→WebGL blend table, 0x80=1.0, alpha-over-1.0), Part 3 (billboard particles, ribbon trails, FX texture state), "What NOT to Use", "Version Compatibility" — the authoritative technique research with HIGH-confidence upstream sources (ps2tek, PCSX2 `GSDevice.cpp`, mogaika/god_of_war_browser) — `[CITED: CLAUDE.md]`.
- `tools/kratos-lab/{app.js,fx.js,fxparse.js,loop.js,combat.js,parsers.js}` read in full/part — `[VERIFIED: codebase]`.
- `.planning/phases/05-fx-record-decode/05-03/04-SUMMARY.md` + `05-PATTERNS.md` — FxDb contract, color provenance, no-painted-ramp proof, decode idioms.
- `.planning/phases/06-.../06-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — locked decisions, requirement acceptance text, carry-forward levers.

### Secondary (MEDIUM confidence)
- Phase-5 D-06 SKIP disposition: per-effect GS blend confidence remains MEDIUM (MAT-decoded blend authoritative; GS-dump is the non-blocking upgrade path).

### Tertiary (LOW confidence)
- None. No unverified WebSearch findings were used — the domain is fully covered by CLAUDE.md's first-party research plus this session's codebase probing.

## Metadata

**Confidence breakdown:**
- Standard stack / architecture: HIGH — all modules exist and were read; render technique pinned by CLAUDE.md's first-party sources.
- Data coverage (D-09): HIGH — every claim about FxDb keys, bindings, blade-light values, and CNG state-gate absence was verified by direct probe this session.
- Particle param *semantics*: LOW (correctly so) — undecoded by design; flagged INFERRED with an optional top-up path.
- Per-effect blend correctness: MEDIUM — MAT-decoded blend is authoritative; GS-dump upgrade path documented (D-06 SKIP).
- Pitfalls / validation: HIGH — grounded in the existing DEC-01 discipline, `fxState()` hooks, and the green test baseline.

**Research date:** 2026-07-26
**Valid until:** stable — the WebGL1/PS2 domain and the git-tracked assets do not move; re-verify only if the FxDb schema or `fx.js`/`drawFx` contracts change (estimate 30 days / next phase boundary).
