# Pitfalls Research

**Domain:** PS2-authentic VFX reproduction (GoW1 chain/fire FX in WebGL1, driven by disc-decoded FXC/PTC/MAT data)
**Researched:** 2026-07-24
**Confidence:** HIGH on GS hardware behavior (ps2tek, PCSX2 sources, GS documentation); MEDIUM on GoW1-specific FX record semantics (undecoded — that risk is itself Pitfall 4); MEDIUM on comparison methodology (well-documented capture/emulation issues)

## Critical Pitfalls

### Pitfall 1: The 0x80 = 1.0 convention applied inconsistently

**What goes wrong:**
On the PS2 GS, 0x80 (128) means 1.0 for alpha and for vertex-color modulation — not 0xFF. Values run up to 0xFF ≈ 2.0, so the hardware can *brighten* textures ("overbright"). The texture MODULATE function is `Cv = (Cs * Ct) >> 7`, and the blend equation divides its C term by 128, not 255. A decoder that uploads a stored vertex color of 0x80 as `128/255 = 0.502` renders everything at half brightness; fire and glow read muddy and dark. Conversely, blanket-doubling every color channel blows out textures that were authored full-range (CLUT texel RGB is 0–255; it's *alpha* and *modulation* that are 0–0x80–0xFF half-scaled).

**Why it happens:**
Three different value domains (texel RGB, CLUT/vertex alpha, blend C term / vertex modulation color) look identical as bytes in a hex dump. Modern GPU intuition says 255 = 1.0 everywhere. The existing kratos-lab skin-texture path may already have a hidden ×2 or ÷2 baked in that "looked right" for opaque skin but is wrong for additive FX where brightness errors are glaring.

**How to avoid:**
- Define one conversion policy in code, documented at the decode boundary: texel RGB stays 0–255 as-is; alpha and modulation colors normalize by dividing by 128 (`min(v / 128.0, 2.0)` in shader terms), never by 255.
- Handle the ≥1.0 range explicitly: WebGL clamps vertex attributes/uniforms fed into fixed-function blending, so any ×(C/128) factor that can exceed 1.0 must be applied in the fragment shader *before* blending, then blend with `ONE, ONE`.
- Audit the existing texture/CLUT decode path for alpha semantics before building FX on top of it (PSMT8 CLUT alpha entries are typically 0x00–0x80).

**Warning signs:**
Additive glow visibly dimmer than footage at matching camera distance; opaque textures suddenly 2× too bright after a "fix"; decoded MAT/PTC color fields clustering around 0x80 (that clustering *is* the tell that a field is a 1.0-relative modulator, not a full-range color).

**Phase to address:**
FX/MAT decode phase (establish the convention in the decoder) + first rendering phase (shader-side normalization). Do not defer to polish — every later visual judgment is contaminated if this is wrong.

---

### Pitfall 2: GS ABCD blend configs mistranslated to WebGL blendFunc

**What goes wrong:**
The GS has exactly one blend formula: `Out = ((A − B) * C >> 7) + D`, where A/B/D ∈ {Cs, Cd, 0} and C ∈ {As, Ad, FIX}. MAT records will encode blend as these selector fields, not as GL enums. Naive translation produces classic failures: additive that's half-strength (mapping `C=As` to `SRC_ALPHA` while alpha was stored as 0x80 → 50% instead of 100%, or mapping `C=FIX(0x80)` to `SRC_ALPHA` at all), washed-out standard alpha (forgetting the ÷128), or too-dark/black FX (mapping a subtract config `(0 − Cd) * C + Cs`-style to a normal add). FIX values above 0x80 (brighten-by-constant) are inexpressible in `blendFunc` entirely.

**Why it happens:**
The four-selector space (81 combinations, ~a dozen used in practice) doesn't map 1:1 to GL's src/dst factor model. Developers pattern-match "additive flag → `gl.ONE, gl.ONE`" without checking which C term the game actually selected, or they translate one MAT record correctly and assume the rest use the same config.

**How to avoid:**
- Build an explicit translation table keyed on the raw (A,B,C,D,FIX) tuple. Canonical mappings:
  - `A=Cs, B=Cd, C=As, D=Cd` → standard alpha: shader outputs `rgb, a*2 clamped`, `blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` — only valid if As ≤ 0x80; otherwise pre-multiply in shader.
  - `A=Cs, B=0, C=As or FIX, D=Cd` → additive: multiply `Cs * C/128` in the fragment shader, then `blendFunc(ONE, ONE)`.
  - `A=0, B=Cd, C=As, D=Cd` → multiplicative darken: `blendFunc(ZERO, ONE_MINUS_SRC_ALPHA)` with shader alpha = As/128.
  - `A=Cd, B=Cs, ...` or anything selecting `Ad` → flag for special handling (see below).
- Rule: whenever the C multiplier can exceed 1.0 or C=FIX, apply the multiply in-shader and use pure `ONE, ONE` / `ONE, ZERO` blending. This sidesteps every GL clamp.
- `C=Ad` (destination alpha) requires framebuffer alpha. If any GoW MAT uses it, render FX into an RGBA FBO — do not rely on canvas destination alpha (see Pitfall 3).
- Log every distinct (A,B,C,D,FIX) tuple found across all MAT records in one pass before writing shaders, so the table is complete, not incremental.

**Warning signs:**
Glow looks right against black but wrong over the character; brightness of the chainglow pass differs from footage by roughly exactly 2× or 0.5×; a MAT record's blend tuple isn't in your translation table (crash/assert here — silently defaulting is how mistranslations ship).

**Phase to address:**
MAT decode phase produces the tuple inventory; blend/material rendering phase implements the table. The tuple-inventory step is cheap and should be an explicit deliverable.

---

### Pitfall 3: "Fixing" the color pipeline with modern gamma correctness (and the canvas-compositing washout)

**What goes wrong:**
Two opposite failure modes. (a) An engineer adds linear-light rendering — decode sRGB → blend linear → re-encode — because it's "correct." The GS had no such concept: it blended raw gamma-encoded framebuffer values. Linear-light additive blending changes how fire stacks toward white and reads distinctly modern (hotter cores, thinner falloff). (b) The WebGL canvas defaults to `alpha: true` with premultiplied compositing; additive passes that write alpha cause the browser to composite the canvas against the page background, washing out or tinting the glow depending on page color.

**Why it happens:**
Gamma-correct rendering is genuinely the right default for *new* content, so it's muscle memory. The canvas alpha issue is invisible when the page background happens to be black.

**How to avoid:**
- WebGL1's default framebuffer path (no `EXT_sRGB` usage, no manual linearization) already blends in gamma space exactly like the GS. The authentic pipeline here is the naive one — document this decision in code so a future "improvement" doesn't undo it.
- Create the context with `alpha: false`, or use `blendFuncSeparate`/`colorMask` to keep destination alpha at 1.0. Verify by temporarily setting the page background to magenta.
- Do not add tone mapping, exposure, or auto-brightness anywhere in the FX path.

**Warning signs:**
Additive stacks saturating to white faster/slower than footage; FX appearance changes when the page CSS background changes; any shader containing `pow(c, 2.2)` in this codebase.

**Phase to address:**
Blend/material rendering phase (pipeline decision, canvas config). One-line checks; the cost is only in knowing to make them.

---

### Pitfall 4: Reverse-engineering FXC/PTC fields by assumption — with no external cross-check

**What goes wrong:**
The project's format knowledge is cross-checked against mogaika/god_of_war_browser, but that project does not document FXC emitter configs or PTC particle defs — the safety net that validated mesh/ANM/texture decoding does not exist for FX records. Classic misreads: treating a fixed-point field (Q.12/Q.14 — the ANM already uses Q.14) as float or vice versa (garbage magnitudes that still "kind of work" after hand-scaling); assuming units (world units vs GS screen pixels for particle size, per-frame vs per-second for rates, degrees vs radians vs PS1-legacy 4096-step angles); and packed-color byte-order errors — PS2 is little-endian, RGBA32 lives in memory as R,G,B,A ascending, so a u32 read is `0xAABBGGRR`; reading it as ARGB or BGR swaps channels and orange flame decodes as cyan.

**Why it happens:**
Binary fields have no self-describing types. A wrong interpretation often produces *plausible-looking* output (a rate of 3.2 vs 32 both spawn particles), and confirmation bias does the rest. Because the mandate is "use the game's values," a misdecoded value is worse than a hand-tuned one — it carries false authority.

**How to avoid:**
- For every field, record: offset, raw bytes, candidate interpretation, and *evidence* (e.g., "value 0x0080 in the color slot = 1.0 modulation, consistent with Pitfall 1 convention"; "this float reads 0.016 ≈ 1/60 — likely a per-tick value").
- Sanity-anchor against observable ground truth: the flame texture (flame6/flame3) is already decodable, so a PTC color field must, when applied, land near the flame hue visible in native-res screenshots. A rate field must be a small number. A lifetime field times the rate must roughly equal on-screen particle counts (countable in freeze-frames).
- Check whether the PS2 ELF can confirm interpretation: find the code that reads the FXC/PTC record (search for the record's field strides/offsets in disassembly) when a field resists inference. Budget is explicitly unconstrained; this is the sanctioned expensive path.
- Maintain an "inferred" label (already a PROJECT.md constraint) for any field used without at least two corroborating pieces of evidence.

**Warning signs:**
A decoded value needs an unexplained fudge factor to look right; two fields are only interpretable if you assume different endianness for each; flame color decodes blue/cyan; magnitudes span absurd ranges across records of the same type.

**Phase to address:**
FX decode phase — this *is* that phase's core risk. Its exit criteria should require the evidence table, not just "parser runs."

---

### Pitfall 5: Frame-tick timing treated as wall-clock (60Hz-authored rates on variable-Hz browsers)

**What goes wrong:**
GoW1 renders at 512x448 and updates at NTSC 60Hz field rate; emission rates, particle lifetimes, velocities, flipbook frame advances, and flicker cadence in PTC records are almost certainly authored in per-tick / tick-count units. Driving the simulation from `requestAnimationFrame` delta on a 120/144Hz monitor doubles emission density and halves apparent lifetimes if values are used per-callback; using them per-second makes everything 60× off. Separately: if the extracted disc is PAL, authored values may assume 50Hz — verify which region the data came from before interpreting rates. Fire *flicker frequency* is the most perceptible casualty: a flame flipbook advancing at the wrong cadence reads wrong instantly even when colors and shapes are perfect.

**Why it happens:**
Browser rAF hides the display rate; on a 60Hz dev monitor everything looks right, then breaks on the user's 144Hz panel. Tick-based units are invisible in the binary (a lifetime of "45" doesn't say 45 of what).

**How to avoid:**
- Run FX simulation on a fixed 60Hz accumulator timestep decoupled from rAF, from day one. Render interpolates; simulation ticks at exactly the game's rate.
- Treat every PTC time/rate field as ticks-at-60Hz until evidence says otherwise; document per-field.
- Confirm disc region (NTSC vs PAL) as a decode-phase fact.
- Validate flicker cadence specifically: count flame flipbook/pulse cycles per second in reference footage (footage is 60 or 30fps — countable) and match.

**Warning signs:**
FX density differs between your two monitors; particle counts in a freeze-frame are ~2× footage; flame flicker looks "too fast/nervous" or "syrupy."

**Phase to address:**
Particle rendering phase (fixed-timestep architecture up front); FX decode phase (units documentation). Retrofitting fixed timestep after tuning is a rewrite of the tuning.

---

### Pitfall 6: Resolution and filtering mismatch — crisp WebGL vs soft 512x448 output

**What goes wrong:**
The game's entire look was tuned for 512x448 rendered with GS bilinear filtering, then stretched by the console/TV. Small FX textures (chainglow, flame frames are likely ≤128px) were *always* seen magnified and soft. Rendered in a crisp 1440p canvas, the same textures show their texel grid, glow edges turn hard, particles read small and sparse, and the composite reads "HD remaster," not PS2 — even with every decoded value correct. Additional traps: if PTC sprite sizes are in GS screen-pixel units, using them as world units breaks scale entirely and only "kind of works" at one camera distance; WebGL1's default `TEXTURE_MIN_FILTER` is `NEAREST_MIPMAP_LINEAR`, which samples black on NPOT/no-mipmap FX textures; and GS REGION_CLAMP/REGION_REPEAT wrap modes (used for sub-rect/flipbook sampling) have no WebGL equivalent and need shader-side UV math.

**Why it happens:**
"Higher resolution is strictly better" intuition. The mismatch is invisible when comparing against *upscaled emulator* footage (Pitfall 8) — the two errors mask each other, then both surface when a native-res reference appears.

**How to avoid:**
- Render the FX (or the whole scene) into a 512x448 RGBA framebuffer and upscale to the canvas with bilinear filtering. Make it a toggle: "native-res authentic" vs "full-res inspect." The native-res path is the one validated against footage.
- Set `LINEAR`/`LINEAR` filtering (or `LINEAR_MIPMAP_LINEAR` with generated mips) explicitly on every FX texture; never rely on defaults.
- When decoding PTC size fields, test the "GS pixels at 512x448" hypothesis explicitly: does the value match the particle's on-screen pixel size in a native-res screenshot?
- Implement REGION_* wrap in the shader if MAT/PTC sampling metadata indicates sub-rect usage.

**Warning signs:**
FX textures render black (mipmap default); particles look correct at one zoom level only; everything is "right but too crisp"; texel edges visible in the glow.

**Phase to address:**
Blend/material rendering phase (native-res FBO + filtering policy); FX decode phase (size-unit hypothesis test). The native-res toggle should exist *before* the first side-by-side comparison, or comparisons will mis-attribute softness differences to color/blend errors.

---

### Pitfall 7: Over-smoothed chain — spline-perfect curves read modern

**What goes wrong:**
The 2005 game draws chains with a small number of discrete segments; visible link repetition, slight angular articulation between links, and coarse catenary sag are part of the period look. A modern implementation reaches for dense Catmull-Rom tessellation, per-frame relaxed verlet with many constraint iterations, and cubic-interpolated blade tracks — producing a liquid, perfectly smooth whip that is *more physically plausible* than the game and therefore reads wrong. Same trap at the link level: high-poly torus links with smooth normals vs the game's low-poly links whose chunkiness is visible in footage.

**Why it happens:**
Smoothness is the default quality axis; every generic tutorial optimizes toward it. Nobody's intuition says "add angular error."

**How to avoid:**
- Count before you build: from native-res freeze-frames, count visible links per chain length and estimate segment count of the curve at rest and mid-swing. Derive segment/link counts from footage; do not pick "what looks good."
- Use the game's own type-10 blade position tracks (already decoded) as the authoritative endpoint motion with linear interpolation between keys — the game's whip shape emerges largely from its authored track, not from heavy simulation. Keep the chain solver minimal (few points, few iterations, 60Hz tick per Pitfall 5) and let it be slightly stiff.
- Alternate link orientation ~90° along the curve (real chain topology) rather than billboarding — this is what makes links read 3D — but keep per-link orientation *discrete*, not smoothly interpolated per-pixel.
- If MSH_BDepoly3Shape/6Shape decode reveals the game's actual ribbon/poly cross-sections and segment counts, those numbers override all of the above.

**Warning signs:**
Chain looks like rope or liquid metal in motion; sag at rest is a mathematically perfect catenary with no link granularity; side-by-side motion comparison "feels floaty" even though positions match.

**Phase to address:**
Chain geometry phase (link counts, orientation) and motion phase (solver restraint). The footage link-count measurement is a prerequisite deliverable for the geometry phase.

---

### Pitfall 8: Contaminated ground truth — validating against upscaled/compressed footage

**What goes wrong:**
The 80–90% fidelity bar is judged against reference footage, so errors in the reference silently become targets. Known contaminations: PCSX2 hardware-renderer upscaling causes GoW-specific artifacts (vertical lines, misaligned interlace-blur offset — the game uses half-height field rendering that PCSX2 must special-case); hardware-renderer blending is only approximately GS-accurate at default accuracy settings, so additive stack brightness in emulator footage may itself be wrong; YouTube re-encodes at 4:2:0 chroma subsampling, which smears and desaturates exactly the saturated orange/red glow edges this project cares most about; and SD-era footage carries BT.601 color, which players/encoders sometimes tag/convert as BT.709, visibly shifting reds and greens. Deinterlacing (bob/blend) in captures adds ghosting and brightness changes that are artifacts, not targets.

**Why it happens:**
The convenient reference (a YouTube playthrough) is the worst reference. The contaminations are subtle enough to pass casual viewing and only bite when someone tunes glow color to match a hue-shifted video.

**How to avoid:**
- Establish a reference-capture pipeline as an explicit early deliverable: PCSX2 **software renderer**, native internal resolution, blending accuracy maxed, lossless or high-bitrate local capture, documented deinterlace setting. This is the color/brightness ground truth.
- Use YouTube footage for *motion and timing* only (whip arcs, flicker cadence, particle burst rhythm) — never for color calibration.
- Keep a small library of native-res PNG freeze-frames (chain at rest, mid-swing, fire close-up) as the pixel-value reference set for link counts (Pitfall 7), particle sizes (Pitfall 6), and glow hue (Pitfall 4 anchoring).
- When a decoded value disagrees with footage, suspect the footage pipeline before the decode — check the same frame in software-renderer capture.

**Warning signs:**
Glow hue "matches the video" but disagrees with the decoded PTC/CLUT color; vertical line artifacts or doubled edges visible in the reference; tuning decisions citing YouTube timestamps for *color*.

**Phase to address:**
This must land in the **first phase** (alongside or before FX decode), because Pitfalls 4, 6, and 7 all consume its outputs. The final validation phase then reuses the same pipeline for side-by-sides.

---

### Pitfall 9: Chasing CRT nostalgia instead of the agreed reference

**What goes wrong:**
Mid-project, someone notices the output doesn't look like their memory of a 2005 CRT (phosphor bloom, composite blur softening dither, interlace shimmer) and starts adding CRT shaders, scanlines, or extra bloom. The fidelity bar drifts, hand-tuned filters pile on top of decoded data (violating the data-first constraint), and the 80–90% judgment becomes unfalsifiable because the target keeps moving.

**Why it happens:**
"Authentic PS2" is ambiguous between "what the GS output" and "what a CRT displayed." The reference footage itself is a digital capture (no CRT), so the two targets genuinely differ.

**How to avoid:**
- Lock the definition now: the target is the GS's digital output as captured by the reference pipeline (Pitfall 8), *not* a CRT simulation. This matches the footage-comparison mandate.
- If CRT flavor is ever wanted, it goes in as a clearly separated, clearly labeled optional post-pass — never mixed into the data-driven layers, and never active during validation comparisons.

**Warning signs:**
PRs adding bloom/blur/scanlines "to match the vibe"; validation screenshots taken with a filter enabled; disagreement about whether a comparison passes because people are imagining different targets.

**Phase to address:**
Project framing / validation-criteria definition (phase 1), enforced at every comparison gate.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hand-tuning an FX value "for now" before its PTC field is decoded | Visible progress | Anchors visual judgment to a wrong baseline; decoded value later "looks wrong" and gets rejected | Only if labeled `INFERRED` in code and listed for replacement (PROJECT.md already mandates this) |
| Translating only the blend tuples seen so far, defaulting the rest to alpha blend | Ships first glow pass sooner | Silent mistranslation of rare configs (subtract, FIX>0x80) discovered late as "mystery brightness" | Never — assert/log on unknown tuples instead (cheap) |
| Simulating particles per-rAF-frame with delta scaling | Simple loop | All tuned rates break on non-60Hz displays; retune required after fixed-timestep retrofit | Never for this project (Pitfall 5) |
| Skipping the native-res FBO and comparing full-res output to footage | One less render target | Softness mismatch mis-attributed to color/blend bugs; wasted debugging | Acceptable only before the first formal comparison |
| Using YouTube reference for early color decisions | No capture setup needed | Hue-shifted targets baked into decode "verification" | Motion/timing study only; never color |

## Integration Gotchas

WebGL1-and-browser specifics (no external services in this project — these are the platform integration points).

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| WebGL1 canvas | Default `alpha: true` lets the page composite/wash out additive FX | `getContext('webgl', { alpha: false })` or force dest alpha = 1.0; test on magenta page background |
| WebGL1 textures | Relying on default `NEAREST_MIPMAP_LINEAR` min filter → black FX textures | Explicit `LINEAR` filters on every FX texture; POT check before mipmaps |
| WebGL1 blending | Trying to express `C=FIX>0x80` or per-pixel ×2 in `blendFunc` | Pre-multiply in fragment shader, blend with `ONE, ONE`; use FBO with alpha if any MAT selects `Ad` |
| GS wrap modes | Assuming CLAMP/REPEAT cover everything | REGION_CLAMP/REGION_REPEAT need shader UV math (likely for flipbook sub-rects) |
| requestAnimationFrame | Treating callback rate as 60Hz | Fixed 60Hz accumulator timestep for simulation; rAF only renders |
| PCSX2 as reference tool | Hardware renderer + upscale for "nicer" reference captures | Software renderer, native res, max blending accuracy for ground truth |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-canvas additive overdraw at high DPR | Frame drops during multi-layer fire on 4K/retina; fine on dev machine | Render FX in the 512x448 FBO (which is also the authenticity fix — Pitfall 6) | Several stacked additive layers × high-res canvas fillrate; the GS had eDRAM bandwidth a browser canvas does not |
| Per-particle draw calls | fps collapses as decoded emission rates arrive | Single dynamic VBO / batched quads per texture+blend group from the start | ~hundreds of particles |
| Rebuilding chain-link geometry per frame on CPU | GC hitches, jitter | Preallocated typed arrays, `bufferSubData` updates | Continuous 60Hz updates |
| Decoding/uploading flipbook frames as separate textures each tick | Upload stalls | Upload the full flipbook once; animate UVs in shader | Any per-frame `texImage2D` |

## Security Mistakes

Low-stakes local tool, but two real ones:

| Mistake | Risk | Prevention |
|---------|------|------------|
| Committing extracted disc assets (`extracted/`) to a public repo | Copyright takedown of the whole project repo | Keep `extracted/` gitignored; repo ships decoders only |
| Parsers trusting length/offset fields from binary records | OOB reads crash the tab mid-session (annoyance, not exploit — local files) | Bounds-check record offsets against buffer length; fail with record name in the error |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No side-by-side comparison mode in the tool | 80–90% judgment done by alt-tabbing memory; unreliable | Build footage-vs-render side-by-side (or A/B flicker) view into kratos-lab as part of the validation phase |
| Authentic-res and inspect-res not toggleable | Can't tell if a mismatch is data or resolution | Single keybind toggle between 512x448 FBO output and full-res |
| Inferred values indistinguishable from decoded values in UI | False confidence in "data-driven" claims | On-screen/inspector badge for any parameter labeled `INFERRED` |
| Comparison only at one camera framing | FX tuned for one distance (size-unit bugs hide — Pitfall 6) | Validate at least close-up, mid, and full-body framings matching footage shots |

## "Looks Done But Isn't" Checklist

- [ ] **Blend translation:** Often covers only the tuples in the first MAT tested — verify the complete (A,B,C,D,FIX) inventory across *all* weapon MAT records is enumerated and each maps to a tested path
- [ ] **0x80 convention:** Often fixed in one path (blend) but not others — verify vertex modulation, CLUT alpha, blend C term, and PTC color fields all use the ÷128 rule consistently
- [ ] **Fixed timestep:** Often "works on my monitor" — verify identical particle density at 60Hz and 144Hz displays (or with a forced-slow rAF test)
- [ ] **Canvas compositing:** Often invisible on dark pages — verify FX unchanged over a magenta page background
- [ ] **Flipbook cadence:** Often eyeballed — verify flame flicker cycles/second counted against footage
- [ ] **Chain link count:** Often "looks smooth" — verify link count and articulation granularity measured from freeze-frames, and solver runs at 60Hz tick
- [ ] **Reference pipeline:** Often "the YouTube video" — verify a documented software-renderer native-res capture exists and color judgments cite it
- [ ] **Size units:** Often correct at one zoom — verify particle scale holds at multiple camera distances
- [ ] **Region wrap / sub-rect sampling:** Often ignored — verify flame textures aren't bleeding neighbor flipbook frames at quad edges

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| 0x80 convention wrong (P1) | MEDIUM | Centralize conversion, re-render, re-judge every prior comparison (they're all invalidated) |
| Blend mistranslation (P2) | LOW–MEDIUM | Fix table entry; if discovered late, re-validate every material using that tuple |
| Gamma "correction" added (P3) | LOW | Remove; one-frame diff confirms |
| Misdecoded FXC/PTC field (P4) | MEDIUM–HIGH | Re-derive with evidence table; ELF disassembly as tiebreaker; audit dependent tuning |
| Per-frame timing (P5) | HIGH if late | Retrofit fixed timestep, then re-verify every rate/lifetime against footage — effectively redoing particle validation |
| Resolution mismatch found late (P6) | LOW mechanically, MEDIUM in re-judgment | Add native-res FBO; redo comparisons (softness changes perceived color/intensity) |
| Over-smoothed chain (P7) | MEDIUM | Reduce segments/iterations to measured counts; geometry rework if links were built high-poly |
| Contaminated reference (P8) | HIGH | Rebuild reference captures, re-audit every color/brightness decision made against the bad footage |

## Pitfall-to-Phase Mapping

Phases named by topic since the roadmap is not yet drawn; the ordering constraints below are the actionable part.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| P8 Contaminated ground truth | **Phase 1 — Reference pipeline & validation criteria** (must precede visual work) | Documented capture settings; native-res freeze-frame library exists |
| P9 CRT nostalgia drift | Phase 1 — validation criteria | Written target definition ("GS output as captured"), cited at each gate |
| P4 FX field misreads | Phase 2 — FXC/PTC/MAT decode | Per-field evidence table; colors anchor to freeze-frames; unknowns labeled INFERRED |
| P1 0x80 convention | Phase 2 (decode policy) + Phase 3 (shaders) | Grep test: no `/255` on alpha/modulation paths; brightness A/B vs reference |
| P2 Blend tuple translation | Phase 2 (tuple inventory) + Phase 3 — blend/material rendering | All tuples enumerated; unknown-tuple assert in place |
| P3 Gamma/canvas compositing | Phase 3 | Magenta-background test; no linearization in FX shaders |
| P6 Resolution/filtering | Phase 3 (native-res FBO, filter policy) | Toggle exists before first formal comparison; multi-distance scale check |
| P7 Over-smooth chain | Phase 4 — chain geometry + Phase 5 — motion | Link count matches freeze-frame count; solver at 60Hz tick |
| P5 Tick timing | Phase 5/6 — particle & motion simulation (architecture set at phase start) | Density identical across display refresh rates; flicker cadence counted vs footage |
| All | Final phase — side-by-side validation | Comparisons use Phase-1 pipeline, native-res toggle, three framings |

**Key ordering constraint for the roadmap:** reference pipeline (P8) → decode with evidence anchoring (P4/P1/P2 inventory) → rendering conventions (P3/P6) → geometry/motion (P7/P5) → validation. Decoding before establishing ground truth, or rendering before decoding, re-opens the largest recovery costs in the table above.

## Sources

- [ps2tek — GS documentation](https://psi-rockin.github.io/ps2tek/) — ALPHA register formula `((A−B)*C >> 7) + D`, MODULATE `(Cs*Ct) >> 7`, 0x80 = 1.0 convention, DTHE/DIMX dithering (HIGH confidence)
- [Maister — PS2 GS emulation, the final frontier](https://themaister.net/blog/2024/07/03/playstation-2-gs-emulation-the-final-frontier-of-vulkan-compute-emulation/) and [Graphics programming like it's 2000, Part 1](https://themaister.net/blog/2025/03/20/graphics-programming-like-its-2000-an-esoteric-introduction-to-playstation-2-graphics-part-1/) — 0x80 = 1.0 up to 0xFF ≈ 2.0, GS pipeline behavior (HIGH)
- [PCSX2 blog — Alpha Testing GS World](https://pcsx2.net/blog/2016/alpha-testing-gs-world/) and [PCSX2 color/alpha management commit](https://github.com/PCSX2/pcsx2/commit/419dfe054464eeacadd1fb725c1ca8a1687571d4) — 128/255 vs 1.0 emulation handling (HIGH)
- [PCSX2 Wiki — God of War](https://wiki.pcsx2.net/God_of_War) — upscaling vertical-line artifacts, software-renderer fix (MEDIUM-HIGH)
- [PCSX2 PR #6106 — reduce blurring when upscaling](https://github.com/PCSX2/pcsx2/pull/6106) — GoW-class half-frame (FFMD) interlace-offset rendering vs upscaling (MEDIUM-HIGH)
- [PS2 Developer wiki — Games With Alternative Display Modes](https://www.psdevwiki.com/ps2/Games_With_Alternative_Display_Modes) — GoW renders 512x448 in both 480i/480p (MEDIUM)
- [mogaika/god_of_war_browser](https://github.com/mogaika/god_of_war_browser) — confirmed FX/particle record formats are *not* documented there (verified absence; drives P4's "no safety net" assessment)
- YouTube 4:2:0 chroma subsampling and BT.601/709 mismatch effects on saturated reds: standard video-engineering knowledge, not independently verified against GoW footage (MEDIUM — flag for spot-check during Phase 1 reference setup)

---
*Pitfalls research for: PS2-authentic VFX reproduction (GoW1 chains/fire in WebGL1)*
*Researched: 2026-07-24*
