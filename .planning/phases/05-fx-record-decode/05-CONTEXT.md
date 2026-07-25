# Phase 5: FX Record Decode - Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Decode the game's actual particle/emitter/shape records — `FXC_*` (emitter configs), `PTC_*` (particle defs), and `MSH_BDepoly` (shapes) — into a queryable **`FxDb`** with **per-field evidence tables** (offset, raw bytes, interpretation, corroboration, real-vs-INFERRED tag). Output is data only: colors, rates, sizes, lifetimes, blend/shape references — JSON-dumpable without a renderer. Phase 6 consumes `FxDb` to render fire/sparks/trails/glow from real values.

**This phase does NOT render anything.** It is a reverse-engineering/decode phase. No public decode of these records exists anywhere (mogaika's tool treats them as opaque raw data) — this is original RE.

**Fast-track framing:** entered ahead of Phase 4 (chain motion, deferred) because the particle payoff is the priority. See [[particle-fasttrack-pivot]].
</domain>

<decisions>
## Implementation Decisions

### Decode priority / MVP slice
- **D-01:** Payoff-first slice. Prioritize the records feeding the **swing trails and their spark particles** first — footage analysis calls the trail's discrete spark specks "the largest less-basic lever." Concretely, slice 1 targets `BFT` (blade fire trail, crimson) + `BGT` (neutral swoosh trail) and the spark emitter (`BDEsparkemit`), plus inspecting the `GFX_swordtrail` texture for a painted age→color ramp. Blade fire (`FXCF`/flame3/flame6) is slice 2; chain glow (`CNG`) refinement and MSH-only shapes are lower priority.
- **D-02:** Respect the roadmap's data-dependency decode ORDER **within** each slice: `MSH` (shapes) → `PTC` (particles, reference shapes) → `FXC` (emitters, reference particles); FXC subtype `0x2` first. Priority (D-01) chooses *which effect family* to decode first; the order chooses *how* to decode within it.

### INFERRED tolerance & escalation
- **D-03:** Decode-first, aggressively. Budget is explicitly unconstrained ("spend as many hours and credits as needed") and the project ethos is data-first. Use the differential-decode protocol (compare 15+ record instances, stage1-vs-god pairs) as the primary method.
- **D-04:** Escalate to **ELF disassembly** for fields that resist decoding AND materially affect the look. Accept a **footage-calibrated INFERRED value (clearly labeled)** ONLY for fields that (a) genuinely won't decode after escalation, OR (b) the game computes/animates at runtime (per CLAUDE.md: hand-tuning is allowed only for runtime-computed quantities, always labeled inferred). Lean decode over infer.

### GS-dump & disc region
- **D-05:** **Disc region = NTSC-U**, confirmed from the reference footage source `God of War_SCUS-97399_...` (`SCUS-97399` is the US serial). Therefore rate/lifetime fields are interpreted as **NTSC 60Hz tick units**. This resolves roadmap success-criterion 4's region prerequisite from evidence already on hand.
- **D-06:** A **PCSX2 GS dump** of a blade swing is treated as a RECOMMENDED (not blocking) corroboration step — it would upgrade per-effect blend-config confidence from MEDIUM to HIGH and confirm the MAT→GS blend mapping. Plan the decode to be corroborated **primarily** by (a) differential decode across record instances, (b) Phase-1 freeze-frame color anchors, and (c) cross-record consistency, so the decode does not stall if no GS dump is captured. **NEEDS USER CONFIRMATION:** whether a GS dump can be captured; if yes, fold it in as the blend/color ground truth.

### Type-5 blade-state descriptor scope
- **D-07:** **Defer** the type-5 ANM descriptor (blades on Kratos's back out of combat / in hands during combat) out of the fast-track slice. It is blade *presentation*, not particles, and does not contribute to the fire/trail payoff. Note it as a later Phase-5 slice or fold into Phase-6 blade work. (Trims roadmap success-criterion 3 from the fast-track scope — acceptable under `Mode: mvp`.)

### Claude's Discretion
User answered "no preference" on which areas to discuss — all decisions above were made on the user's behalf, grounded in the project's data-first ethos, the unconstrained budget, and the user's stated priority (thick, particle-rich trails and prominent fire vs. reference footage). **User can adjust any decision before planning proceeds.**

### Folded Todos
- **`trail-fidelity-from-footage`** — footage-grounded trail analysis (clip `God of War_SCUS-97399_20260724212336.mp4`, ~t=20s combo3A). Provides Phase-5 corroboration data: (1) real trail hugs the tip arc (outer ~third); (2) age→color ramp white-hot→orange→ember-red, likely painted in `GFX_swordtrail` — inspect the texture first (data-first, may be a UV-mapping fact not new code); (3) trail fully gone ~30 frames post-swing (a lifetime anchor to corroborate decoded `PTC` lifetimes); (4) discrete spark specks ride the trail = spark particles (the priority lever, D-01). Records live in `assets/kratos/fx/` and inside `assets/wads/R_WPN0_0.WAD`.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### FX format research (already in-repo — the RE starting point)
- `CLAUDE.md` §"Part 2: GoW1 FX data formats — what exists, what doesn't" — VERIFIED: MAT blend/flags decode exists; FXC/PTC/MSH-shape records are NOT decoded anywhere public; `MSH_BDepoly6Shape` is handled as raw data (tag 112) by mogaika. This is the honest baseline for the RE.
- `CLAUDE.md` §"Part 1: PS2 GS Blending → WebGL1" — the ABCD→WebGL blend table + `0x80 = 1.0` convention + alpha-over-1.0 rule; needed to interpret any decoded blend/intensity field and for the GS-dump cross-check.
- `CLAUDE.md` §"Part 4: Verification tools" — PCSX2 GS Debugger/dumps as ground truth (D-06); god_of_war_browser as the RE cross-reference.

### Requirements & roadmap
- `.planning/ROADMAP.md` §"Phase 5: FX Record Decode" — goal, 4 success criteria, decode order, differential-decode + GS-dump + ELF-escalation research flag.
- `.planning/REQUIREMENTS.md` — DEC-02, DEC-03 (the phase's requirement IDs — read for exact acceptance wording).

### Existing decode implementation (the pattern to extend)
- `tools/kratos-lab/fxparse.js` — `buildMats`/`parseTxr` MAT+TXR decode: the fail-loud size-bound-then-magic pattern, `readName`, evidence-driven field reads. The FxDb decoders should mirror this style.
- `tools/kratos-lab/parsers.js` — `parseWad`/record access (`{idx,off,tag,size,name,dataOff}`), `resolve`, `decodeTexture`. FX records are reached via the same WAD record access.

### Source data
- `assets/kratos/fx/` — 12 records: `FXC_BFTemit1/2`, `FXC_BGTemit1/2`, `FXC_CNGemit`, `FXC_FXCFemit`, `PTC_BFTpart1/2`, `PTC_BGTpart1/2`, `PTC_CNGpart`, `PTC_FXCFpart`.
- `assets/wads/R_WPN0_0.WAD` — weapon WAD containing the same FX records in-container (differential-decode source).
- `assets/weapon/GFX_swordtrail.bin` + `PAL_swordtrail.bin` — the trail texture to inspect for a painted age→color ramp (trail-fidelity todo point 2).
- Reference footage: `God of War_SCUS-97399_20260724212336.mp4` (NTSC-U, ~t=20s combo3A) — corroboration + region proof (D-05). Phase-1 freeze-frame color anchors where captured.

### Carried context
- `.planning/phases/03-chain-link-ribbon-glow/03-02-SUMMARY.md` — glow-intensity (alpha-over-1.0) + trail-richness carry-forward items feeding this work.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fxparse.js` decode idiom (buildMats/parseTxr): size-bound assert → magic assert → named field reads → evidence in comments. The `FxDb` decoders (`parseFxc`/`parsePtc`/`parseMsh`) should copy this idiom, including node:assert-only known-answer tests (`test/wad.test.js` style).
- `parsers.js` WAD record access + `resolve` — how to locate and slice FX records from `R_WPN0_0.WAD` for the differential (in-container vs standalone `.bin`) comparison.

### Established Patterns
- Data-first + fail-loud: unknown/short records assert, never silently default (matches CLAUDE.md and the Phase-2 review discipline). Every decoded field tagged real vs INFERRED.
- Pure, Node-testable decoders (no GL/DOM) with known-answer suites — same as `chain.js`/`fxparse.js`. `FxDb` must be JSON-dumpable without a renderer.

### Integration Points
- `FxDb` is the hand-off to Phase 6 (particle runtime) — must expose cross-record references (FXC→PTC→MSH, texture names) so the renderer resolves an emitter to its particle def to its shape/texture.
</code_context>

<specifics>
## Specific Ideas

- The **trail spark particles** are the user's top priority ("thick, rich and full of particles… we are way off") — the decode slice order (D-01) is chosen to unblock those first.
- Inspect `GFX_swordtrail` for a **painted age→color ramp** (white-hot→orange→ember-red) before assuming runtime color math — it may make the Phase-6 trail a UV-mapping fact, not new code.
- Region is **NTSC-U (SCUS-97399)** — do not treat rates/lifetimes as PAL 50Hz.
</specifics>

<deferred>
## Deferred Ideas

- **Type-5 ANM blade-state descriptor** (blades on back vs in hands) — presentation, not particles; deferred out of the fast-track slice (D-07). Revisit as a later Phase-5 slice or with Phase-6 blade work.
- **Chain-glow (`CNG`) intensity refinement** — the Phase-3 chainglow reads too subtle; the `FXC_CNGemit`/`PTC_CNGpart` decode may reveal a state-dependent glow mechanism (dark at rest → hot streak on attack). Lower priority than trails/fire in slice 1; pursue in slice 2 alongside the alpha-over-1.0 intensity fix.
- **Phase 4 (chain motion)** — deferred entirely by the fast-track pivot; parallel-capable, revisit after the particle payoff.

### Reviewed Todos (not folded)
- **`hitbox-visualization`** — matched only on generic keywords; it concerns combat hitbox display, not FX decode. Out of scope for Phase 5.
</deferred>

---

*Phase: 5-fx-record-decode*
*Context gathered: 2026-07-25*
