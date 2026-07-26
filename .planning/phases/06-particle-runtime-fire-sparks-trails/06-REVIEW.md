---
phase: 06-particle-runtime-fire-sparks-trails
reviewed: 2026-07-26T09:36:33Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - tools/kratos-lab/particles.js
  - tools/kratos-lab/fxparse.js
  - tools/kratos-lab/fx.js
  - tools/kratos-lab/app.js
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: resolved
resolution:
  resolved_at: 2026-07-26T10:00:00Z
  warnings_fixed:
    - WR-01: 52b90ad (MAT_pticleMat/colorSource load-time fail-loud assert — no per-frame TypeError)
    - WR-02: 75d8a6d (drawPool guards tint RGB non-finite before bufferSubData)
    - WR-03: 663a78b (parseLight validates core values finite, fail-loud named throw)
  info_fixed:
    - IN-01: 6f74938 (dedupe BFT/BGT variant tint into shared helper)
    - IN-02: bc3e738 (annotate parseLight ambientTriple color-R alias)
  tests: all 8 suites (particles/light/fxdb/fx/wad/chain/loop/anm) green after fixes; node --check app.js OK
  note: WR-02 uses graceful degradation (substitute spawn-finite per-particle color) rather than blanking the batch — deliberate, matches the review's suggested fix
---

# Phase 6: Code Review Report

**Reviewed:** 2026-07-26T09:36:33Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the Phase-6 particle-runtime slice: the pure `particles.js` sim
(makePool/spawn/integrate/burst, spawnAnchor, stretchAxis, INFERRED helpers), the
new `parseLight` decoder in `fxparse.js`, the `additivePremult` blend entry in
`fx.js`, and the app.js runtime wiring (`buildFxDb`, the shared billboard pool,
fire/spark/trail passes, chain-glow gate, per-blade point lights).

The core discipline the phase set out to hold is largely intact: the pool is
hard-capped, `spawn()` rejects non-finite pos/vel/size/life/color at emission,
`integrate()` age-culls to bound lifetime growth, every FX batch takes its
blend/depth from `Fx.applyMaterial` (no hardcoded `blendFunc`/`depthMask`), and
`drawFx` restores state via `Fx.restoreFxState`. The real-vs-INFERRED labeling is
consistent — the fire color traces to the byte-decoded `MAT_pticleMat.blendColor`
(real) while the ramp/glow/variant tints are labeled INFERRED, and no fabricated
"real" color was found. `parseLight`'s size gate (`< 0x48`) correctly bounds every
byte it reads (max read ends at `+0x48`), so there is no OOB spill into the
adjacent WAD record. I also traced `machine.st.hits` (combat.js): it is monotonic
(`+= 1` only, never reset), so the `!==` hit-edge burst is safe — not a defect.

The findings below are three robustness gaps where the phase's own stated
guard requirements are only partially met — each is latent (triggers on
malformed/absent decoded data rather than on the shipping target WAD), plus two
maintainability notes.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `db.meta.colorSource.value` is dereferenced unconditionally every frame, but `colorSource` is only conditionally created

**File:** `tools/kratos-lab/app.js:1155` and `tools/kratos-lab/app.js:1165` (creation site `tools/kratos-lab/fxparse.js:589`)

**Issue:** `buildFxDb` only sets `db.meta.colorSource` when `MAT_pticleMat` is found
in the WAD:

```js
// fxparse.js:588
const pmat = buildMats(records.filter((r) => r.name === "MAT_pticleMat"), wadBuf).byName["MAT_pticleMat"];
if (pmat) { db.meta.colorSource = { ... }; }
```

`drawFx` then reads `db.meta.colorSource.value` on **every** call, as an argument
expression evaluated before `drawPool` can early-out:

```js
// app.js:1155
drawPool(mvp, view, fireTex, { name: "fxFire", kinds: FIRE_KINDS, tint: db.meta.colorSource.value });
// app.js:1165
drawPool(mvp, view, trailTex, { name: "fxImpactSpark", ..., tint: db.meta.colorSource.value, stretch: SPARK_STRETCH });
```

If `MAT_pticleMat` is absent, `db.meta.colorSource` is `undefined` and `.value`
throws `TypeError` every frame → the `loop()` try/catch (app.js:1727) surfaces it
in `#status` and halts all rendering. This is asymmetric with the code's own
handling: the fire-texture path at app.js:431 explicitly treats `MAT_pticleMat` as
possibly absent (`if (matDb.byName.MAT_pticleMat)` + a documented `trailTex`
fallback), yet the color path assumes it always exists. The load-time asserts at
app.js:85 check `MAT_chainlink`/`MAT_chainglow`/`MAT_swordtrail` but never
`MAT_pticleMat`. Elevate to BLOCKER if a `MAT_pticleMat`-absent WAD is a supported
configuration.

**Fix:** Either add `MAT_pticleMat` to the load-time required-record assert (so
absence fails loud at init with a named error), or make the tint resolve a
labeled INFERRED fallback and skip the crash:

```js
// once, near load:
if (!db.meta.colorSource) throw new Error("weapon WAD missing MAT_pticleMat (fire/spark color source)");
// OR degrade gracefully:
const FIRE_TINT = (db.meta.colorSource && db.meta.colorSource.value) || [1, 1, 1]; // INFERRED fallback
...
drawPool(mvp, view, fireTex, { name: "fxFire", kinds: FIRE_KINDS, tint: FIRE_TINT });
```

### WR-02: `drawPool` non-finite guard omits the tint RGB it packs into the vertex buffer

**File:** `tools/kratos-lab/app.js:896-907`

**Issue:** Phase requirement (2) is that no non-finite value reaches `bufferSubData`.
`drawPool` guards `p`, `vel`, `size`, and `a`, and its comment claims this is
"defense-in-depth for the runtime-derived fade/size AND the spark stretch
velocity":

```js
// app.js:896
if (!Number.isFinite(p[0]) || ... || !Number.isFinite(size) || !Number.isFinite(a)) continue;
const cr = tint ? tint[0] : (c ? c[0] : 1);   // tint NOT covered by the guard above
const cg = tint ? tint[1] : (c ? c[1] : 1);
const cb = tint ? tint[2] : (c ? c[2] : 1);
```

The per-particle color path (`c`) is safe because `spawn()` already rejects
non-finite color at emission — but the `tint` override is a **separate** path
sourced from decoded (untrusted) `MAT_pticleMat.blendColor`
(`db.meta.colorSource.value`), which is read via `getFloat32` with no finite check
anywhere. A NaN/Infinity in those disc bytes packs straight into `poolVerts` →
`bufferSubData` (app.js:926) for the fire and impact-spark batches. This is the
exact class of bug `spawn()` guards against for per-particle color, left open on
the render-time override.

**Fix:** Validate the tint once before the pack loop (or per-component in the
guard):

```js
const safeTint = tint && tint.every(Number.isFinite) ? tint : null;
...
const cr = safeTint ? safeTint[0] : (c ? c[0] : 1);
```

### WR-03: Decoded light color/intensity/range reach GL uniforms without a finite check; `parseLight` performs no content validation

**File:** `tools/kratos-lab/fxparse.js:194-224`; consumed at `tools/kratos-lab/app.js:645-648` and `tools/kratos-lab/app.js:1223`

**Issue:** `parseLight` is the only decoder in `fxparse.js` with no content
validation — `parseTxr`/`parsePtc`/`parseFxc`/`parseMsh`/`parseAnmType5` all
validate a magic (or a `0x00020001` identity), but `parseLight` only size-gates,
then returns raw floats. Those floats flow to uniforms with no `Number.isFinite`
guard:

```js
// app.js:645-648  (set once at init)
gl.uniform3fv(uLightColorL, bladeLightL.color);
gl.uniform1f(uLightRangeL, bladeLightL.range * s0);
// app.js:1223    (per frame)
gl.uniform1f(uInt, dl.intensity);
```

The blade **position** uniform is guarded (the `bladeSim[key].pos` gate zeroes
intensity before a live blade exists, app.js:1221-1226), but the decoded
color/intensity/range are not. A NaN light color yields NaN fragment output for
every lit pixel — render corruption, not a crash. Phase requirement (2) explicitly
demands non-finite values be kept off GL uniforms; the target records are
byte-good (documented `(1.0,0.622,0.288)` / `2.5` / `160`), so this is latent, but
the guard the phase asked for is missing on this path.

**Fix:** Finite-validate the four core values at the end of `parseLight` (fail
loud, matching the size-gate idiom), so bad bytes never leave the decoder:

```js
for (const [k, v] of [["intensity", intensity], ["range", range]]) {
  if (!Number.isFinite(v)) throw new Error(`LIGHT ${rec.name}: non-finite ${k}`);
}
if (!color.every(Number.isFinite) || !anchor.every(Number.isFinite)) {
  throw new Error(`LIGHT ${rec.name}: non-finite color/anchor`);
}
```

## Info

### IN-01: Per-variant BFT/BGT tint math is duplicated across `drawFx` and `simStep`

**File:** `tools/kratos-lab/app.js:1119-1127` and `tools/kratos-lab/app.js:1572-1574`

**Issue:** The INFERRED "crimson" (BFT) and "toWhite" (BGT) tint formulas are
written twice. In `drawFx` the hot stop uses `toWhite(hot0, 0.15)` /
`crimson(hot0)`; in `simStep` `sparkTint` recomputes byte-for-byte the same
`[hot[0]+(1-hot[0])*0.15, ...]` (BGT) and `[hot[0], hot[1]*0.50, hot[2]*0.45]`
(BFT). Two copies of one runtime-tint rule drift apart the moment one is tuned in
Phase 7 (footage calibration is explicitly a later step), silently desyncing the
trail sheet from its sparks.

**Fix:** Hoist the tint into a single helper (near `Particles.variantFor` or as a
small module fn) and call it from both sites, e.g.
`function variantTint(variant, c) { ... }`.

### IN-02: `parseLight` ancillary `ambientTriple` re-reads offset `+0x2c`, overlapping `color[0]`

**File:** `tools/kratos-lab/fxparse.js:203` and `tools/kratos-lab/fxparse.js:209`

**Issue:** `color = [f(0x2c), f(0x30), f(0x34)]` and
`ambientTriple = [f(0x24), f(0x28), f(0x2c)]` both read `+0x2c`, so
`ambientTriple[2]` is always identical to `color[0]`. This is evidence-only
(INFERRED, never surfaced as a light parameter), so it is harmless functionally,
but it makes the ancillary "(1,1,1) triple" self-corroboration circular — the
third component can never disagree with the color R it aliases. If the intent was a
distinct vec3 ambient block, the offsets look like a copy/paste of the color
offset; if the overlap is intentional, a one-line note would prevent a future
reader from "fixing" it.

**Fix:** Confirm the intended ambient-triple offsets against the RESEARCH per-field
table; if the overlap is deliberate, annotate `+0x2c (== color R)` in the
inline comment so it reads as intentional rather than a slipped offset.

---

_Reviewed: 2026-07-26T09:36:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
