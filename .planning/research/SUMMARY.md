# Project Research Summary

**Project:** Chains of Chaos — Visual Fidelity (kratos-lab)
**Domain:** PS2 (GS)-authentic game VFX reproduction in vanilla WebGL1, driven by disc-decoded data
**Researched:** 2026-07-24
**Confidence:** HIGH overall (MEDIUM–LOW only where the project's own reverse engineering is the work)

## Executive Summary

This project reproduces the GoW1 (2005) Level-1 Blades of Chaos weapon presentation — chain links, heat glow, blade fire, sparks, swing trails — inside the existing kratos-lab WebGL1 viewer, using the game's own data. Research converges on a clear picture: the *rendering* side is a solved problem with authoritative references (the GS blend equation `((A−B)·C >> 7) + D` maps cleanly onto core WebGL1 via PCSX2's canonical `m_blendMap`; the MAT record format including blend/depth-write flags is fully decoded in mogaika/god_of_war_browser and ports directly), while the *data* side splits in two: MAT/ANM/texture records are decodable today with known-good specs, but the FXC emitter configs, PTC particle defs, and MSH_BDepoly shapes have **no public decode anywhere** — that is original reverse engineering and the single largest unknown in the project.

The recommended approach follows a strict ordering discovered independently by both the architecture and pitfalls research: establish uncontaminated ground truth first (PCSX2 software-renderer, native-res capture library — YouTube footage is chroma-subsampled and hue-shifted, usable for motion/timing only), then take the cheap real-data win (WAD directory parser + MAT decode + a single MAT→GL blend mapping table, which immediately upgrades the existing chain/trail draws), then split into two parallel tracks: a chain-visual track that needs **no new decoding** (ribbon texturing, glow overlay, catenary/whip motion) and a decode-gated fire/spark track (MSH → PTC → FXC differential decode across the 15+ record instances, then a particle runtime driven by decoded values). A key research finding reframes one requirement: **the game has no chain geometry — the chain is a textured ribbon** (`chainlink`, 512×32, 16 links/tile), so "segmented 3D-reading links" should be delivered as a correctly pitched, per-link-twisted ribbon, not 3D link meshes, which would actually read *less* authentic.

The dominant risks are convention errors that silently poison every later visual judgment: the GS 0x80=1.0 alpha/modulation convention (get it wrong and all FX render at half or double brightness), blend tuple mistranslation, gamma-"correct" rendering (the authentic pipeline is the naive clamped-LDR one), wall-clock particle timing (everything is authored in 60Hz ticks), and validating against contaminated footage. All are cheap to prevent up front and expensive to recover from late — the phase ordering below exists specifically to front-load them.

## Key Findings

### Recommended Stack

This is a technique stack, not a package stack — vanilla WebGL1 + JS, zero runtime dependencies (project constraint). Everything needed is core WebGL1; no extensions required.

**Core techniques:**
- **GS ABCD blend → WebGL1 mapping table**: port PCSX2's `m_blendMap` configs (additive `0201` → `SRC_ALPHA, ONE`; usual `0101` → `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`; subtractive `2001` → `FUNC_REVERSE_SUBTRACT`) — canonical, verified against PCSX2 source
- **Shader-side premultiply for alpha > 0x80**: WebGL has no dual-source blending; multiply `color × alpha128/128` in the fragment shader and blend `ONE, ONE` — exactly PCSX2's `BLEND_MIX` strategy, mathematically exact
- **0x80 = 1.0 everywhere**: texture MODULATE (`×255/128`), CLUT alpha, blend FIX, vertex/particle colors — one conversion policy at the decode boundary, ÷128 never ÷255
- **CPU-simulated GPU-billboarded quad particles**: one dynamic interleaved VBO, vertex-shader billboarding from view-matrix columns; NOT `gl.POINTS` (size caps, center-clipping, no stretch), NOT instancing (GoW1 budgets are hundreds of particles)
- **Chain as twisted textured ribbon**: quad-strip along the chain curve, UVs anchored to arc length, per-link alternating ~90° twist for the 3D read; `chainglow` as a second wider additive strip over the same curve
- **Verification tools (external, not runtime)**: PCSX2 ≥ 2.0 GS Debugger dumps (ground truth for per-effect blend registers), Spector.js (GL state-leak capture), god_of_war_browser (decode cross-check)

**Deliberately excluded** (anti-authentic): bloom/post-glow, sRGB/tonemapping, soft particles, motion blur, mipmapped FX textures, depth-sorted additive, hand-tuned glow colors.

### Expected Features

**Must have (table stakes — absent = instantly reads fake):**
- Chain ribbon with real `chainlink` texture at correct link pitch (32px/link, 16/tile), alpha gaps visible — the chain's identity
- `chainglow` additive overlay (depth-write off, heat-ramp placement per the texture's hot cluster)
- Chain motion: catenary drape at rest → taut whip-lag C-curves in flight → settle
- Constant blade fire: two layered systems per blade (flame3 + flame6), grayscale sprites tinted by runtime PTC color (expected orange-red)
- Crimson swing trail with white-hot core (real `swordtrail` texture + runtime red tint)
- Impact spark bursts on hit events (`FXC_BDEsparkemit`, one per blade)
- Additive saturation to flat white where layers stack (clamped LDR gamma-space blending — a renderer invariant, not an asset)
- Blades on back out of combat / in hands in combat

**Should have (differentiators, add after core validates):**
- Per-blade warm point lights using decoded values ((1.0, 0.622, 0.288) × 2.5, range 160) — already fully decoded
- State-dependent chain glow (dark at rest → white-hot streak during attacks) — mechanism undecoded, candidate `FXC_CNGemit`
- Dual trail system (crimson fire BFT + neutral silver swoosh BGT) — pending PTC decode
- 60Hz stepped trail extrusion (do NOT spline-smooth), bilinear-only PS2 texture character

**Defer (v2+):**
- Plume of Prometheus / finisher FX — high effort, input-specific
- God-tier variants — out of scope per PROJECT.md

### Architecture Approach

Extend kratos-lab with a clean decode/runtime split: a pure byte-decoder module (`fxparse.js`) that turns WAD records into JSON-dumpable descriptor objects (testable without a renderer; every field tagged `real` vs `inferred`), and a runtime module (`fx.js`) owning emitter instances, a CPU particle pool integrated **in world space** (fire must lag a whipping blade, not stick to it), geometry builders, and a pass-sorted renderer where a single MAT→GL table is the *only* place PS2 blend semantics map to WebGL. The WAD is loaded raw in-browser via a new `parseWad` with **nearest-preceding-name resolution** (the WAD holds level-1 AND god-tier records under identical names; a flat name map silently cross-wires them). Render order is fixed: opaque → alpha-cutout chain links (depth-write ON so fire occludes correctly) → "usual"-blended → additive (depth-write off, unsorted).

**Major components:**
1. `Parsers.parseWad` (extend parsers.js) — WAD buffer → ordered node list + by-name index with mogaika-matching resolution semantics
2. `fxparse.js` (new) — MAT/MSH-shape/PTC/FXC byte decoders → FxDb with resolved cross-record references
3. `fx.js` (new) — emitters bound to joint/blade matrices, fixed-60Hz particle pool, ChainLinks/ShapeRibbon/SpriteBatch builders, MAT-driven pass renderer
4. `anim.js` (extend) — type-5 ANM state descriptor decode (blade show/hide/fire gating)
5. `app.js` (modify) — orchestration only; `drawFx` becomes pass-driven `Fx.draw`

First-party record inventory is complete (exact offsets, sizes, subtype magics walked from R_WPN0_0.WAD this session): FXC subtypes 0x2 (7 instances), 0x3 (3), 0xd (4), 0xc (1); all PTC share one 0x13 layout with variable tail. **Differential decode across instances is the primary RE technique** — 7 subtype-0x2 records plus stage1/god pairs give multiple data points per field.

### Critical Pitfalls

1. **0x80 = 1.0 convention applied inconsistently** — one documented conversion policy at the decode boundary (÷128 for alpha/modulation, texel RGB stays 0–255); audit the existing texture path before building FX on it. Wrong = every later visual judgment contaminated.
2. **Blend tuple mistranslation** — enumerate every distinct (A,B,C,D,FIX)/MAT-flag combo across ALL weapon MATs in one pass before writing shaders; assert on unknown tuples, never silently default.
3. **Contaminated ground truth** — establish a PCSX2 software-renderer, native-res, documented capture pipeline as an explicit *first* deliverable; YouTube footage for motion/timing only, never color.
4. **FXC/PTC decode by assumption** — no external safety net exists; require a per-field evidence table (offset, raw bytes, interpretation, corroboration), anchor colors to freeze-frames, use ELF disassembly as the sanctioned tiebreaker, label everything else INFERRED.
5. **Wall-clock particle timing** — PTC rates/lifetimes are almost certainly 60Hz-tick units; run simulation on a fixed 60Hz accumulator decoupled from rAF from day one (retrofit = redo all tuning). Verify disc region (NTSC vs PAL).
6. **Modern "improvements"** — no gamma linearization, no tonemapping, no bloom, no spline-smoothed chains/trails; canvas `{ alpha: false }`; native-res 512×448 FBO toggle before the first formal comparison.

## Implications for Roadmap

Based on combined research, a 7-phase structure with two parallel tracks after Phase 2:

### Phase 1: Reference Pipeline & Validation Criteria
**Rationale:** Pitfalls research is unambiguous — decoding or rendering before ground truth exists re-opens the largest recovery costs. Every later phase consumes this phase's outputs (freeze-frame library, link counts, flicker cadence, color anchors).
**Delivers:** PCSX2 software-renderer native-res capture setup (documented settings), freeze-frame PNG library (chain at rest, mid-swing, fire close-up, three framings), written target definition ("GS output as captured, not CRT"), footage link-count and flicker-cadence measurements.
**Addresses:** The 80–90%-vs-footage acceptance metric itself.
**Avoids:** P8 (contaminated ground truth), P9 (CRT nostalgia drift).

### Phase 2: WAD Directory + MAT Decode + Render-Pass Foundation
**Rationale:** Cheapest real-data win — mat.go is a known-good spec; immediately replaces the hardcoded `uAdd` flag on existing chain/trail draws and de-risks the pass architecture before any novel decoding. Also where all rendering conventions get locked.
**Delivers:** `parseWad` with nearest-preceding resolution; full MAT decode + complete blend-tuple inventory across all weapon MATs; the single MAT→GL mapping table (with unknown-tuple assert); pass-list restructure of `drawFx`; canvas `alpha: false`; 0x80 conversion policy; native-res FBO toggle; fixed-60Hz timestep skeleton.
**Uses:** mogaika mat.go layout, PCSX2 m_blendMap, shader-premultiply strategy.
**Implements:** parsers.js extension, matgl table, fx.js pass skeleton.
**Avoids:** P1 (0x80), P2 (blend translation), P3 (gamma/canvas), P6 (resolution/filtering).

### Phase 3: Chain Visual — Link Ribbon + Glow Pass
**Rationale:** Decode-independent track; the chain is the project's namesake element and needs zero new RE (textures + MATs decoded, curve exists). Depends only on Phase 2's pass architecture.
**Delivers:** Chain ribbon with correct link pitch (arc-length-anchored UVs, alpha gaps, per-link alternating twist, cutout pass with depth-write ON), `chainglow` additive overlay on shared UVs (depth-write off), link count matched to Phase-1 freeze-frame measurements.
**Addresses:** Chain ribbon + chainglow table stakes; reframes "segmented 3D-reading links" as authentic ribbon (the game has no chain mesh — 3D links are an anti-feature).
**Avoids:** P7 (over-smoothing — discrete per-link orientation, measured counts).

### Phase 4: Chain Motion
**Rationale:** Independent pure simulation; can proceed in parallel with the decode track. Motion is half the authenticity bar per footage analysis.
**Delivers:** Catenary drape at rest, whip-lag C-curves in flight (driven primarily by the already-decoded type-10 blade tracks, minimal restrained solver), settle behavior, 60Hz-tick solver.
**Addresses:** Chain motion table stakes.
**Avoids:** P7 (liquid-smooth whip), P5 (solver on fixed tick).

### Phase 5: FX Record Decode (MSH → PTC → FXC + type-5 ANM)
**Rationale:** Gates three table-stakes features (fire, sparks, trail colors). Original RE with no public reference — the project's highest-risk, highest-effort phase. Order within phase: MSH shapes (diff stage1 768B vs god 1008B), then PTC (diff 8 instances), then FXC by subtype (0x2 first — 7 instances give the most differential data), then type-5 blade-state descriptor.
**Delivers:** Documented FXC/PTC/MSH formats (per-field evidence tables in README), FxDb with resolved references, `real` vs `INFERRED` tags on every field; PCSX2 GS dump of a blade swing to verify actual per-effect blend configs.
**Addresses:** "Blade fire and spark emission decoded from FXC/PTC records" requirement.
**Avoids:** P4 (assumption-driven decode — evidence table is the exit criterion, not "parser runs").

### Phase 6: Particle Runtime — Fire, Sparks, Trails
**Rationale:** Needs Phase 5's decoded values to drive it (hand-tuning first would anchor visual judgment to wrong baselines). Builds on Phase 2's pass architecture and timestep.
**Delivers:** World-space particle pool on the fixed 60Hz tick, billboard sprite batch, BDepoly shape-ribbon flames, spark bursts wired to existing hit events, swordtrail driven by decoded MAT/PTC values, emitter gating from type-5 state.
**Uses:** CPU-quad billboarding pattern, shader-premultiply additive.
**Implements:** fx.js runtime (pool, builders, buckets — one draw per material/pass).
**Avoids:** P5 (tick timing), anti-pattern 4 (local-space simulation).

### Phase 7: Side-by-Side Validation & Inferred-Residue Tuning
**Rationale:** The acceptance metric is judged here; everything prior feeds it.
**Delivers:** In-tool side-by-side / A-B flicker comparison vs Phase-1 captures at three framings, native-res toggle active, tuning of runtime-computed (labeled INFERRED) quantities only, "Looks Done But Isn't" checklist pass (magenta-background test, 144Hz density test, flicker cadence count).
**Addresses:** "80–90% accurate in motion" requirement.

**Post-validation additions (v1.x, roadmapper may fold into Phase 7 or a small Phase 8):** per-blade point lights (values already decoded), state-dependent glow rule, blade stow/draw, dual-trail split.

### Phase Ordering Rationale

- **Ground truth before everything** (P8): Phases 3–7 all consume Phase-1 measurements; color/brightness decisions made against YouTube footage would need full re-audit.
- **MAT before FXC** (architecture build order): known-good spec validates the WAD parser and pass architecture cheaply before novel RE begins; blend-tuple inventory must be complete before shaders ship.
- **Two parallel tracks after Phase 2**: chain visual/motion (3, 4) needs no new decoding; fire/spark (5, 6) is decode-gated. The roadmapper can schedule 3/4 alongside 5 freely.
- **Decode before runtime** (5 before 6): matches PROJECT.md's "decode before visuals" decision; hand-tuned placeholder values carry false authority and get rejected when real values land.
- **Conventions locked in Phase 2** because retrofit costs are the highest in the recovery table: fixed timestep (HIGH), 0x80 convention (MEDIUM, invalidates all comparisons), reference pipeline (HIGH).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (FX record decode):** the core novel-RE phase — no public documentation exists anywhere; plan should include the differential-decode protocol, PCSX2 GS-dump capture procedure, and the ELF-disassembly escalation path
- **Phase 4 (chain motion):** mechanism is footage-inferred, not data-backed; may need a short footage-measurement study (segment counts, lag timing) during planning rather than web research

Phases with standard patterns (skip research-phase):
- **Phase 1:** capture methodology fully specified in PITFALLS.md
- **Phase 2:** mat.go + PCSX2 m_blendMap are complete, verified specs; STACK.md has exact GL calls
- **Phase 3:** ribbon technique specified in STACK.md; escalation path (crossed ribbons → link mesh) pre-defined
- **Phase 6:** billboard/VBO patterns fully specified in STACK.md and ARCHITECTURE.md
- **Phase 7:** checklist-driven; criteria defined in Phase 1

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | GS blend math, MAT flags, color conventions verified against ps2tek + PCSX2 source + mogaika source directly; MEDIUM only on which ABCD configs GoW1 sets per effect (GS dump resolves) |
| Features | HIGH | Element inventory read directly from disc data this session (textures decoded, MATs parsed, lights decoded); MEDIUM on runtime behaviors (footage-inferred pending FXC/PTC decode) |
| Architecture | HIGH | Record inventory/offsets from first-party WAD walk; mogaika semantics read from source; MEDIUM on FXC field interpretations (structural only — that decode IS Phase 5) |
| Pitfalls | HIGH | GS hardware behavior from primary docs/emulator sources; MEDIUM on comparison-methodology specifics (flagged for spot-check in Phase 1) |

**Overall confidence:** HIGH — with the explicit caveat that the FXC/PTC/MSH decode is original reverse engineering whose outcome cannot be pre-verified; the mitigation (differential decode, evidence tables, GS dumps, ELF fallback) is planned, not the result.

### Gaps to Address

- **FXC/PTC/MSH field semantics** — no public decode exists (verified absence in god_of_war_browser and forum sweep). Handle: dedicated Phase 5 with differential decode across 15+ instances, per-field evidence tables, PCSX2 GS dumps, ELF disassembly as tiebreaker.
- **State-dependent chain glow mechanism** (dark at rest vs white-hot in attacks) — observed result HIGH, mechanism LOW. Handle: decode candidate `FXC_CNGemit` in Phase 5; else implement footage-inferred rule labeled INFERRED.
- **MSH_BDepoly shape hypothesis** (authored fan/strip meshes for flames) — LOW confidence, naming convention only. Handle: Phase 5 decode resolves; no rendering assumptions until then.
- **Exact ABCD blend config per effect** — MAT bits give the class, not the tuple. Handle: one PCSX2 GS dump of a blade swing (Phase 5) converts MEDIUM to fact.
- **Type-5 ANM descriptor** (blade stow/draw state) — mogaika's guess matches ours. Handle: decode in Phase 5; fallback to combat-state rule labeled INFERRED.
- **Disc region (NTSC vs PAL)** — affects tick-rate interpretation of all PTC time fields. Handle: confirm as a Phase 5 decode-phase fact before interpreting rates.
- **Trail dual-system theory** (BFT fire + BGT swoosh) — MEDIUM. Handle: PTC_BFT/BGT decode confirms; v1 ships single crimson trail if not.

## Sources

### Primary (HIGH confidence)
- First-party binary data: `extracted/wads/R_WPN0_0.WAD` full record walk, `extracted/kratos/fx/*`, decoded FX textures (chainlink/chainglow/swordtrail/flame/splash) — read directly this session
- [mogaika/god_of_war_browser](https://github.com/mogaika/god_of_war_browser) — `mat.go` (full MAT spec), `gow1.go` (WAD tag semantics), `anm.go`/`type8.go` (ANM datatypes), `gfx.go` (CLUT alpha ×255/128), `RenderChain.js` (reference GL mapping) — read from source
- [PCSX2 source](https://github.com/PCSX2/pcsx2) — `GSDevice.cpp` m_blendMap (canonical ABCD→GL), `GSDevice.h` HWBlendFlags — read from source
- [ps2tek GS documentation](https://psi-rockin.github.io/ps2tek/) — blend formula, MODULATE math, 0x80 convention
- Existing kratos-lab code and format docs (`tools/kratos-lab/`, `extracted/README.md`)

### Secondary (MEDIUM confidence)
- Reference footage frames ([FMGwS-bvNiU](https://www.youtube.com/watch?v=FMGwS-bvNiU), extracted/analyzed) + Wikipedia Hydra screenshot — element behaviors, trail/glow states; likely PS3 Collection footage (retains PS2 assets)
- [PCSX2 blog: Alpha Testing GS World](https://pcsx2.net/blog/2016/alpha-testing-gs-world/), [PCSX2 Wiki — God of War](https://wiki.pcsx2.net/God_of_War), PCSX2 PR #6106 — GS blend background, GoW-specific upscaling artifacts
- [Maister GS emulation write-ups](https://themaister.net/blog/2024/07/03/playstation-2-gs-emulation-the-final-frontier-of-vulkan-compute-emulation/) — 0x80→~2.0 overbright behavior
- [PSDevWiki](https://www.psdevwiki.com/ps2/Graphics_Synthesizer) — GS registers, GoW 512×448 display modes

### Tertiary (LOW confidence)
- Forum sweep (ZenHAX, ResHax, ps2-home) — absence of public FXC/PTC docs (absence of evidence)
- MSH_BDepoly shape hypothesis — naming + ecosystem convention only; Phase 5 resolves
- YouTube 4:2:0 / BT.601-709 contamination effects — standard video engineering, spot-check during Phase 1

---
*Research completed: 2026-07-24*
*Ready for roadmap: yes*
