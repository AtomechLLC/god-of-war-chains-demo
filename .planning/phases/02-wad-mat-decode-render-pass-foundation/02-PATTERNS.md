# Phase 2: WAD/MAT Decode & Render-Pass Foundation - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 8 (5 modified/no-change, 4 new — fx.js may fold into app.js per RESEARCH.md)
**Analogs found:** 7 / 8 (three sub-patterns inside app.js have no codebase analog — use RESEARCH.md Patterns 3/6/7)

## File Classification

| New/Modified File | Status | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|--------|------|-----------|----------------|---------------|
| `tools/kratos-lab/parsers.js` (add `parseWad`, `resolve`, export guard) | modify | binary decoder module | transform (bytes → records) | itself — `parseMesh`/`decodeTexture` | exact |
| `tools/kratos-lab/fxparse.js` (MAT decode + tuple enumeration) | new | binary decoder module | transform (records → MatDb) | `parsers.js` decode style + `combat.js` module shell | exact |
| `tools/kratos-lab/fx.js` (matgl table + `applyMaterial`) | new | render-state utility | request-response (GL state application per pass) | `app.js` `drawFx` blend block (lines 519–535) + `combat.js` module shell | role-match |
| `tools/kratos-lab/app.js` (context attrs, loop accumulator, drawFx re-state, FBO toggle, hooks, asset paths) | modify | app bootstrap + sim/render loop | event-driven (rAF) | itself — modification sites excerpted below | exact (in-place) |
| `tools/kratos-lab/test/wad.test.js` | new | test (Node known-answer) | batch | `gen_twk.js` (only Node dev-script precedent) | role-match |
| `tools/kratos-lab/test/loop.test.js` | new | test (Node known-answer) | batch | `gen_twk.js` | role-match |
| `tools/kratos-lab/index.html` (add `<script>` tags) | modify | wiring/config | — | itself — script block lines 110–113 | exact |
| `tools/kratos-lab/server.js` | **no change** | static server | request-response | — | n/a (verified below) |

**Asset-path decision (overrides RESEARCH.md examples):** RESEARCH.md references `extracted/wads/R_WPN0_0.WAD`, but `.gitignore` blocks `extracted/**` while `assets/` is the tracked curated set (decision 2026-07-24, `assets/README.md`) and `assets/wads/R_WPN0_0.WAD` is committed (verified via `git ls-files`). **New code — browser fetches AND Node tests — must load from `assets/` paths** (`../../assets/wads/R_WPN0_0.WAD` from the lab page; `../../../assets/wads/R_WPN0_0.WAD` from `test/`). The public educational build has no `extracted/`. Existing `extracted/` fetches in app.js may be migrated to `assets/` equivalents where the curated file exists (all Phase-2-relevant files do).

## Pattern Assignments

### `tools/kratos-lab/parsers.js` — add `parseWad` + `resolve` (decoder, transform)

**Analog:** itself. New functions join the existing IIFE and its return object.

**Module shell + fetch pattern** (`parsers.js` lines 5–10):
```javascript
const Parsers = (() => {
  async function fetchBuf(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
```

**DataView decode + magic assert with named error** (`parsers.js` lines 13–15) — copy this discipline for the WAD header and MAT magic (`0x8`) checks:
```javascript
  function parseMesh(b, matPageOverride) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (dv.getUint32(0, true) !== 0x0001000f) throw new Error("bad mesh magic");
```
All reads are little-endian (`true` flag) via one `DataView` over the `Uint8Array`, with raw byte access via `b[off]` for strings/bytes — exactly the shape `parseWad` needs (see RESEARCH.md Pattern 1 for the verified walker body: **u16 tag @+0, u16 flags @+2** — not u32).

**Export surface** (`parsers.js` lines 282–283) — extend the return, then append the dual-env guard *after* the IIFE close:
```javascript
  return { fetchBuf, parseMesh, decodeTexture };   // + parseWad, resolve
})();
// NEW, after the close (RESEARCH.md §Code Examples):
if (typeof module !== "undefined" && module.exports) module.exports = Parsers;
```

**Do-not-touch invariants in this file** (REND-01 audit says these are already correct):
- CLUT alpha (`parsers.js` line 269): `clut[i * 4 + 3] = a >= 0x80 ? 255 : a * 2;` — this IS the ×255/128-clamped rule; never "fix" to `/255`.
- Vertex color ÷128 (`parsers.js` lines 204–206): `col[vi * 3] = b[s.col + i * 4] / 128;`
- `decodeTexture` returns `ImageData` (line 271) uploaded directly — no canvas round-trip for FX textures.

### `tools/kratos-lab/fxparse.js` — NEW (decoder, transform)

**Analogs:** `parsers.js` for decode style (above), `combat.js` for the module shell of a file that consumes another module's output.

**Module shell** (`combat.js` lines 7 and 255–257 — the codebase-wide convention: IIFE assigned to a single global `const`, returning a small API object):
```javascript
const Combat = (() => {
  // ...
  return { GRAPH, GLYPH, makeMachine };
})();
```
`fxparse.js` follows identically: `const FxParse = (() => { ... return { buildMats, enumTuples, resolve? }; })();` plus the `module.exports` guard. Keep it **pure decode — no GL, no DOM** (Node-testable), same as `combat.js`/`parsers.js` which never touch `document`/`gl` in their decode paths (`anim.js` tail confirms the same shell: `return { makeRig }; })();`).

**Decode body:** MAT layout + flag bits are fully specified in RESEARCH.md Pattern 3 (header 0x38, 0x40/layer, Flags[0] bits 7/16/19/24–27); known-answer expectations are RESEARCH.md §Verified MAT Inventory. Use `DataView` + named-error style from parsers.js. Error messages must include the record name (e.g., `` throw new Error(`MAT ${rec.name}: bad magic`) `` — matches parsers.js style and the security requirement).

### `tools/kratos-lab/fx.js` — NEW or folded into app.js (render-state utility)

**Analog (what it replaces):** the hardcoded per-effect state in `app.js` `drawFx` (lines 519–535). This is the current — anti-pattern — code the matgl table supersedes; its *state-restore discipline* is the part to keep:
```javascript
    if (chainV.length) {
      gl.uniform1f(fxLocs.uAdd, 0);                 // ← hardcoded "usual" flag, no blend, discard-cutout in shader
      gl.bindTexture(gl.TEXTURE_2D, chainTex);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(chainV), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, chainV.length / 6);
    }
    if (trailV.length) {
      gl.uniform1f(fxLocs.uAdd, 1);                 // ← hardcoded additive
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);           // ← replace with matgl(MatDb["MAT_swordtrail"])
      gl.depthMask(false);
      // ...draw...
      gl.depthMask(true);                           // ← keep this restore discipline, extend with
      gl.disable(gl.BLEND);                         //    blendEquation(FUNC_ADD) per RESEARCH Pitfall 4
    }
```
The table itself (usual/additive/subtract + throw-on-unknown, depthWrite read from bit 19 separately) is fully specified in RESEARCH.md Pattern 3 — copy it verbatim; there is no better codebase analog. Module shell: same `combat.js` IIFE convention if it lands as `fx.js`; it MAY touch `gl` (it is the render layer) so it is not Node-tested.

**Current FX shader that changes with it** (`app.js` lines 296–304) — the `uAdd` branch and ad-hoc `vT.z` modulate are what `uMaterialColor`/`uLayerColor` uniforms replace (multiply in-shader BEFORE blending so blend-color values of 2.0 survive; TFX MODULATE = plain `tex.rgb * color` per Pattern 4):
```javascript
  gl.attachShader(fxProg, shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 vT;
    uniform sampler2D uTex; uniform float uAdd;
    void main() {
      vec4 c = texture2D(uTex, vT.xy);
      if (uAdd < 0.5 && c.a < 0.35) discard;   // cutout threshold: keep, label INFERRED (RESEARCH A3)
      gl_FragColor = vec4(c.rgb * vT.z, uAdd > 0.5 ? vT.z * c.a : c.a);
    }`));
```

### `tools/kratos-lab/app.js` — modification sites (in-place; the analog is the current code)

**1. Context creation — the ONE place `alpha:false` can go** (`app.js` lines 100–101; RESEARCH Pitfall 3 — attributes are fixed at first `getContext`):
```javascript
  const canvas = $("gl");
  const gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: true });
  // → { alpha: false, antialias: true, preserveDrawingBuffer: true }
```
Also `app.js` line 321: `gl.clearColor(0, 0, 0, 0);` → `gl.clearColor(0, 0, 0, 1);`

**2. Loop restructure target** (`app.js` lines 804–818 — current variable-dt loop to convert to the RESEARCH.md Pattern 6 accumulator):
```javascript
  let last = performance.now();
  function step(dt) {
    lastState = { name: machine.st.current, t: machine.st.t };
    machine.tick(dt);
    heat = Math.max(machine.st.rage ? 0.45 : 0, heat - dt * 0.8);
    render(dt);
    renderTimeline();
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
```
Sim/presentation split for the restructure (RESEARCH Pitfall 5, verified against this code):
- **sim (fixed 1/60):** `machine.tick` (line 807), `heat` decay (line 808), `updateSkinning` internals — pose/blade/trail: trail aging + `driveBlade` live at lines 444–455 inside `updateSkinning(dt)`, and trail history push must happen per sim tick.
- **presentation (wall dt / render-time):** `autoSpin` yaw (line 544 `if (autoSpin) yaw += dt * 0.25;`), camera easing (line 556 `dist += (target - dist) * ...`), canvas resize (lines 540–541).
- `renderTimeline()` (line 810) stays per-rAF. `window.KratosLab.step` (line 822) must keep meaning "one fixed sim step + one render" for the automated hooks.

**3. drawFx re-state** (`app.js` lines 470–537): replace the `uAdd` flag pushes with `applyMaterial(gl, MatDb["MAT_chainlink"])` / `applyMaterial(gl, MatDb["MAT_swordtrail"])`, followed by the explicit restore block (`blendEquation(FUNC_ADD)`, `depthMask(true)`, `disable(BLEND)`). Note chainlink decodes as **usual + depth-write ON** — the chain draw gains real alpha blending it currently lacks. `fxLocs` table (lines 306–313) gains `uMaterialColor`/`uLayerColor`, drops `uAdd`.

**4. render() head — where the FBO bind wraps** (`app.js` lines 539–543):
```javascript
  function render(dt) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
```
When the native-res toggle is on: bind FBO + `viewport(0,0,512,448)` before the clear, keep projection aspect = display aspect (line 558 `M.persp(0.9, w / h, ...)`), then bind null framebuffer, restore viewport to `w,h`, draw the blit quad. FBO setup itself has **no codebase analog** — copy RESEARCH.md Pattern 7 verbatim (RGBA/UNSIGNED_BYTE, CLAMP_TO_EDGE, LINEAR, DEPTH_COMPONENT16, completeness assert). The blit quad gets its **own trivial program** — reuse the `shader()` helper (lines 131–136) and `gl.createProgram` pattern (lines 137–141), not the FX program.

**5. Texture-state analog for the FBO color texture vs FX strips** (`app.js` `makeTex`, lines 267–276 — current FX texture convention: REPEAT-U/CLAMP-V, LINEAR, direct `ImageData` upload; the FBO texture differs only in CLAMP on both axes + null upload):
```javascript
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

**6. Load-time WAD fetch + surfacing** — follow the existing staged-load pattern with `status()` + try/catch (`app.js` lines 40–65 blade load is the template: `status("decoding …")`, `try { ... } catch (e) { console.warn(...) }`, console summary line). Tuple inventory surfaces in the existing stats card (`app.js` lines 93–97, `$("stats").innerHTML = ...`) per RESEARCH Open Q3.

**7. Asset paths + failure message** — current fetches use `../../extracted/...` (e.g. `app.js` line 29 `"../../extracted/kratos/model/hero_0.bin"`, lines 45–54 weapon files). New WAD fetch: `"../../assets/wads/R_WPN0_0.WAD"`. The public-build catch block keys on the path string (`app.js` line 828):
```javascript
  if (/fetch .*extracted/.test(e.message)) {
```
If Phase 2 loads from `assets/` (it must) this regex needs to cover both roots (e.g. `/fetch .*(extracted|assets)/`) or the friendly "assets not present" message silently stops firing for WAD failures.

**8. Test hooks** (`app.js` lines 821–825 — extend, don't replace):
```javascript
  window.KratosLab = {
    machine, mesh, step, rig, skin,
    setView(y, p, d) { yaw = y; pitch = p; dist = d; userDist = d; autoSpin = false; },
    input,
  };
```
Wave-0 additions per RESEARCH: `gl.getContextAttributes()` exposure, current-pass state dump, native-res toggle, sim-step counter, `MatDb`.

### `tools/kratos-lab/test/wad.test.js` + `test/loop.test.js` — NEW (Node known-answer tests)

**Analog:** `gen_twk.js` — the repo's only Node dev-script precedent (built-ins only, `__dirname`-anchored paths, usage comment):
```javascript
// gen_twk.js lines 6–14
// Usage: node tools/kratos-lab/gen_twk.js   (writes design/twk/*.twk)
const fs = require("fs");
const path = require("path");
const LAB = __dirname;
const OUT = path.resolve(LAB, "..", "..", "design", "twk");
const clipsJson = JSON.parse(fs.readFileSync(path.join(LAB, "data", "clips.json"), "utf8").replace(/^\uFEFF/, ""));  // NB: the real file has a literal invisible BOM char inside the regex — escaped here
```
Differences from the analog: do **not** copy gen_twk.js's `eval(combatSrc)` trick — the `module.exports` guard on `parsers.js`/`fxparse.js` makes plain `require("../parsers.js")` work. Assertion bodies + expected values: RESEARCH.md §Code Examples (wad.test.js sketch) and §Verified First-Party Data — **but load the WAD from `assets/`**, not `extracted/`:
```javascript
const buf = new Uint8Array(fs.readFileSync(path.join(__dirname, "../../../assets/wads/R_WPN0_0.WAD")));
```
Use `require("assert")`/`node:assert` with `assert.strictEqual`; exit code is the pass/fail signal (`node tools/kratos-lab/test/wad.test.js`). `loop.test.js` requires the accumulator to be a pure exported function (feed synthetic deltas, assert step counts + 0.25s stall clamp).

### `tools/kratos-lab/index.html` — script wiring

**Analog:** itself, lines 110–113. Load order matters (globals must exist before app.js runs); note the `?v=16` cache-buster convention — bump it when scripts change:
```html
<script src="parsers.js?v=16"></script>
<script src="anim.js?v=16"></script>
<script src="combat.js?v=16"></script>
<script src="app.js?v=16"></script>
```
Insert `fxparse.js` (and `fx.js` if separate) after `parsers.js`, before `app.js`, with the same version query. The stats card that surfaces the tuple inventory already exists (`index.html` line 81 `<div class="stat-rows" id="stats">`).

### `tools/kratos-lab/server.js` — verified NO changes needed

`server.js` serves the whole project root (line 7 `path.resolve(__dirname, "..", "..")`) with path-traversal guard (line 30) and MIME fallback (line 40): `MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream"` — `.WAD` lowercases to `.wad`, misses the MIME map, and correctly falls through to `application/octet-stream`. `assets/` is under ROOT and already served.

## Shared Patterns

### Module shell + dual-environment export
**Source:** `combat.js` lines 7/255–257, `parsers.js` lines 5/282–283, `anim.js` tail; guard from RESEARCH.md §Code Examples
**Apply to:** `parsers.js` (modify), `fxparse.js`, `fx.js`
```javascript
const ModuleName = (() => {
  /* ...functions, no top-level side effects... */
  return { publicFn1, publicFn2 };
})();
if (typeof module !== "undefined" && module.exports) module.exports = ModuleName;  // decode files only
```

### Binary decode discipline
**Source:** `parsers.js` lines 13–15 (DataView + magic assert), line 202 sign-extension idiom `(b[x] << 24 >> 24)`, RESEARCH Pattern 1 bounds check
**Apply to:** `parseWad`, `resolve`, `fxparse.js`
- One `DataView` over the `Uint8Array`; every multi-byte read explicit little-endian.
- Assert magics/invariants immediately; **error messages carry the record name** (V5 requirement).
- Bounds-check size against buffer length before trusting any record (`throw new Error(\`WAD record ${name} overruns buffer\`)`).
- Strings strictly NUL-terminated (bytes after NUL are garbage — established project rule).

### 0x80 = 1.0 invariants (protect, don't re-implement)
**Source:** `parsers.js` line 269 (CLUT alpha), lines 204–206 (vertex color ÷128); CLAUDE.md conventions
**Apply to:** all new decode/render code
Already-correct code must not be "normalized." MAT colors are floats already 1.0-based (values up to 2.0 observed) — pass through as uniforms, no ÷128, no blanket ×2.

### GL state set/restore per pass
**Source:** `app.js` lines 527–534 (current partial restore), RESEARCH Pitfall 4 + RenderChain.js reference discipline
**Apply to:** every draw pass in app.js/fx.js
```javascript
// applyMaterial() sets FULL state (blendEquation + blendFuncSeparate + depthMask) — never assumes prior state.
// After the FX block, always:
gl.blendEquation(gl.FUNC_ADD);
gl.depthMask(true);
gl.disable(gl.BLEND);
```
`gl.clear` respects `depthMask` — a leaked false mask breaks depth clearing next frame.

### Staged load with status + graceful degradation
**Source:** `app.js` lines 28–65 (`status("decoding …")` → `try/catch` → `console.warn`/`console.log` summary), lines 826–844 (public-build catch)
**Apply to:** WAD fetch + MatDb build in app.js
Fatal decode errors (unknown blend tuple) must **throw**, not warn — the assert is the DEC-01 contract; the outer catch surfaces it in `#status`.

### Asset paths (public-build safe)
**Source:** `.gitignore` (extracted/** blocked; assets/ tracked), `assets/README.md`, `app.js` line 828 regex
**Apply to:** all new fetches and test file reads
`../../assets/...` from the lab page; `path.join(__dirname, "../../../assets/...")` from `test/`; update the line-828 failure-message regex to match whichever roots the code actually fetches.

## No Analog Found

Sub-patterns with no existing code to copy from (planner should lift RESEARCH.md patterns directly):

| Pattern | Target file | Reason | Use Instead |
|---------|-------------|--------|-------------|
| matgl table semantics (mode→GL, throw-on-unknown, bit-19 depthMask) | `fx.js`/app.js | Current code has only the hardcoded `uAdd` boolean this replaces | RESEARCH.md Pattern 3 (verbatim, incl. comments) |
| Fixed 1/60 accumulator | app.js loop | Current loop is pure variable-dt (`dt = min(0.05, elapsed)`) | RESEARCH.md Pattern 6 (incl. 0.25s stall clamp, `viewDirty`) |
| FBO + depth renderbuffer + blit quad | app.js render() | No offscreen render target exists anywhere in the codebase | RESEARCH.md Pattern 7 (incl. completeness assert) |
| Node test file structure | `test/*.test.js` | No tests exist; `gen_twk.js` is a generator, not a test | RESEARCH.md §Code Examples wad.test.js sketch (with assets/ path fix) |

## Metadata

**Analog search scope:** `tools/kratos-lab/` (all 7 source files), `assets/`, `.gitignore`, repo root
**Files scanned:** 7 source files read (parsers.js, app.js, combat.js, index.html, server.js, gen_twk.js full/targeted; anim.js head+tail), plus assets/README.md and .gitignore
**Pattern extraction date:** 2026-07-24
