# Phase 3: Chain Link Ribbon & Glow - Pattern Map

**Mapped:** 2026-07-25
**Files analyzed:** 6 (2 new, 4 modified; fx.js explicitly UNCHANGED)
**Analogs found:** 6 / 6 (all exact or role-match — this phase extends its own established machinery)

All line numbers are CURRENT as of commit `7276b0f` (read this session). Phase-2 pins are superseded by these.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tools/kratos-lab/chain.js` (NEW) | pure geometry module | transform (curve pts → interleaved verts) | `tools/kratos-lab/loop.js` (module scaffold) + `app.js` `pushRibbon`/vertex layout | role-match (scaffold exact; algorithm is new) |
| `tools/kratos-lab/fxparse.js` (add `parseTxr`) | binary decoder | file-I/O (WAD bytes → record fields) | same file: `buildMats` + `readName` (lines 60–146) | exact |
| `tools/kratos-lab/app.js` — drawFx chain passes | render orchestration | request-response (per-frame draw) | same file: chainlink pass 590–603 + swordtrail pass 604–616 | exact |
| `tools/kratos-lab/app.js` — load stage (WAD-sourced textures, `makeTex` params) | bootstrap / config | file-I/O | same file: WAD load 67–79, texture fetches 40–54, `makeTex` 288–297 | exact |
| `tools/kratos-lab/app.js` — `depthFunc(LEQUAL)`, `chainInfo()`, trail bias | init / test hook / geometry | mixed | same file: GL init 356–357, `fxState()` 1004–1013, trail rows 568–575 | exact |
| `tools/kratos-lab/index.html` | script wiring | — | same file: script block 111–117 (`?v=20`) | exact |
| `tools/kratos-lab/test/chain.test.js` (NEW) | test (known-answer, pure module) | batch | `tools/kratos-lab/test/loop.test.js` | exact (role + flow) |
| `tools/kratos-lab/test/wad.test.js` (extend) | test (known-answer, real WAD bytes) | batch | same file (esp. lines 20–21, 77–90, 108–133) | exact |
| `tools/kratos-lab/fx.js` | — | — | — | **UNCHANGED** (RESEARCH Architectural Map: `applyMaterial` already covers both chain modes) |

## Pattern Assignments

### `tools/kratos-lab/chain.js` (NEW — pure geometry module, transform)

**Analog:** `tools/kratos-lab/loop.js` (whole file, 51 lines) — the purest example of the locked module pattern. Secondary: `fx.js` lines 10–11 ("No top-level gl/DOM access — gl arrives as a parameter"), `fxparse.js` lines 1–7.

**Module scaffold pattern** (`loop.js` lines 1–20, 20, 47–51 — copy this shape exactly):
```js
// loop.js — pure fixed-timestep accumulator for kratos-lab (REND-03).
// ... explanation of WHY, citing requirement IDs and pitfalls ...
// Pure module: no DOM, no GL, no clock reads — wall time arrives as a
// parameter, so the whole 60Hz contract is Node-testable (test/loop.test.js).

const Loop = (() => {
  const STEP = 1 / 60;
  // ... named constants with derivation comments ...
  return { STEP, makeAccumulator };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Loop;
```
For chain.js: `const Chain = (() => { ... return { buildRibbon, LINKS_PER_TILE, ... }; })();` + the same two-line export guard verbatim. Header comment must cite CHAIN-01, the decoded texture facts (32px/link, 16 links/tile — VERIFIED), and label `LINK_PITCH` INFERRED with the derivation (03-RESEARCH Pattern 2).

**Vertex layout contract the walker must emit** (`app.js` lines 528–537 — `pushRibbon`, the current row→triangle emitter; and lines 582–586, the attribute binding it must satisfy):
```js
  function pushRibbon(rows, out) {
    // rows: [{a:[3], b:[3], u, alpha}]; emits triangles between consecutive rows
    for (let i = 1; i < rows.length; i++) {
      const p = rows[i - 1], q = rows[i];
      out.push(
        ...p.a, p.u, 0, p.alpha, ...p.b, p.u, 1, p.alpha, ...q.a, q.u, 0, q.alpha,
        ...q.a, q.u, 0, q.alpha, ...p.b, p.u, 1, p.alpha, ...q.b, q.u, 1, q.alpha,
      );
    }
  }
```
```js
    gl.vertexAttribPointer(fxLocs.aP, 3, gl.FLOAT, false, 24, 0);   // app.js:585
    gl.vertexAttribPointer(fxLocs.aT, 3, gl.FLOAT, false, 24, 12);  // app.js:586
```
6 floats/vert, stride 24: pos xyz + (u, v, alpha). chain.js may either emit `rows` per link (row pairs with duplicated boundaries, consumed by `pushRibbon`) or emit triangles directly — but the interleave format is fixed by lines 585–586. Positions are in the same model space the current chain block uses (multiplied by `uM`/`modelMat` in the fx vertex shader, app.js:316, set at 580).

**Degenerate-frame precedent to improve on** (`app.js` lines 554–557 — the current horizontal-perpendicular with the `|| 1` guard that hides the vertical-chain hole; 03-RESEARCH Pitfall 2):
```js
        let cx = -d[2], cz = d[0];
        const cl = Math.hypot(cx, cz) || 1;
        const hw = 0.14;
        cx = (cx / cl) * hw; cz = (cz / cl) * hw;
```
Replace with cross-product frames + epsilon check + previous-frame hysteresis (03-RESEARCH "Arc-length link walk" code example is the design; unit-test the vertical case).

**Constants that die with the old block** (`app.js` line 556 `hw = 0.14`, line 559 `const segs = 10, reps = Math.max(1, Math.round(len / 0.9));`, line 564 `u: t * reps`). `CHAIN_LEN = 14` (line 448) survives as the slack reference.

---

### `tools/kratos-lab/fxparse.js` — add `parseTxr` (decoder, file-I/O)

**Analog:** same file, `buildMats` (lines 74–146) + `readName` (lines 60–68) + module doc header (lines 1–22).

**Name-read helper — reuse, do not duplicate** (lines 59–68; `parseTxr` lives in the same IIFE so it calls this directly):
```js
  // strictly NUL-terminated string — bytes after the NUL are dev-machine garbage
  function readName(buf, off, maxLen) {
    let s = "";
    for (let i = 0; i < maxLen; i++) {
      const c = buf[off + i];
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
```

**Fail-loud decode pattern — size bound then magic, errors name the record** (lines 83–92, the WR-01 pattern the security section requires `parseTxr` to follow):
```js
      // WR-01: parseWad only guarantees the record fits the BUFFER, not that
      // the decoder stays inside the RECORD — a short size would silently
      // decode the next record's bytes. Fail loud, name the record.
      if (r.size < 0x38) {
        throw new Error(`MAT ${r.name}: size ${r.size} < 0x38 header`);
      }

      const base = r.dataOff;
      const magic = dv.getUint32(base, true); // mat.go Magic @+0
      if (magic !== 0x8) {
        throw new Error(`MAT ${r.name}: bad magic 0x${magic.toString(16)} (expected 0x8)`);
      }
```
For `parseTxr`: assert `rec.size >= 0x58` (88 bytes) then magic `=== 7`; read `gfxName` @+0x04, `palName` @+0x1C via `readName(buf, off, 24)`; record `tailFlags` u16 @+0x56 verbatim, never act on it (03-RESEARCH TXR layout + Open Question Q2). DataView construction pattern: line 75 `const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);`.

**Export line to extend** (line 168): `return { decodeFlags, buildMats, enumTuples };` → add `parseTxr`.

---

### `tools/kratos-lab/app.js` — drawFx two-pass chain (render orchestration)

**Analog:** the two existing passes in `drawFx` (lines 590–616). PASS 1 (chainlink) already exists at 590–603 and keeps its exact shape; PASS 2 (chainglow) copies the swordtrail pass shape at 604–616 minus the vertex re-upload.

**PASS 1 template — current chainlink pass** (lines 590–603; keeps `uCutoff 0.35` INFERRED, comment style, fxLog discipline):
```js
    if (chainV.length) {
      const mat = matDb.byName.MAT_chainlink;
      Fx.applyMaterial(gl, mat);
      fxLog.push({ name: mat.name, mode: mat.mode, depthWrite: !mat.disableDepthWrite });
      gl.uniform3fv(fxLocs.uMaterialColor, mat.materialColor);
      gl.uniform4fv(fxLocs.uLayerColor, mat.blendColor);
      gl.uniform1f(fxLocs.uCutoff, 0.35); // INFERRED cutout threshold (02-RESEARCH A3)
      gl.bindTexture(gl.TEXTURE_2D, chainTex);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(chainV), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, chainV.length / 6);
    }
```
**PASS 2 (chainglow, new)** = same block with `MAT_chainglow`, `chainglowTex`, `uCutoff 0.0` (glow alpha ≡ 1 — 03-RESEARCH Pattern 5), and **no `bufferData` call** — draw the same bytes for bit-identical depth. Convert `chainV` to a `Float32Array` once before PASS 1 so both passes share the identical upload. Draw order: links → glow → trail (links must write depth before any additive pass).

**Pass bracket that must survive the rework** (lines 539–541, 577–589, 617–618):
```js
  function drawFx(mvp) {
    fxLog.length = 0;                                   // 540: log reset per frame
    if (!blade || !skin || !skin.lastWorld) return;
    ...
    gl.useProgram(fxProg);                              // 578
    gl.uniformMatrix4fv(fxLocs.uMVP, false, mvp);
    gl.uniformMatrix4fv(fxLocs.uM, false, modelMat);
    gl.uniform1i(fxLocs.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf);
    ...
    gl.disable(gl.CULL_FACE);                           // 587
    // Every FX pass takes its FULL blend/depth state from its decoded MAT via
    // Fx.applyMaterial — no hardcoded blendFunc/depthMask here (DEC-01).
    ...
    Fx.restoreFxState(gl);                              // 617
    gl.useProgram(prog);                                // 618
  }
```
The chain-anchor computation to keep feeding the walker (lines 548–553): forearm chain joint pos `a` from `world[chainJ*16+12..14]`, pommel `bpt = xformM(bladeSim[key].mat, blade.hilt)`. The sag shaping currently inline at 560–565 moves into the curve-sample input handed to `Chain.buildRibbon` (03-RESEARCH Pattern 1 keeps the curve input generic for Phase 4).

**Trail tip-arc bias (Pattern 7)** — analog is the trail row emission (lines 568–575):
```js
      const hst = trailHist[key];
      if (hst.length >= 2) {
        const rows = hst.map((e, i) => ({
          a: e.hilt, b: e.tip, u: i / (hst.length - 1),
          alpha: Math.max(0, 1 - e.age / TRAIL_AGE) * 0.85,
        }));
        pushRibbon(rows, trailV);
      }
```
Change: `a: e.hilt` → inner edge lerped toward the tip, `a = lerp(e.hilt, e.tip, TRAIL_INNER_T)` with `TRAIL_INNER_T = 0.6` named + labeled INFERRED (footage analysis, not decoded). Do NOT touch u/v orientation — the decoded swordtrail texture confirms the current mapping (bright ember edge at v=1 = tip; ramp toward u=1 = newest). `TRAIL_AGE = 0.22` (line 441) stays. Trail history recording at line 953 (`hst.push({ tip: xformM(bm, blade.tip), hilt: xformM(bm, blade.hilt), age: 0 })`) is unchanged — bias at emission, not at record, so the raw hilt/tip history stays available to Phase 4+.

---

### `tools/kratos-lab/app.js` — load stage: WAD-sourced chain textures + `makeTex` params (bootstrap, file-I/O)

**Analog:** WAD load stage (lines 67–79) + extracted-file texture fetches (lines 46–54) + `makeTex` (lines 288–297).

**WAD load + fail-loud contract already in place** (lines 67–77 — new resolve/parseTxr/decodeTexture calls go in this stage, same no-try/catch discipline):
```js
  status("loading weapon WAD…");
  // DEC-01 decode stage — deliberately NOT wrapped in try/catch: decode
  // failures (bad magic, invalid flag combos) are the assert contract and
  // must reach the outer catch, which surfaces them in #status.
  const wadBuf = await Parsers.fetchBuf("../../assets/wads/R_WPN0_0.WAD");
  const wadRecords = Parsers.parseWad(wadBuf);
  const matDb = FxParse.buildMats(wadRecords, wadBuf);
  ...
  for (const need of ["MAT_chainlink", "MAT_chainglow", "MAT_swordtrail"]) {
    if (!matDb.byName[need]) throw new Error(`weapon WAD missing required MAT: ${need}`);
  }
```
New chain path per 03-RESEARCH Pattern 6 / code example: `mat.texName → Parsers.resolve(wadRecords, texName, matRecIdx) → FxParse.parseTxr → resolve gfx/pal → Parsers.decodeTexture(wadBuf.subarray(r.dataOff, r.dataOff + r.size), ...)`. Note: `resolve` needs the MAT record's `idx` — `matDb` mats carry `off` (fxparse.js:129) but not `idx`; look the record up in `wadRecords` (each record has `idx`, parsers.js:304) or extend what buildMats stores. `resolve` returns `null` on miss (parsers.js:323 — "caller decides: throw with record name"): throw with the name, matching the line-76 style.

**`makeTex` to parameterize** (lines 288–297 — currently hardcodes LINEAR + REPEAT/CLAMP; extend signature, keep defaults so `bladeTex`/`trailTex` at 298–299 are untouched):
```js
  function makeTex(src) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
```
→ `makeTex(src, {wrapS, wrapT, filter})`; filter comes from `mat.filter` ("linear" for all three FX MATs). chainlink: REPEAT U / CLAMP V; chainglow: CLAMP both (single hot blob at u∈[0,~0.153] — Pitfall 5; label the CLAMP choice INFERRED per A2). No mipmaps ever (CLAUDE.md). Old extracted-file chainlink fetch (lines 52–54) and `chainTex` (line 300) are replaced by the WAD-sourced pair `chainlinkTex`/`chainglowTex`.

---

### `tools/kratos-lab/app.js` — init depthFunc + `KratosLab.chainInfo()` (init / test hook)

**depthFunc anchor** (lines 356–357 — add `gl.depthFunc(gl.LEQUAL)` here, once, with the GS ZTST=2 citation comment; Pitfall 1):
```js
  gl.clearColor(0, 0, 0, 1); // opaque clear — FBO-path clears must also be opaque
  gl.enable(gl.DEPTH_TEST);
```

**Test-hook analog** (`window.KratosLab`, lines 988–1020; `fxState()` at 1004–1013 is the shape to copy — a plain object of primitives sampled on demand, doc comment stating what it proves):
```js
    // Sampled between frames (console), fxState proves the per-frame restore
    // discipline: blendEnabled false, blendEquation FUNC_ADD, depthMask true.
    fxState() {
      return {
        alpha: gl.getContextAttributes().alpha,
        blendEnabled: gl.isEnabled(gl.BLEND),
        ...
      };
    },
```
`chainInfo()` returns the walker metadata for the checkpoint proof: `{ linkCount, arcLen, linkPitch, ribbonWidth }` per side (from the last `Chain.buildRibbon` result — stash it where `bladeSim` state lives). The `fxLog` array (line 349, exposed at 1001) gains the chainglow entry automatically via the PASS-2 `fxLog.push` — checkpoint asserts three entries (chainlink, chainglow, swordtrail) mid-swing (Pitfall 7). Any new on-page debug display uses `textContent`, never `innerHTML` (security IN-06; analog: `log()` at lines 698–704 uses `textContent`).

---

### `tools/kratos-lab/index.html` — script wiring (config)

**Analog:** script block (lines 111–117):
```html
<script src="parsers.js?v=20"></script>
<script src="fxparse.js?v=20"></script>
<script src="fx.js?v=20"></script>
<script src="loop.js?v=20"></script>
<script src="anim.js?v=20"></script>
<script src="combat.js?v=20"></script>
<script src="app.js?v=20"></script>
```
Add `<script src="chain.js?v=21"></script>` after `loop.js` (chain.js has no deps; app.js consumes it, so anywhere before `app.js`), and bump **ALL** tags to `?v=21` — the established convention is a lockstep bump on every script change (Pitfall 7; RESEARCH Supporting stack).

---

### `tools/kratos-lab/test/chain.test.js` (NEW — test, batch)

**Analog:** `tools/kratos-lab/test/loop.test.js` (whole file, 86 lines) — pure-module known-answer suite.

**Suite conventions to copy** (loop.test.js lines 1–15, 17–23, 86):
```js
// loop.test.js — known-answer tests for the pure fixed-timestep accumulator
// (REND-03 timestep half). Run: node tools/kratos-lab/test/loop.test.js
// ...
const assert = require("node:assert");
const Loop = require("../loop.js");

// --- API shape -------------------------------------------------------------
assert.strictEqual(Loop.STEP, 1 / 60, "Loop.STEP must be 1/60");
...
// --- 60Hz display: 600 frames of exactly 1/60 -> 600 ± 1 steps -------------
{
  const acc = Loop.makeAccumulator();
  let steps = 0;
  for (let i = 0; i < 600; i++) steps += acc.advance(1 / 60);
  assert.ok(Math.abs(steps - 600) <= 1, `60Hz: expected 600±1 steps, got ${steps}`);
}
...
console.log("loop.test.js: all accumulator known-answer tests passed");
```
Conventions: header comment names the requirement ID + run command; `"use strict"` optional (loop.test.js omits it, wad/fx use it); braced `{}` blocks per scenario with a `// --- title ---` rule line; every assert carries a message; final `console.log("<file>: ... passed")`; exit code is the signal — no framework. Assertions per 03-RESEARCH validation map: pitch spacing = LINK_PITCH along arc; consecutive link cross-axes perpendicular (dot ≈ 0); duplicated boundary rows with per-link constant axis (Pitfall 4); `u ∈ [0,1]` invariant (Pitfall 6); square-texel invariant `RIBBON_WIDTH === LINK_PITCH`; vertical-chain degenerate guard (Pitfall 2: straight-down curve → no NaNs, stable S); fractional-tail U truncation.

**Static-source-check pattern** (loop.test.js lines 68–84 — regex over `app.js` source, useful if a plan wants to pin "no new color literals in the glow path" or the no-re-upload contract without a browser):
```js
{
  const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.ok(
    !/skin\.lastWorld\s*=\s*world\b/.test(appSrc),
    "CR-01: app.js must not alias computePose's shared buffer (skin.lastWorld = world)"
  );
  ...
}
```

---

### `tools/kratos-lab/test/wad.test.js` — extend (test, batch)

**Analog:** same file. Existing anchors to build on: requires + WAD path (lines 11–21), the already-resolved `matRecChainlink` (52–56) and `txr` = TXR_chainlink record (79–82), MAT known answers (108–133).

**Asset-path + known-answer conventions** (lines 17–21, 79–82):
```js
// The WAD is read from the git-tracked assets/ curated subset ONLY — never
// copy game bytes into test fixtures.
const WAD_PATH = path.join(__dirname, "..", "..", "..", "assets", "wads", "R_WPN0_0.WAD");
const buf = new Uint8Array(fs.readFileSync(WAD_PATH));
...
const txr = Parsers.resolve(recs, "TXR_chainlink", matRecChainlink.idx);
assert.ok(txr, "TXR_chainlink resolves");
assert.strictEqual(txr.off, 0x213a0, "TXR_chainlink offset");
assert.strictEqual(txr.size, 88, "TXR_chainlink size");
```
New TXR assertions: `FxParse.parseTxr(buf, txr)` → `gfxName === "GFX_chainlink"`, `palName === "PAL_chainlink"`, `tailFlags === 0x0001` (chainglow/swordtrail: `0x0051`); bad-magic synthetic record throws naming the record (copy the synthetic-buffer throw pattern at lines 176–188). Round-trip: gfx/pal names resolve to data-carrying records.

**ImageData shim — required before calling `decodeTexture` in Node** (Pitfall 8; `parsers.js` line 271 constructs `new ImageData(w, h)`):
```js
global.ImageData = class ImageData {
  constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
};
```
Texture known answers (all first-party verified, 03-RESEARCH Decoded Asset Facts): chainlink 512×32, binary alpha (only 0/255; 7,408 opaque px), U-autocorrelation peak at lag 32; chainglow 512×32, every alpha 255 after decode, hottest texel (254,229,0), all-black for x ≥ 80, zero blue in every texel.

**Error-throw test pattern with named record** (lines 176–188 — the `MAT_bogus` synthetic buffer; reuse the same construction for `TXR` bad-magic):
```js
  const bogus = new Uint8Array(32 + 0x78);
  const bdv = new DataView(bogus.buffer);
  bdv.setUint16(0, 0x1e, true); // tag
  ...
  assert.throws(() => FxParse.buildMats(bogusRecs, bogus), /MAT_bogus/, "bad magic names the record");
```

## Shared Patterns

### MAT-driven pass state (DEC-01) — apply to every new FX pass
**Source:** `tools/kratos-lab/fx.js` lines 48–55 (`applyMaterial` — full state per pass, throw on unknown mode) and 59–63 (`restoreFxState`); consumed as in `app.js` 590–603.
```js
  function applyMaterial(gl, mat) {
    const fn = MATGL[mat.mode];
    if (!fn) throw new Error(`Unmapped blend mode '${mat.mode}' in ${mat.name}`); // assert, never default
    fn(gl);
    gl.depthMask(!mat.disableDepthWrite);
  }
```
Never hardcode blendFunc/depthMask in drawFx; one `fxLog.push` per applied pass; `Fx.restoreFxState(gl)` closes the FX block every frame.

### Dual-environment export guard — apply to chain.js
**Source:** identical two lines at `loop.js` 50–51, `fx.js` 68–69, `fxparse.js` 171–172, `parsers.js` 329–330:
```js
// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Chain;
```

### Fail-loud decode asserts naming the record — apply to parseTxr and all load-stage resolves
**Source:** `fxparse.js` 84–91 (size bound + magic throw), `parsers.js` 307 (`WAD record ${name} overruns buffer`), `app.js` 68–70 + 75–77 (decode stage un-caught by design; missing-record throw). Errors always include the record/material name; asserts run before any field read.

### INFERRED labeling — apply to every hand-tuned constant this phase introduces
**Source:** `app.js` line 599 (`// INFERRED cutout threshold (02-RESEARCH A3)`), fx shader comment lines 329–330, native-res comments 362–364. New instances: `LINK_PITCH` (A4), glow CLAMP + pommel U-anchor (A2/A3), `TRAIL_INNER_T` (A9), plus the ZTST=2 [CITED ps2tek] / [ASSUMED for these draws] split on the LEQUAL comment (A1). Also carry the deferred check verbatim: *"DEFERRED to Phase-1 polish (01-04): calibrate LINK_PITCH against measured on-screen link counts; expected change: one constant in chain.js."*

### Educational comment style — apply to chain.js and all modified blocks
**Source:** `loop.js` 1–18, `fx.js` 1–19, `app.js` 588–589, 591–593. Comments explain WHY with requirement IDs (CHAIN-01/02, DEC-01), cite decoded data ("VERIFIED in texture"), and name the upstream doc — this is a course repo (binding user preference).

### Test-suite conventions — apply to chain.test.js and wad.test.js extensions
**Source:** all three suites. `node:assert` only; message on every assert; scenario `{}` blocks with rule-line titles; known answers cite where they were verified; final `console.log` summary. Full-suite command: `node tools/kratos-lab/test/wad.test.js && node tools/kratos-lab/test/fx.test.js && node tools/kratos-lab/test/loop.test.js && node tools/kratos-lab/test/chain.test.js`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `chain.js` arc-length walker algorithm (internal math only) | geometry | transform | No arc-length/twist-frame code exists anywhere in the repo; the old flat-strip block (app.js 546–567) is the thing being replaced, not a pattern to copy. Use 03-RESEARCH "Code Examples → Arc-length link walk" as the reference implementation; module scaffold and vertex layout DO have exact analogs (above). |

## Metadata

**Analog search scope:** `tools/kratos-lab/` (app.js, fx.js, fxparse.js, parsers.js, loop.js, index.html, test/*.test.js) — the phase's entire predicted file-touch surface per 03-RESEARCH
**Files scanned:** 9 read in full (2,945 lines total); assets verified present (`assets/wads/R_WPN0_0.WAD`, `assets/weapon/GFX_/PAL_chainlink|chainglow|swordtrail.bin`)
**Pattern extraction date:** 2026-07-25 (line anchors valid at commit `7276b0f`)
