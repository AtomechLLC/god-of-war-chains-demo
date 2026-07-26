# Phase 6: Particle Runtime — Fire, Sparks & Trails - Pattern Map

**Mapped:** 2026-07-26
**Files analyzed:** 11 touch surfaces (1 NEW pure module, 3 in-place `app.js` extensions, 1 `fx.js` table entry, 1 NEW `fxparse.js` decoder, 2 NEW test suites, 1 test extension, 1 `index.html` version bump)
**Analogs found:** 10 / 11 (the only genuinely new-shape code is the view-matrix-column billboard VS + velocity-stretch, which has no in-repo analog — copy the CLAUDE.md Part 3 blueprint reproduced in RESEARCH Code Examples)

Line anchors are CURRENT as of this session's read (branch `master`, tip `a0764aa`). This is a **render/runtime payoff phase** — it consumes the Phase-5 `FxDb`, it does not re-decode formats (RESEARCH resolved both D-09 top-ups: `FXC_BDEsparkemit` is already a real `db.fxc` key, and `parseLight` is the one thin decode add). The RED known-answers (spawn-anchor math, `parseLight` byte-exact values, blade-lag divergence) live in RESEARCH "Code Examples" / "Decoded Data Inventory" and are authoritative over this map's prose.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tools/kratos-lab/particles.js` (NEW — pure spawn/advect/cull/variant-select/glow-gate) | sim module (pure) | transform + event-driven | `chain.js` (pure IIFE, interleaved-vert return) + `loop.js` (pure accumulator, `STEP`) | role-match (exact scaffold) |
| `tools/kratos-lab/app.js` `drawFx()` (MODIFY — particle-pool GL draw + fire/spark passes) | render | request-response (per-frame GPU submit) | same file: chainglow/trail passes `drawFx` (593–702) | exact (same fn, extend) |
| `tools/kratos-lab/app.js` `simStep()` (MODIFY — spawn + integrate) | sim | event-driven (per-tick) | same file: `trailHist` recording in `simStep` (1063–1081) | exact (same fn, extend) |
| `tools/kratos-lab/app.js` mesh shader `prog` (MODIFY — point-light term) | render (shader) | transform | same file: `vsrc`/`fsrc` directional-light term (124–152) | role-match (extend lighting math) |
| `tools/kratos-lab/fx.js` (MODIFY — `additivePremult` MATGL entry) | config / render-state | request-response | same file: `additive`/`usual` MATGL entries (24–40) | exact |
| `tools/kratos-lab/fxparse.js` `parseLight` (NEW decoder) | binary decoder | file-I/O → transform | same file: `parseTxr` (159–173) + `parseAnmType5` vec4 reads (436–502) | exact |
| `tools/kratos-lab/test/particles.test.js` (NEW) | test (pure sim known-answer) | transform | `test/chain.test.js` / `test/loop.test.js` pure-module scaffold | exact |
| `tools/kratos-lab/test/light.test.js` (NEW) | test (byte-exact known-answer) | file-I/O | `test/fxdb.test.js` (WAD read + resolve + KA) | exact |
| `tools/kratos-lab/test/fxdb.test.js` (EXTEND — BDEsparkemit/CNG assertions) | test (known-answer) | batch | same file (scenario blocks 45–70) | exact |
| `tools/kratos-lab/index.html` (MODIFY — `?v=23`→`?v=24` all tags + new `particles.js` tag) | config | — | same file: lockstep `?v=23` tags (115–122) | exact |
| `tools/kratos-lab/loop.js`, `combat.js` | — | — | — | **UNCHANGED — consumed as-is** (accumulator clock; `st.hits`/`isIdle()`/`windows` triggers) |

**`FXC_BDEsparkemit` / blade-light D-09 note:** RESEARCH confirmed `FXC_BDEsparkemit` (+`.0`,`0`,`2`) is **already** a real `db.fxc` key surfaced by `buildFxDb` (fxparse.js 607–613) — **no decoder change**. The only new decode is `parseLight`. `buildFxDb` itself needs **no edit** for sparks; the fire family binds by `shapeRef` NAME (Pitfall 6), which the existing `db.refs` shape-ref loop (fxparse.js 645–657) and the raw `db.fxc[...].shapeRef` field already expose.

## Pattern Assignments

### `tools/kratos-lab/particles.js` (NEW — pure sim module, transform + event-driven)

**Analog:** `chain.js` (whole-file scaffold) + `loop.js` (`STEP` constant + factory-returns-methods shape). This is the automatable core of SC1/SC2 — spawn-anchor transform, Euler advect, aging, cull, velocity-stretch axis — and MUST be a pure module with **no GL/DOM** so it is Node-testable, exactly like `chain.buildRibbon`.

**IIFE + vec-helpers + named-export + dual-env-guard scaffold to copy** (`chain.js` 28–47, 147–151):
```js
const Particles = (() => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  // ... spawn / integrate / cull / variantFor / glowGain ...
  return { makePool, /* STEP-unit helpers */ };
})();
// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Particles;
```

**Fixed-step integrate — mirror the `loop.js` factory shape** (`loop.js` 21, 30–45): a `makePool()` factory returns `{ spawn, integrate, particles, ... }`; `integrate(dt)` runs `pos += vel·dt; vel += g·dt; age += dt` and culls `age > life`, called with exactly `Loop.STEP` from `simStep` (never a wall delta — Pitfall 5). Hard-cap pool length + lifetime cull (Security "unbounded particle growth"); guard/skip non-finite params before they reach a vertex (Security "NaN → GL uniform").

**Interleaved-vert output convention — mirror `chain.buildRibbon`'s return** (`chain.js` 133–144): the pure module owns the SIM math and returns particle arrays (positions/velocities/ages/sizes); the GL vertex packing (4 verts/particle, corner offsets, UV, color128) is assembled in `app.js`. Return a plain JSON-dumpable structure — no GL handles (same purity as `{ verts, nLinks, arcLen }`).

**Blade-local spawn → world decouple (SC1 blade-lag, D-03)** — the anti-Pitfall-4 core. Take the emitter's decoded FXC placement-matrix translation and transform by the live blade world matrix ONCE at spawn; integrate in world space after (see `xformM` under Shared Patterns):
```js
// Source: RESEARCH Pattern 2 + VERIFIED app.js xformM(540), bladeSim[key].mat(500)
const m = bladeSim[key].mat;                  // live blade world matrix THIS tick
const anchorLocal = fxc.matrix.slice(12, 15); // decoded FXC translation (blade-local)
const spawnWorld = xformM(m, anchorLocal);    // world pos; particle decouples after this
pool.spawn({ pos: spawnWorld, vel: jitter(inferredVel), age: 0, life: inferredLife });
```

**Determinism boundary (D-07):** the pure module stays deterministic/tested; per-particle randomness (jitter within decoded ranges) is injected by the caller passing a seeded/`Math.random` sampler — keep RNG OUT of the tested known-answer paths (feed fixed jitter=0 in tests, exactly as `chain.test.js` feeds fixed curve arrays).

---

### `tools/kratos-lab/app.js` `drawFx()` (MODIFY — particle pool draw + fire/spark/glow passes, request-response)

**Analog:** the existing `drawFx` chainglow + trail passes (593–702) — the single FX insertion site. Add the pool draw *before* `Fx.restoreFxState(gl)` (700).

**Decoded-blend-only pass structure to copy verbatim** (656–698 — every pass: `Fx.applyMaterial` → `fxLog.push` → set MODULATE uniforms → bind texture → upload → draw; NO hardcoded `blendFunc`/`depthMask`):
```js
const mat = matDb.byName.MAT_swordtrail;
Fx.applyMaterial(gl, mat);                                   // DEC-01 — full state from MAT
fxLog.push({ name: mat.name, mode: mat.mode, depthWrite: !mat.disableDepthWrite });
gl.uniform3fv(fxLocs.uMaterialColor, mat.materialColor);
gl.uniform4fv(fxLocs.uLayerColor, mat.blendColor);
gl.uniform1f(fxLocs.uCutoff, 0.0);                           // additive: no cutout
gl.bindTexture(gl.TEXTURE_2D, trailTex);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trailV), gl.DYNAMIC_DRAW);
gl.drawArrays(gl.TRIANGLES, 0, trailV.length / 6);
```

**Per-frame DYNAMIC_DRAW buffer + interleaved attribute binding to copy** (the pool needs its own program + buffer, following `fxBuf` setup 382, 641–645 and `makeBuf(arr, dynamic)` 169–174; `bufferSubData` per-frame rewrite from `uploadSkinnedVerts` 578–579):
```js
gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf);               // (pool gets its OWN buffer)
gl.vertexAttribPointer(fxLocs.aP, 3, gl.FLOAT, false, 24, 0);   // stride 24, offset 0
gl.vertexAttribPointer(fxLocs.aT, 3, gl.FLOAT, false, 24, 12);  // offset 12
```
Batch pool draws by blend group + texture (D-02); additive commutes → no depth sort. Every new pass appends to `fxLog` so `KratosLab.fxState()`/`fxLog` (1128–1137) proves per-pass state.

**Trail ribbon extension (TRL-01/02, Pattern 4) — extend, do not replace** (624–634): keep the `trailHist.map → pushRibbon` rows; `TRAIL_INNER_T = 0.6` (498) tip-arc bias already present; add the runtime age→color ramp as a fragment uniform (INFERRED, label it) and select `MAT`/texture per BFT-vs-BGT from `combat.js` move state.

**alpha-over-1.0 premult path (CHAIN-03 glow + fire, D-05, Pattern 3):** route glow/fire through the new `additivePremult` MAT mode (see `fx.js` below) and output `gl_FragColor = vec4(rgb * alpha128, 0.0)` in the pool/fire fragment (RESEARCH Code Examples). Gate glow gain by combat state: `const glowGain = machine.isIdle() ? GLOW_REST : GLOW_HOT;` (INFERRED rule, no decoded gate exists — RESEARCH CHAIN-03).

---

### `tools/kratos-lab/app.js` `simStep()` (MODIFY — spawn + integrate, event-driven per-tick)

**Analog:** the `trailHist` recording block inside `simStep` (1063–1081) — the exact precedent for "record/advance per sim tick, not per rendered frame" (Pitfall 5). Particle spawn + `pool.integrate(STEP)` slot in right beside it, same `const STEP = Loop.STEP` (1048), same `attacking = !machine.isIdle()` gate (1067), same `driveBlade`-produced `bm`/`bladeSim[key].mat` (1075) for the spawn anchor.
```js
// existing precedent to sit beside (app.js 1066–1080):
if (blade) {
  const attacking = !machine.isIdle();
  for (const [key, hand, trackOff] of [["l", JID.lWeapIH, 0], ["r", JID.rWeapIH, 3]]) {
    const bm = driveBlade(bladeSim[key], world, hand, tp, STEP);
    if (attacking) { hst.push({ tip: xformM(bm, blade.tip), hilt: xformM(bm, blade.hilt), age: 0 }); }
  }
}
```
**Hit-edge spark burst (FIRE-02, Pattern 5):** edge-detect `machine.st.hits` (combat.js 146/172) across ticks and burst on change:
```js
// Source: VERIFIED combat.js st.hits(:172); RESEARCH Code Examples
if (machine.st.hits !== prevHits) { pool.burstSparks(bladeSim, fxcSpark, INFERRED_count); prevHits = machine.st.hits; }
```
`simStepCount++` (1085) already witnesses cadence for the 60Hz-vs-144Hz test.

---

### `tools/kratos-lab/app.js` mesh shader `prog` (MODIFY — per-blade point light, REND-02, Pattern 6)

**Analog:** the existing directional-light term in the mesh fragment shader (144–150) — the new point light copies this Lambert shape, swapping the constant `L` for a per-vertex vector to the decoded light world position with linear range attenuation. Pass light uniforms like the existing `uHeat`/`uModel` (339–345). No shadows (D-06).
```glsl
// existing directional term to mirror (app.js fsrc 145–146):
vec3 L = normalize(vec3(0.35, 0.5, 1.0));
float diff = 0.38 + 0.72 * max(dot(n, L), 0.0);
// NEW: point light — Lambert + linear atten (RESEARCH Pattern 6):
//   vec3 Lp = uLightPos - worldPos; float d = length(Lp);
//   float atten = max(0.0, 1.0 - d / uLightRange);
//   c += uLightColor * uLightIntensity * max(dot(n, normalize(Lp)), 0.0) * atten;
```
Light world position = decoded `parseLight` anchor (`(-0.32,-8.0,1.0)`) transformed by `bladeSim[key].mat`. Values are REAL/decoded, not INFERRED (RESEARCH REND-02).

---

### `tools/kratos-lab/fx.js` (MODIFY — `additivePremult` MATGL entry, Pattern 3)

**Analog:** the `additive` / `usual` entries in the `MATGL` table (24–40). The file's own header comment (13–19) **already anticipates this exact entry** ("The table below must gain a premultiplied entry"). Add ONE mode; do NOT inline a `blendFunc` in `app.js` (Anti-Pattern — violates DEC-01). `applyMaterial` (48–55) and `restoreFxState` (59–63) are unchanged.
```js
// extends MATGL (fx.js:24) — Source: CLAUDE.md Part 1 "alpha-over-1.0", RESEARCH Pattern 3
additivePremult: (gl) => {
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE);           // premultiplied source: Cs·As + Cd, no clamp on As
},
```
The mode string reaches `applyMaterial` via `mat.mode`; for the CNG/fire draws the caller supplies a MAT (or a synthesized mat-like `{ name, mode:"additivePremult", disableDepthWrite:true }`) so the assert-on-unknown contract (50) still holds.

---

### `tools/kratos-lab/fxparse.js` `parseLight` (NEW decoder, REND-02, file-I/O → transform)

**Analog:** `parseTxr` (159–173) is the closest structural match — a single `(buf, rec)` decoder: size-gate BEFORE any field read (both naming the record), `DataView` over `buf.buffer/byteOffset/byteLength`, `readName` for the record name, verbatim field reads. `parseAnmType5` (436–502) is the second analog for the **vec4 offset reads bounded by `rec.size`** (anchorOffset 456–460) and the real-vs-INFERRED evidence-array discipline.

**Size-gate-then-read idiom to copy** (parseTxr 159–172; the byte-exact offsets are in RESEARCH Code Examples "parseLight"):
```js
// Source: RESEARCH "parseLight" — LeftBladeLight @0x6a60, 88 B, fields byte-exact
function parseLight(buf, rec) {
  if (rec.size < 0x48) throw new Error(`LIGHT ${rec.name}: size ${rec.size} < 0x48`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const b = rec.dataOff;
  return {
    anchor:    [dv.getFloat32(b+0x10,true), dv.getFloat32(b+0x14,true), dv.getFloat32(b+0x18,true)], // (-0.32,-8.0,1.0)
    color:     [dv.getFloat32(b+0x2c,true), dv.getFloat32(b+0x30,true), dv.getFloat32(b+0x34,true)], // (1.0,0.622,0.288)
    intensity:  dv.getFloat32(b+0x38,true),  // 2.5
    range:      dv.getFloat32(b+0x44,true),  // 160
    // evidence[]: tag the 4 core values "real"; ancillary +0x24/+0x3c/+0x40 verbatim (A5)
  };
}
```
**Export line to extend** (fxparse.js 719): add `parseLight` to `return { ... }`. The dual-env guard (722–723) is untouched. `LeftBladeLight`/`RightBladeLight` are WAD-native records located via `Parsers.parseWad` + `Parsers.resolve` (Don't-Hand-Roll) — the light record uses WAD tag `0x1e` at off `0x6a60`/`0x6b20`; confirm the tag/name filter mirrors the MAT/TXR path. Byte-decoded values are REAL; the show/hide and any ancillary-field meaning stay INFERRED.

---

### `tools/kratos-lab/test/particles.test.js` (NEW — pure sim known-answers)

**Analog:** `test/chain.test.js` (whole scaffold) — the pure-module TDD suite: header comment naming the run command + RED note (1–15), `require("../particles.js")` (18), test-local vec helpers duplicated (20–24), `{}` scenario blocks with a message on every assert. `loop.test.js` is the second analog for the fixed-step/accumulator known-answers.
```js
"use strict";
const assert = require("node:assert");
const Particles = require("../particles.js");   // RED: MODULE_NOT_FOUND until it lands
// { spawn-anchor transform } { euler advect } { cull age>life }
// { blade-lag: move blade between spawn+integrate → assert world pos diverges from blade tip }
// { hit-edge → burst count } { ramp monotonicity } { variant-select table } { glow-gate isIdle→gain }
console.log("particles.test.js: ...passed");
```
Feed fixed inputs (jitter=0, known FXC matrices, known blade matrices) exactly as `chain.test.js` feeds straight/vertical curve arrays. Covers the sim halves of FIRE-01/02, TRL-01/02, CHAIN-03 (RESEARCH Wave 0 Gaps).

---

### `tools/kratos-lab/test/light.test.js` (NEW — byte-exact known-answers)

**Analog:** `test/fxdb.test.js` (1–70) — WAD read from the curated subset (`WAD_PATH`, 25–26), `Parsers.parseWad(buf)` (38), resolve-then-decode, byte-exact `assert.strictEqual`/tolerance asserts. No `ImageData` shim needed (no texture path) unless the light suite also decodes a texture.
```js
const WAD_PATH = path.join(__dirname, "..", "..", "..", "assets", "wads", "R_WPN0_0.WAD");
const buf = new Uint8Array(fs.readFileSync(WAD_PATH));
const recs = Parsers.parseWad(buf);
// resolve LeftBladeLight/RightBladeLight; assert color(1.0,0.622,0.288), intensity 2.5, range 160,
// anchor(-0.32,-8.0,1.0); Left ≡ Right byte-identical; + attenuation math atten(range)=0, atten(0)=1.
```
Add `light.test.js` to the Validation "Full suite command" (RESEARCH 474). May fold into `fxdb.test.js` instead (RESEARCH lists both).

---

### `tools/kratos-lab/test/fxdb.test.js` (EXTEND — BDEsparkemit / CNG assertions)

**Analog:** same file, existing scenario blocks (45–70). Add `{}` blocks asserting `db.fxc["FXC_BDEsparkemit"]` exists with `subtype === 0x3` and `shapeRef` in `{flame6Shape,flame3Shape,flame5Shape}`, and that `FXC_CNGemit`→`PTC_CNGpart` is a name-confirmed ref (`shapeNameMatch === true` in `db.refs`). Build the db via `FxParse.buildFxDb(recs, buf, standaloneRecs)` (fxparse.js 515). These are the "⚠️ extend" rows in the RESEARCH Test Map.

---

### `tools/kratos-lab/index.html` (MODIFY — script-tag version bump)

**Analog:** the lockstep `?v=23` tags (115–122). **Unlike Phase 5 (decode-only), this phase changes browser behavior** — `app.js`, `fx.js`, `fxparse.js` are all consumed at runtime and a NEW `particles.js` tag is added. Bump EVERY tag to `?v=24` in lockstep and add `<script src="particles.js?v=24"></script>` (before `app.js`, after `chain.js`). 03-PATTERNS Pitfall 7 discipline: never bump one tag alone.

## Shared Patterns

### Fail-loud size-gate → named field reads (WR-01 / V5) — apply to `parseLight`
**Source:** `fxparse.js` `parseTxr` 159–167; `buildMats` 84–92; `parseAnmType5` bounded vec4 reads 437, 456–461. Size gate runs BEFORE any field read; every throw names the record (`LIGHT ${rec.name}: ...`). This is the ASVS V5 control against OOB reads into adjacent WAD records (RESEARCH Security Domain).

### Decoded-blend-only via `Fx.applyMaterial` (DEC-01) — apply to EVERY new FX pass
**Source:** `fx.js` `applyMaterial` 48–55 (asserts on unmapped mode — never remove); consumed in `drawFx` 659/679/691. No new pass may call `blendFunc`/`depthMask` directly (Anti-Pattern). The `additivePremult` mode is ADDED to the table, not inlined.

### `restoreFxState` leak guard — end `drawFx` with it, every frame
**Source:** `fx.js` 59–63; called at `drawFx` 700. Add the pool draw INSIDE `drawFx` before this call. `KratosLab.fxState()` (app.js 1128–1137) proves `blendEnabled false / FUNC_ADD / depthMask true` between frames (Pitfall 3).

### 60Hz sim tick, never render frame (Pitfall 5) — spawn/integrate in `simStep`, submit in `drawFx`
**Source:** `app.js` `simStep` 1047–1086 (owns sim time, `const STEP = Loop.STEP`), `loop.js` accumulator 30–45, the loop pump 1089–1108. `renderFrame`/`drawFx` only submit current pool state. `trailHist` recording (1063–1081) is the exact precedent.

### Blade-local spawn → world decouple — `xformM` + `bladeSim[key].mat` + FXC matrix
**Source:** `app.js` `xformM` 540–546, `bladeSim` 499–502, `driveBlade` 504–534 (produces `.mat` per tick). Sample the blade matrix ONLY at spawn; integrate in world space after (SC1 blade-lag; Pitfall 4). Blade motion itself is a pre-existing approximation — do NOT fix it here (Phase 4, out of scope).

### Per-frame DYNAMIC_DRAW + `bufferSubData` rewrite — the pool GPU buffer
**Source:** `app.js` `makeBuf(arr, dynamic)` 169–174, `uploadSkinnedVerts` `bufferSubData` 578–579, `fxBuf` interleaved attribute binding 641–645. One interleaved `Float32Array`, one `ARRAY_BUFFER` (`DYNAMIC_DRAW`), rewritten per frame; static index buffer built once (CLAUDE.md Part 3 / D-02).

### Pure, JSON-dumpable module (no GL/DOM) — apply to `particles.js`
**Source:** `chain.js` returns `{ verts, nLinks, arcLen, ... }` (144); `loop.js` `makeAccumulator` returns `{ advance }` (32–44). The sim math is Node-requireable with zero build step; GL packing stays in `app.js`.

### Dual-environment export guard — apply to `particles.js` (and the `fxparse.js` export line)
**Source:** identical two lines at `fx.js` 68–69, `loop.js` 50–51, `chain.js` 150–151, `fxparse.js` 722–723:
```js
// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Particles;
```

### real vs INFERRED tagging — data-first discipline on every runtime-computed quantity
**Source:** `fxparse.js` evidence arrays (`tag:"real"|"INFERRED"`, e.g. parsePtc 309–320, parseAnmType5 490–499); `db.meta.colorSource` (536–549). REAL this phase: `parseLight` values, `MAT_pticleMat.blendColor`, FXC spawn matrices, `FXC_BDEsparkemit` presence, bindings. INFERRED (label them): age→color ramp, particle rate/velocity/lifetime/size (param semantics undecoded — Pitfall 1), the dark↔hot glow rule, `TRAIL_INNER_T`. Never fabricate a real-tagged effect color (Pitfall 4).

### FxDb binding by shapeRef NAME, not slot pair (D-08 / Pitfall 6)
**Source:** `fxparse.js` `buildFxDb` refs loops 645–657 (shape refs) and 674–694 (slot pairs — `corroborationOnly:true`, `shapeNameMatch`). Bind fire `FXC_BDEsparkemit`→`PTC_flameN` by matching `shapeRef` strings (both `flameNShape`); do NOT bind on a `db.refs` slot pair whose `shapeNameMatch === false`.

### Test-suite conventions — apply to `particles.test.js` / `light.test.js`
**Source:** all suites (`chain`/`loop`/`fxdb`/`wad`.test.js). `node:assert` only; header comment names requirement ID + run command + RED note; `{}` scenario blocks; a message on EVERY assert; known answers cite where verified; final `console.log("<file>: ...passed")`; exit code is the pass/fail signal.

### Educational WHY-comment style with requirement IDs
**Source:** `chain.js` 1–27, `fxparse.js` decoder headers (148–158, 244–268), `fx.js` 1–19. Each new module/decoder opens with a byte-layout / intent header citing offsets, the source doc, and requirement IDs; INFERRED fields labeled inline. Binding user preference (course repo).

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| View-matrix-column billboard vertex shader (`world = center + camRight·corner.x + camUp·corner.y`) | render (shader) | transform | No in-repo billboarding exists — `fxProg` VS (app.js 349–353) is a plain MVP transform. Copy the CLAUDE.md Part 3 blueprint reproduced verbatim in RESEARCH "Code Examples → Billboard vertex shader"; extract `camRight`/`camUp` from the view-matrix columns. |
| Velocity-aligned stretched-spark axis (built in VS from projected velocity) | render (shader) | transform | No stretched-quad code exists. RESEARCH "Code Examples → Velocity-aligned stretch" gives the exact VS snippet; per-particle `aVel` attribute is new. |
| `additivePremult` fragment output (`gl_FragColor = vec4(rgb * alpha128, 0.0)`, alpha128 unclamped) | render (shader) | transform | The `fxProg` fragment (357–370) does MODULATE + cutout, not premultiply. New fire/pool fragment needed (or a branch); the blend-state half DOES have an analog (`fx.js` MATGL). RESEARCH Pattern 3. |
| Runtime age→color ramp uniform (white-hot→orange→ember over trail age) | render (shader) | transform | INFERRED runtime tint — no painted ramp exists (05-04 proof). New uniform + fragment mix; calibrate to the ~30-frame trail-gone anchor (folded todo). Label INFERRED. |

## Metadata

**Analog search scope:** `tools/kratos-lab/` — read in full: `fx.js`, `loop.js`, `chain.js`, `fxparse.js`, `combat.js`; read targeted: `app.js` (context+mesh shader 117–276, FX program+textures 316–435, blade/trail/`drawFx` 485–702, `simStep`+`KratosLab` hooks 1047–1156), `parsers.js` (signatures), `test/fxdb.test.js` (1–75), `test/chain.test.js` (1–60), `index.html` (script tags). Grep-located every target function across `app.js` (1176 lines) before targeted reads (no whole-file load).
**Files scanned:** 9 read (5 full modules + `app.js` sections + 2 test heads + `index.html`/`parsers.js` greps); FxDb key coverage + blade-light byte values taken from RESEARCH's first-party probe this session.
**Pattern extraction date:** 2026-07-26 (line anchors valid at branch `master`, tip `a0764aa`).
