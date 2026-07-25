---
phase: 02-wad-mat-decode-render-pass-foundation
reviewed: 2026-07-25T08:22:41Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - tools/kratos-lab/parsers.js
  - tools/kratos-lab/fxparse.js
  - tools/kratos-lab/fx.js
  - tools/kratos-lab/loop.js
  - tools/kratos-lab/app.js
  - tools/kratos-lab/index.html
  - tools/kratos-lab/test/wad.test.js
  - tools/kratos-lab/test/fx.test.js
  - tools/kratos-lab/test/loop.test.js
findings:
  critical: 1
  warning: 4
  info: 9
  total: 14
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-07-25T08:22:41Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the phase-2 WAD/MAT decode + render-pass foundation: `parseWad`/`resolve` (parsers.js), the pure MAT decoder (fxparse.js), the MAT→GL mapping table (fx.js), the fixed-timestep accumulator (loop.js), the app-side wiring (app.js: WAD load stage, data-driven FX passes, sim/render split, native-res FBO), plus the three Node test suites. All three test suites pass against the git-tracked `assets/wads/R_WPN0_0.WAD`. Findings below were additionally verified against the shipping WAD bytes (duplicate-name MAT content comparison, record sizes, layer counts) and against `anim.js` (`computePose` buffer semantics) and the pre-phase `app.js` (regression provenance).

The decode layer is solid: the u16-tag/u16-flags header split, the fail-loud magic/mode-bit asserts, the 1.0-based MAT color pass-through, and the DEC-01 single-mapping-table discipline all check out. The tests are genuine known-answer tests (including the u32-vs-u16 Pitfall-1 guard and the GroupEnd-marker resolve guard).

One critical regression was introduced by the REND-03 sim/render split: the shared `computePose` output buffer is aliased by `skin.lastWorld` and clobbered by the blend-window prev-pose computation, so the rendered pose (and chain anchors) freeze at the previous pose for the duration of every blend window. The pre-phase code was ordering-safe (prev computed first, current recomputed after); the refactor silently broke that invariant.

## Narrative Findings (AI reviewer)

No structural pre-pass was provided; all findings below are narrative findings from direct code review.

## Critical Issues

### CR-01: Blend-window pose corruption — `skin.lastWorld` aliases `computePose`'s shared buffer, which the prev-pose computation clobbers

**File:** `tools/kratos-lab/app.js:514,518,932` (root cause interaction with `tools/kratos-lab/anim.js:286`)
**Issue:** `rig.computePose()` fills and returns a **single** `Float32Array` allocated once in the `makeRig` closure (anim.js:286 `const world = new Float32Array(n * 16);` … `return world;`). `simStep()` stores that same array by reference: `skin.lastWorld = world;` (app.js:932). During a blend window, `uploadSkinnedVerts()` first calls `skinPose(rig.computePose(skin.prevAct, skin.prevTime))` (app.js:514), which **overwrites the shared buffer with the previous pose**, then calls `skinPose(skin.lastWorld)` (app.js:518) — but `skin.lastWorld` now contains the *previous* pose, not the current one. The blend therefore interpolates prev-with-prev: for the entire blend duration (0.08s–0.5s on every move transition) the rendered character is frozen at a single stale pose, then snaps — the exact artifact the blend exists to prevent. `drawFx` (app.js:542) also reads the clobbered `skin.lastWorld` for the chain-anchor and hand positions, so the chain/trail ribbons anchor to the stale pose too.

This is a regression introduced by this phase's REND-03 split (commit 49bbb8f). The pre-phase `updateSkinning` was accidentally ordering-safe: it computed the prev pose *first* and then recomputed the current pose into the shared buffer *after* (old app.js:425–430), so the buffer held the current pose when skinning and FX ran. Moving the current-pose computation into `simStep` broke that invariant.
**Fix:** Snapshot the pose in `simStep` instead of aliasing the shared buffer:
```js
// simStep(), app.js:931-932
const world = rig.computePose(machine.st.current, machine.st.t);
if (!skin.lastWorld) skin.lastWorld = new Float32Array(world.length);
skin.lastWorld.set(world);   // copy — computePose reuses one internal buffer
```
(Keep using the local `world` for `driveBlade` within the same tick; it is valid until the next `computePose` call.) Alternatively make `computePose` write into a caller-provided output array — but the copy above is the minimal, contained fix.

## Warnings

### WR-01: `buildMats` reads 0x78 bytes per record without validating `r.size` — truncated/corrupt MAT decodes neighboring bytes silently

**File:** `tools/kratos-lab/fxparse.js:81-106`
**Issue:** The only size filter is `r.size === 0` (line 79). The decoder then unconditionally reads the 0x38-byte header plus a 0x40-byte layer (0x78 bytes total) from `r.dataOff`. A MAT record whose `size` is, say, 0x20 would pass the filter and silently decode bytes belonging to the *next* WAD record (in-buffer reads succeed; `parseWad` only guarantees the record doesn't overrun the buffer, not that the decoder stays inside the record). Near the end of the buffer it instead throws a raw `RangeError` with no record name. Both outcomes violate the fail-loud, name-the-record decode contract that the rest of this module enforces (bad magic, mode-bit asserts). Verified: all 24 MATs in the shipping WAD are ≥ 0x78, so this is a hardening gap, not a live decode error — but this parser is explicitly the foundation for later WADs.
**Fix:**
```js
if (r.size < 0x38) throw new Error(`MAT ${r.name}: size ${r.size} < 0x38 header`);
// ...after reading layerCount:
if (r.size < 0x38 + layerCount * 0x40)
  throw new Error(`MAT ${r.name}: size ${r.size} too small for ${layerCount} layer(s)`);
```

### WR-02: Multi-layer MATs are silently mis-inventoried — only layer 0 is decoded, but `enumTuples` attributes all layers to layer 0's tuple

**File:** `tools/kratos-lab/fxparse.js:91-106,134-148`
**Issue:** `buildMats` decodes only layer 0 (`const l0 = base + 0x38;`) while `layerCount` is read from the header. `enumTuples` then adds the *full* `layerCount` to the tuple keyed by layer 0's mode/depthWrite/filter. If a future WAD (the hero-side WAD with `MAT_Csmoke`/`MAT_firesploch1` is already anticipated in fx.js comments) contains a 2-layer MAT whose layers carry *different* blend modes, the inventory — the tool that decides which blend tuples need GL mappings — will silently claim coverage it doesn't have. That is precisely the silent-mistranslation failure mode the DEC-01 throw-on-unknown design exists to prevent. Verified: all 24 records in this WAD have `layerCount === 1`, so this is latent, not live.
**Fix:** Enforce the current single-layer assumption loudly until multi-layer decode exists:
```js
if (layerCount !== 1)
  throw new Error(`MAT ${r.name}: ${layerCount} layers — only single-layer decode implemented`);
```
(or decode every layer at `base + 0x38 + n * 0x40` and make `enumTuples` iterate per-layer flags).

### WR-03: Variable shadowing — for-of destructured `key` immediately shadowed in `drawFx`; `s0` in `simStep` shadows the module-level `s0 = mesh.scale`

**File:** `tools/kratos-lab/app.js:544-546,939` (vs `app.js:350`)
**Issue:** In `drawFx`, the loop head destructures `key` (`for (const [key, handN, chainN] of [["l", "lWeapIH", "lChain"], …])`) and the body immediately redeclares it: `const key = handN[0];` (line 546). The destructured binding is dead code; the two values only coincide because `"lWeapIH"[0] === "l"`. Reordering the tuple or renaming a joint would make them silently diverge, and any reference to `key` inserted above line 546 hits the TDZ and throws at runtime. Separately, `simStep`'s loop (line 939) destructures a loop element named `s0` (a track offset, 0/3) that shadows the module-level `const s0 = mesh.scale` (line 350) — harmless today only because `modelMat` is built before `simStep` exists, but it is the same trap.
**Fix:** Delete line 546 (`const key = handN[0];`) — the destructured `key` already holds `"l"`/`"r"`. Rename `simStep`'s loop element `s0` to `trackOff` (and its use `track[s0]` → `track[trackOff]`).

### WR-04: Exceptions thrown inside the rAF loop (including the designed `Fx.applyMaterial` assert) kill the app silently — the #status fail-loud contract only covers load time

**File:** `tools/kratos-lab/app.js:959-967` (interaction with `tools/kratos-lab/fx.js:50`)
**Issue:** The DEC-01 contract routes unknown blend modes to a throw in `Fx.applyMaterial` (fx.js:50) — but that throw fires *inside `drawFx`, inside the rAF callback*. The async IIFE's `.catch` (app.js:1004) has long since resolved by then, so the exception is not caught: the loop body throws before `requestAnimationFrame(loop)` is scheduled, the app freezes on the last frame, `#status` still reads "ready — …", and the only evidence is a console error. Two consequences: (1) the load-time comment "decode failures … must reach the outer catch, which surfaces them in #status" does not hold for the render-time half of the assert contract (a `strange`-mode MAT passes `decodeFlags` and only trips at first draw); (2) any other mid-loop exception (`machine.tick`, GL loss side effects) has the same frozen-app, status-lies failure mode. Also note the app.js:75-77 startup check verifies the three required MATs *exist* but not that their modes are mappable.
**Fix:** Surface loop-time failures through the same channel as load-time ones:
```js
function loop(now) {
  try {
    const wallDt = (now - last) / 1000;
    last = now;
    const n = accum.advance(wallDt);
    for (let i = 0; i < n; i++) simStep();
    renderFrame(wallDt);
    renderTimeline();
  } catch (e) {
    status("ERROR: " + e.message);
    console.error(e);
    return; // halt loudly, message visible
  }
  requestAnimationFrame(loop);
}
```
Optionally also dry-validate required MAT modes at startup (extend the app.js:75 loop to assert `["usual","additive","subtract"].includes(mat.mode)`) so a bad mode still reaches the load-time catch.

## Info

### IN-01: Decoded `filter`/`texName`/`haveTexture` are not consumed by the render path

**File:** `tools/kratos-lab/app.js:288-297,46-54` (decoded at `tools/kratos-lab/fxparse.js:54-55,98`)
**Issue:** `makeTex` hardcodes `LINEAR` filtering and the FX textures load from hardcoded `GFX_*/PAL_*` paths rather than resolving `mat.texName` → TXR → GFX via `Parsers.resolve` (which is implemented and tested but unused outside the tests). Coincidentally correct today (all FX MATs decode `filter: "linear"`, asserted by tests), but per the project's data-first rule the decoded values should eventually drive texture state.
**Fix:** In a later phase, wire `gl.texParameteri(… mat.filter === "linear" ? gl.LINEAR : gl.NEAREST)` and resolve textures through the WAD name chain.

### IN-02: `subtract` mapping leaves the alpha channel on REVERSE_SUBTRACT with (SRC_ALPHA, ONE), unlike usual/additive's explicit (ONE, ONE) accumulate

**File:** `tools/kratos-lab/fx.js:35-38`
**Issue:** `usual`/`additive` use `blendFuncSeparate(…, ONE, ONE)` per the RenderChain.js reference, but `subtract` uses plain `blendFunc`, and `blendEquation(FUNC_REVERSE_SUBTRACT)` applies to both RGB and alpha. Destination alpha is currently unused (canvas `alpha:false`; blit ignores it), so this is latent — but it will produce inconsistent FBO alpha when subtract goes live for hero-side smoke.
**Fix:** `gl.blendEquationSeparate(gl.FUNC_REVERSE_SUBTRACT, gl.FUNC_ADD); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);`

### IN-03: `byName` last-record-wins silently collapses duplicate MAT names

**File:** `tools/kratos-lab/fxparse.js:125`
**Issue:** Four MAT names appear twice in this WAD (`MAT_lambert1New`, `MAT_M01splash`, `MAT_oftFire_lambert1New`, `MAT_M01blurredSplotch`). Verified against the WAD bytes: both instances of each are content-identical, and the three target MATs (`MAT_chainlink`/`chainglow`/`swordtrail`) are unique — so last-wins is provably safe today. If a future weapon-stage WAD carries level-1 vs god instances that *differ*, `byName` will silently return the god one while the project targets level 1 (the resolve() nearest-preceding rule handles this correctly; byName does not).
**Fix:** When duplicates start to matter, assert content equality between same-name instances in `buildMats`, or select by group context/offset instead of global last-wins.

### IN-04: `advance()` NaN dt permanently poisons the accumulator

**File:** `tools/kratos-lab/loop.js:36`
**Issue:** `Math.min(Math.max(NaN, 0), maxFrame)` is NaN; `acc` becomes NaN and `acc >= step - EPS` is false forever — the sim silently stops stepping for the life of the page. Unlikely from rAF timestamps, but a one-line guard closes it.
**Fix:** `acc += Number.isFinite(dt) ? Math.min(Math.max(dt, 0), maxFrame) : 0;`

### IN-05: `renderTimeline` frame math is redundant and NaN-prone when `dur` is 0/undefined

**File:** `tools/kratos-lab/app.js:847`
**Issue:** `Math.floor((t / dur) * dur * 30)` is algebraically `Math.floor(t * 30)` but yields NaN if `dur` is 0 or undefined (then `#tlFrames` renders "frame NaN / 0" and the playhead style gets "NaN%"). Pre-existing, in-scope file.
**Fix:** `const fr = Math.floor(t * 30), tot = Math.round((dur || 0) * 30);` and guard `pct(t / (dur || 1))`.

### IN-06: `innerHTML` assembled from data-file-derived strings

**File:** `tools/kratos-lab/app.js:751-780,796-799`
**Issue:** `updateDataCards` interpolates `e.name`/`e.v` (from `twk_events.json`) and `c.name` (from `clips.json`) into `innerHTML`; `branchRowEl` does the same with graph strings. All sources are local, user-extracted data, so real XSS exposure is minimal — but a crafted data file would execute markup in the page.
**Fix:** Prefer `textContent`/element construction for data-derived fields (as `log()` already does).

### IN-07: No null check on `canvas.getContext("webgl", …)`

**File:** `tools/kratos-lab/app.js:122`
**Issue:** If WebGL is unavailable/blocked, `getContext` returns null and the next call (`gl.createShader`) throws `TypeError: Cannot read properties of null`, which the outer catch surfaces as a cryptic status message instead of "WebGL not available".
**Fix:** `if (!gl) throw new Error("WebGL1 context unavailable in this browser");`

### IN-08: `wad.test.js` dies with a raw ENOENT when the assets subset is absent

**File:** `tools/kratos-lab/test/wad.test.js:20-21`
**Issue:** The WAD is git-tracked in this repo, so the test runs here — but app.js itself anticipates deployments that strip `assets/` ("public build ships code only"). In such a checkout the test crashes at load with an unhelpful `ENOENT` stack instead of an actionable message.
**Fix:** `if (!fs.existsSync(WAD_PATH)) { console.error("SKIP: assets/wads/R_WPN0_0.WAD not present (curated asset subset required)"); process.exit(0); }` — or exit non-zero with that message if the suite must be mandatory.

### IN-09: UI reports "hard cut" for blend-0 clips while the machine substitutes a 0.08s blend

**File:** `tools/kratos-lab/app.js:713` (vs label at `app.js:754`)
**Issue:** `onMove` maps an authored `blend === 0` to the 0.08s default (`CLIP[name].blend > 0 && … ? CLIP[name].blend : 0.08`), yet `updateDataCards` labels those clips "blend-in 0s (hard cut)". The displayed real data and the actual behavior disagree; under the data-first rule an authored 0 should arguably hard-cut. Pre-existing, in-scope file.
**Fix:** Either honor authored 0 (`const bl = CLIP[name] && CLIP[name].blend >= 0 && CLIP[name].blend <= 0.5 ? CLIP[name].blend : 0.08;` with `blendLeft = 0` when bl is 0) or label the substituted 0.08s as inferred in the card.

---

_Reviewed: 2026-07-25T08:22:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
