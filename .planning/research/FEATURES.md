# Feature Research

**Domain:** GoW1 (2005, PS2) Level-1 Blades of Chaos weapon presentation — visual fidelity target for kratos-lab
**Researched:** 2026-07-24
**Confidence:** HIGH for element inventory (decoded from disc data); MEDIUM for runtime behaviors (footage-inferred, pending FXC/PTC/code decode)

## Element-by-Element Reference Breakdown

What the real game's weapon presentation consists of, with data provenance. Sources: R_WPN0_0.WAD record inventory (read directly), decoded textures/materials (this research), reference footage frames extracted from the user's video (FMGwS-bvNiU, GoW1 chapter 0:00–3:26), and the Wikipedia Hydra-fight PS2 screenshot.

### 1. Chain link ribbon (base pass)

- **The original game renders the swinging chain as a textured ribbon, not 3D link meshes.** R_WPN0_0.WAD contains *no* chain geometry record — only `MAIBlade` (the blade mesh) and the `chainlink` texture. Confidence: HIGH (exhaustive record walk of the WAD).
- `chainlink` texture: **512×32, 4bpp, 16-color, linear**. Decoded content: a side-view strip of **16 links per tile (32px pitch: ~25px link + ~7px gap)**. Links occupy rows 6–25 of 32 (transparent borders top/bottom); alpha has soft edges (values 112–255), fully transparent gaps between links (see-through chain).
- Color: **near-black warm metal** — dominant texels #010101–#271B10, maximum brightness only #5F5244. The chain body is *dark*. In footage the extended chain reads as distinct dark chunky links against most backgrounds (Wikipedia Hydra screenshot: dark link silhouettes along the whole arc).
- `MAT_chainlink`: **"usual" alpha blend, depth-write ON, bilinear filter, material color (1,1,1)**. Decoded from MAT flags (bit layout verified against god_of_war_browser `mat.go`).
- Link scale/pitch along the rendered chain is runtime (tiling rate of the strip) — calibrate against footage. No taper evidence in footage; chain width appears constant, perspective does the rest.

### 2. Chain heat-glow (additive overlay pass)

- `chainglow` texture: **512×32, 4bpp — same dimensions as chainlink**, i.e. a companion overlay strip for the same ribbon UVs.
- Content: mostly black (invisible under additive blending) with **one hot cluster occupying roughly the first quarter of the strip** (peak luma at x≈32–96). Hot colors: **#FEE500 (yellow-white) → #FCBE00 (amber) → #E44C00 (orange-red) → #360600 (dark red falloff)**. Classic heat ramp.
- `MAT_chainglow`: **additive blend, depth-write OFF**, material color (1,1,1), no UV/color animation flags in the material itself.
- Runtime behavior (footage): **state-dependent**. At rest/slow movement the chain reads dark with at most a faint hot shimmer near the blade end. During attacks/throws the extended chain reads as a **glowing red-hot streak with a white-saturated core and periodic link modulation** (frame t=45s: grab-throw chain = white core + red halo). Whether the engine scrolls the glow strip, repositions it near the pommel, or ramps its intensity per state is **not yet decoded** — confidence LOW on mechanism, HIGH on the observed result. Prime candidate: hero WAD `FXC_CNGemit`/`PTC_CNGpart` ("ChaiN Glow"?) — decode target.

### 3. Chain motion

- **Combat idle:** short catenary slack loop between the forearm anchor (`lChain`/`rChain` joints) and the blade pommel; sways with body motion.
- **In flight (whips/throws):** chain pulls taut with **pronounced lag curvature** — big smooth C-curves trailing the blade arc (Wikipedia Hydra shot; frames t=17/21s). Settles back to drape after the move.
- **Forearm wrap:** the wrap on Kratos' forearms is *modeled/textured into the hero mesh* (already decoded); the dynamic ribbon only spans forearm→pommel.
- **Out of combat:** blades stow crossed on Kratos' back (mesh part skinned to `rightBladeBack`/`leftBladeBack` joints — already parsed in kratos-lab); the type-5 ANM descriptor (undecoded) likely holds the show/hide state for in-hand vs on-back blades.

### 4. Blade fire (constant flame on blades)

- Data chain (level-1 blade, from WAD grouping): `FXC_BDepoly6` (emitter config, 136B) → `PTC_flame6` (particle def, 632B) → `MAT_M01splash` → `splash` texture (**64×64 8bpp, soft white puff, low alpha**); and `FXC_BDepoly3` → `PTC_flame3` → `MAT_M01blurredSplotch` → `fireSplotch` texture (**64×64 8bpp, grayscale splotch**). Plus `MSH_BDepoly6Shape`/`MSH_BDepoly3Shape` (768B each) — emission shapes along the blade ("BDepoly" = blade poly). **Two layered flame systems per blade.**
- Both flame materials are **grayscale/white textures with "usual" alpha blending — the orange-red flame color must come from runtime particle color in the PTC records** (decode target; expected orange-red ramp).
- Footage: in combat the blades carry **elongated red-orange flame streaks hugging the blade length, with brighter/white-hot flecks**, visible even while held (frame t=14s shows both raised blades wrapped in fire). Fire intensifies with swings.

### 5. Impact sparks

- `FXC_BDEsparkemit` (228B) — **two instances, one per blade** (`.0` suffix on the second). Decode target for rate/velocity/color.
- Footage: hits produce **brief hot spark bursts** at the contact point (yellow-white streaks + small flash), stochastic, fast-decaying.

### 6. Swing trails

- `swordtrail` texture: **64×32 8bpp**, ~95% black, with a thin **amber gradient (max #F3B012, alpha 0x80=1.0)** concentrated along one edge — an edge-hot streak texture, *not* a broad white fan.
- `MAT_swordtrail`: **additive, depth-write OFF**, bilinear.
- Footage shows **two trail characters**: (a) dominant **crimson-red ribbon with white-hot core** on most swings (frames t=8/17s: broad red fans across wide arcs; inner region translucent red, leading edge white); (b) occasional **silver-white/neutral swoosh** on some moves (idlesheet t≈30–31s). The hero WAD carries **two trail emitter pairs: `FXC_BFTemit1/2` + `PTC_BFTpart1/2` and `FXC_BGTemit1/2` + `PTC_BGTpart1/2`** (1/2 = left/right blade) — consistent with a fire trail + neutral swoosh dual system. The crimson comes from runtime color modulating the amber texture (amber × red vertex color, ×2 modulate, clamping to red-white) — MEDIUM confidence, decode `PTC_BFT/BGT` to confirm.
- Trails persist for a substantial part of a swing arc then fade fast (~0.2–0.4s, LOW confidence — tune against footage). Wide sweeps produce large flat fans following the blade path plane.

### 7. Per-blade dynamic lights

- `LeftBladeLight` / `RightBladeLight` records decoded (magic 0x6, 88 bytes, point-light flags=1): **color (1.0, 0.622, 0.288) — warm orange — intensity 2.5, range ~160 units, offset (0, −0.3, −8) from the blade frame**. Confidence: HIGH (field layout verified against god_of_war_browser `light.go`).
- Effect in game: warm orange vertex-lit tint on Kratos' arms/torso and nearby ground whenever blades are out (visible in frame t=14s). PS2 vertex lighting — no shadows cast.

### 8. Additive saturation ("the PS2 hot core")

- Everywhere flame/glow/trail layers overlap, colors **clamp to flat white** (LDR saturate) — the signature white-hot core with hard hue banding to red at the fringe. This is a renderer *behavior*, not an asset: additive blending in clamped 8-bit gamma space with no tonemapping.

### 9. Move-specific FX (finishers)

- Plume of Prometheus (□□△) finisher erupts a **large orange fire plume + expanding ground fire ring + dark smoke** (idlesheet t≈26–28s). Hero WAD carries `fireSplotch`, `splash`, `Comicsmoke` textures and `FXC_FXCFemit`/`PTC_FXCFpart` (candidate). Distinct from the constant blade fire.

## Feature Landscape

### Table Stakes (absent = instantly reads fake)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Chain ribbon textured with real `chainlink` strip at correct link pitch (32px/link, 16 links/tile), alpha gaps visible | The dark chunky see-through links are the chain's identity in every frame | MEDIUM | Ribbon approach IS authentic — upgrade existing flat ribbon's tiling/width/billboarding, don't replace with 3D links |
| `chainglow` additive overlay pass (depth-write off) with the real heat-ramp colors | The hot-chain look during attacks is the single most recognizable weapon element | MEDIUM | Same UVs as base pass; runtime intensity/placement rule needed (see differentiators) |
| Chain motion: catenary drape at rest, taut whip-lag C-curves in flight, settle after | Footage shows pronounced lag curves on every swing; straight chains read instantly fake | HIGH | Physics/verlet over the authored blade tracks; anchors already known (`lChain`/`rChain` → pommel) |
| Constant blade fire: two layered flame systems per blade (flame3+flame6), red-orange, hugging the blade | Blades are visibly aflame in essentially every combat frame | HIGH | Requires FXC/PTC/MSH_BDepoly decode; grayscale sprites tinted by runtime particle color |
| Crimson swing trail with white-hot core, additive, fast fade | Every attack in footage is dominated by these ribbons | MEDIUM | Existing trail + real `swordtrail` texture + red runtime tint; broad fan on sweeps |
| Impact spark bursts on hit (BDEsparkemit) | Hit feedback; absence makes contact feel dead | MEDIUM | Needs hit events from existing combat state machine + FXC decode |
| Additive saturation to flat white where layers stack | The "PS2 hot core" look; modern soft blending reads wrong immediately | LOW | Clamped LDR additive blending in gamma space — no tonemapping |
| Blades on back when idle/out of combat, in hands in combat | Core presentation grammar of the character | LOW–MEDIUM | Back-blade mesh already parsed; type-5 ANM descriptor = likely show/hide state (decode) |

### Differentiators (the last 10–20% of authenticity)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-blade warm point lights using decoded values (1.0, 0.622, 0.288) × 2.5, range 160 | Orange tint on Kratos' skin/ground sells "the blades light the scene"; values are the game's own | MEDIUM | Vertex-lit only, no shadows — matches PS2 |
| State-dependent chain glow (dark at rest → hot streak in flight) | Matches both the Hydra screenshot (dark links) and throw frames (white-hot chain) | MEDIUM | Mechanism undecoded — candidate `FXC_CNGemit`; else infer from footage and label inferred |
| Hot-cluster glow distribution per texture (hot near pommel end, dark tail) | The glow is not uniform; texture says exactly where the heat lives | LOW | Free once UV mapping is right |
| Dual trail system (crimson fire + neutral silver swoosh per blade) | Explains both trail colors seen in footage; BFT/BGT records are per-blade pairs | MEDIUM | Decode PTC_BFT/BGT for colors/lifetimes |
| Runtime flame color ramp from PTC records | "Use the game's values" — flame hue/level differences come from data, not eyeballing | HIGH | 632-byte PTC layout decode; highest-effort decode target |
| Plume of Prometheus eruption FX (fire plume + ground ring + smoke) | Finisher moments are the flashiest frames in any comparison clip | HIGH | Move-specific triggering; defer until core loop matches |
| PS2 GS texture character: bilinear filtering, low-res texel chunk, no mip trilinear/aniso | Grazing-angle blur and chunky texels are part of the period look | LOW | WebGL1 settings; mostly free |
| 60 Hz trail sampling with visible polygonal steps on fast swings | GoW1 runs 60fps; trails are per-frame polygon extrusions, not smoothed splines | LOW | Do NOT spline-smooth the trail history |

### Anti-Features (modern effects the PS2 game does NOT have — deliberately exclude)

| Feature | Why Tempting | Why Wrong for GoW1 | Alternative |
|---------|--------------|--------------------|-------------|
| HDR bloom / post-process glow | "Fire should glow" instinct | Zero halation in footage — flames/trails have hard sprite edges; PS2 GS glow = additive geometry only | Additive passes that clamp to white |
| Soft particles (depth-fade at intersections) | Hides sprite/geometry seams | PS2 flame sprites hard-clip against geometry; softening reads modern | Let sprites intersect hard |
| True 3D chain link meshes | PROJECT.md says "segmented 3D-reading links" | The game has NO chain mesh — it's a textured ribbon; real 3D links change silhouette/filtering and read "too good" | Ribbon with correct link pitch + billboarding (optionally crossed second ribbon) — "3D-reading" comes from the texture |
| Motion blur (per-object or camera) | Modern action-game default | GoW1 PS2 has none on the weapon; smearing kills the crisp 60fps whip readability | Trails ARE the motion blur |
| Smooth spline trails with soft alpha gradients | Looks "cleaner" | GoW1 trails are raw per-frame polygon fans; polish reads wrong | Keep stepped 60Hz extrusion |
| Tonemapping (ACES/filmic) on hot colors | Preserve hue in brights | GoW1 clips to flat white; hue-preserving rolloff changes the fire character completely | Clamped LDR gamma-space blending |
| Particle-cast lighting / shadow-casting blade light | Physical correctness | Only the 2 authored point lights exist; vertex-lit, no shadows | Use decoded light records only |
| Normal maps / specular on chain & blade | Modern metal rendering | Flat textures + vertex color only on these elements | Real textures at native res |
| Depth of field, lens flare, chromatic effects | Cinematic feel | Not present in PS2 gameplay camera | Clean framing only |

## Feature Dependencies

```
Chain ribbon base pass (chainlink texture, pitch, billboarding)
    └──requires──> nothing new (upgrade of existing ribbon)

Chain glow overlay ──requires──> Chain ribbon base pass (shared UVs)
State-dependent glow ──requires──> Chain glow overlay + combat state machine (existing)

Chain motion (drape/whip-lag/settle) ──independent of texturing──
    └──feeds──> both chain passes (ribbon geometry)

Blade flame systems ──requires──> FXC/PTC/MSH_BDepoly decode + MAT blend application
Impact sparks ──requires──> FXC_BDEsparkemit decode + hit events (existing state machine)
Swing trails (dual) ──requires──> swordtrail MAT/texture (done here) + PTC_BFT/BGT decode for colors
Plume finisher FX ──requires──> Blade flame systems (shared textures/decode) + move triggers

Per-blade lights ──requires──> vertex-lighting hook in renderer (new)
    └──enhances──> everything (warm tint on Kratos/ground)

Additive saturation ──enhances──> glow, flames, trails (renderer-wide blend behavior)
Blade stow/draw ──requires──> type-5 ANM descriptor decode (or inferred combat-state rule)
```

### Dependency Notes

- **Glow requires base ribbon:** the glow strip is dimension-matched to chainlink — one ribbon, two passes, shared UVs. Build the UV/tiling pipeline once.
- **FXC/PTC decode gates flames, sparks, and trail colors:** three table-stakes features hang off the same decode effort — do the record decode as its own early phase (this matches PROJECT.md's "decode before visuals" decision).
- **Additive saturation conflicts with tonemapping:** the renderer must NOT gain any HDR/tonemap pass later; lock this as a rendering invariant.
- **Chain motion is independent:** it can be built and judged with the current flat ribbon before texturing lands, or in parallel.

## MVP Definition

### Launch With (v1) — "reads as GoW1 in motion"

- [ ] Chain ribbon with real chainlink texture at correct link pitch + alpha gaps — the chain's identity
- [ ] Chainglow additive pass (correct blend/depth flags, heat-ramp placement) — the hot-chain look
- [ ] Chain motion: drape / whip-lag / settle — motion is half the authenticity bar
- [ ] FXC/PTC/MSH decode for flames + sparks + trails — everything downstream uses these values
- [ ] Constant blade fire (both systems, runtime-tinted) — visible in every frame
- [ ] Crimson swing trail with white core (real texture + runtime tint) — dominates attack frames
- [ ] Impact sparks on hit events
- [ ] Additive-clamp rendering behavior (no bloom, no tonemap)

### Add After Validation (v1.x)

- [ ] Per-blade point lights (decoded values) — when core FX pass a side-by-side check
- [ ] State-dependent glow intensity rule — after footage comparison identifies the exact trigger
- [ ] Blade stow/draw via type-5 decode — when idle/traversal clips join the comparison set
- [ ] Dual-trail split (BFT vs BGT) — after PTC_BFT/BGT decode confirms the two-system theory

### Future Consideration (v2+)

- [ ] Plume of Prometheus / move-specific finisher FX — high effort, only visible on specific inputs
- [ ] PS2 GS filtering-character emulation beyond bilinear — diminishing returns at the 80–90% bar
- [ ] God-tier (stage5/godchain/godswordtrail) variants — explicitly out of scope per PROJECT.md

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Chain ribbon (real texture, pitch) | HIGH | LOW–MEDIUM | P1 |
| Chainglow overlay pass | HIGH | MEDIUM | P1 |
| Chain motion (drape/whip/settle) | HIGH | HIGH | P1 |
| FXC/PTC/MSH decode | HIGH (gates 3 features) | HIGH | P1 |
| Blade fire | HIGH | HIGH | P1 |
| Swing trails (crimson+core) | HIGH | MEDIUM | P1 |
| Impact sparks | MEDIUM | MEDIUM | P1 |
| Additive-clamp behavior | HIGH | LOW | P1 |
| Per-blade lights | MEDIUM | MEDIUM | P2 |
| State-dependent glow | MEDIUM | MEDIUM | P2 |
| Blade stow/draw | MEDIUM | MEDIUM | P2 |
| Dual-trail split | MEDIUM | MEDIUM | P2 |
| Finisher FX | LOW–MEDIUM | HIGH | P3 |

## Sources

**Disc data (HIGH confidence — read directly this session):**
- `extracted/wads/R_WPN0_0.WAD` — full record walk: blade/flame/spark/chain/trail inventory, `MSH_BDepoly3/6Shape`, `LeftBladeLight`/`RightBladeLight`
- Decoded textures: `GFX/PAL_chainlink`, `chainglow`, `swordtrail`, `stage1Btx`, `fireSplotch`, `splash` (dimensions, palettes, link pitch, heat-ramp colors, usage histograms)
- Parsed `MAT_*` records (blend flags per god_of_war_browser `mat.go` bit layout) and `*BladeLight` records (per `light.go`)
- `extracted/README.md`, `tools/kratos-lab/README.md` — existing decode state

**Reference footage (MEDIUM–HIGH confidence — frames extracted and analyzed):**
- [User's reference video FMGwS-bvNiU](https://www.youtube.com/watch?v=FMGwS-bvNiU), GoW1 chapter 0:00–3:26 — frames at t=3, 8, 14, 17, 21, 45, 57s + contact sheets (trail color/shape, blade fire, chain-in-flight, finisher FX). Note: footage appears to be the PS3 God of War Collection (720p/16:9); Bluepoint port retains PS2 assets/FX ([GamesRadar review](https://www.gamesradar.com/god-of-war-collection-review/), [GameFAQs comparison thread](https://gamefaqs.gamespot.com/boards/971800-god-of-war-collection/53755123))
- [Wikipedia GoW1 gameplay screenshot](https://en.wikipedia.org/wiki/God_of_War_(2005_video_game)) (Hydra fight) — dark links on extended chain, fire at blade end, whip curvature

**Platform facts (MEDIUM confidence — multiple sources):**
- GoW1 PS2 supports 480p progressive, widescreen, ~60fps ([GameFAQs progressive scan thread](https://gamefaqs.gamespot.com/boards/919864-god-of-war/42651447), [PS2 Dev Wiki display modes](https://www.psdevwiki.com/ps2/Games_With_Alternative_Display_Modes))
- [mogaika/god_of_war_browser](https://github.com/mogaika/god_of_war_browser) — MAT/light record field layouts (`pack/wad/mat/mat.go`, `pack/wad/light/light.go`)
- Lore/appearance context: [God of War Wiki — Blades of Chaos](https://godofwar.fandom.com/wiki/Blades_of_Chaos) (via search snippets; page blocked direct fetch)

---
*Feature research for: GoW1 Blades of Chaos visual presentation (Level 1)*
*Researched: 2026-07-24*
