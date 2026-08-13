// app.js — Kratos Lab glue: WebGL preview, controller pad, branch stack, timeline.

(async () => {
  const $ = (id) => document.getElementById(id);
  const status = (m) => ($("status").textContent = m);

  // ---------- load real data ------------------------------------------------
  status("loading clip table…");
  const clipsJson = await (await fetch("data/clips.json")).json();
  const DUR = {}, CLIP = {};
  for (const c of clipsJson.clips) { DUR[c.name] = c.dur; CLIP[c.name] = c; }
  DUR["block"] = 0.4;
  let TWK = { sections: {}, slots: [] };
  try { TWK = await (await fetch("data/twk_events.json")).json(); } catch {}
  // map graph moves to their TWK action sections (traversal actions only — the
  // navigation bank is the part of the tweak tree that survives in data)
  const TWK_ACTION = { highFallLand: "ANIHighLand_ACT0", land: "ANIHighLand_ACT0" };

  const FANCY = {
    comboLR3: "PLUME OF PROMETHEUS",
    combo4D: "SPIRIT OF HERCULES",
    dashMultiStab: "CYCLONE OF CHAOS",
    blockLauncher: "LAUNCHER",
    // re-identified: the "berserk" set is the bare-handed brawl (blades
    // sheathed in its blade tracks), NOT Rage of the Gods — rage keeps the
    // blade moveset and only swaps the FX set (blue glyphs / god textures)
    berserkEnter: "HAND-TO-HAND",
    airV1: "AIR SLAM",
  };

  status("decoding hero_0.bin…");
  const meshBuf = await Parsers.fetchBuf("../../assets/kratos/model/hero_0.bin");
  const mesh = Parsers.parseMesh(meshBuf);

  status("decoding skeleton + animations…");
  let rig = null;
  try {
    const objBuf = await Parsers.fetchBuf("../../assets/kratos/model/hero.bin");
    const anmBuf = await Parsers.fetchBuf("../../assets/kratos/animations/ANM_hero.bin");
    rig = GowAnim.makeRig(objBuf, anmBuf);
  } catch (e) { console.error("rig", e); }

  status("decoding Blades of Chaos…");
  let blade = null;
  try {
    const bladeAllMats = {};
    for (let i = 0; i < 16; i++) bladeAllMats[i] = 0;
    const bmesh = Parsers.parseMesh(await Parsers.fetchBuf("../../assets/weapon/MAIBlade_0.bin"), bladeAllMats);
    const bImg = Parsers.decodeTexture(
      await Parsers.fetchBuf("../../assets/weapon/GFX_stage1Btx.bin"),
      await Parsers.fetchBuf("../../assets/weapon/PAL_stage1Btx.bin"));
    const trailImg = Parsers.decodeTexture(
      await Parsers.fetchBuf("../../assets/weapon/GFX_swordtrail.bin"),
      await Parsers.fetchBuf("../../assets/weapon/PAL_swordtrail.bin"));
    // chainlink is no longer fetched from assets/weapon here — it (and the new
    // chainglow) are WAD-sourced below via the decoded texName -> TXR -> GFX/PAL
    // chain (02-REVIEW IN-01; bytes verified byte-identical to the extracted
    // files). See fxTexFromMat / chainlinkTex / chainglowTex.
    // blade long axis -> hilt (end nearer origin) and tip points in blade-local space
    const ext = [bmesh.mx[0] - bmesh.mn[0], bmesh.mx[1] - bmesh.mn[1], bmesh.mx[2] - bmesh.mn[2]];
    const ax = ext.indexOf(Math.max(...ext));
    const mid = (a) => (a === ax ? 0 : (bmesh.mn[a] + bmesh.mx[a]) / 2);
    const endA = [mid(0), mid(1), mid(2)], endB = [mid(0), mid(1), mid(2)];
    endA[ax] = bmesh.mn[ax]; endB[ax] = bmesh.mx[ax];
    const dA = Math.hypot(...endA), dB = Math.hypot(...endB);
    const hilt = dA < dB ? endA : endB, tip = dA < dB ? endB : endA;
    blade = { mesh: bmesh, bImg, trailImg, hilt, tip };
    console.log(`blade: ${bmesh.verts} verts ${bmesh.tris} tris, axis ${ax}, tip @ ${tip.map(v=>v.toFixed(1))}`);
  } catch (e) { console.warn("blade load", e); }

  // ---------- TARGET DUMMY: the undead legionnaire (R_SKS) ------------------
  // REAL enemy set extracted from the disc (assets/enemy): SKS_0 mesh, the
  // sks skeleton object (29 joints incl. his sword IH/OB anchors), ANM_sks
  // (93 acts — the full hit-reaction suite, deaths, taunts, spawn) and the
  // GFX/PAL_SKStextNu skin. Failure-tolerant: the lab runs without it.
  let dummy = null;
  try {
    status("raising the target dummy…");
    const [dMeshBuf, dObjBuf, dAnmBuf, dGfx, dPal] = await Promise.all([
      Parsers.fetchBuf("../../assets/enemy/SKS_0.bin"),
      Parsers.fetchBuf("../../assets/enemy/sks.bin"),
      Parsers.fetchBuf("../../assets/enemy/ANM_sks.bin"),
      Parsers.fetchBuf("../../assets/enemy/GFX_SKStextNu.bin"),
      Parsers.fetchBuf("../../assets/enemy/PAL_SKStextNu.bin"),
    ]);
    const dMesh = Parsers.parseMesh(dMeshBuf);
    const dRig = GowAnim.makeRig(dObjBuf, dAnmBuf);
    const dImg = Parsers.decodeTexture(dGfx, dPal);
    dummy = { on: true, mesh: dMesh, rig: dRig, img: dImg };
    console.log(`dummy: ${dMesh.verts} verts, ${dRig.jointCount} joints, ${dRig.anm.acts.size} acts`);
  } catch (e) { console.warn("dummy load", e); }

  status("loading weapon WAD…");
  // DEC-01 decode stage — deliberately NOT wrapped in try/catch: decode
  // failures (bad magic, invalid flag combos) are the assert contract and
  // must reach the outer catch, which surfaces them in #status.
  const wadBuf = await Parsers.fetchBuf("../../assets/wads/R_WPN0_0.WAD");
  const wadRecords = Parsers.parseWad(wadBuf);
  const matDb = FxParse.buildMats(wadRecords, wadBuf);
  const matTuples = FxParse.enumTuples(matDb.list);
  // FIRE-01 (BLOCKER fix): build + expose the runtime FxDb the fire/spark render
  // slices read. Before this plan app.js built only `matDb` — the render `db` did
  // NOT exist in the browser runtime. buildFxDb with NO 3rd `standaloneRecs` arg
  // synchronously surfaces the in-WAD fire family (FXC_BDEsparkemit +
  // FXC_BDEsparkemit.0, PTC_flame3/PTC_flame6) and db.meta.colorSource
  // (MAT_pticleMat.blendColor) — all verified in-WAD this session. BFT/BGT/CNG/FXCF
  // are standalone-ONLY (Phase-5 Pitfall 1) and the FIRE slices do NOT need them, so
  // NO async fetch of assets/kratos/fx/*.bin is added here (D-09a — in-WAD only).
  const db = FxParse.buildFxDb(wadRecords, wadBuf);
  for (const need of ["MAT_chainlink", "MAT_chainglow", "MAT_swordtrail"]) {
    if (!matDb.byName[need]) throw new Error(`weapon WAD missing required MAT: ${need}`);
  }
  // WR-01: db.meta.colorSource (MAT_pticleMat.blendColor) is the REAL fire/spark
  // tint dereferenced EVERY frame in drawFx (db.meta.colorSource.value). buildFxDb
  // creates it ONLY when MAT_pticleMat is present in the WAD, so make that dependency
  // explicit and FAIL LOUD here at load with a named error — never a silent per-frame
  // TypeError that the loop() try/catch would surface as a halted render. MAT_pticleMat
  // is present in the shipping WAD; this just asserts the render loop's precondition.
  if (!db.meta.colorSource || !db.meta.colorSource.value) {
    throw new Error("weapon WAD missing MAT_pticleMat (fire/spark color source db.meta.colorSource)");
  }
  console.table(matTuples);
  console.log(`weapon WAD: ${wadRecords.length} records, ${matDb.list.length} MATs, ${matTuples.length} blend tuples`);

  // FIRE-01: resolve the two level-1 blade-fire emitters from the runtime `db` ONCE
  // at load by shapeRef NAME (D-08 / Pitfall 6 — the fire family uses PLACEHOLDER
  // slot 0x0 and is NOT a db.refs slot pair, so the emitter->particle join is on the
  // shapeRef STRING, via Particles.fireBindings(db)). Level-1 pair: FXC_BDEsparkemit
  // -> PTC_flame6 (flame6Shape) + FXC_BDEsparkemit.0 -> PTC_flame3 (flame3Shape). A
  // shapeRef resolving to flame5Shape is god/other tier — REJECT it for level-1 fire
  // (Pitfall 7 / A4). Each accepted system stashes its decoded FXC placement matrix
  // (blade-local, REAL byte-exact); simStep transforms it to world at spawn.
  const fireBinds = Particles.fireBindings(db);
  const FIRE_LEVEL1 = { "FXC_BDEsparkemit": "fire6", "FXC_BDEsparkemit.0": "fire3" };
  const fireSystems = [];
  for (const bind of fireBinds) {
    if (/flame5Shape/i.test(bind.shapeRef)) continue; // reject god/other-tier flame5 (Pitfall 7)
    const kind = FIRE_LEVEL1[bind.emitter];
    if (!kind) continue;                              // keep ONLY the two level-1 emitters
    const fxc = db.fxc[bind.emitter];
    if (!fxc || !Array.isArray(fxc.matrix)) continue; // guard a malformed placement matrix
    fireSystems.push({ kind, emitter: bind.emitter, particle: bind.particle, matrix: fxc.matrix });
  }
  console.log(`blade fire: ${fireSystems.length} level-1 flame systems bound (${fireSystems.map((s) => s.kind).join(", ") || "none"})`);
  // Pool draw batching by particle family (D-02): fire (flame3+flame6) on the decoded
  // fire sprite/color; the 06-04 trail-spark riders keep their own sprite+tint.
  const FIRE_KINDS = new Set(["fire3", "fire6"]);
  const SPARK_KINDS = new Set(["spark"]);   // FIRE-02 impact sparks — their own stretched batch
  const HITFLASH_KINDS = new Set(["hitFlash"]); // GFX_flasher03 on-hit radial burst
  // FIRE-02: the impact-spark emitter IS the SAME already-real FXC_BDEsparkemit family as
  // blade fire (A6 — continuous fire and on-hit sparks are one emitter family, differing
  // ONLY by trigger; NO new emitter decode, D-09a). Its decoded blade-local placement
  // matrix (REAL byte-exact) anchors the on-hit burst via Particles.spawnAnchor, exactly
  // like the fire systems. Consumed from the runtime `db` — NOT rebuilt.
  const sparkFxc = (db.fxc && db.fxc["FXC_BDEsparkemit"]) || null;
  console.log(`impact sparks: FXC_BDEsparkemit ${sparkFxc && Array.isArray(sparkFxc.matrix) ? "bound" : "MISSING"} (FIRE-02, same family as blade fire — A6)`);

  // REND-02: decode the two per-blade warm point lights from the REAL LIGHT records
  // (LeftBladeLight @0x6a60 / RightBladeLight @0x6b20, WAD tag 0x1e, 88 B). The four
  // core values (color/intensity/range/anchor) are byte-EXACT/REAL via FxParse.parseLight
  // (06-02) — NOT hardcoded roadmap constants (D-06/D-09b). Each name also carries a
  // size-0 tag-0x32 back-reference; filter to the data-carrying tag-0x1e copy (size>0) so
  // the 0-byte dupe never reaches the decoder (mirrors light.test.js). Fail-loud (NOT
  // wrapped in try/catch) so a missing/short record surfaces in #status via the outer catch.
  const findLight = (name) => wadRecords.find((r) => r.name === name && r.tag === 0x1e && r.size > 0);
  const lightRecL = findLight("LeftBladeLight");
  const lightRecR = findLight("RightBladeLight");
  if (!lightRecL || !lightRecR) throw new Error("weapon WAD missing LeftBladeLight/RightBladeLight (tag 0x1e)");
  const bladeLightL = FxParse.parseLight(wadBuf, lightRecL);
  const bladeLightR = FxParse.parseLight(wadBuf, lightRecR);
  console.log(`blade lights: color(${bladeLightL.color.map((v) => v.toFixed(3)).join(",")}) intensity ${bladeLightL.intensity} range ${bladeLightL.range} anchor(${bladeLightL.anchor.map((v) => v.toFixed(2)).join(",")}) — REAL/decoded (REND-02), L≡R ${JSON.stringify(bladeLightR) === JSON.stringify(bladeLightL)}`);

  status("decoding textures…");
  const texPairs = [
    ["GFX_MAI01F", "PAL_MAI01F"],
    ["GFX_MAI02F", "PAL_MAI02F", "PAL_MAI01F"],
    ["GFX_MAI03F", "PAL_MAI03F"],
  ];
  const texImages = [];
  for (const [g, p, fb] of texPairs) {
    try {
      const gfx = await Parsers.fetchBuf(`../../assets/kratos/textures/${g}.bin`);
      let pal;
      try { pal = await Parsers.fetchBuf(`../../assets/kratos/textures/${p}.bin`); }
      catch { pal = await Parsers.fetchBuf(`../../assets/kratos/textures/${fb}.bin`); }
      const img = Parsers.decodeTexture(gfx, pal);
      texImages.push(img);
      const fig = document.createElement("figure");
      const cv = document.createElement("canvas");
      cv.width = img.width; cv.height = img.height;
      cv.getContext("2d").putImageData(img, 0, 0);
      const cap = document.createElement("figcaption");
      cap.textContent = `${g} ${img.width}×${img.height}`;
      fig.append(cv, cap);
      $("texGrid").append(fig);
    } catch (e) { console.warn("texture", g, e); }
  }
  // weapon trail texture (the decoded swoosh DECAL) alongside the skins — mostly
  // black texels (transparent under the additive blend), so upscale pixelated
  // with a border so the amber band + rib structure read at 64×32.
  if (blade && blade.trailImg) {
    const img = blade.trailImg;
    const fig = document.createElement("figure");
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    cv.getContext("2d").putImageData(img, 0, 0);
    cv.style.imageRendering = "pixelated";
    cv.style.width = "128px";
    cv.style.border = "1px solid #3a3a40";
    const cap = document.createElement("figcaption");
    cap.textContent = `GFX_swordtrail ${img.width}×${img.height} — trail swoosh decal`;
    fig.append(cv, cap);
    $("texGrid").prepend(fig);
  }

  $("stats").innerHTML =
    `<b>${mesh.verts.toLocaleString()}</b> vertices, <b>${mesh.tris.toLocaleString()}</b> triangles in <b>${mesh.chunks}</b> strips<br>` +
    `<b>${clipsJson.clips.length}</b> animation clips decoded<br>` +
    `combat set: <b>combo3A–F, combo4A–D, 5–7,</b><br><b>LR2–4, airH1–3/V1, berH1–4/V1–4</b><br>` +
    `source: R_HERO0.WAD / R_PERM.WAD<br>` +
    `blend tuples: <b>${matTuples.length}</b> (` +
    matTuples.map((t) => `${t.mode}/dw-${t.depthWrite ? "on" : "off"} ×${t.layerCount}`).join(", ") +
    `)`;

  // ---------- WebGL textured mesh renderer ----------------------------------
  const canvas = $("gl");
  const dbgHud = $("dbgHud"); // on-screen diagnostic readout (updated in renderFrame)
  // alpha:false — opaque canvas: page compositing can never tint/wash out the
  // additive FX passes (REND-01; verify with the magenta-background test).
  // Gamma stance: naive 8-bit gamma-space math IS the target — no sRGB, no
  // tonemap (authority: reference/TARGET-DEFINITION.md).
  const gl = canvas.getContext("webgl", { alpha: false, antialias: true, preserveDrawingBuffer: true });
  const vsrc = `
    attribute vec3 aPos; attribute vec2 aUV; attribute vec3 aNrm; attribute vec3 aCol;
    uniform mat4 uMVP; uniform mat4 uRot; uniform mat4 uModel;
    varying vec2 vUV; varying vec3 vNrm; varying vec3 vCol; varying vec3 vWorld;
    void main() {
      vec4 world = uModel * vec4(aPos, 1.0);
      gl_Position = uMVP * world;
      // world-space position for the per-blade point lights (REND-02). uModel is the
      // full model->world transform (hero: modelMat; blade: modelMat*bladeSim.mat), so
      // vWorld is in the SAME world space as the decoded light position uploaded below.
      vWorld = world.xyz;
      vUV = aUV;
      vNrm = mat3(uRot[0].xyz, uRot[1].xyz, uRot[2].xyz) * aNrm;
      vCol = aCol;
    }`;
  const fsrc = `
    precision mediump float;
    varying vec2 vUV; varying vec3 vNrm; varying vec3 vCol; varying vec3 vWorld;
    uniform sampler2D uTex; uniform float uHeat; uniform float uPages;
    // Per-blade warm point lights (REND-02) — the REAL decoded LeftBladeLight /
    // RightBladeLight values (FxParse.parseLight, 06-02): Lambert diffuse + LINEAR range
    // attenuation, NO shadow maps (D-06). Values are byte-exact/REAL, never hardcoded
    // roadmap constants (D-09b). uLightRange is in world units (decoded range x mesh
    // scale) so d/range matches vWorld's world-space distances. Summed onto the lit
    // color as a naive gamma-space add (REND-01 — no bloom, no tonemap).
    uniform vec3 uLightPosL; uniform vec3 uLightColorL; uniform float uLightIntensityL; uniform float uLightRangeL;
    uniform vec3 uLightPosR; uniform vec3 uLightColorR; uniform float uLightIntensityR; uniform float uLightRangeR;
    vec3 bladeLight(vec3 lp, vec3 lcol, float lint, float lrange, vec3 nrm, vec3 world) {
      vec3 Lp = lp - world;
      float d = length(Lp);
      float atten = max(0.0, 1.0 - d / lrange);          // linear falloff (mirrors light.test.js atten)
      vec3 dir = Lp / max(d, 1e-4);                       // normalize(Lp), guarded against a zero-length NaN
      return lcol * lint * max(dot(nrm, dir), 0.0) * atten;
    }
    void main() {
      float page = floor(clamp(vUV.y, 0.0, uPages - 0.001));
      vec2 tc = vec2(fract(vUV.x), (fract(vUV.y) + page) / uPages);
      vec4 texel = texture2D(uTex, tc);
      if (texel.a < 0.4) discard;   // alpha cutout (ragged skirt edges etc.)
      vec3 tex = texel.rgb;
      vec3 n = normalize(vNrm);
      vec3 L = normalize(vec3(0.35, 0.5, 1.0));
      float diff = 0.38 + 0.72 * max(dot(n, L), 0.0);
      float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 14.0) * 0.35;
      vec3 ao = mix(vec3(1.0), vCol, 0.45);   // soften the warm baked AO tint
      vec3 c = tex * ao * diff * 1.75 + vec3(spec);
      c = mix(c, vec3(0.95, 0.25, 0.22) * (0.4 + diff), uHeat * 0.6);
      // Two per-blade warm point lights added ON TOP of the lit color (D-06; the light
      // term is additive — REND-01 naive add, the two blade lights are summed).
      c += bladeLight(uLightPosL, uLightColorL, uLightIntensityL, uLightRangeL, n, vWorld);
      c += bladeLight(uLightPosR, uLightColorR, uLightIntensityR, uLightRangeR, n, vWorld);
      gl_FragColor = vec4(c, 1.0);
    }`;
  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, vsrc));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fsrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const LOCS = {};
  for (const n of ["aPos", "aUV", "aNrm", "aCol"]) {
    LOCS[n] = gl.getAttribLocation(prog, n);
    gl.enableVertexAttribArray(LOCS[n]);
  }
  function makeBuf(arr, dynamic) {
    const bo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bo);
    gl.bufferData(gl.ARRAY_BUFFER, arr, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    return bo;
  }
  function makeMeshSet(m, dynamicPos) {
    const set = {
      pos: makeBuf(m.pos, dynamicPos), uv: makeBuf(m.uv), nrm: makeBuf(m.nrm), col: makeBuf(m.col),
      ibo: gl.createBuffer(), count: m.tris * 3,
    };
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, set.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    return set;
  }
  function bindMeshSet(set) {
    // Re-ENABLE the mesh attribute arrays every bind, not just re-point them. The
    // Phase-6 FX passes (drawPool / trail) enable their own attrib arrays and leave
    // ALL arrays DISABLED afterward; without re-enabling here, the hero/blade draw on
    // the next frame runs with aPos/aUV/aNrm/aCol disabled → every vertex reads the
    // constant (0,0,0) → the whole mesh collapses to the origin and vanishes. This
    // only bit during combat (the pool only draws while attacking), which is why
    // "Kratos disappeared on attack". enableVertexAttribArray is idempotent/cheap.
    gl.bindBuffer(gl.ARRAY_BUFFER, set.pos);
    gl.vertexAttribPointer(LOCS.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(LOCS.aPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, set.uv);
    gl.vertexAttribPointer(LOCS.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(LOCS.aUV);
    gl.bindBuffer(gl.ARRAY_BUFFER, set.nrm);
    gl.vertexAttribPointer(LOCS.aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(LOCS.aNrm);
    gl.bindBuffer(gl.ARRAY_BUFFER, set.col);
    gl.vertexAttribPointer(LOCS.aCol, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(LOCS.aCol);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, set.ibo);
  }

  // ---------- skinning: real two-bone weights from the mesh VertexMeta ------
  // vertJ1/vertJ2 are the decoded per-vertex joint pair (weight w to J1, 1-w to
  // J2, from the position W word). Vertices without meta fall back to nearest
  // skinned joint in their chunk palette.
  // buildSkin/skinPoseFor are CHARACTER-GENERIC (rig+mesh parameterized) so the
  // target dummy reuses the exact hero pipeline — one skinning implementation.
  function buildSkin(rigX, meshX) {
    const idle = rigX.computePose(null, 0);
    // rigid inverse of a rotation+translation matrix
    function rigidInverse(m, out) {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[c * 4 + r] = m[r * 4 + c];
      out[3] = out[7] = out[11] = 0; out[15] = 1;
      out[12] = -(out[0] * m[12] + out[4] * m[13] + out[8] * m[14]);
      out[13] = -(out[1] * m[12] + out[5] * m[13] + out[9] * m[14]);
      out[14] = -(out[2] * m[12] + out[6] * m[13] + out[10] * m[14]);
    }
    // inverse-bind per joint: real Matrixes3 where present, else inverse of idle FK
    const invBinds = [];
    for (const j of rigX.obj.joints) {
      if (j.isSkinned) invBinds.push(rigX.obj.invBind[j.invId]);
      else {
        const m = new Float32Array(16);
        rigidInverse(idle.subarray(j.id * 16, j.id * 16 + 16), m);
        invBinds.push(m);
      }
    }
    const valid = (id) => id >= 0 && id < rigX.jointCount;
    const j1 = new Int16Array(meshX.verts), j2 = new Int16Array(meshX.verts);
    const wgt = new Float32Array(meshX.verts);
    let metaBound = 0, staticBound = 0, fallback = 0;
    for (let v = 0; v < meshX.verts; v++) {
      let a = meshX.vertJ1[v], bJ = meshX.vertJ2[v], w = meshX.vertW[v];
      if (meshX.vertStatic[v]) staticBound++;
      else if (valid(a) && valid(bJ)) metaBound++;
      else { a = 1; bJ = 1; w = 1; fallback++; } // pelvis fallback (should be ~0)
      j1[v] = a; j2[v] = bJ; wgt[v] = Math.max(0, Math.min(1, w));
    }
    return {
      j1, j2, wgt, metaBound, staticBound, fallback, invBinds,
      // JOINT-LOCAL rigs (SKS-class): the object ships NO inverse binds
      // (mat3count 0, no 0x80 joint flags) because the mesh is authored
      // ENTIRELY in joint-local space — every vertex takes the static path
      // (world · v), never world·invBind·v (which scattered the chunks).
      allStatic: !rigX.obj.invBind || rigX.obj.invBind.length === 0,
      bindPos: meshX.pos.slice(),
      out: new Float32Array(meshX.pos.length),
      jointMats: new Float32Array(rigX.jointCount * 16),
      prev: null, prevTime: 0, blendLeft: 0, blendDur: 0,
    };
  }
  let skin = null;
  if (rig) {
    skin = buildSkin(rig, mesh);
    console.log(`skinning: ${skin.metaBound} two-bone, ${skin.staticBound} static (blades), ${skin.fallback} fallback of ${mesh.verts}`);
  }

  function skinPoseFor(rigX, skinX, meshX, world) {
    // dynamic: joint matrix = world * inverseBind; static verts: world only
    const jm = skinX.jointMats;
    for (const j of rigX.obj.joints) {
      const w = world.subarray(j.id * 16, j.id * 16 + 16);
      const ib = skinX.invBinds[j.id];
      const o = j.id * 16;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
        jm[o + c * 4 + r] = w[r] * ib[c * 4] + w[4 + r] * ib[c * 4 + 1] + w[8 + r] * ib[c * 4 + 2] + w[12 + r] * ib[c * 4 + 3];
    }
    const bp = skinX.bindPos, out = skinX.out;
    const j1 = skinX.j1, j2 = skinX.j2, wg = skinX.wgt, vs = meshX.vertStatic;
    const allStatic = skinX.allStatic;
    for (let v = 0; v < meshX.verts; v++) {
      const x = bp[v * 3], y = bp[v * 3 + 1], z = bp[v * 3 + 2];
      if (allStatic || vs[v]) { // static: coords live in joint-local space
        const o = j1[v] * 16;
        out[v * 3] = world[o] * x + world[o + 4] * y + world[o + 8] * z + world[o + 12];
        out[v * 3 + 1] = world[o + 1] * x + world[o + 5] * y + world[o + 9] * z + world[o + 13];
        out[v * 3 + 2] = world[o + 2] * x + world[o + 6] * y + world[o + 10] * z + world[o + 14];
        continue;
      }
      const oA = j1[v] * 16, oB = j2[v] * 16, w = wg[v], iw = 1 - w;
      out[v * 3] = (jm[oA] * x + jm[oA + 4] * y + jm[oA + 8] * z + jm[oA + 12]) * w +
                   (jm[oB] * x + jm[oB + 4] * y + jm[oB + 8] * z + jm[oB + 12]) * iw;
      out[v * 3 + 1] = (jm[oA + 1] * x + jm[oA + 5] * y + jm[oA + 9] * z + jm[oA + 13]) * w +
                       (jm[oB + 1] * x + jm[oB + 5] * y + jm[oB + 9] * z + jm[oB + 13]) * iw;
      out[v * 3 + 2] = (jm[oA + 2] * x + jm[oA + 6] * y + jm[oA + 10] * z + jm[oA + 14]) * w +
                       (jm[oB + 2] * x + jm[oB + 6] * y + jm[oB + 10] * z + jm[oB + 14]) * iw;
    }
  }
  const skinPose = (world) => skinPoseFor(rig, skin, mesh, world);
  const heroSet = makeMeshSet(mesh, true);
  const posBuf = heroSet.pos;
  const bladeSet = blade ? makeMeshSet(blade.mesh, false) : null;

  // texture atlas: the three 256x256 skin pages stacked vertically (V pages)
  const atlasPages = texImages.length || 1;
  const atlas = document.createElement("canvas");
  atlas.width = 256; atlas.height = 256 * atlasPages;
  const actx = atlas.getContext("2d");
  texImages.forEach((img, i) => actx.putImageData(img, 0, i * 256));
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // makeTex(src, opts?) — opts.wrapS/wrapT default to REPEAT-S / CLAMP-T (the
  // legacy strip defaults, so bladeTex/trailTex stay byte-for-byte unchanged);
  // opts.filter comes from the decoded MAT.filter ("linear" -> LINEAR, else
  // NEAREST). No mipmaps EVER (CLAUDE.md: GS FX draws were bilinear at most;
  // mipping the 512x32 chainlink strip smears the links).
  function makeTex(src, opts) {
    const o = opts || {};
    const wrapS = o.wrapS !== undefined ? o.wrapS : gl.REPEAT;
    const wrapT = o.wrapT !== undefined ? o.wrapT : gl.CLAMP_TO_EDGE;
    const filt = o.filter === "nearest" ? gl.NEAREST : gl.LINEAR;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    return t;
  }

  // dummy GL resources — the generic pipeline (own buffers, skin, texture)
  if (dummy) {
    dummy.set = makeMeshSet(dummy.mesh, true);
    dummy.skin = buildSkin(dummy.rig, dummy.mesh);
    dummy.tex = makeTex(dummy.img, { wrapS: gl.CLAMP_TO_EDGE });
  }
  const bladeTex = blade ? makeTex(blade.bImg) : null;
  const trailTex = blade ? makeTex(blade.trailImg) : null;

  // WAD-sourced FX textures via the decoded texName -> TXR -> GFX/PAL chain
  // (02-REVIEW IN-01: consume the decoded texName/filter fields). WAD record
  // bytes are byte-identical to the extracted assets/weapon files (verified
  // 2026-07-25), so this is a data-first re-source with zero visual risk. Fails
  // loud (named throws), un-caught by design so the outer catch surfaces it.
  function fxTexFromMat(mat, opts) {
    const matRec = wadRecords.find((r) => r.off === mat.off); // mats carry off, not idx
    if (!matRec) throw new Error(`FX texture: no WAD record for MAT ${mat.name} @0x${mat.off.toString(16)}`);
    const txrRec = Parsers.resolve(wadRecords, mat.texName, matRec.idx);
    if (!txrRec) throw new Error(`FX texture: ${mat.name} texName ${mat.texName} did not resolve`);
    const txr = FxParse.parseTxr(wadBuf, txrRec);
    const g = Parsers.resolve(wadRecords, txr.gfxName, txrRec.idx);
    if (!g) throw new Error(`FX texture: ${txr.gfxName} (from ${mat.texName}) did not resolve`);
    const p = Parsers.resolve(wadRecords, txr.palName, txrRec.idx);
    if (!p) throw new Error(`FX texture: ${txr.palName} (from ${mat.texName}) did not resolve`);
    const img = Parsers.decodeTexture(
      wadBuf.subarray(g.dataOff, g.dataOff + g.size),
      wadBuf.subarray(p.dataOff, p.dataOff + p.size));
    return makeTex(img, { wrapS: opts.wrapS, wrapT: opts.wrapT, filter: mat.filter });
  }
  // chainlink: REPEAT on U (the 16-link strip tiles along the chain), CLAMP on V
  // (single strip height). chainglow: CLAMP on BOTH — the glow's single hot blob
  // lives at u∈[0,~0.26] with the rest additive-black; REPEAT would re-tile the
  // hot spot every 16 links (Pitfall 5). [INFERRED wrap choice — A2; the real
  // heat-ramp colors sample regardless, Phase-5 GS dump confirms placement.]
  const chainlinkTex = fxTexFromMat(matDb.byName.MAT_chainlink, { wrapS: gl.REPEAT, wrapT: gl.CLAMP_TO_EDGE });
  const chainglowTex = fxTexFromMat(matDb.byName.MAT_chainglow, { wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE });
  // RAGE OF THE GODS variants — the WAD ships REAL god-mode FX assets
  // (MAT/GFX/PAL_godchainlink, godchainglow, godswordtrail); the RAGE toggle
  // swaps the whole mat+texture set (decoded blend modes/colors included).
  const godChainlinkTex = matDb.byName.MAT_godchainlink
    ? fxTexFromMat(matDb.byName.MAT_godchainlink, { wrapS: gl.REPEAT, wrapT: gl.CLAMP_TO_EDGE }) : null;
  const godChainglowTex = matDb.byName.MAT_godchainglow
    ? fxTexFromMat(matDb.byName.MAT_godchainglow, { wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE }) : null;
  const godTrailTex = matDb.byName.MAT_godswordtrail
    ? fxTexFromMat(matDb.byName.MAT_godswordtrail, { wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE }) : null;
  // GFX_flasher03 (WAD, no MAT record): a 64×64 radial impact-flash burst —
  // white-hot core, soft circular falloff, neutral grayscale. Decoded directly
  // from the WAD GFX/PAL pair; used as the on-hit flash sprite (REAL texels;
  // the spawn placement/params are INFERRED — no decoded flash-emitter record).
  const flasherTex = (() => {
    const g = wadRecords.find((r) => r.name === "GFX_flasher03");
    const p = wadRecords.find((r) => r.name === "PAL_flasher03");
    if (!g || !p) return null;
    const img = Parsers.decodeTexture(
      wadBuf.subarray(g.dataOff, g.dataOff + g.size),
      wadBuf.subarray(p.dataOff, p.dataOff + p.size));
    return makeTex(img, { wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE, filter: true });
  })();
  // WEAPON LEVEL 5 blade skin (REAL WAD assets GFX/PAL_stage5Btx) + the decoded
  // per-level Rage rule: God Mode Trail Tint = (1,1,1,1) at L1-3 but RED
  // (1,0,0,1) at L4-5 (/Player/ Weapon Level tree). The Weapon Lv button swaps
  // the blade texture and, during Rage, applies the level's REAL trail tint.
  const blade5Tex = (() => {
    const g = wadRecords.find((r) => r.name === "GFX_stage5Btx");
    const p = wadRecords.find((r) => r.name === "PAL_stage5Btx");
    if (!g || !p) return null;
    const img = Parsers.decodeTexture(
      wadBuf.subarray(g.dataOff, g.dataOff + g.size),
      wadBuf.subarray(p.dataOff, p.dataOff + p.size));
    return makeTex(img);
  })();
  let weaponLevel = 1; // 1 or 5
  // REAL decoded /Player/ Costume 0-5 table (all values from part1.pak uid 273).
  // wl = "Weapon Length" (gameplay reach; sits among the pure gameplay mults),
  // dmg = Damage Mult, orb = Weapon Orb Mult. The lab applies wl as the reach
  // multiplier on the hit display (interpretation INFERRED; values REAL).
  const COSTUMES = [
    { wl: 0.7, dmg: 1, orb: 1 },   // Costume 0 (default Kratos)
    { wl: 0.6, dmg: 1, orb: 1 },
    { wl: 0.9, dmg: 0.5, orb: 1 },
    { wl: 0.3, dmg: 2, orb: 4 },
    { wl: 0.35, dmg: 0.5, orb: 2 },
    { wl: 0.7, dmg: 2, orb: 2 },
  ];
  let costumeIdx = 0;

  // FIRE-01 fire billboard sprite (WARNING-4 resolution): attempt the decoded
  // MAT_pticleMat texture FIRST. MAT_pticleMat has layerCount 1 but exposes NO layer
  // texName (probed empty this session), so fxTexFromMat is EXPECTED to fail to
  // resolve a texture — catch it and fall back to the already-loaded trailTex
  // (GFX_swordtrail, in-WAD) as the DOCUMENTED fire sprite. This is an INFERRED
  // sprite REUSE: the DECODED, real part of the fire is its COLOR (db.meta.colorSource
  // = MAT_pticleMat.blendColor); the sprite itself is a labeled INFERRED choice. A
  // NON-NULL GL texture is bound for the fire batch either way (acceptance). Unlike
  // the chain textures this ONE attempt is wrapped (the null-texName is expected, not
  // a decode failure) — the fallback keeps the failure local to the fire sprite.
  let fireTex = null;
  if (matDb.byName.MAT_pticleMat) {
    try {
      fireTex = fxTexFromMat(matDb.byName.MAT_pticleMat, { wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE });
    } catch (e) {
      fireTex = null; // MAT_pticleMat carries no texName — expected; use the fallback
    }
  }
  if (!fireTex) fireTex = trailTex; // INFERRED fallback fire sprite (documented reuse)

  const uMVP = gl.getUniformLocation(prog, "uMVP");
  const uRot = gl.getUniformLocation(prog, "uRot");
  const uHeat = gl.getUniformLocation(prog, "uHeat");
  const uModel = gl.getUniformLocation(prog, "uModel");
  const uPages = gl.getUniformLocation(prog, "uPages");
  gl.uniform1f(uPages, atlasPages);
  gl.uniform1i(gl.getUniformLocation(prog, "uTex"), 0);

  // ---- FX program: chain/trail ribbons (pos + uv + alpha) ------------------
  const fxProg = gl.createProgram();
  gl.attachShader(fxProg, shader(gl.VERTEX_SHADER, `
    attribute vec3 aP; attribute vec3 aT;
    uniform mat4 uMVP; uniform mat4 uM;
    varying vec3 vT;
    void main() { gl_Position = uMVP * (uM * vec4(aP, 1.0)); vT = aT; }`));
  // TFX MODULATE shape (02-RESEARCH Pattern 4): tex × layer blend color ×
  // material color, multiplied in-shader BEFORE blending so decoded overbright
  // values (e.g. 2.0 on the untextured lambert MATs) survive into the blend.
  gl.attachShader(fxProg, shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 vT;
    uniform sampler2D uTex;
    uniform vec3 uMaterialColor; uniform vec4 uLayerColor; uniform float uCutoff;
    // TRL-01 trail branch, gated by uTrailRamp so it touches ONLY the swordtrail
    // pass — the chain/glow passes upload uTrailRamp=0 (no bleed, T-06-03-01).
    // The branch samples the REAL GFX_swordtrail texels directly (the texture IS
    // the feathered amber gradient + ember speckle; black = transparent under the
    // additive blend). vT.z is the per-row age fade (1 fresh -> 0 old).
    uniform float uTrailRamp;
    uniform float uTrailAlpha; // REAL Trail Tint A (0.8) / God Mode Trail Tint A (1.0, Rage)
    uniform vec3 uTrailTint;   // REAL Trail Tint RGB (1,1,1) / God Mode L4-5 RED (1,0,0)
    // CHAIN-03 combat-gated glow brightness (D-05, A2). When uGlowGain > 0 this is
    // the alpha-over-1.0 chainglow premult branch (CLAUDE.md Part 1): output the
    // DECODED glow texel rgb premultiplied by (alpha128 * uGlowGain) with alpha 0,
    // so blendFunc(ONE,ONE) (additivePremult) reproduces the GS additive Cs*As + Cd
    // with As UNCLAMPED — a gain > 1.0 pushes the glow ABOVE the 1.0 clamp (the
    // 03-02 "glow too subtle" lever, data-grounded — NOT a hand-tuned color). Gated
    // by uGlowGain so it touches ONLY the chainglow pass; the link/trail/pool passes
    // upload uGlowGain=0 (no bleed, T-06-07-01). The COLOR is still the decoded
    // chainglow texel (identity material/blend); only the gain rule is INFERRED.
    uniform float uGlowGain;
    void main() {
      vec4 c = texture2D(uTex, vT.xy);
      vec3 rgb = c.rgb * uLayerColor.rgb * uMaterialColor;
      float a = c.a * uLayerColor.a * vT.z;
      // cutout 0.35 is INFERRED — GS TEST-register alpha test is not in MAT
      // records (02-RESEARCH A3); Phase 5's GS dump reads the real value.
      if (a < uCutoff) discard;
      if (uGlowGain > 0.0) {
        // alpha-over-1.0 glow-brightness recovery: premultiply the decoded texel by
        // (alpha128 * combat gain), alpha out 0 => Cs*As + Cd under ONE,ONE.
        gl_FragColor = vec4(rgb * (a * uGlowGain), 0.0);
        return;
      }
      if (uTrailRamp > 0.5) {
        // REAL GFX_swordtrail sampling. The decoded 64x32 texture is a complete swoosh
        // DECAL (black = transparent under the additive MAT_swordtrail blend — classic
        // GS, no alpha needed): luminance ramps toward the bright corner at (u=1, v=1)
        // — dark-amber -> gold (243,176,18) — and carries baked RIB striations
        // (irregular bright/dark columns along u) — the multi-streak look in footage.
        // Mapping: u = 0 tail -> 1 live blade edge (ONE texture per swoosh, never
        // tiled — its u-ramp IS the along-arc fade); the sheet's v (inner -> tip) is
        // remapped into the visible band [~0.78, 1.0] so the REAL feather spans the
        // width. The remap is the only INFERRED part — every color is a real texel.
        // Alpha = REAL Trail Tint A=0.8 x age fade (the fade matters after the swing
        // ends, when rows age out in place). Gain (INFERRED): only the small bright
        // rib corner exceeds 1.0 — a hot core, no field-wide blowout.
        // ORIENTATION (user-identified): the decal's LONG axis (64, the ramp + the
        // speckle) runs ALONG THE CHAIN — transparent near the hand, ramping to
        // intense gold at the tip ("blended transparency down the blade"). Its
        // band rows (32-axis) run ALONG THE SWEEP — the bright last row is the
        // INTENSE section AT the live chain position, fading backward through the
        // path ("and back along the path"). Swept, each chain-position's speckle
        // paints the CONCENTRIC flow streaks seen in footage (not radial spokes).
        // So: texture U = cross-section (vT.y, hand->tip; /0.87 puts the tip line
        // on the ramp's peak, smoothstep fades the past-tip overhang fringe),
        // texture V = sweep (vT.x, tail->live edge, stretched into the band so the
        // veil persists across the whole sweep). All colors remain real texels.
        vec3 tex = uTrailTint * texture2D(uTex, vec2(min(vT.y / 0.87, 1.0), mix(0.75, 1.0, vT.x))).rgb;
        float edgeFade = 1.0 - smoothstep(0.87, 1.0, vT.y);
        // Alpha holds the REAL Trail Tint A through the sweep (uTrailAlpha: 0.8
        // normal / 1.0 Rage — both decoded); the age term only DISSOLVES rows
        // over their last 30% of life (the post-swing fade-out).
        float a = uTrailAlpha * min(vT.z / 0.3, 1.0);
        gl_FragColor = vec4(tex * 2.2 * edgeFade, a);
        return;
      }
      gl_FragColor = vec4(rgb, a);
    }`));
  gl.linkProgram(fxProg);
  const fxLocs = {
    aP: gl.getAttribLocation(fxProg, "aP"),
    aT: gl.getAttribLocation(fxProg, "aT"),
    uMVP: gl.getUniformLocation(fxProg, "uMVP"),
    uM: gl.getUniformLocation(fxProg, "uM"),
    uTex: gl.getUniformLocation(fxProg, "uTex"),
    uMaterialColor: gl.getUniformLocation(fxProg, "uMaterialColor"),
    uLayerColor: gl.getUniformLocation(fxProg, "uLayerColor"),
    uCutoff: gl.getUniformLocation(fxProg, "uCutoff"),
    uTrailRamp: gl.getUniformLocation(fxProg, "uTrailRamp"),
    uTrailAlpha: gl.getUniformLocation(fxProg, "uTrailAlpha"),
    uTrailTint: gl.getUniformLocation(fxProg, "uTrailTint"),
    uGlowGain: gl.getUniformLocation(fxProg, "uGlowGain"),
  };
  const fxBuf = gl.createBuffer();
  // per-frame FX pass log: rewritten at the top of each drawFx call; one entry
  // per applyMaterial'd pass — console-visible proof of per-pass state without
  // mid-frame GL reads (exposed on window.KratosLab.fxLog).
  const fxLog = [];

  // ---- FX pool: shared world-space billboard particle pool (D-02) ----------
  // ONE GL program (billboard VS from the view-matrix camRight/camUp columns +
  // an alpha-over-1.0 premult fragment), ONE interleaved DYNAMIC_DRAW buffer
  // rewritten per frame via bufferSubData (never reallocated), ONE STATIC index
  // buffer built ONCE. 4 verts/particle. The pure sim (spawn/integrate/cull)
  // lives in Particles (particles.js); this is only the GPU-submission half
  // (CLAUDE.md Part 3 "Billboard particles"). No ANGLE_instanced_arrays, no
  // gl.POINTS (both banned by CLAUDE.md at this particle scale).
  //
  // POOL_CAP — INFERRED hard bound (Security V5 / T-06-04-02). GoW1-era emitters
  // are tens-to-hundreds of particles; 512 is a comfortable few-hundred ceiling
  // that keeps the per-frame rebuild trivial (<0.1ms) and bounds the buffer +
  // CPU cost. POOL_CAP*4 verts stays < 65536 so the static index buffer fits
  // UNSIGNED_SHORT. Particles.makePool enforces the cap (reject-when-full).
  const POOL_CAP = 2048;  // INFERRED density headroom (was 512); POOL_CAP*4 verts < 65536 index limit — Phase-7 tune
  const fxPool = Particles.makePool({ maxParticles: POOL_CAP });
  // FIRE-02 velocity-stretch factor for impact sparks: the pool VS scales each quad's
  // long (velocity-aligned) axis by this when the spark batch draws (uStretch). INFERRED
  // (A1 — the PS2 "stretched spark" elongation is a runtime look, no decoded field);
  // Phase-7 footage-tunable. Non-spark batches pass 0 (plain camRight/camUp billboard).
  const SPARK_STRETCH = 2.5;
  const POOL_FLOATS_PER_VERT = 14;                 // aCenter(3)+aCorner(2)+aUV(2)+aColor(4)+aVel(3)
  const POOL_STRIDE = POOL_FLOATS_PER_VERT * 4;    // interleaved stride in bytes
  const poolProg = gl.createProgram();
  gl.attachShader(poolProg, shader(gl.VERTEX_SHADER, `
    attribute vec3 aCenter;   // particle center (mesh-local — same space as the trail verts)
    attribute vec2 aCorner;   // ±halfSize corner offset
    attribute vec2 aUV;
    attribute vec4 aColor;    // rgb + alpha128 (may exceed 1.0 — premultiplied in the fragment)
    attribute vec3 aVel;      // per-particle world velocity (FIRE-02 spark stretch axis)
    uniform mat4 uMVP; uniform vec3 uCamRight; uniform vec3 uCamUp;
    uniform float uStretch;   // 0 = plain billboard; >0 = velocity-aligned stretch factor (spark batch)
    uniform vec4 uUVRect;     // sprite UV sub-rect [u0, v0, uSpan, vSpan] — see below
    varying vec2 vUV; varying vec4 vColor;
    void main() {
      vec3 world;
      if (uStretch > 0.0) {
        // FIRE-02 velocity-aligned STRETCHED billboard (CLAUDE.md Part 3 "Spark
        // stretching"): the quad's long axis rides the projected velocity so the
        // spark reads as a streak scaled along motion; the short axis is the
        // perpendicular. This GLSL mirrors the pure Particles.stretchAxis(vel,
        // camUp) contract (particles.js) — normalize(aVel), with the uCamUp
        // fallback when |vel| ~ 0 — evaluated per-vertex on the GPU.
        vec3 axis = length(aVel) > 1e-4 ? normalize(aVel) : uCamUp;
        vec3 perp = normalize(cross(axis, uCamRight));
        world = aCenter + axis * (aCorner.x * uStretch) + perp * aCorner.y;
      } else {
        // Billboard: expand the quad along the camera right/up axes so every
        // sprite faces the camera with NO per-particle CPU matrix (CLAUDE.md Part
        // 3). uCamRight/uCamUp are the view matrix's row-0/row-1 (columns of its
        // transpose), supplied by drawPool.
        world = aCenter + uCamRight * aCorner.x + uCamUp * aCorner.y;
      }
      gl_Position = uMVP * vec4(world, 1.0);
      // uUVRect = [u0, v0, uSpan, vSpan]: per-batch sprite sub-rect. The swordtrail
      // texture is a complete swoosh DECAL — a billboard sampling ALL of it stamps a
      // mini-swoosh per particle ("repeating" detail along the arc). Spark batches
      // riding trailTex pass the bright ember corner instead; default (0,0,1,1).
      vUV = uUVRect.xy + aUV * uUVRect.zw; vColor = aColor;
    }`));
  gl.attachShader(poolProg, shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec2 vUV; varying vec4 vColor;
    uniform sampler2D uTex;
    void main() {
      // alpha-over-1.0 premultiply (CLAUDE.md Part 1): output rgb·alpha128 with
      // alpha128 UNCLAMPED (GS As up to ~1.99), blended ONE,ONE (additivePremult)
      // => Cs·As + Cd — the GS fire/glow additive. The sprite texel modulates the
      // premultiplied color; alpha out = 0 leaves dest alpha untouched.
      vec4 t = texture2D(uTex, vUV);
      gl_FragColor = vec4(vColor.rgb * vColor.a * t.rgb * t.a, 0.0);
    }`));
  gl.linkProgram(poolProg);
  const poolLocs = {
    aCenter: gl.getAttribLocation(poolProg, "aCenter"),
    aCorner: gl.getAttribLocation(poolProg, "aCorner"),
    aUV: gl.getAttribLocation(poolProg, "aUV"),
    aColor: gl.getAttribLocation(poolProg, "aColor"),
    aVel: gl.getAttribLocation(poolProg, "aVel"),
    uMVP: gl.getUniformLocation(poolProg, "uMVP"),
    uCamRight: gl.getUniformLocation(poolProg, "uCamRight"),
    uCamUp: gl.getUniformLocation(poolProg, "uCamUp"),
    uStretch: gl.getUniformLocation(poolProg, "uStretch"),
    uUVRect: gl.getUniformLocation(poolProg, "uUVRect"),
    uTex: gl.getUniformLocation(poolProg, "uTex"),
  };
  // ONE interleaved ARRAY_BUFFER (DYNAMIC_DRAW), allocated once at cap size and
  // rewritten each frame with bufferSubData. poolVerts is the CPU scratch that
  // gets packed then uploaded (mirror uploadSkinnedVerts' bufferSubData path).
  const poolVertBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, poolVertBuf);
  gl.bufferData(gl.ARRAY_BUFFER, POOL_CAP * 4 * POOL_STRIDE, gl.DYNAMIC_DRAW);
  const poolVerts = new Float32Array(POOL_CAP * 4 * POOL_FLOATS_PER_VERT);
  // STATIC index buffer built ONCE: two triangles (6 idx) per particle quad.
  const poolIdxBuf = gl.createBuffer();
  {
    const idx = new Uint16Array(POOL_CAP * 6);
    for (let i = 0; i < POOL_CAP; i++) {
      const b = i * 4;
      idx[i * 6] = b; idx[i * 6 + 1] = b + 1; idx[i * 6 + 2] = b + 2;
      idx[i * 6 + 3] = b; idx[i * 6 + 4] = b + 2; idx[i * 6 + 5] = b + 3;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, poolIdxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  }
  // the 4 quad corners: [cornerX, cornerY, u, v] (±1 scaled by particle size).
  const POOL_CORNERS = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];

  const s0 = mesh.scale;
  const modelMat = new Float32Array([
    s0, 0, 0, 0, 0, s0, 0, 0, 0, 0, s0, 0,
    -mesh.ctr[0] * s0, -mesh.ctr[1] * s0, -mesh.ctr[2] * s0, 1,
  ]);
  gl.uniformMatrix4fv(uModel, false, modelMat);

  // REND-02 per-blade point-light uniforms on the mesh program `prog` (prog is the
  // active program here). COLOR and RANGE are set ONCE — constants from the REAL decode.
  // range is converted mesh->world by ×s0 (mesh.scale) so the linear attenuation
  // atten=max(0,1-d/range) matches vWorld's world-space distances. POSITION and INTENSITY
  // are refreshed per rendered frame (renderFrame) so each light rides its blade; the
  // missing-blade guard there zeroes intensity so no NaN reaches a uniform (T-06-08-01).
  const uLightPosL = gl.getUniformLocation(prog, "uLightPosL");
  const uLightColorL = gl.getUniformLocation(prog, "uLightColorL");
  const uLightIntensityL = gl.getUniformLocation(prog, "uLightIntensityL");
  const uLightRangeL = gl.getUniformLocation(prog, "uLightRangeL");
  const uLightPosR = gl.getUniformLocation(prog, "uLightPosR");
  const uLightColorR = gl.getUniformLocation(prog, "uLightColorR");
  const uLightIntensityR = gl.getUniformLocation(prog, "uLightIntensityR");
  const uLightRangeR = gl.getUniformLocation(prog, "uLightRangeR");
  gl.uniform3fv(uLightColorL, bladeLightL.color);   // REAL decoded warm amber (1.0,0.622,0.288)
  gl.uniform3fv(uLightColorR, bladeLightR.color);
  gl.uniform1f(uLightRangeL, bladeLightL.range * s0);  // decoded range 160 -> world units
  gl.uniform1f(uLightRangeR, bladeLightR.range * s0);
  gl.uniform1f(uLightIntensityL, 0.0);              // set per frame (guarded — dark until the blade sim is live)
  gl.uniform1f(uLightIntensityR, 0.0);

  gl.clearColor(0, 0, 0, 1); // opaque clear — FBO-path clears must also be opaque
  gl.enable(gl.DEPTH_TEST);
  // LEQUAL (not the GL default LESS): the chainglow overlay (drawFx PASS 2) is
  // coplanar with the depth-writing chain links, so equal-depth glow fragments
  // must PASS or the glow vanishes exactly where links wrote depth (Pitfall 1).
  // GS ZTST=2 GEQUAL passes equal depths [CITED: psi-rockin.github.io/ps2tek];
  // that GoW1 uses ZTST=2 for these draws is [ASSUMED] until the Phase-5 GS dump
  // (A1) — LEQUAL is the required GL-convention analog regardless. Hero/blade
  // opaque rendering is unaffected (distinct depths).
  gl.depthFunc(gl.LEQUAL);

  // ---- native-res render target (REND-03): 512×448 offscreen FBO -----------
  // 4:3 stretched display of the 512×448 GS target (02-RESEARCH A2 / Open Q1 —
  // NTSC non-square pixels). 8:7 raw option = change displayAspect to 8/7;
  // revisit when Phase-1 capture stills land. Do not block on it.
  const NATIVE = { w: 512, h: 448, displayAspect: 4 / 3 };
  let nativeRes = false; // default OFF — full-res inspect until Phase 7 comparisons
  // 512×448: width POT, height NPOT. WebGL1 NPOT rules: fine as an FBO color
  // texture with CLAMP_TO_EDGE + LINEAR and no mipmaps — all true here.
  // gl.RGBA/UNSIGNED_BYTE: 8-bit clamped like the canvas so REND-01's blend
  // saturation behavior survives (NO float formats).
  const rtTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, rtTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NATIVE.w, NATIVE.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // bilinear upscale = the authentic soft look
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const rtDepth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rtDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, NATIVE.w, NATIVE.h);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rtTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rtDepth);
  // T-2-10: an incomplete FBO renders black silently — fail loud at startup
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("native-res FBO incomplete");
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Blit pass: its OWN trivial program — no fxProg/hero state coupling (T-2-11)
  const blitProg = gl.createProgram();
  gl.attachShader(blitProg, shader(gl.VERTEX_SHADER, `
    attribute vec2 aPos; uniform vec2 uScale; varying vec2 vUV;
    void main() { gl_Position = vec4(aPos * uScale, 0.0, 1.0); vUV = aPos * 0.5 + 0.5; }`));
  gl.attachShader(blitProg, shader(gl.FRAGMENT_SHADER, `
    precision mediump float; varying vec2 vUV; uniform sampler2D uTex;
    void main() { gl_FragColor = texture2D(uTex, vUV); }`));
  gl.linkProgram(blitProg);
  const blitLocs = {
    aPos: gl.getAttribLocation(blitProg, "aPos"),
    uScale: gl.getUniformLocation(blitProg, "uScale"),
    uTex: gl.getUniformLocation(blitProg, "uTex"),
  };
  const blitBuf = gl.createBuffer(); // fullscreen two-triangle quad, -1..1
  gl.bindBuffer(gl.ARRAY_BUFFER, blitBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.useProgram(blitProg);
  gl.uniform1i(blitLocs.uTex, 0);
  gl.useProgram(prog);

  // tiny mat4
  const M = {
    mul(a, b) {
      const o = new Float32Array(16);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    },
    persp(fov, asp, n, f) {
      const t = 1 / Math.tan(fov / 2);
      return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]);
    },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
    rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    trans(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
  };
  // Cosmetic 90° roll of the blade MESH about its own length axis (local Z = the blade's
  // long axis, per the loader). Applied on the RIGHT of the blade model matrix so it rolls
  // the mesh in local space BEFORE driveBlade orients it — turning the blade edge-forward
  // (was flat-forward). It never touches the length axis, so the swept-edge trail (built
  // from hilt/tip on that axis) is unchanged. Flip the sign if the edge faces the wrong way.
  const BLADE_ROLL = M.rotZ(Math.PI / 2);

  // ---- arena: meter-grid training room (user request) ----------------------
  // A gridded floor + walls so Kratos/chain/trail extents read in METERS: 1 cell
  // = 1 m via the measured bridge (Chain.METERS_TO_WORLD = 14 mesh units/m,
  // Kratos ≈ 2.0 m). Drawn in MESH space (× modelMat like the hero), inward-faced
  // walls + backface cull so orbiting always sees the far walls, Smash-training
  // style. Texture: canvas-generated 8 m tile (POT 1024px, REPEAT), thin 1 m
  // lines, heavy 4 m lines, two-tone 4 m panels.
  const ARENA_M = Chain.METERS_TO_WORLD;   // mesh units per meter (bridge)
  const ARENA_HALF = 28 * ARENA_M;         // ±28 m floor (user-doubled) — long root-motion runs stay inside
  const ARENA_WALL_H = 7 * ARENA_M;        // 7 m walls — jump/aerial arcs stay inside
  const ARENA_TILE = 8 * ARENA_M;          // texture tile = 8 m
  // far clip plane, DERIVED so arena resizes can't re-clip the floor (the
  // doubled arena outgrew the old fixed far=50): max wheel zoom-out (26) +
  // the farthest arena corner in display units as seen from a hero followed
  // at the 16 m teleport radius, + margin.
  const CAM_FAR = 26 + (ARENA_HALF * Math.SQRT2 + 4 * 4 * ARENA_M) * s0 + 10;
  const arenaTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 1024;
    const g = c.getContext("2d");
    g.fillStyle = "#b9b2a4"; g.fillRect(0, 0, 1024, 1024);
    g.fillStyle = "#c4bdae"; g.fillRect(0, 0, 512, 512); g.fillRect(512, 512, 512, 512);
    g.strokeStyle = "#8f887a"; g.lineWidth = 2;      // 1 m lines (128px/m)
    for (let i = 0; i <= 8; i++) {
      const p = i * 128;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 1024); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(1024, p); g.stroke();
    }
    g.strokeStyle = "#6e6759"; g.lineWidth = 5;      // 4 m major lines
    for (const p of [0, 512, 1024]) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 1024); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(1024, p); g.stroke();
    }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  })();
  const arenaProg = gl.createProgram();
  gl.attachShader(arenaProg, shader(gl.VERTEX_SHADER, `
    attribute vec3 aPos; attribute vec2 aUV;
    uniform mat4 uMVP; varying vec2 vUV; varying vec3 vP;
    void main() { gl_Position = uMVP * vec4(aPos, 1.0); vUV = aUV; vP = aPos; }`));
  gl.attachShader(arenaProg, shader(gl.FRAGMENT_SHADER, `
    precision mediump float; varying vec2 vUV; varying vec3 vP;
    uniform sampler2D uTex; uniform vec3 uTint;
    void main() {
      vec3 c = texture2D(uTex, vUV).rgb * uTint;
      float fade = clamp(1.0 - length(vP.xz) / (${(ARENA_HALF * 2.2).toFixed(1)}), 0.45, 1.0);
      gl_FragColor = vec4(c * fade, 1.0);
    }`));
  gl.linkProgram(arenaProg);
  const arenaLocs = {
    aPos: gl.getAttribLocation(arenaProg, "aPos"),
    aUV: gl.getAttribLocation(arenaProg, "aUV"),
    uMVP: gl.getUniformLocation(arenaProg, "uMVP"),
    uTex: gl.getUniformLocation(arenaProg, "uTex"),
    uTint: gl.getUniformLocation(arenaProg, "uTint"),
  };
  const arenaBuf = gl.createBuffer();
  {
    const E = ARENA_HALF, H = ARENA_WALL_H, T = ARENA_TILE;
    const v = [];
    const quad = (a, b, c2, d) => { v.push(...a, ...b, ...c2, ...a, ...c2, ...d); };
    const P = (x, y, z, u, w2) => [x, y, z, u / T, w2 / T];
    // floor (drawn cull-off)
    quad(P(-E, 0, -E, -E, -E), P(E, 0, -E, E, -E), P(E, 0, E, E, E), P(-E, 0, E, -E, E));
    // walls, wound CCW as seen from INSIDE (backface cull hides near walls)
    quad(P(-E, 0, -E, -E, 0), P(E, 0, -E, E, 0), P(E, H, -E, E, H), P(-E, H, -E, -E, H));    // z=-E, normal +z
    quad(P(E, 0, E, -E, 0), P(-E, 0, E, E, 0), P(-E, H, E, E, H), P(E, H, E, -E, H));        // z=+E, normal -z
    quad(P(-E, 0, E, -E, 0), P(-E, 0, -E, E, 0), P(-E, H, -E, E, H), P(-E, H, E, -E, H));    // x=-E, normal +x
    quad(P(E, 0, -E, -E, 0), P(E, 0, E, E, 0), P(E, H, E, E, H), P(E, H, -E, -E, H));        // x=+E, normal -x
    gl.bindBuffer(gl.ARRAY_BUFFER, arenaBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  }
  let arenaOn = true;
  // 1×1 white texture — solid-color overlay draws through the FX program (hitboxes)
  const whiteTex = (() => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    return t;
  })();
  function drawArena(mvpModel) {
    gl.useProgram(arenaProg);
    gl.uniformMatrix4fv(arenaLocs.uMVP, false, mvpModel);
    gl.uniform1i(arenaLocs.uTex, 0);
    gl.bindTexture(gl.TEXTURE_2D, arenaTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, arenaBuf);
    gl.enableVertexAttribArray(arenaLocs.aPos);
    gl.enableVertexAttribArray(arenaLocs.aUV);
    gl.vertexAttribPointer(arenaLocs.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(arenaLocs.aUV, 2, gl.FLOAT, false, 20, 12);
    gl.disable(gl.CULL_FACE);
    gl.uniform3f(arenaLocs.uTint, 0.82, 0.81, 0.78);       // floor: slightly darker
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.uniform3f(arenaLocs.uTint, 1.0, 0.99, 0.96);        // walls: lighter panels
    gl.drawArrays(gl.TRIANGLES, 6, 24);
    gl.disable(gl.CULL_FACE);
    gl.disableVertexAttribArray(arenaLocs.aPos);
    gl.disableVertexAttribArray(arenaLocs.aUV);
  }

  // start zoomed out (full figure + blade-path + arena); user wheel-zooms freely.
  // Camera distance is USER-CONTROLLED ONLY — no auto-frame (see renderFrame).
  // start distance 10 (user): the doubled arena made the old 14 read too far out
  let yaw = 0.6, pitch = 0.15, dist = 10.0, userDist = 10.0, autoSpin = true;
  // FOLLOW camera (btnFollow, default ON): the orbit center tracks Kratos in
  // display space, so real root-motion travel stays framed. OFF = the classic
  // fixed-origin orbit. Smoothed toward the pelvis each rendered frame.
  let followCam = true;
  const camTgt = [0, 0, 0], camTgtGoal = [0, 0, 0];
  // pointer events (usability): ONE path for mouse + touch orbit, plus 2-finger
  // pinch zoom on touch. setPointerCapture keeps a drag that leaves the canvas.
  const ptrs = new Map();
  let pinchD0 = 0, pinchZ0 = 14;
  canvas.style.touchAction = "none"; // the canvas owns its gestures (no page scroll/zoom)
  canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch {} // stale/synthetic ids throw
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    autoSpin = false;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinchD0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      pinchZ0 = userDist;
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (ptrs.size === 1) {
      yaw += (e.clientX - p[0]) * 0.008;
      pitch = Math.max(-1.4, Math.min(1.5, pitch + (e.clientY - p[1]) * 0.006));
    }
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2 && pinchD0 > 0) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      userDist = Math.max(1.2, Math.min(26, pinchZ0 * (pinchD0 / Math.max(20, d))));
    }
  });
  const ptrEnd = (e) => ptrs.delete(e.pointerId);
  canvas.addEventListener("pointerup", ptrEnd);
  canvas.addEventListener("pointercancel", ptrEnd);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); userDist = Math.max(1.2, Math.min(26, userDist + e.deltaY * 0.002)); }, { passive: false });
  // camera presets (usability): canonical study angles. Kratos' combos advance
  // along -Z, so "front" looks from -Z back at his face; "top" reads the hitbox
  // sectors best (pitch near straight down).
  const CAM_PRESETS = {
    front: { yaw: Math.PI, pitch: 0.12 },
    side: { yaw: Math.PI / 2, pitch: 0.12 },
    top: { yaw: Math.PI, pitch: 1.5 },
  };
  function camPreset(name) {
    const p = CAM_PRESETS[name];
    if (!p) return;
    autoSpin = false;
    yaw = p.yaw; pitch = p.pitch;
  }

  let heat = 0;
  const JID = {};
  if (rig) for (const j of rig.obj.joints) JID[j.name] = j.id;
  const trailHist = { l: [], r: [] };
  // hitbox linger (btnHitbox): CHARACTER-ANCHORED display (the decoded Concussion
  // data proved GoW1 hit volumes anchor at the character, not the weapon). Each
  // attacking tick records Kratos' position + the live blade-tip reach (REAL
  // track); the overlay draws the reach envelope as ground circles around HIM,
  // fading over HITBOX_LINGER frames — plus the authored concussion rings.
  const hitboxHist = []; // {cx, cz, r, age} — character-centered reach samples
  const HITBOX_LINGER = 20;
  // REAL decoded CONCUSSION hit volumes (part1.pak /TweakTemplates/Concussion/NNN,
  // instances NAMED per attack — "BF Plume C", "3F Plume C", "7A Plume C", "Hero
  // Impale1/2"): hand-authored AoE spheres at the CHARACTER (zeroJoint), decoupled
  // from the blades. s/e = Start/End Radius in METERS, dur seconds, imp = Ground/Air
  // Impulse Away. The blade sweeps stay engine melee; these are the impact moves.
  // Move mapping (BF=base, 3F/7A=book enders) is INFERRED from the instance names.
  // Each attack pairs a "C" (collision — the s/e/dur here) with an "F" template
  // (fx: the authored VISUAL shockwave ring — different radii, always shown).
  const CONCUSSION = {
    comboLR3: { s: 2.0, e: 2.0, dur: 0.1, imp: 500, fx: { s: 4.5, e: 2.0, dur: 0.1 } },   // 007/008 "BF Plume C/F"
    combo3F:  { s: 2.75, e: 2.0, dur: 0.1, imp: 500, fx: { s: 4.25, e: 2.0, dur: 0.1 } }, // 011/012 "3F Plume C/F"
    combo7A:  { s: 2.5, e: 2.0, dur: 0.1, imp: 250, fx: { s: 3.5, e: 2.0, dur: 0.1 } },   // 009/010 "7A Plume C/F"
    airImpaleLand: { s: 4.0, e: 2.0, dur: 0.1, imp: 1000, fx: { s: 0, e: 4.0, dur: 0.35 } }, // 013/015 "Hero Impale1/FX"
  };
  // RAGE BRAWLING (decoded 2026-08-12): the berCombo*/berAir* melee acts author
  // the blades SHEATHED — their type-10 tracks pin BOTH tips at the dorsal
  // sheath (y≈26-32, |x|≤5, ≤1.5 m excursion all clip) while the HANDS do fast
  // 1.3 m strikes. Normal combos' tracks equal the hand at rest and whip to
  // 7 m. GoW1's Rage of the Gods is hand-to-hand: blade FX (trail/fire/tip
  // flash) are suppressed on these moves and the hits are the FISTS.
  const FIST_MOVES = /^ber(Combo|Air)/;
  // fall clips (ANIFall="fallv" in the Navigation action bank): airborne but
  // DESCENDING — they take the gravity path, never the air-attack hover
  const FALL_MOVES = /^(fallV|berFallN)$/;
  // ---- GoW1 stick locomotion + evades --------------------------------------
  // Left stick moves Kratos camera-relative, analog walk → run. Ground speeds
  // are DERIVED FROM THE CLIPS (the planted foot backslides at exactly the
  // authored ground speed): walkBlend1 1.74 m/s, walkBlend2 8.82 m/s, brawl
  // 1.55/9.65. The right stick is GoW1's EVADE (the game has no camera stick —
  // cameras are authored): flick to roll; roll distances are the evade clips'
  // REAL controller channels (front/back comp-422, left/right comp-420).
  // Turn rate + deflection thresholds are INFERRED (feel-tuned).
  const LOCO = {
    walk: 1.74 * ARENA_M, run: 8.82 * ARENA_M,
    bwalk: 1.55 * ARENA_M, brun: 9.65 * ARENA_M,
    TURN: 10,               // rad/s toward the stick heading (INFERRED)
    RUN_AT: 0.78, WALK_AT: 0.7, // deflection hysteresis (INFERRED)
  };
  const LOCO_STATE = /^(walkBlend[12]|berWalkBlend[12])$/;
  const GROUND_STANCE = /^(idleCombat2?|berserkIdle|walkBlend[12]|berWalkBlend[12])$/;
  const padStickL = { x: 0, y: 0 };
  let padEvade = null;   // one-shot camera-relative flick vector from the right stick
  let locoRun = false;
  // horizontal momentum (units/s): set while ground-moving, CARRIED through
  // jumps/falls (a running jump keeps its speed — INFERRED, the GoW feel; the
  // stick gets reduced mid-air steering authority), decayed by landing
  // friction, stalled by air attacks (the GoW hover).
  const locoVel = { x: 0, z: 0 };
  const AIR_CARRY = /^(jumpUp|jumpAir|jumpDoubleAir|fallV|berJumpAir|berJumpDoubleAir|berFallN)$/;
  const LAND_STATE = /^(land|runLand|combatLand2|berLand)$/;
  const AIR_STEER = 3.0;  // 1/s steering authority toward the stick mid-air (INFERRED)
  const LAND_FRICTION = 5.0; // 1/s momentum decay through the landing clip (INFERRED)
  // planar movement basis THROUGH THE CAMERA (user-corrected): the stick maps
  // through the RENDERED view matrix — its camera right/forward rows projected
  // onto the ground plane and normalized — not through hand-derived yaw trig.
  // Updated every rendered frame in renderFrame; near-top-down (forward
  // projects to ~zero) falls back to the projected camera-up, so "stick up"
  // stays "up the screen" even looking straight down.
  const camGround = { fx: -Math.sin(0.6), fz: -Math.cos(0.6), rx: Math.cos(0.6), rz: -Math.sin(0.6) };
  function updateCamGround(view) {
    let rx = view[0], rz = view[8];          // row 0 = camera right (world), planar
    let fx = -view[2], fz = -view[10];       // -row 2 = camera forward (world), planar
    if (fx * fx + fz * fz < 1e-6) { fx = view[1]; fz = view[9]; } // top-down: projected up
    const rl = Math.hypot(rx, rz) || 1, fl = Math.hypot(fx, fz) || 1;
    camGround.rx = rx / rl; camGround.rz = rz / rl;
    camGround.fx = fx / fl; camGround.fz = fz / fl;
  }
  function locoTick() {
    const st = machine.st;
    const cur = st.current;
    // airborne: carry the takeoff momentum, with reduced stick steering —
    // the running jump keeps travelling (user report: it stopped dead)
    if (AIR_CARRY.test(cur)) {
      padEvade = null;
      if (rootMotion.on && (locoVel.x || locoVel.z)) {
        const mag = Math.hypot(padStickL.x, padStickL.y);
        if (mag > 0.2) {
          const wx = camGround.rx * padStickL.x + camGround.fx * -padStickL.y;
          const wz = camGround.rz * padStickL.x + camGround.fz * -padStickL.y;
          const spd = Math.hypot(locoVel.x, locoVel.z);
          const k = Math.min(1, AIR_STEER * Loop.STEP);
          locoVel.x += (wx * spd - locoVel.x) * k;
          locoVel.z += (wz * spd - locoVel.z) * k;
        }
        rootMotion.x += locoVel.x * Loop.STEP;
        rootMotion.z += locoVel.z * Loop.STEP;
        // face the travel while airborne
        rootMotion.hd = Math.atan2(-locoVel.x, -locoVel.z);
      }
      return;
    }
    // landing: momentum bleeds off through the clip instead of cutting dead —
    // runLand (the rolling landing) keeps nearly all of it and hands straight
    // back to the run; the planted landings brake hard
    if (LAND_STATE.test(cur)) {
      padEvade = null;
      // roll-out: past the runLand plant, a held stick blends STRAIGHT into
      // the run — no one-tick idle hop between landing and locomotion
      if (cur === "runLand" && Math.hypot(padStickL.x, padStickL.y) > 0.2 && st.t / st.dur > 0.55) {
        machine.force(st.brawl ? (locoRun ? "berWalkBlend2" : "berWalkBlend1") : (locoRun ? "walkBlend2" : "walkBlend1"));
        return;
      }
      if (rootMotion.on && (locoVel.x || locoVel.z)) {
        rootMotion.x += locoVel.x * Loop.STEP;
        rootMotion.z += locoVel.z * Loop.STEP;
        const fr = cur === "runLand" ? 0.8 : LAND_FRICTION;
        const k = Math.max(0, 1 - fr * Loop.STEP);
        locoVel.x *= k; locoVel.z *= k;
      }
      return;
    }
    if (!GROUND_STANCE.test(st.current)) { padEvade = null; locoVel.x = locoVel.z = 0; return; }
    if (padEvade) {
      const e = padEvade;
      padEvade = null;
      // flick → world direction through the rendered camera basis, then
      // classify vs the FACING via dot products (the clips are character-local)
      const wx = camGround.rx * e.x + camGround.fx * -e.y, wz = camGround.rz * e.x + camGround.fz * -e.y;
      const fwdx = -Math.sin(rootMotion.hd), fwdz = -Math.cos(rootMotion.hd);
      const rgtx = Math.cos(rootMotion.hd), rgtz = -Math.sin(rootMotion.hd);
      const df = wx * fwdx + wz * fwdz, dr = wx * rgtx + wz * rgtz;
      const clip = Math.abs(df) >= Math.abs(dr) ? (df > 0 ? "evadeFront" : "evadeBack") : (dr > 0 ? "evadeRight" : "evadeLeft");
      machine.force(clip);
      log(`🌀 ${clip} (right-stick evade — REAL roll channel)`);
      return;
    }
    const mag = Math.hypot(padStickL.x, padStickL.y);
    if (mag > 0.2) {
      // stick → world direction through the rendered camera basis →
      // facing target (fwd(h) = (-sin h, -cos h))
      const wx = camGround.rx * padStickL.x + camGround.fx * -padStickL.y;
      const wz = camGround.rz * padStickL.x + camGround.fz * -padStickL.y;
      const tgt = Math.atan2(-wx, -wz);
      let d = tgt - rootMotion.hd;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const stepR = LOCO.TURN * Loop.STEP;
      rootMotion.hd += Math.abs(d) < stepR ? d : Math.sign(d) * stepR;
      locoRun = mag > (locoRun ? LOCO.WALK_AT : LOCO.RUN_AT);
      const want = st.brawl ? (locoRun ? "berWalkBlend2" : "berWalkBlend1") : (locoRun ? "walkBlend2" : "walkBlend1");
      if (st.current !== want) machine.force(want);
      const base = locoRun ? (st.brawl ? LOCO.brun : LOCO.run) : (st.brawl ? LOCO.bwalk : LOCO.walk) * Math.min(1, mag / LOCO.RUN_AT);
      locoVel.x = -Math.sin(rootMotion.hd) * base; // momentum, carried into jumps
      locoVel.z = -Math.cos(rootMotion.hd) * base;
      if (rootMotion.on) {
        rootMotion.x += locoVel.x * Loop.STEP; // along the facing
        rootMotion.z += locoVel.z * Loop.STEP;
      }
    } else {
      locoVel.x = locoVel.z = 0;
      if (LOCO_STATE.test(st.current)) {
        machine.force(st.idle());
        locoRun = false;
      }
    }
  }
  // ---------- target-dummy behavior (the undead legionnaire) ---------------
  // Idles + taunts on a beat; melee hits route through the REAL hit-reaction
  // suite by strike direction; concussions launch him with the DECODED impulse
  // values; death01/02 → corpse hold → the REAL spawn act raises him again.
  // HP 100 is INFERRED (his /TweakTemplates/Sold/020 stat template is decoded-
  // pending); damage = base × REAL weapon-level Dmg Mult × REAL costume mult.
  if (dummy) {
    dummy.x = 0; dummy.z = -5 * ARENA_M; dummy.hd = 0; // 5 m out; hd 0 = visual front +Z, toward center
    dummy.cur = "spawn"; dummy.t = 0;
    dummy.maxHp = 100; dummy.hp = 100;      // INFERRED
    dummy.tauntIn = 6;
    dummy.respawnIn = 0;
    dummy.kbx = 0; dummy.kbz = 0;           // knockback velocity (units/s)
    dummy.lastHitSeg = { l: -1, r: -1 };    // one melee hit per swing per blade
    dummy.hits = 0;
    dummy.lastWorld = null;
    dummy.dur = (n) => { const a = dummy.rig.anm.acts.get(n); return a ? a.duration : 1; };
    dummy.play = (n) => { if (dummy.rig.anm.acts.has(n)) { dummy.cur = n; dummy.t = 0; } };
  }
  const DUMMY_TAUNTS = ["taunt02", "taunt03", "taunt04"];
  // INFERRED display scale: the SKS skeleton is authored ~1.4× the hero's
  // numeric scale (rest head 45.4 u vs 34.0) with NO normalizing field found
  // in MDL/OBJ (MDL trailing floats hero 12.0 / SKS 5.0 noted but unproven).
  // 0.76 puts his posed height at ≈ Kratos' — the footage read. Tunable.
  const DUMMY_SCALE = 0.76;
  const DUMMY_MIN_SEP = 0.9 * ARENA_M; // body separation radius (INFERRED)
  // SKS VISUAL FRONT = +Z — OPPOSITE the hero (user-verified on screen; the
  // jaw-vector heuristic proved unreliable on the helmeted skull). Every
  // facing computation for the dummy routes through this offset.
  const DUMMY_FACE_OFFSET = Math.PI;
  const DUMMY_WALK = "Front";               // his walk clip
  const DUMMY_WALK_SPEED = 3.16 * ARENA_M;  // DERIVED: planted-foot on 'Front' × 0.76 scale
  const DUMMY_NEAR = 8 * ARENA_M;           // approach until 8 squares away (user)
  const KB_SCALE = 0.42; // units/s per impulse unit — INFERRED scale on the REAL impulses
  function dummyTick() {
    if (!dummy || !dummy.on) return;
    const STEP = Loop.STEP;
    dummy.t += STEP;
    const d = dummy.dur(dummy.cur);
    if (dummy.t >= d) {
      if (/^death/.test(dummy.cur)) {
        dummy.t = d - 0.001; // corpse hold
        dummy.respawnIn -= STEP;
        if (dummy.respawnIn <= 0) { dummy.hp = dummy.maxHp; dummy.play("spawn"); log("🦴 the legionnaire rises again"); }
      } else if (dummy.cur === "standIdle" || dummy.cur === DUMMY_WALK) {
        dummy.t %= d;
      } else if (dummy.cur === "hitLaunch" || dummy.cur === "hitBounce") {
        dummy.play("hitGetUp"); // launched → get up off the ground, like the game
      } else {
        dummy.play("standIdle");
      }
    }
    if (dummy.cur === "standIdle") {
      dummy.tauntIn -= STEP;
      if (dummy.tauntIn <= 0) {
        dummy.play(DUMMY_TAUNTS[(Math.random() * DUMMY_TAUNTS.length) | 0]);
        dummy.tauntIn = 5 + Math.random() * 5;
      }
    }
    // knockback slide (REAL Concussion impulses, INFERRED scale) + wall clamp
    if (dummy.kbx || dummy.kbz) {
      dummy.x += dummy.kbx * STEP; dummy.z += dummy.kbz * STEP;
      const k = Math.max(0, 1 - 6 * STEP);
      dummy.kbx *= k; dummy.kbz *= k;
      if (Math.abs(dummy.kbx) + Math.abs(dummy.kbz) < 1) dummy.kbx = dummy.kbz = 0;
      const lim = ARENA_HALF - ARENA_M;
      dummy.x = Math.max(-lim, Math.min(lim, dummy.x));
      dummy.z = Math.max(-lim, Math.min(lim, dummy.z));
    }
    // face the hero (user: 'they are not facing each other') — enemies track
    // their target. Eased turn, held during hit reactions/death so the
    // direction-relative reaction clips stay coherent. fwd(hd) = (−sin,−cos)
    // → face (tx,tz) at hd = atan2(−tx,−tz). Turn rate INFERRED.
    if (!/^(death|hit)/.test(dummy.cur)) {
      const tx = rootMotion.x - dummy.x, tz = rootMotion.z - dummy.z;
      const dist = Math.hypot(tx, tz);
      if (dist > 0.5) {
        const tgt = Math.atan2(-tx, -tz) + DUMMY_FACE_OFFSET; // his visual front is +Z
        let dh = tgt - dummy.hd;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const turn = 6 * STEP;
        dummy.hd += Math.abs(dh) < turn ? dh : Math.sign(dh) * turn;
      }
      // approach (user): walk toward Kratos until within 8 squares, using his
      // own walk clip at its derived ground speed
      if (!/^(spawn|taunt)/.test(dummy.cur)) {
        if (dist > DUMMY_NEAR) {
          if (dummy.cur !== DUMMY_WALK) dummy.play(DUMMY_WALK);
          dummy.x += (tx / dist) * DUMMY_WALK_SPEED * STEP;
          dummy.z += (tz / dist) * DUMMY_WALK_SPEED * STEP;
        } else if (dummy.cur === DUMMY_WALK) {
          dummy.play("standIdle");
        }
      }
    }
    // body separation: Kratos walks, the dummy yields (no standing inside
    // each other — GoW pushes the enemy out of the hero's radius)
    if (rootMotion.on) {
      const sx = dummy.x - rootMotion.x, sz = dummy.z - rootMotion.z;
      const sd = Math.hypot(sx, sz);
      if (sd > 0.01 && sd < DUMMY_MIN_SEP) {
        const push = (DUMMY_MIN_SEP - sd) * 0.35; // eased shove
        dummy.x += (sx / sd) * push;
        dummy.z += (sz / sd) * push;
      }
    }
    const w = dummy.rig.computePose(dummy.cur, Math.min(dummy.t, d - 0.0001));
    for (let i = 0; i < w.length; i += 16) {
      for (let k = 0; k < 15; k++) w[i + k] *= DUMMY_SCALE; // uniform display scale
    }
    applyXformTo(w, dummy.hd, dummy.x, 0, dummy.z);
    if (!dummy.lastWorld) dummy.lastWorld = new Float32Array(w.length);
    dummy.lastWorld.set(w);
  }
  // route a landed hit into the reaction suite (direction-relative clips)
  function dummyHit(dmg, fromX, fromZ, launch, impulse) {
    if (!dummy || !dummy.on || /^death/.test(dummy.cur) || dummy.cur === "spawn") return false;
    dummy.hp = Math.max(0, dummy.hp - dmg);
    dummy.hits++;
    // impact flash + sparks ON the dummy (chest ≈ vertebrae2 height)
    const cx = dummy.lastWorld ? dummy.lastWorld[2 * 16 + 12] : dummy.x;
    const cy = dummy.lastWorld ? dummy.lastWorld[2 * 16 + 13] : 18;
    const cz = dummy.lastWorld ? dummy.lastWorld[2 * 16 + 14] : dummy.z;
    if (flasherTex) fxPool.spawn({ pos: [cx, cy, cz], vel: [0, 0, 0], size: 5.0, life: 7 * Loop.STEP, color: [1, 1, 1, 2.2], kind: "hitFlash" });
    if (launch && impulse) {
      // REAL Ground Impulse Away, scaled (KB_SCALE INFERRED) along away-vector
      const ax = dummy.x - fromX, az = dummy.z - fromZ;
      const al = Math.hypot(ax, az) || 1;
      dummy.kbx = (ax / al) * impulse * KB_SCALE;
      dummy.kbz = (az / al) * impulse * KB_SCALE;
    }
    if (dummy.hp <= 0) {
      dummy.play(Math.random() < 0.5 ? "death01" : "death02");
      dummy.respawnIn = 2.2;
      log("💀 legionnaire destroyed — " + dummy.hits + " hits taken");
      return true;
    }
    if (launch) { dummy.play("hitLaunch"); return true; }
    // strike direction vs his VISUAL facing (+Z model front) picks the clip
    const ix = dummy.x - fromX, iz = dummy.z - fromZ; // incoming blow direction
    const fwdx = Math.sin(dummy.hd), fwdz = Math.cos(dummy.hd);
    const rgtx = -Math.cos(dummy.hd), rgtz = Math.sin(dummy.hd);
    const df = ix * fwdx + iz * fwdz, dr = ix * rgtx + iz * rgtz;
    dummy.play(Math.abs(df) >= Math.abs(dr) ? (df > 0 ? "hitBack" : "hitFront") : (dr > 0 ? "hitLeft" : "hitRight"));
    return true;
  }
  const ringHist = []; // live concussion DEBUG rings {cx,cz, s,e,durTicks, age} (Hitboxes overlay)
  const fxRings = [];  // live SHOCKWAVE visuals {cx,cz, s,e,durTicks, age} — REAL "F"-template radii/timing, always shown
  // Concussion TRIGGER TIME (derived from REAL data): the slam is where the move's
  // comp-422 controller displacement completes — first t reaching 90% of the clip's
  // net travel. (The hit-counter edge fires at move START, spawning the ring where
  // Kratos WAS before the leap — the reported mis-placement.) Fallback 0.7×dur.
  function concussionTime(move) {
    const cd = CONCUSSION[move];
    if (!cd) return null;
    if (cd.tStar === undefined) {
      const dur = DUR[move] || 1;
      cd.tStar = 0.7 * dur; // INFERRED fallback
      const d0 = rig.rootDisp(move, 0), d1 = rig.rootDisp(move, dur);
      if (d0 !== null && d1 !== null && Math.abs(d1 - d0) > 1) {
        for (let k = 0; k <= Math.round(dur * 30); k++) {
          const t = k / 30;
          if (Math.abs(rig.rootDisp(move, t) - d0) >= 0.9 * Math.abs(d1 - d0)) { cd.tStar = t; break; }
        }
      }
    }
    return cd.tStar;
  }
  // Segment tracking: a push gap (attacking paused between combo moves) starts a NEW
  // segment — each swing gets its OWN swoosh decal + ribbon strip. Connecting across
  // gaps stretched quads between disjoint arcs (hard radial cuts) and spread one
  // decal over multiple swings (only the last swing got the bright leading section).
  const trailSeg = { l: { last: -9, id: 0 }, r: { last: -9, id: 0 } };
  const TRAIL_AGE = 0.6;   // INFERRED: row lifetime = the 0.35s window + post-swing dissolve margin (rows beyond the window sample the decal's black end anyway)

  // ---- blade transforms from the game's authored type-10 tracks ------------
  // Each act stores per-frame world-space positions for both blades
  // (stream 0 = left, stream 1 = right; verified against the idle hand
  // positions). Gripped when the track sits at the hand; flying otherwise,
  // tip (-Z) leading along the track velocity.
  const CHAIN_LEN = 14; // ribbon slack reference only
  // REAL decoded Blades FX tweak values — reversed from part1.pak's /Player/ tweak tree
  // (GoW1 node hash h*127+c, mogaika utils/hash.go; "Weapon Level 1" subdir). These are
  // the game's own designer values (not inferred). See memory: elf-fx-tweak-schema.
  const TWK_FX = {
    trailTint:   [1.0, 1.0, 1.0, 0.8], // Trail Tint R/G/B/A — white tint, 0.8 opacity
    glowDiameter: 0.18,                // Glow Diameter
    bladeDamping: 0.4,                 // Blade Damping (drives the DEFERRED Phase-4 chain solver)
    bladeScale:   1.0,                 // Blade Scale In-Hand / On-Back / Out
    nominalParticles: 36,              // Nominal Particles — CONFIRMED the BLOOD/gore emitter's (GlobGame "goBloodSpot"), NOT blade fire
    emitTime: 3.0,                     // Emit Time — same blood emitter (blade-fire params live in the undecoded FXC binaries)
  };
  // Trail geometry: a SWEPT BLADE-EDGE ribbon. Each history row is the blade's world
  // LENGTH (hilt→tip); consecutive rows are connected into the surface the blade edge
  // swept. Because driveBlade now orients the flying blade radially (length ⟂ the swing),
  // the edge lies across the motion, so the swept surface is a wide smooth sheet that
  // sheds off the whole back edge of the blade — not a point-source fan at the hilt.
  const TRAIL_EXT = 0.15; // INFERRED overhang past hilt/tip (fraction of blade length) for a fuller sheet
  // Trail window: INFERRED (footage-calibrated, user-validated). NO decoded trail
  // duration exists: the /Player/ "Weapon Length" per Costume 0-5 sits among pure
  // gameplay multipliers (Damage/AI Damage/Orb Mults, Infinite Magic — all hashes
  // cracked against ELF strings) = the weapon's gameplay REACH per costume, and
  // "God Mode" in that tree means RAGE (God Mode Dmg/Meter Drain/Tint), so the
  // earlier "God-Mode pairing = trail parameter" inference was invalid.
  const TRAIL_WINDOW_S = 0.35;
  const SWOOSH_ROWS = Math.round(TRAIL_WINDOW_S * 60); // decal spans this fixed window behind the blade; long swings shed rows off its dark end
  // CHAIN-03 chain-glow combat gains (D-05, A2 — INFERRED, footage-calibrated in
  // Phase 7). No decoded state-gate field exists (verified Phase 5), so the dark<->hot
  // RULE is INFERRED; the brightness it drives is data-grounded (alpha-over-1.0,
  // CLAUDE.md Part 1) and the COLOR stays the decoded chainglow texel (Pitfall 4 — no
  // hand-picked glow color). GLOW_REST is small (dark links at rest); GLOW_HOT > 1.0
  // (a hot streak that exceeds the 1.0 clamp) — this is the 03-02 "glow too subtle"
  // lever, closed data-grounded. Fed through the tested-pure Particles.glowGain.
  const GLOW_REST = 0.3;   // INFERRED — dim glow at rest (dark links)
  const GLOW_HOT = 1.8;    // INFERRED — bright hot streak on attack (>1.0, alpha-over-1.0)
  const bladeSim = {
    l: { mat: new Float32Array(16), pos: null, chain: null },
    r: { mat: new Float32Array(16), pos: null, chain: null },
  };

  function driveBlade(sim, world, hand, trackPos, dt) {
    const handM = world.subarray(hand * 16, hand * 16 + 16);
    const anchor = [handM[12], handM[13], handM[14]];
    const pos = trackPos ? [trackPos[0], trackPos[1], trackPos[2]] : anchor;
    sim.pos = pos;
    const distToHand = Math.hypot(pos[0] - anchor[0], pos[1] - anchor[1], pos[2] - anchor[2]);
    if (distToHand < 2.0) {
      // gripped: follow the hand frame at the authored position
      sim.mat.set(handM);
      sim.mat[12] = pos[0]; sim.mat[13] = pos[1]; sim.mat[14] = pos[2];
    } else {
      // flying: the blade length axis = the hand→blade line, so the swept blade-edge
      // (the trail below) lies across the tangential swing and sheds a sheet off the
      // whole blade. The visible MESH is rolled 90° about this length axis at render
      // (BLADE_ROLL) so its edge — not its flat — faces the cut; that roll never moves
      // the length axis, so the trail is unaffected.
      const zx = -(pos[0] - anchor[0]) / distToHand;
      const zy = -(pos[1] - anchor[1]) / distToHand;
      const zz = -(pos[2] - anchor[2]) / distToHand;
      let xx = -zz, xy = 0, xz = zx;
      const xl = Math.hypot(xx, xy, xz) || 1;
      xx /= xl; xz /= xl;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      sim.mat.set([xx, xy, xz, 0, yx, yy, yz, 0, zx, zy, zz, 0, pos[0], pos[1], pos[2], 1]);
    }
    return sim.mat;
  }

  function lerp3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function xformM(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ];
  }

  function xform(world, j, p) {
    const o = j * 16;
    return [
      world[o] * p[0] + world[o + 4] * p[1] + world[o + 8] * p[2] + world[o + 12],
      world[o + 1] * p[0] + world[o + 5] * p[1] + world[o + 9] * p[2] + world[o + 13],
      world[o + 2] * p[0] + world[o + 6] * p[1] + world[o + 10] * p[2] + world[o + 14],
    ];
  }

  // Render-side derived state (REND-03 split): CPU skinning of the current
  // sim pose + GPU upload. Runs once per RENDERED frame — never per sim tick;
  // skinning 7.4k verts is the expensive half, and an unchanged pose costs
  // nothing extra on a 144Hz display. Reads skin.blendLeft but never
  // decrements it — sim time is owned exclusively by simStep().
  function uploadSkinnedVerts() {
    if (!rig || !skin || !skin.lastWorld) return;
    let prevOut = null;
    if (skin.blendLeft > 0 && skin.prevAct) {
      const saved = skin.out;
      skin.out = new Float32Array(saved.length);
      // ADVANCING cross-fade (user-reported mushy transitions): the outgoing
      // clip keeps PLAYING through the blend window instead of freezing at the
      // seam — a frozen prev pose dragged against the incoming motion.
      const pt = Math.min(skin.prevTime + (skin.blendDur - skin.blendLeft), DUR[skin.prevAct] || skin.prevTime);
      const pw = rig.computePose(skin.prevAct, pt);
      // the PREV pose gets the FULL root transform — heading rotation, the
      // prev horizontal base (px/pz, constructed for seam continuity) and the
      // CURRENT vertical. Without the heading, any transition while facing
      // != 0 blended a rotated pose against an unrotated one (the big smear).
      if (rootMotion.on) applyRootXformTo(pw, rootMotion.px, rootMotion.y, rootMotion.pz);
      else applyRootXformTo(pw, 0, 0, 0); // heading still applies with root motion off
      skinPose(pw);
      prevOut = skin.out;
      skin.out = saved;
    }
    skinPose(skin.lastWorld);
    const outPos = skin.out;
    if (prevOut) {
      const f = 1 - skin.blendLeft / skin.blendDur;
      for (let i = 0; i < outPos.length; i++) outPos[i] = prevOut[i] * (1 - f) + outPos[i] * f;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, outPos);
  }

  // chaikinRows: one corner-cutting pass over a row polyline (both edges + u/alpha
  // interpolated). The 60Hz-sampled tip path (30fps authored tracks, lerped) shows
  // jagged corners between rows on fast sweeps; two passes quadruple the rows into
  // a smooth arc. First/last rows are kept EXACT so the live edge stays on the blade.
  function chaikinRows(rows) {
    if (rows.length < 3) return rows;
    const lerpRow = (p, q, t) => ({
      a: [p.a[0] + (q.a[0] - p.a[0]) * t, p.a[1] + (q.a[1] - p.a[1]) * t, p.a[2] + (q.a[2] - p.a[2]) * t],
      b: [p.b[0] + (q.b[0] - p.b[0]) * t, p.b[1] + (q.b[1] - p.b[1]) * t, p.b[2] + (q.b[2] - p.b[2]) * t],
      u: p.u + (q.u - p.u) * t, alpha: p.alpha + (q.alpha - p.alpha) * t,
    });
    const out = [rows[0]];
    for (let i = 0; i < rows.length - 1; i++) {
      out.push(lerpRow(rows[i], rows[i + 1], 0.25), lerpRow(rows[i], rows[i + 1], 0.75));
    }
    out.push(rows[rows.length - 1]);
    return out;
  }

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

  // drawPool(mvp, view, batchTex) — submit the shared billboard particle pool
  // (D-02). ONE bufferSubData rewrite of the active particles then ONE additive-
  // premult batch through Fx.applyMaterial (no hardcoded blendFunc/depthMask —
  // DEC-01). Called from drawFx BEFORE restoreFxState; an empty pool draws
  // nothing and leaves fxState() clean. The sprite is bound PER BATCH by the
  // caller's family (this plan's only batch = trail-spark riders on trailTex);
  // later slices (fire 06-05) bind their own decoded sprite.
  function drawPool(mvp, view, batchTex, opts) {
    const kinds = (opts && opts.kinds) || null;  // Set of kinds to include; null = all (back-compat)
    const tint = (opts && opts.tint) || null;    // REAL decoded rgb override (fire: db.meta.colorSource)
    const stretch = (opts && opts.stretch) || 0; // FIRE-02: >0 = velocity-aligned stretch factor (spark batch)
    // WR-02: the tint override is a SEPARATE, untrusted path sourced from decoded
    // MAT_pticleMat.blendColor (db.meta.colorSource.value) — read via getFloat32 with
    // no finite check anywhere upstream. The per-particle guard below covers pos/vel/
    // size/alpha but NOT this batch-constant tint, so a NaN/Infinity disc byte would
    // pack straight into poolVerts -> bufferSubData. Validate the packed RGB ONCE here
    // (Phase requirement 2 / V5); fall back to the per-particle color (spawn already
    // guarantees it finite) when the tint is non-finite so NO NaN ever uploads.
    const safeTint =
      tint && Number.isFinite(tint[0]) && Number.isFinite(tint[1]) && Number.isFinite(tint[2]) ? tint : null;
    const parts = fxPool.particles;
    const n = Math.min(parts.length, POOL_CAP);
    if (n === 0) return;                       // empty pool → nothing; state stays clean
    // Camera right/up in world space = the view matrix's row-0/row-1 (columns of
    // its transpose). modelMat is a uniform scale + translate (NO rotation), so
    // these world directions are also valid in the mesh-local space aCenter lives
    // in — the pool centers ride the same coords as the trail/chain verts.
    let rx = view[0], ry = view[4], rz = view[8];
    let ux = view[1], uy = view[5], uz = view[9];
    const rl = Math.hypot(rx, ry, rz) || 1, ul = Math.hypot(ux, uy, uz) || 1;
    rx /= rl; ry /= rl; rz /= rl; ux /= ul; uy /= ul; uz /= ul;
    const V = poolVerts;
    let o = 0, drawn = 0;
    for (let i = 0; i < n; i++) {
      const q = parts[i];
      if (kinds && !kinds.has(q.kind)) continue;   // batch by particle family (D-02)
      const p = q.pos, c = q.color, size = q.size, vel = q.vel;
      // per-particle fade: peak alpha128 (c[3], INFERRED overbright) × life-left.
      const fade = q.life > 0 ? Math.max(0, 1 - q.age / q.life) : 0;
      const a = (c && c.length > 3 ? c[3] : 1) * fade;
      // Guard non-finite BEFORE the value reaches bufferSubData (V5 / T-06-04-03,
      // T-06-06-02). Particles.spawn already rejects non-finite inputs at emission;
      // this is defense-in-depth for the runtime-derived fade/size AND the spark
      // stretch velocity (a NaN aVel → a degenerate stretch axis) so NaN never uploads.
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2]) ||
          !Number.isFinite(vel[0]) || !Number.isFinite(vel[1]) || !Number.isFinite(vel[2]) ||
          !Number.isFinite(size) || !Number.isFinite(a)) continue;
      // Fire batch overrides per-particle rgb with the REAL decoded fire color
      // (tint = db.meta.colorSource / MAT_pticleMat.blendColor [2,2,2,1] overbright);
      // the per-particle alpha128 (INFERRED overbright peak) is UNTOUCHED, so the
      // additive-premult fragment (rgb·alpha128, ONE,ONE) recovers GS brightness
      // ABOVE the 1.0 clamp (CLAUDE.md Part 1 alpha-over-1.0). Spark batch: no tint,
      // per-particle rgb as-is. NO fabricated crimson anywhere (Pitfall 4).
      const cr = safeTint ? safeTint[0] : (c ? c[0] : 1);
      const cg = safeTint ? safeTint[1] : (c ? c[1] : 1);
      const cb = safeTint ? safeTint[2] : (c ? c[2] : 1);
      for (let k = 0; k < 4; k++) {
        const cor = POOL_CORNERS[k];
        V[o++] = p[0]; V[o++] = p[1]; V[o++] = p[2];       // aCenter (mesh-local)
        V[o++] = cor[0] * size; V[o++] = cor[1] * size;     // aCorner (±size)
        V[o++] = cor[2]; V[o++] = cor[3];                   // aUV
        V[o++] = cr; V[o++] = cg; V[o++] = cb; V[o++] = a;  // aColor rgb + alpha128
        V[o++] = vel[0]; V[o++] = vel[1]; V[o++] = vel[2];  // aVel (FIRE-02 spark stretch axis)
      }
      drawn++;
    }
    if (drawn === 0) return;
    gl.useProgram(poolProg);
    gl.uniformMatrix4fv(poolLocs.uMVP, false, M.mul(mvp, modelMat)); // aCenter is mesh-local
    gl.uniform3f(poolLocs.uCamRight, rx, ry, rz);
    gl.uniform3f(poolLocs.uCamUp, ux, uy, uz);
    gl.uniform1f(poolLocs.uStretch, stretch);   // FIRE-02: 0 = billboard, >0 = velocity stretch
    const uvr = (opts && opts.uvRect) || [0, 0, 1, 1]; // sprite sub-rect (swoosh-decal batches pass the ember corner)
    gl.uniform4f(poolLocs.uUVRect, uvr[0], uvr[1], uvr[2], uvr[3]);
    gl.uniform1i(poolLocs.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, poolVertBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, V.subarray(0, drawn * 4 * POOL_FLOATS_PER_VERT));
    gl.enableVertexAttribArray(poolLocs.aCenter);
    gl.enableVertexAttribArray(poolLocs.aCorner);
    gl.enableVertexAttribArray(poolLocs.aUV);
    gl.enableVertexAttribArray(poolLocs.aColor);
    gl.enableVertexAttribArray(poolLocs.aVel);
    gl.vertexAttribPointer(poolLocs.aCenter, 3, gl.FLOAT, false, POOL_STRIDE, 0);
    gl.vertexAttribPointer(poolLocs.aCorner, 2, gl.FLOAT, false, POOL_STRIDE, 12);
    gl.vertexAttribPointer(poolLocs.aUV, 2, gl.FLOAT, false, POOL_STRIDE, 20);
    gl.vertexAttribPointer(poolLocs.aColor, 4, gl.FLOAT, false, POOL_STRIDE, 28);
    gl.vertexAttribPointer(poolLocs.aVel, 3, gl.FLOAT, false, POOL_STRIDE, 44);
    gl.disable(gl.CULL_FACE);
    // Blend + depth ONLY from the MAT table (DEC-01): the new additivePremult
    // mode (ONE,ONE + FUNC_ADD + depthMask off). No hardcoded blendFunc here. Each
    // batch (spark riders / blade fire) applies + logs its own pass so fxState()
    // proves the additive/depth-off discipline per family.
    const batchName = (opts && opts.name) || "fxPool";
    Fx.applyMaterial(gl, { name: batchName, mode: "additivePremult", disableDepthWrite: true });
    fxLog.push({ name: batchName, mode: "additivePremult", depthWrite: false, count: drawn });
    gl.bindTexture(gl.TEXTURE_2D, batchTex);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, poolIdxBuf);
    gl.drawElements(gl.TRIANGLES, drawn * 6, gl.UNSIGNED_SHORT, 0);
    // Disable the pool's attrib arrays so they never leak into the next mesh/FX
    // draw (which re-point their own attribs, but a leftover enabled array at
    // these locations still pointing at poolVertBuf can trip some drivers).
    gl.disableVertexAttribArray(poolLocs.aCenter);
    gl.disableVertexAttribArray(poolLocs.aCorner);
    gl.disableVertexAttribArray(poolLocs.aUV);
    gl.disableVertexAttribArray(poolLocs.aColor);
    gl.disableVertexAttribArray(poolLocs.aVel);
  }

  // IN-01: the INFERRED per-variant tint (Phase-7 footage-tunable) shared by the
  // trail-sheet ramp stops (drawFx) and the impact-spark tint (simStep) so one
  // tuning edit can't silently desync the sparks from the trail. BGT pulls a color
  // toward white by whiteK; BFT keeps red and damps green/blue to crimson (whiteK
  // ignored). NO fabricated real color — the inputs are the INFERRED runtime ramp
  // stops (Particles.rampColor), never a decoded field (Pitfall 4).
  function variantTint(variant, c, whiteK) {
    return variant === "BGT"
      ? [c[0] + (1 - c[0]) * whiteK, c[1] + (1 - c[1]) * whiteK, c[2] + (1 - c[2]) * whiteK]
      // BFT (fire trail): keep the warm AMBER/GOLD ramp — GoW1's swing trail reads gold,
      // not crimson. Only a light warm shift (was ×0.50/×0.45, which crushed it to red).
      : [c[0], c[1] * 0.88, c[2] * 0.62];
  }

  function drawFx(mvp, view) {
    fxLog.length = 0;
    if (!blade || !skin || !skin.lastWorld) return;
    const world = skin.lastWorld;
    const chainV = [], glowV = [], trailV = [];
    for (const [key, handN, chainN] of [["l", "lWeapIH", "lChain"], ["r", "rWeapIH", "rChain"]]) {
      const hand = JID[handN], chainJ = JID[chainN];
      if (hand !== undefined && chainJ !== undefined && bladeSim[key].pos) {
        // chain ribbon: forearm chain joint -> simulated blade pommel;
        // taut when the blade flies, saggy when gripped. Sample the sag curve
        // (Phase 4 swaps this sampler for a real solver — the walker stays
        // curve-agnostic), then hand the points to the pure arc-length link-
        // walker (chain.js): one 32px link cell per LINK_PITCH with an
        // alternating ~90° twist — countable segmented links with visible alpha
        // gaps, NOT the old squashed flat strip (`u = t·reps`).
        const a = [world[chainJ * 16 + 12], world[chainJ * 16 + 13], world[chainJ * 16 + 14]];
        const bpt = xformM(bladeSim[key].mat, blade.hilt);
        const d = [bpt[0] - a[0], bpt[1] - a[1], bpt[2] - a[2]];
        const len = Math.hypot(...d) || 1;
        const slack = Math.max(0, 1 - len / CHAIN_LEN);
        const CURVE_SAMPLES = 64;
        const curvePts = [];
        for (let i = 0; i <= CURVE_SAMPLES; i++) {
          const t = i / CURVE_SAMPLES;
          const sag = Math.sin(Math.PI * t) * (0.4 + len * 0.35 * slack);
          curvePts.push([a[0] + d[0] * t, a[1] + d[1] * t - sag, a[2] + d[2] * t]);
        }
        const chain = Chain.buildRibbon(curvePts, Chain.LINK_PITCH);
        bladeSim[key].chain = chain; // stash per side for KratosLab.chainInfo()
        for (let i = 0; i < chain.verts.length; i++) chainV.push(chain.verts[i]);
        // glow halo ribbon: same walk, wider by the REAL decoded Glow/Link
        // diameter ratio (0.18/0.13 — /Player/ Glow Diameter & Link Diameter;
        // unit-free ratio, so no physics↔mesh unit bridge needed). Gives the
        // chainglow its own geometry instead of reusing the link bytes.
        const glowChain = Chain.buildRibbon(curvePts, Chain.LINK_PITCH, { widthScale: Chain.GLOW_OVER_LINK });
        for (let i = 0; i < glowChain.verts.length; i++) glowV.push(glowChain.verts[i]);
      }
      const hst = trailHist[key];
      if (hst.length >= 2) {
        // PER-SEGMENT swoosh ribbons: split the history at push gaps (e.seg — each
        // swing is its own segment) and emit ONE ribbon + ONE decal per segment.
        // Connecting across gaps stretched quads between disjoint arcs (hard radial
        // cuts) and spread one decal over several swings (only the last swing got
        // the bright leading section) — footage gives every slash its own crescent.
        const segs = [];
        let cur = null, curSeg = null;
        for (const e of hst) {
          if (!cur || e.seg !== curSeg) { cur = []; segs.push(cur); curSeg = e.seg; }
          cur.push(e);
        }
        for (const seg of segs) {
          if (seg.length < 2) continue;
          const n = seg.length;
          const rows = seg.map((e, i) => {
            // FIXED-WINDOW decal: fresh = 1 at the leading edge, reaching 0 exactly
            // SWOOSH_ROWS behind it — the graphic is a constant-length stamp trailing
            // the blade. Rows older than the window clamp to 0 and sample the decal's
            // black end (invisible), so a long swing sheds its tail instead of
            // STRETCHING one swoosh across the whole arc. Short jabs compress it.
            const fresh = Math.max(0, 1 - (n - 1 - i) / SWOOSH_ROWS);
            // Row cross-section = the FROZEN world span the assembly swept at this
            // sample: hand (grip/chain anchor) → blade tip (+ small blade-axis
            // overhang). Endpoints never morph after creation — the old geometric
            // taper slid each row's inner edge as it aged, which read as UVs CYCLING
            // up the chain. The crescent's narrowing comes from the decal itself
            // (dark inner band + dark tail — the bright corner falls off both ways).
            const hand = e.hand || e.hilt;
            const dx = e.tip[0] - e.hilt[0], dy = e.tip[1] - e.hilt[1], dz = e.tip[2] - e.hilt[2];
            return {
              a: hand,
              b: [e.tip[0] + dx * TRAIL_EXT, e.tip[1] + dy * TRAIL_EXT, e.tip[2] + dz * TRAIL_EXT],
              // u = ONE decal per SEGMENT (0 tail -> 1 leading edge): the complete
              // swoosh graphic rides each swing like a stamp, never tiled and never
              // shared across swings. The fragment maps it 90°-rotated (long axis
              // along the chain, band rows along the sweep).
              u: fresh, alpha: Math.max(0, 1 - e.age / TRAIL_AGE),
            };
          });
          // sample-level de-jitter first: the 30fps-authored tracks lerped at 60Hz
          // can zigzag on alternate samples, which corner-cutting alone only halves.
          // Neighbor-average each interior row (first/last kept exact — the live
          // edge stays on the blade), THEN two corner-cutting passes → smooth arc.
          for (let i = 1; i < rows.length - 1; i++) {
            const p = rows[i - 1], c = rows[i], q = rows[i + 1];
            for (let k = 0; k < 3; k++) {
              c.a[k] = (p.a[k] + 2 * c.a[k] + q.a[k]) * 0.25;
              c.b[k] = (p.b[k] + 2 * c.b[k] + q.b[k]) * 0.25;
            }
          }
          pushRibbon(chaikinRows(chaikinRows(rows)), trailV);
        }
      }
    }
    // Reach the pool pass even when chain/trail are empty (the pool draws its own
    // program/buffer). An empty pool no-ops inside drawPool, so state stays clean.
    if (!chainV.length && !trailV.length && fxPool.count === 0) return;
    gl.useProgram(fxProg);
    gl.uniformMatrix4fv(fxLocs.uMVP, false, mvp);
    gl.uniformMatrix4fv(fxLocs.uM, false, modelMat);
    gl.uniform1i(fxLocs.uTex, 0);
    // CHAIN-03 leak guard (T-06-07-01): reset the glow premult flag at the TOP of
    // every drawFx so a mid-phase render is deterministic — only the chainglow PASS 2
    // turns it on, and the trail pass turns it back off. Off => the fxProg fragment
    // takes the normal (non-premult) path for the link/trail passes.
    gl.uniform1f(fxLocs.uGlowGain, 0.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf);
    gl.enableVertexAttribArray(fxLocs.aP);
    gl.enableVertexAttribArray(fxLocs.aT);
    gl.vertexAttribPointer(fxLocs.aP, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(fxLocs.aT, 3, gl.FLOAT, false, 24, 12);
    gl.disable(gl.CULL_FACE);
    // Every FX pass takes its FULL blend/depth state from its decoded MAT via
    // Fx.applyMaterial — no hardcoded blendFunc/depthMask here (DEC-01).
    if (chainV.length) {
      const chainVerts = new Float32Array(chainV);
      const chainVertCount = chainV.length / 6;

      // The age->color ramp is a swordtrail-ONLY tint — keep it OFF for both
      // chain passes so it never bleeds into the decoded chain/glow texels
      // (T-06-03-01). The trail pass below re-enables it.
      gl.uniform1f(fxLocs.uTrailRamp, 0.0);

      // PASS 1 — links: real decoded state = usual alpha blend + depth-write ON
      // (MAT_chainlink 0x44010080). The ONLY pass that uploads. RAGE swaps the
      // whole decoded god-mode mat+texture set (REAL assets).
      const rage = machine.st.rage && godChainlinkTex && godChainglowTex;
      const matL = rage ? matDb.byName.MAT_godchainlink : matDb.byName.MAT_chainlink;
      Fx.applyMaterial(gl, matL);
      fxLog.push({ name: matL.name, mode: matL.mode, depthWrite: !matL.disableDepthWrite });
      // __fxBright (debug): overbright the dark metal so the segmented link
      // geometry is legible WITHOUT the chainglow. Inspection aid only — real
      // visibility comes from the PASS-2 glow overlay below.
      gl.uniform3fv(fxLocs.uMaterialColor, window.__fxBright ? [8, 8, 8] : matL.materialColor);
      gl.uniform4fv(fxLocs.uLayerColor, matL.blendColor);
      gl.uniform1f(fxLocs.uCutoff, 0.35); // INFERRED cutout threshold (02-RESEARCH A3)
      gl.bindTexture(gl.TEXTURE_2D, rage ? godChainlinkTex : chainlinkTex);
      gl.bufferData(gl.ARRAY_BUFFER, chainVerts, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, chainVertCount);

      // PASS 2 — chainglow: additive-PREMULT + depth-write OFF, on its OWN ribbon
      // widened by the REAL decoded Glow/Link diameter ratio (0.18/0.13 from
      // /Player/ — the halo extends past the link edges, as the data says; depth
      // is only READ here, so the wider silhouette depth-tests correctly against
      // the scene). CHAIN-03 (D-05, A2): the
      // glow is combat-GATED (dark at rest -> hot streak on attack) and BRIGHTENED
      // through the alpha-over-1.0 path (CLAUDE.md Part 1) — the fragment premultiplies
      // the DECODED glow texel by (alpha128 * uGlowGain) and blends ONE,ONE, so a gain
      // > 1.0 pushes the glow ABOVE the 1.0 clamp (closing the 03-02 "glow too subtle"
      // lever, data-grounded). The heat-ramp COLORS still come straight from the decoded
      // MAT_chainglow texture (identity material/blend -> texels pass through); there is
      // NO hand-picked glow color (Pitfall 4) — only the gain rule + GLOW_REST/GLOW_HOT
      // are INFERRED. Visible over the links via depthFunc(LEQUAL) (set once at init).
      //
      // Gate rule: dark<->hot base from the tested-pure Particles.glowGain (INFERRED,
      // no decoded state gate exists — verified Phase 5). Optional smooth flare on top:
      // during an attack, ease the hot streak in over the active window (st.t/st.dur vs
      // windows.branch ~0.70) and back toward rest, so the glow pulses with the swing
      // instead of hard-switching. Bounded in [GLOW_REST, glowBase] and finite (the
      // tested glowGain feeds it) — the value the premult fragment scales by (INFERRED).
      const glowBase = Particles.glowGain(machine.isIdle(), { rest: GLOW_REST, hot: GLOW_HOT });
      let glowGainNow = glowBase;
      if (!machine.isIdle()) {
        const f = Math.min(Math.max(machine.st.t / (machine.st.dur || 1), 0), 1);
        const env = Math.max(Math.sin(Math.PI * Math.min(f / (machine.windows.branch || 1), 1)), 0);
        glowGainNow = GLOW_REST + (glowBase - GLOW_REST) * env;
      }
      // Synthesize a mat-like carrying mode:'additivePremult' so Fx.applyMaterial's
      // assert-on-unknown contract still holds (DEC-01 — no hardcoded blendFunc here;
      // the blend switch lives ONLY in fx.js). depthWrite OFF as the decoded additive
      // glow always was.
      const matG = rage ? matDb.byName.MAT_godchainglow : matDb.byName.MAT_chainglow;
      const glowGL = { name: matG.name, mode: "additivePremult", disableDepthWrite: true };
      Fx.applyMaterial(gl, glowGL);
      fxLog.push({ name: glowGL.name, mode: glowGL.mode, depthWrite: !glowGL.disableDepthWrite, glowGain: glowGainNow });
      gl.uniform3fv(fxLocs.uMaterialColor, matG.materialColor); // identity — texels pass through
      gl.uniform4fv(fxLocs.uLayerColor, matG.blendColor); // identity RGBA
      gl.uniform1f(fxLocs.uCutoff, 0.0); // additive: alpha ≡ texel, no cutout
      gl.uniform1f(fxLocs.uGlowGain, glowGainNow); // >0 activates the premult branch; combat-gated
      gl.bindTexture(gl.TEXTURE_2D, rage ? godChainglowTex : chainglowTex);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(glowV), gl.DYNAMIC_DRAW); // REAL-ratio halo ribbon
      gl.drawArrays(gl.TRIANGLES, 0, glowV.length / 6);
      // Restore the glow flag OFF so the trail pass (same fxProg) is unaffected by the
      // premult branch (T-06-07-01 — no bleed; the trail sets it again defensively).
      gl.uniform1f(fxLocs.uGlowGain, 0.0);
    }
    if (trailV.length) {
      // MAT_swordtrail decodes additive + depth-write OFF (0x48090080) — the
      // former hardcoded guess, now data-confirmed. RAGE swaps to the REAL
      // god-mode trail (MAT/GFX_godswordtrail) with the REAL God Mode Trail
      // Tint alpha (L1: 1,1,1,1 → alpha 1.0 vs the normal 0.8).
      const rageT = machine.st.rage && godTrailTex;
      const mat = rageT ? matDb.byName.MAT_godswordtrail : matDb.byName.MAT_swordtrail;
      Fx.applyMaterial(gl, mat);
      fxLog.push({ name: mat.name, mode: mat.mode, depthWrite: !mat.disableDepthWrite });
      gl.uniform3fv(fxLocs.uMaterialColor, mat.materialColor);
      gl.uniform4fv(fxLocs.uLayerColor, mat.blendColor);
      gl.uniform1f(fxLocs.uCutoff, 0.0);
      // --- TRL-01/02: runtime age->color ramp + per-move BFT/BGT variant ------
      // INFERRED white-hot->ember tint applied per-row-age in the fxProg fragment
      // (gated by uTrailRamp). 05-04 PROVED GFX_swordtrail carries NO painted
      // length-wise ramp, so this is a RUNTIME tint, never a decoded/real color.
      // Endpoints come from the tested-pure Particles.rampColor stops; blend and
      // depth still come ONLY from MAT_swordtrail via Fx.applyMaterial (DEC-01).
      //
      // Trail color comes 100% from the REAL GFX_swordtrail texels (feathered amber
      // gradient + ember speckle — see the uTrailRamp fragment branch). No runtime tint:
      // the REAL decoded Trail Tint is (1,1,1,0.8) = white, i.e. texels pass through and
      // only the 0.8 alpha applies (in the fragment). The BFT/BGT variant tint still
      // drives the impact/trail SPARKS in simStep; the sheet itself is pure decoded texels.
      gl.uniform1f(fxLocs.uTrailRamp, 1.0);
      gl.uniform1f(fxLocs.uGlowGain, 0.0); // glow premult OFF for the trail (no bleed, T-06-07-01)
      gl.uniform1f(fxLocs.uTrailAlpha, rageT ? 1.0 : 0.8); // REAL Trail Tint A / God Mode Trail Tint A
      // REAL per-level Rage tint: God Mode Trail Tint RGB is white at L1-3, RED at L4-5
      gl.uniform3fv(fxLocs.uTrailTint, rageT && weaponLevel >= 4 ? [1, 0, 0] : [1, 1, 1]);
      gl.bindTexture(gl.TEXTURE_2D, rageT ? godTrailTex : trailTex);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trailV), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, trailV.length / 6);
    }
    // PASS — trail-spark particle pool riders: billboard, additive-premult, depth
    // OFF, AFTER the trail sheet and BEFORE restoreFxState (Pitfall 3 leak guard).
    // The batch sprite is the already-loaded in-WAD GFX_swordtrail streak (trailTex,
    // real texture bytes) — an INFERRED sprite reuse: the D-04c trail-spark
    // enhancement has no dedicated decoded sprite record, so it rides the decoded
    // swordtrail texel (real bytes, INFERRED assignment). Per-particle rgb (the
    // BFT/BGT variant tint) is kept as-is (no tint override). Empty pool → drawPool
    // no-ops; fxState() stays clean.
    // PLUME/IMPALE SHOCKWAVE — the authored "F"-template ring (REAL radii/timing
    // from the decoded Concussion F pairs), rendered as an additive ground band in
    // the decoded blade-glow amber. Always shown (a game visual, not the debug
    // overlay); only the band LOOK is INFERRED (no decoded ring shader exists).
    if (fxRings.length) {
      const fxrV = [];
      for (const r of fxRings) {
        const t = Math.min(1, r.age / r.durTicks);
        const rad = (r.s + (r.e - r.s) * t) * Chain.METERS_TO_WORLD;
        if (rad < 0.5) continue;
        const fade = r.age <= r.durTicks ? 1 : Math.max(0, 1 - (r.age - r.durTicks) / 14);
        const inner = rad * 0.78, N = 40, y = 0.4;
        for (let s = 0; s < N; s++) {
          const a0 = (s / N) * Math.PI * 2, a1 = ((s + 1) / N) * Math.PI * 2;
          const ox0 = Math.cos(a0), oz0 = Math.sin(a0), ox1 = Math.cos(a1), oz1 = Math.sin(a1);
          fxrV.push(
            r.cx + ox0 * inner, y, r.cz + oz0 * inner, 0.5, 0.5, fade,
            r.cx + ox0 * rad, y, r.cz + oz0 * rad, 0.5, 0.5, fade,
            r.cx + ox1 * rad, y, r.cz + oz1 * rad, 0.5, 0.5, fade,
            r.cx + ox0 * inner, y, r.cz + oz0 * inner, 0.5, 0.5, fade,
            r.cx + ox1 * rad, y, r.cz + oz1 * rad, 0.5, 0.5, fade,
            r.cx + ox1 * inner, y, r.cz + oz1 * inner, 0.5, 0.5, fade,
          );
        }
      }
      if (fxrV.length) {
        Fx.applyMaterial(gl, { name: "fxShockRing", mode: "additive", disableDepthWrite: true });
        fxLog.push({ name: "fxShockRing", mode: "additive", depthWrite: false });
        gl.uniform1f(fxLocs.uTrailRamp, 0);
        gl.uniform1f(fxLocs.uGlowGain, 0);
        gl.uniform1f(fxLocs.uCutoff, 0);
        gl.uniform3fv(fxLocs.uMaterialColor, bladeLightL.color); // REAL decoded warm amber
        gl.uniform4fv(fxLocs.uLayerColor, [1, 1, 1, 0.55]);
        gl.bindTexture(gl.TEXTURE_2D, whiteTex);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fxrV), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, fxrV.length / 6);
      }
    }
    // HITBOX overlay (btnHitbox): the game's weapon collision = the blade capsule
    // swept along the REAL type-10 track. Drawn as camera-facing octagon hoops
    // along hilt→tip; radius = Blade Collision Tolerance (REAL 0.5, read as
    // meters — the radius interpretation is INFERRED). Additive red, depth-write
    // OFF via Fx.applyMaterial (DEC-01). Shown only while attacking (the frames
    // whose blade sweep the game tests for hits).
    if (window.__hitbox && (hitboxHist.length || ringHist.length)) {
      const hitV = [], hitFillV = [];
      // CHARACTER-ANCHORED reach display: per sample, a FILLED translucent sector
      // wedge (center → the blade tip's ±15° arc, at its height) plus a brighter
      // rim line at the reach boundary. Overlapping wedges layer into a coverage
      // heat-fill — the union over the swing = the move's TRUE hit area (the
      // melee filter is the sweep). Targets outside the fill are not hit.
      // vertical half-extent of a strike slab: the REAL Blade Collision Tolerance
      // (0.5 m) reused as the strike's thickness band (interpretation INFERRED)
      const SLAB_H = 0.5 * Chain.METERS_TO_WORLD;
      // corner rails: connect each slab's 4 wall corners to the PREVIOUS sample of
      // the same blade (consecutive ticks only — no rails across swing gaps), so
      // the sweep reads as one continuous extruded volume with depth.
      const cornerOf = (s, side, yy) => {
        const a = s.ang + side * 0.26;
        return [s.cx + Math.cos(a) * s.r, yy, s.cz + Math.sin(a) * s.r];
      };
      const prevSample = {};
      for (const e of hitboxHist) {
        const fade = Math.max(0, 1 - e.age / HITBOX_LINGER); // per-vertex alpha → soft decay
        const y = e.y !== undefined ? e.y : 0.3;
        const yLo = Math.max(0.3, y - SLAB_H), yHi = y + SLAB_H;
        const HALF = 0.26, SEG = 6, fillA = fade * 0.14;
        for (let s = 0; s < SEG; s++) {
          const a0 = e.ang - HALF + (s / SEG) * 2 * HALF, a1 = e.ang - HALF + ((s + 1) / SEG) * 2 * HALF;
          const x0 = e.cx + Math.cos(a0) * e.r, z0 = e.cz + Math.sin(a0) * e.r;
          const x1 = e.cx + Math.cos(a1) * e.r, z1 = e.cz + Math.sin(a1) * e.r;
          // flat wedge at mid-height (top-down readability)
          hitFillV.push(
            e.cx, y, e.cz, 0.5, 0.5, fillA,
            x0, y, z0, 0.5, 0.5, fillA,
            x1, y, z1, 0.5, 0.5, fillA,
          );
          // curved OUTER WALL (vertical volume — readable from the side)
          hitFillV.push(
            x0, yLo, z0, 0.5, 0.5, fillA, x1, yLo, z1, 0.5, 0.5, fillA, x1, yHi, z1, 0.5, 0.5, fillA,
            x0, yLo, z0, 0.5, 0.5, fillA, x1, yHi, z1, 0.5, 0.5, fillA, x0, yHi, z0, 0.5, 0.5, fillA,
          );
          // rims: top + bottom arcs
          hitV.push(x0, yLo, z0, 0.5, 0.5, fade, x1, yLo, z1, 0.5, 0.5, fade);
          hitV.push(x0, yHi, z0, 0.5, 0.5, fade, x1, yHi, z1, 0.5, 0.5, fade);
          // vertical edge connectors at the sector ends
          if (s === 0) hitV.push(x0, yLo, z0, 0.5, 0.5, fade, x0, yHi, z0, 0.5, 0.5, fade);
          if (s === SEG - 1) hitV.push(x1, yLo, z1, 0.5, 0.5, fade, x1, yHi, z1, 0.5, 0.5, fade);
        }
        // depth rails to the previous same-blade slab (consecutive ticks only)
        const p = prevSample[e.key];
        if (p && p.age === e.age + 1) {
          const pLo = Math.max(0.3, p.y - SLAB_H), pHi = p.y + SLAB_H;
          const railA = fade * 0.7;
          for (const [side, ya, yb] of [[-1, yLo, pLo], [1, yLo, pLo], [-1, yHi, pHi], [1, yHi, pHi]]) {
            const c0 = cornerOf(e, side, ya), c1 = cornerOf(p, side, yb);
            hitV.push(c0[0], c0[1], c0[2], 0.5, 0.5, railA, c1[0], c1[1], c1[2], 0.5, 0.5, railA);
          }
        }
        prevSample[e.key] = e;
      }
      // concussion rings: flat ground circles at the AUTHORED radius (meters × the
      // bridge), interpolating Start→End Radius over the authored duration, then
      // lingering with fade — the REAL AoE hit volume of the impact moves.
      for (const r of ringHist) {
        const t = Math.min(1, r.age / r.durTicks);
        const rad = (r.s + (r.e - r.s) * t) * Chain.METERS_TO_WORLD;
        const fade = r.age <= r.durTicks ? 1 : Math.max(0, 1 - (r.age - r.durTicks) / (HITBOX_LINGER * 3));
        const N = 48, y = 0.3, fillA = fade * 0.2;
        // cylinder wall height: the sphere's vertical coverage, capped at 1.5 m
        const yTop = y + Math.min(rad, 1.5 * Chain.METERS_TO_WORLD);
        for (let s = 0; s < N; s++) {
          const a0 = (s / N) * Math.PI * 2, a1 = ((s + 1) / N) * Math.PI * 2;
          const x0 = r.cx + Math.cos(a0) * rad, z0 = r.cz + Math.sin(a0) * rad;
          const x1 = r.cx + Math.cos(a1) * rad, z1 = r.cz + Math.sin(a1) * rad;
          // FILLED ground disc (hero concussions: Angle=0 = full 360°)
          hitFillV.push(
            r.cx, y, r.cz, 0.5, 0.5, fillA,
            x0, y, z0, 0.5, 0.5, fillA,
            x1, y, z1, 0.5, 0.5, fillA,
          );
          // cylinder WALL (side-view volume)
          hitFillV.push(
            x0, y, z0, 0.5, 0.5, fillA, x1, y, z1, 0.5, 0.5, fillA, x1, yTop, z1, 0.5, 0.5, fillA,
            x0, y, z0, 0.5, 0.5, fillA, x1, yTop, z1, 0.5, 0.5, fillA, x0, yTop, z0, 0.5, 0.5, fillA,
          );
          // top rim
          hitV.push(x0, yTop, z0, 0.5, 0.5, fade, x1, yTop, z1, 0.5, 0.5, fade);
        }
        for (const rr of [rad, rad - 0.7]) {
          for (let s = 0; s < N; s++) {
            const a0 = (s / N) * Math.PI * 2, a1 = ((s + 1) / N) * Math.PI * 2;
            hitV.push(
              r.cx + Math.cos(a0) * rr, y, r.cz + Math.sin(a0) * rr, 0.5, 0.5, fade,
              r.cx + Math.cos(a1) * rr, y, r.cz + Math.sin(a1) * rr, 0.5, 0.5, fade,
            );
          }
        }
      }
      if (hitV.length || hitFillV.length) {
        // "usual" alpha blend (not additive): additive red over the BRIGHT arena
        // floor washed out to invisible pink — alpha-blended solid red reads on
        // any background. Depth-write stays off (overlay).
        Fx.applyMaterial(gl, { name: "hitboxOverlay", mode: "usual", disableDepthWrite: true });
        fxLog.push({ name: "hitboxOverlay", mode: "usual", depthWrite: false });
        gl.uniform1f(fxLocs.uTrailRamp, 0);
        gl.uniform1f(fxLocs.uGlowGain, 0);
        gl.uniform1f(fxLocs.uCutoff, 0);
        gl.uniform3fv(fxLocs.uMaterialColor, [1, 0.1, 0.1]);
        gl.uniform4fv(fxLocs.uLayerColor, [1, 1, 1, 0.85]);
        gl.bindTexture(gl.TEXTURE_2D, whiteTex);
        if (hitFillV.length) { // translucent sector/disc fills under the rims
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(hitFillV), gl.DYNAMIC_DRAW);
          gl.drawArrays(gl.TRIANGLES, 0, hitFillV.length / 6);
        }
        if (hitV.length) {     // bright rim lines on top
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(hitV), gl.DYNAMIC_DRAW);
          gl.drawArrays(gl.LINES, 0, hitV.length / 6);
        }
      }
    }
    // EMBER_UV: the bright gold corner of the swoosh decal — sparks sample ONLY this
    // sub-rect so each billboard reads as an ember dot, not a stamped mini-swoosh
    // (which visually REPEATED the swoosh detail along the arc). Real texels.
    const EMBER_UV = [0.75, 0.8, 0.25, 0.2];
    // (trail-spark rider batch removed with its spawner — the swoosh decal carries the arc detail)
    // PASS — blade fire (flame3 + flame6, FIRE-01): its OWN batch by texture (D-02).
    // Color = the REAL decoded fire color from db.meta.colorSource
    // (MAT_pticleMat.blendColor, [2,2,2,1] overbright) applied as the per-vertex rgb
    // tint; the per-particle alpha128 (INFERRED overbright peak) carries the extra
    // brightness so the additive-premult fragment (rgb·alpha128, ONE,ONE) recovers GS
    // brightness ABOVE the 1.0 clamp (CLAUDE.md Part 1 alpha-over-1.0). Sprite =
    // fireTex (resolved MAT_pticleMat texture, or the documented trailTex fallback —
    // MAT_pticleMat has no texName). NO fabricated crimson: the color is decoded
    // (Pitfall 4); only the runtime age fade (life-left in drawPool) is INFERRED.
    drawPool(mvp, view, fireTex, { name: "fxFire", kinds: FIRE_KINDS, tint: db.meta.colorSource.value,
      uvRect: fireTex === trailTex ? EMBER_UV : undefined }); // fallback sprite is the swoosh decal — crop it too
    // PASS — impact sparks (FIRE-02): velocity-aligned STRETCHED billboards. The pool VS
    // (uStretch = SPARK_STRETCH > 0) builds each quad's long axis from the per-particle
    // aVel (the PS2 "stretched spark" look, CLAUDE.md Part 3) — every spark in the on-hit
    // burst has its own fanned velocity, so the shower reads as a spray of streaks. Color =
    // the REAL decoded fire color (db.meta.colorSource / MAT_pticleMat.blendColor) as the
    // per-vertex tint — NO fabricated spark RGB (Pitfall 4); only the stretch factor + the
    // runtime age fade are INFERRED. Sprite = the in-WAD GFX_swordtrail streak (trailTex,
    // real bytes, INFERRED assignment — no decoded spark sprite record). Additive-premult,
    // depth OFF via Fx.applyMaterial, BEFORE restoreFxState (Pitfall 3 leak guard).
    drawPool(mvp, view, trailTex, { name: "fxImpactSpark", kinds: SPARK_KINDS, tint: db.meta.colorSource.value, stretch: SPARK_STRETCH, uvRect: EMBER_UV });
    // PASS — on-hit flash: the REAL GFX_flasher03 radial burst as its own batch
    if (flasherTex) drawPool(mvp, view, flasherTex, { name: "fxHitFlash", kinds: HITFLASH_KINDS });
    Fx.restoreFxState(gl);
    gl.useProgram(prog);
  }

  // Presentation (wall-clock): autospin yaw + camera-distance easing consume
  // the real frame delta so camera FEEL is identical on every refresh rate —
  // deliberately NOT sim time (02-RESEARCH Pitfall 5).
  function renderFrame(wallDt) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    if (nativeRes) {
      // every pass renders into the 512×448 GS-storage-size target (REND-03)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, NATIVE.w, NATIVE.h);
    } else {
      gl.viewport(0, 0, w, h);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (autoSpin) yaw += wallDt * 0.25;
    uploadSkinnedVerts();
    // Camera distance is USER-CONTROLLED only: ease toward the wheel target for a
    // smooth zoom feel. (The old blade-reach auto-frame eased in/out with every
    // swing — an annoying wiggle; removed at user request. Start distance is
    // zoomed out instead, so full swings stay framed by default.)
    dist += (userDist - dist) * Math.min(1, wallDt * 8);
    // On-screen debug HUD (dev aid): surfaces why Kratos might not be visible so a
    // screenshot alone is diagnostic — camera distance, draw gating.
    if (dbgHud) dbgHud.textContent =
      `move ${machine.st.current}   dist ${dist.toFixed(1)}\n` +
      `hero ${window.__fxOnly ? "HIDDEN (FX-only)" : "drawn"}   native ${nativeRes ? "ON" : "off"}   pool ${fxPool.count}` +
      (padDbg ? `\n${padDbg}` : "");
    const rot = M.mul(M.rotX(pitch), M.rotY(yaw));
    // follow target: Kratos' pelvis in display space ((mesh − ctr) × scale);
    // eased so the camera glides after him rather than hard-locking
    if (followCam && skin && skin.lastWorld && JID.pelvis !== undefined) {
      const pj = JID.pelvis * 16;
      camTgtGoal[0] = (skin.lastWorld[pj + 12] - mesh.ctr[0]) * s0;
      camTgtGoal[2] = (skin.lastWorld[pj + 14] - mesh.ctr[2]) * s0;
    } else { camTgtGoal[0] = 0; camTgtGoal[2] = 0; }
    const camK = Math.min(1, wallDt * 6);
    camTgt[0] += (camTgtGoal[0] - camTgt[0]) * camK;
    camTgt[2] += (camTgtGoal[2] - camTgt[2]) * camK;
    // view = camera transform (world→view); its row-0/row-1 give the world-space
    // camera right/up the billboard pool needs (drawPool). Split out of the mvp
    // compose so drawFx can hand it to drawPool.
    const view = M.mul(M.mul(M.trans(0, 0, -dist), rot), M.trans(-camTgt[0], 0, -camTgt[2]));
    updateCamGround(view); // planar stick-movement basis follows the rendered camera
    // native pass projects at the 4:3 DISPLAY aspect (non-square GS pixels) —
    // NOT the 512/448 storage aspect (02-RESEARCH A2)
    const mvp = M.mul(M.persp(0.9, nativeRes ? NATIVE.displayAspect : w / h, 0.05, CAM_FAR), view);
    // arena first: opaque, depth-write ON, so the hero/FX depth-test over it.
    // Skipped in FX-only (black isolation stays black).
    if (arenaOn && !window.__fxOnly) drawArena(M.mul(mvp, modelMat));
    gl.useProgram(prog);
    bindMeshSet(heroSet);
    gl.uniformMatrix4fv(uMVP, false, mvp);
    gl.uniformMatrix4fv(uRot, false, rot);
    gl.uniform1f(uHeat, heat);
    gl.uniform1f(uPages, atlasPages);
    gl.uniformMatrix4fv(uModel, false, modelMat);
    // REND-02: refresh each blade light's WORLD position + intensity every rendered
    // frame so it rides its blade — anchor (blade-local) × live blade matrix
    // bladeSim[key].mat (blade→mesh) × modelMat (mesh→world), matching vWorld's space.
    // Missing-blade guard: an uninitialized bladeSim[key].mat would push a NaN into the
    // uniform, so zero that light's intensity until its blade sim is live (T-06-08-01).
    for (const [key, uPos, uInt, dl] of [
      ["l", uLightPosL, uLightIntensityL, bladeLightL],
      ["r", uLightPosR, uLightIntensityR, bladeLightR],
    ]) {
      const wpos = bladeSim[key].pos ? xformM(modelMat, xformM(bladeSim[key].mat, dl.anchor)) : null;
      if (wpos && wpos.every(Number.isFinite)) {
        gl.uniform3fv(uPos, wpos);
        // BLADE_LIGHT_GAIN (INFERRED runtime calibration): the decoded intensity 2.5 is
        // in the GAME's lighting units. Applied 1:1 in this renderer (two lights, near-
        // flat attenuation at range×s0) it blew the hero out — and on a fast attack whip
        // a non-finite blade matrix pushed NaN into the hero fragment, turning Kratos
        // black (he "disappeared on attack"). The decoded value stays REAL in the data;
        // only this display gain is INFERRED (renderer units ≠ game units). Phase-7 tune.
        gl.uniform1f(uInt, dl.intensity * 0.12);
      } else {
        gl.uniform1f(uInt, 0.0);            // no live/finite blade — dark, no NaN reaches the hero fragment
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // __fxOnly (debug): skip the hero + blade MESHES so the FX passes render
    // alone against the black clear — isolates chain/trail visibility.
    if (!window.__fxOnly) gl.drawElements(gl.TRIANGLES, heroSet.count, gl.UNSIGNED_SHORT, 0);
    // Blades of Chaos: chain-simulated (gripped when slow, flung when whipped)
    if (bladeSet && skin && skin.lastWorld) {
      gl.uniform1f(uPages, 1);
      gl.bindTexture(gl.TEXTURE_2D, weaponLevel >= 5 && blade5Tex ? blade5Tex : bladeTex); // REAL stage1/stage5 skins
      bindMeshSet(bladeSet);
      if (!window.__fxOnly) for (const key of ["l", "r"]) {
        if (!bladeSim[key].pos) continue;
        // roll the mesh 90° about its length axis so the edge faces the cut (BLADE_ROLL);
        // trail/fire/lights use bladeSim.mat directly and are unaffected by this cosmetic roll.
        gl.uniformMatrix4fv(uModel, false, M.mul(M.mul(modelMat, bladeSim[key].mat), BLADE_ROLL));
        gl.drawElements(gl.TRIANGLES, bladeSet.count, gl.UNSIGNED_SHORT, 0);
      }
    }
    // TARGET DUMMY: the same skinned pipeline, its own buffers/texture
    if (dummy && dummy.on && dummy.lastWorld && !window.__fxOnly) {
      skinPoseFor(dummy.rig, dummy.skin, dummy.mesh, dummy.lastWorld);
      gl.bindBuffer(gl.ARRAY_BUFFER, dummy.set.pos);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, dummy.skin.out);
      gl.uniform1f(uPages, 1);
      gl.uniformMatrix4fv(uModel, false, modelMat);
      gl.bindTexture(gl.TEXTURE_2D, dummy.tex);
      bindMeshSet(dummy.set);
      gl.drawElements(gl.TRIANGLES, dummy.set.count, gl.UNSIGNED_SHORT, 0);
    }
    // dummy HP bar: project the head joint (id 5) to screen space
    {
      const hpEl = $("dummyHp");
      if (hpEl) {
        if (dummy && dummy.on && dummy.lastWorld && !window.__fxOnly) {
          const hx = dummy.lastWorld[5 * 16 + 12], hy = dummy.lastWorld[5 * 16 + 13] + 6, hz = dummy.lastWorld[5 * 16 + 14];
          const mm = M.mul(mvp, modelMat);
          const cx = mm[0] * hx + mm[4] * hy + mm[8] * hz + mm[12];
          const cy = mm[1] * hx + mm[5] * hy + mm[9] * hz + mm[13];
          const cw = mm[3] * hx + mm[7] * hy + mm[11] * hz + mm[15];
          if (cw > 0.05) {
            hpEl.style.display = "block";
            hpEl.style.left = `${((cx / cw) * 0.5 + 0.5) * 100}%`;
            hpEl.style.top = `${(1 - ((cy / cw) * 0.5 + 0.5)) * 100}%`;
            const fill = hpEl.firstElementChild;
            if (fill) fill.style.width = `${Math.max(0, (dummy.hp / dummy.maxHp) * 100)}%`;
          } else hpEl.style.display = "none";
        } else hpEl.style.display = "none";
      }
      if (!window.__noFx) drawFx(mvp, view); // __noFx (debug): skip ALL FX to isolate whether the FX passes hide the hero
    }
    if (nativeRes) {
      // blit 512×448 → canvas letterboxed to 4:3, bilinear upscale. Per
      // 02-RESEARCH Pitfall 6: the canvas (and preserveDrawingBuffer
      // screenshots) now contain ONLY this blit — that IS the output; any
      // readPixels check reads after this point.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // opaque black = letterbox bars
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(blitProg);
      const ca = w / h; // letterbox (bars top/bottom) or pillarbox (bars sides)
      if (ca > NATIVE.displayAspect) gl.uniform2f(blitLocs.uScale, NATIVE.displayAspect / ca, 1);
      else gl.uniform2f(blitLocs.uScale, 1, ca / NATIVE.displayAspect);
      gl.bindTexture(gl.TEXTURE_2D, rtTex);
      gl.bindBuffer(gl.ARRAY_BUFFER, blitBuf);
      gl.enableVertexAttribArray(blitLocs.aPos);
      gl.vertexAttribPointer(blitLocs.aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(prog);
    }
  }

  // ---------- combo machine + UI -------------------------------------------
  const logEl = $("log");
  function log(msg) {
    const d = document.createElement("div");
    d.className = "log-line";
    d.textContent = msg;
    logEl.prepend(d);
    while (logEl.children.length > 40) logEl.lastChild.remove();
  }

  const stack = []; // branch panel entries {name, el, state}
  // ROOT MOTION chaining (toggle btnRootMo, default ON): the ANM clips carry REAL
  // baked root translation (e.g. combo3B lunges ~0.42 m), but each clip is authored
  // in its own coordinates — without re-basing, every transition snaps the root back
  // and displacement never accumulates. On each move transition we shift a persistent
  // XZ base so the incoming clip's first frame lands exactly where the outgoing clip
  // left the root (game behavior: combos carry you across the arena). px/pz hold the
  // PREVIOUS clip's base so the blend window lerps two poses that meet at the seam.
  // DEFAULT ON — the REAL controller-displacement channel was FOUND (2026-08):
  // ANM type-5 comp 422, a cumulative per-attack movement scalar the pose decoder
  // never read (the skeleton itself is authored in place — root joint static,
  // pelvis swings are pose). See decodeRootTrack in anim.js.
  // VERTICAL (decoded 2026-08-12): comp 421 is the controller's authored
  // vertical channel — jumpUp rises 0→9.37 units (0.67 m), jumpDoubleAir adds
  // a second boost to 10.95 (0.78 m); airV1 opens at 9.66 = the single-jump
  // apex, corroborating the read. Ground moves/landings carry no 421: the
  // engine drops the controller under the decoded /GlobGame/ Gravity (50,
  // meters — REAL) and air attacks hover (engine float, INFERRED from
  // gameplay). y/vy implement exactly that model here.
  // hd = facing heading (radians; 0 = the clips' authored -Z forward) — stick
  // locomotion turns it, and ALL root motion (channels + movement) advances
  // along it; prevTrackX tracks the lateral comp-420 channel (side evades).
  const rootMotion = { on: true, x: 0, z: 0, y: 0, vy: 0, hd: 0, px: 0, pz: 0, prevTrack: null, prevTrackY: null, prevTrackX: null, pendingRebase: false };
  const GRAV_UNITS = 50 * Chain.METERS_TO_WORLD; // REAL /GlobGame/ Gravity 50 m/s² × units bridge
  // BALLISTIC JUMP (user-corrected; binary-verified 2026-08-12): no named
  // hero-jump parameters exist ANYWHERE — not in the TWK banks, and the ELF's
  // 'Jump Compensation'/'Double Jump Comp' strings sit in the CAMERA tweak
  // block (Elevation Constraint / Move Dolly / Safe Zones context — camera
  // smoothing during jumps), while 'Fall Time' is the BloodSpots particle
  // param (3.0 s, already decoded). The hero's v0/g are anonymous compiled
  // constants; a code float-sweep finds no attributable pair short of full
  // MIPS disassembly. The model stands on what IS data: ballistic arc shape
  // (the channel's own curvature), channel arc timing, and the model height.
  // BOTH jump parameters DERIVED from the comp-421 channel itself — the
  // channel is a ballistic arc: its tail deceleration measures ~0.70 u/frame²
  // at 15 Hz = 11.25 m/s² (the JUMP gravity — distinct from the world/
  // projectile Gravity 50, which flew crazy high AND ended the hop before
  // the double-jump branch could fire), and its apex is the intended
  // controller rise (jumpUp 9.37 u = 0.67 m; jumpDoubleAir boost 10.75 u =
  // 0.77 m). v0 = sqrt(2·g·apex). Airtime ≈ 0.69 s — the GoW float.
  // TIMING is the channel's (verified right by feel): full arc T = 0.65 s.
  // HEIGHT is decoupled (user: the channel's 0.67 m apex reads too low on
  // screen): apex target 1.1 m feet clearance — INFERRED, footage scale.
  // In a ballistic arc h and T pin both parameters: v0 = 4h/T, g = 8h/T².
  // The double-jump boost keeps the REAL channel ratio (10.75/9.37 rise).
  const JUMP_T = 0.65;   // derived: comp-421 arc duration
  const JUMP_H = 28 / Chain.METERS_TO_WORLD; // = Kratos' MODEL HEIGHT (28 u = 2.0 m) — user spec
  const JUMP_G = (8 * JUMP_H / (JUMP_T * JUMP_T)) * Chain.METERS_TO_WORLD;  // 20.8 m/s²
  const JUMP_V0 = (4 * JUMP_H / JUMP_T) * Chain.METERS_TO_WORLD;            // 6.77 m/s
  const DJUMP_V0 = JUMP_V0 * Math.sqrt(10.75 / 9.37); // REAL boost ratio
  const PHYS_JUMP = /^(jumpUp|jumpAir|jumpDoubleAir|berJumpAir|berJumpDoubleAir)$/;
  // apply the character root transform to an in-place pose: rotate every joint
  // matrix by the heading about the origin, then translate by the accumulated
  // offsets. The blade track gets the identical treatment (applyRootTrack) so
  // chains/trails/hitboxes inherit facing automatically.
  function applyXformTo(world, hd, ox, oy, oz) {
    if (hd) {
      const c = Math.cos(hd), s = Math.sin(hd);
      for (let j = 0; j < world.length; j += 16) {
        for (const o of [0, 4, 8, 12]) {
          const x = world[j + o], z = world[j + o + 2];
          world[j + o] = c * x + s * z;
          world[j + o + 2] = -s * x + c * z;
        }
      }
    }
    if (ox || oy || oz) {
      for (let j = 0; j < world.length; j += 16) {
        world[j + 12] += ox;
        world[j + 13] += oy;
        world[j + 14] += oz;
      }
    }
  }
  const applyRootXformTo = (world, ox, oy, oz) => applyXformTo(world, rootMotion.hd, ox, oy, oz);
  function applyRootPose(world) {
    applyRootXformTo(world, rootMotion.x, rootMotion.y, rootMotion.z);
  }
  function applyRootTrack(track) {
    const hd = rootMotion.hd;
    if (hd) {
      const c = Math.cos(hd), s = Math.sin(hd);
      for (const o of [0, 3]) {
        const x = track[o], z = track[o + 2];
        track[o] = c * x + s * z;
        track[o + 2] = -s * x + c * z;
      }
    }
    for (const o of [0, 3]) {
      track[o] += rootMotion.x;
      track[o + 1] += rootMotion.y;
      track[o + 2] += rootMotion.z;
    }
  }
  let vertPrevMove = "idleCombat"; // takeoff edge detector for the ballistic jump
  let lastState = { name: "idleCombat", t: 0 };
  const machine = Combat.makeMachine((n) => DUR[n], {
    onMove(name, prev, via) {
      heat = machine.st.rage ? 0.75 : 0.35;
      rootMotion.pendingRebase = true; // re-base the incoming clip at the current root (chaining)
      if (skin && prev) {
        let bl = CLIP[name] && CLIP[name].blend > 0 && CLIP[name].blend <= 0.5 ? CLIP[name].blend : 0.08;
        // touchdown blends widen (INFERRED — soften ground contact): the land
        // clips ship blend 0, and a fall→land cut at 0.08 s read as a pop
        if (/^(land|runLand|combatLand2|berLand)$/.test(name)) bl = Math.max(bl, 0.16);
        // the jump chain transitions fast (0.33-0.47 s clips) — widen so each
        // link cross-fades through motion instead of cutting (user report)
        if (/^(jumpUp|jumpAir|jumpDoubleAir|fallV|berJumpAir|berFallN|walkBlend|berWalkBlend)/.test(name)) bl = Math.max(bl, 0.12);
        skin.prevAct = prev;
        skin.prevTime = lastState.t;
        skin.blendDur = bl;
        skin.blendLeft = bl;
      }
      pushBranchBlock(name);
      updateMoveCard();
      const viaTxt = via ? ` (via ${via.mod === "L1" ? "L1+" : ""}${via.input ?? "auto"})` : "";
      if (!Combat.GRAPH[name]?.loop) log(`▶ ${name}${viaTxt}  ${DUR[name] ? DUR[name].toFixed(2) + "s" : ""}`);
    },
    onComplete(name) {},
    onQueue(b) {
      log(`⧗ queued: ${b.input} → ${b.to}`);
      renderQueueHighlight(b);
    },
    onCancel() { log("✂ block-cancel"); },
    onInput(input, l1) {},
  });

  function updateMoveCard() {
    const name = machine.st.current;
    $("mcName").textContent = name;
    $("mcFancy").textContent = FANCY[name] || "";
    const d = DUR[name];
    const n = Combat.GRAPH[name] || {};
    const c = CLIP[name];
    $("mcMeta").textContent =
      (d ? `${d.toFixed(3)}s · ${Math.round(d * 30)} frames @30` : "") +
      (c && c.blend ? ` · blend-in ${c.blend}s` : "") +
      (n.loop ? " · stance (loops)" : "") +
      (machine.st.rage ? " · RAGE" : "");
    updateDataCards(name);
  }

  function updateDataCards(name) {
    const c = CLIP[name];
    if (c) {
      // REAL per-move movement from the comp-422 controller channel (meters via
      // the Kratos-height bridge) + the authored concussion, when this move has one
      let extra = "";
      const d0 = rig.rootDisp(name, 0), d1 = rig.rootDisp(name, c.dur);
      if (d0 !== null && d1 !== null && Math.abs(d1 - d0) > 0.5) {
        extra += `movement <b>${(Math.abs(d1 - d0) / Chain.METERS_TO_WORLD).toFixed(2)} m</b> (type-5 comp-422 track)<br>`;
      }
      // REAL vertical rise from the comp-421 controller channel (jumps/boosts)
      {
        let y0 = null, yMax = -Infinity;
        for (let k = 0; k <= Math.round(c.dur * 30); k++) {
          const v = rig.rootDispY(name, k / 30);
          if (v === null) { y0 = null; break; }
          if (y0 === null) y0 = v;
          yMax = Math.max(yMax, v);
        }
        if (y0 !== null && yMax - y0 > 0.5) {
          extra += `jump rise <b>${((yMax - y0) / Chain.METERS_TO_WORLD).toFixed(2)} m</b> (comp-421 vertical channel)` +
            (PHYS_JUMP.test(name) ? ` <span style="color:#86aed0">— animation reference; the controller jump is ballistic (arc timing 0.65 s from this channel · apex = model height 2.0 m → v0 12.3 m/s, g 37.9 m/s²)</span>` : "") + `<br>`;
        }
      }
      const cd = CONCUSSION[name];
      if (cd) {
        extra += `concussion AoE <b>${cd.s} m</b>${cd.e !== cd.s ? `→${cd.e} m` : ""} · knockback <b>${cd.imp}</b>` +
          (cd.fx ? ` · fx ring ${cd.fx.s}→${cd.fx.e} m` : "") + `<br>`;
      }
      if (FIST_MOVES.test(name)) {
        extra += `<b>rage brawling</b> — blades sheathed (the type-10 track pins both tips dorsal); the strikes are the FISTS<br>`;
      }
      $("moveData").innerHTML =
        `<b>${c.name}</b> — ANM clip id ${c.id}<br>` +
        `duration <b>${c.dur.toFixed(4)}s</b> (${Math.round(c.dur * 30)} frames)<br>` +
        `blend-in <b>${c.blend}s</b>${c.blend === 0 ? " (hard cut)" : ""}<br>` +
        extra +
        `keyframes sampled at <b>${c.kfHz} Hz</b><br>` +
        `header @ 0x${c.off.toString(16).toUpperCase()} in ANM_hero.bin<br>` +
        // provenance cross-links (usability): jump from the live move to its
        // decoded sheet and the how-it-was-dug-up story
        `→ <a href="../../design/twk/index.html#${c.name}.twk" target="_blank">${c.name}.twk sheet</a>` +
        (CONCUSSION[name] ? ` · <a href="../../design/twk/index.html#decoded/Concussions_AttackHitVolumes.twk" target="_blank">hit volumes</a>` : "") +
        ` · <a href="../../design/data-archaeology.html" target="_blank">how it was decoded</a>`;
    } else {
      $("moveData").innerHTML = `<b>${name}</b> — synthetic stance (no ANM clip)`;
    }
    const act = TWK_ACTION[name];
    if (act) {
      const secs = Object.keys(TWK.sections).filter((k) => k.includes(act));
      let html = `<b>${act}</b> — /Animation/goHero/ tweak tree<br>`;
      let rows = 0;
      for (const k of secs) {
        for (const e of TWK.sections[k]) {
          if (rows >= 14) break;
          const num = parseFloat(e.v);
          if (!e.name && (!isFinite(num) || String(e.v).startsWith("0x"))) continue;
          html += `event ${k.split("/").pop()}: ${e.name ? `<b>${e.name}</b> ` : ""}${e.v}<br>`;
          rows++;
        }
      }
      $("twkData").innerHTML = rows ? html : html + "(no decoded event records)";
    } else if (CLIP[name]) {
      $("twkData").innerHTML =
        `<b>${name}</b>: no tweak-tree events — attack windows were compiled into ` +
        `engine code (only traversal actions keep baked events, e.g. footfalls on ` +
        `<b>rMetatarsal</b> at phase 0.45 of the walk cycle). Timing sliders apply (inferred).`;
    }
  }

  // ---- branch stack per spec:
  // new active block pushed on top; previous becomes greyed; older greyed removed.
  function branchRowEl(b) {
    const row = document.createElement("div");
    row.className = "branch-row";
    row.dataset.input = b.input + (b.mod || "");
    const g = Combat.GLYPH[b.input];
    let btnHtml = "";
    if (b.mod === "L1") btnHtml += `<span class="mini-mod">L1</span><span class="arrow">+</span>`;
    if (b.input === "L1") btnHtml += `<span class="mini-mod">L1</span>`;
    else btnHtml += `<span class="mini-btn" style="color:${g.color}">${g.txt}</span>`;
    if (b.mod === "hold") btnHtml += `<span class="mini-mod">hold</span>`;
    const durTxt = DUR[b.to] ? ` <span class="dur">(${DUR[b.to].toFixed(2)}s)</span>` : "";
    row.innerHTML =
      `${btnHtml}<span class="arrow">→</span><span class="target">${b.to}</span>${durTxt}` +
      (b.fancy ? `<span class="fancy">${b.fancy}</span>` : "") +
      `<span class="tag ${b.tag || "inferred"}">${b.tag || "inferred"}</span>`;
    return row;
  }

  function pushBranchBlock(name) {
    // grey the current active, drop previously greyed
    for (const s of [...stack]) {
      if (s.state === "greyed") { s.el.remove(); stack.splice(stack.indexOf(s), 1); }
      else { s.state = "greyed"; s.el.classList.add("greyed"); }
    }
    const node = Combat.GRAPH[name] || { branches: [] };
    const el = document.createElement("div");
    el.className = "branch-block";
    const d = DUR[name];
    const rows = machine.visibleBranches();
    el.innerHTML = `<div class="bb-title">${name}${d ? ` <span class="dur">· ${d.toFixed(2)}s</span>` : ""}${node.loop ? ` <span class="dur">· stance</span>` : ""}</div>`;
    const rowsEl = document.createElement("div");
    rowsEl.className = "branch-rows";
    if (rows.length === 0) {
      rowsEl.innerHTML = `<span class="log-line">no branches — recovers to stance</span>`;
    } else for (const b of rows) rowsEl.append(branchRowEl(b));
    el.append(rowsEl);
    $("branchStack").prepend(el);
    stack.push({ name, el, state: "active" });
  }

  function renderQueueHighlight(b) {
    const active = stack.find((s) => s.state === "active");
    if (!active) return;
    for (const r of active.el.querySelectorAll(".branch-row"))
      r.classList.toggle("queued", r.dataset.input === b.input + (b.mod || ""));
  }

  // ---------- timeline ------------------------------------------------------
  // hit-active row (usability): NO per-frame hit-window data exists in the ANM
  // (proven — the 60Hz candidate tracks are exporter boilerplate), so the row is
  // DERIVED from the REAL type-10 blade track: a tick is "hot" while either tip
  // moves at strike speed. Gate = max(25 u/s ≈ 1.8 m/s, 35% of the move's own
  // peak) — both constants INFERRED; the track being differenced is real. The
  // solid block is the AUTHORED concussion window [trigger, trigger+0.1s].
  const HITWIN_CACHE = {};
  // traversal/recovery moves carry NO melee test — the blades whip from body
  // motion during jumps/landings/evades, which fooled the tip-speed gate into
  // painting hit windows that don't exist (user-corrected). airImpaleLand is
  // NOT excluded: it is an attack (authored concussion).
  const NO_MELEE = /^(jump|comboJump$|land$|runLand$|combatLand|highFallLand$|fall|combatFall$|evade|dash$|walkBlend|berWalkBlend|ber(Jump|Land|FallN|serkEnter|serkExit))/;
  function hitWindows(move) {
    if (HITWIN_CACHE[move]) return HITWIN_CACHE[move];
    const out = { segs: [], conc: null };
    const dur = DUR[move];
    const node = Combat.GRAPH[move];
    if (!dur || !rig || (node && node.loop) || NO_MELEE.test(move)) return (HITWIN_CACHE[move] = out); // stances/traversal: no strike
    const n = Math.max(2, Math.round(dur * 60));
    // strike-point sampler: blade track for armed moves; the HAND JOINTS for
    // rage brawling (blades sheathed — their track barely moves, the fists do)
    const fists = FIST_MOVES.test(move);
    const strikeAt = (t) => {
      if (!fists) { const tr0 = rig.bladePos(move, t); return tr0 ? Array.from(tr0) : null; }
      const w = rig.computePose(move, t);
      const l = JID.lWeapIH * 16, r = JID.rWeapIH * 16;
      return [w[l + 12], w[l + 13], w[l + 14], w[r + 12], w[r + 13], w[r + 14]];
    };
    const speeds = [0];
    let prev = null, maxS = 0;
    for (let i = 0; i <= n; i++) {
      const tr = strikeAt((i / n) * dur);
      if (tr && prev) {
        const dl = Math.hypot(tr[0] - prev[0], tr[1] - prev[1], tr[2] - prev[2]);
        const dr = Math.hypot(tr[3] - prev[3], tr[4] - prev[4], tr[5] - prev[5]);
        const s = Math.max(dl, dr) * (n / dur); // tip speed, units/s
        speeds.push(s);
        maxS = Math.max(maxS, s);
      } else if (i > 0) speeds.push(0);
      prev = tr;
    }
    const thresh = Math.max(25, maxS * 0.35); // INFERRED strike-speed gate
    let start = null;
    for (let i = 0; i <= n; i++) {
      const hot = maxS > 0 && speeds[i] >= thresh;
      if (hot && start === null) start = i;
      if ((!hot || i === n) && start !== null) { out.segs.push([start / n, i / n]); start = null; }
    }
    out.segs = out.segs.filter(([a, b]) => (b - a) * n >= 2); // drop 1-tick speckle
    const cd = CONCUSSION[move];
    if (cd) {
      const t0 = concussionTime(move) / dur;
      out.conc = [t0, Math.min(1, t0 + cd.dur / dur)];
    }
    return (HITWIN_CACHE[move] = out);
  }
  let hitRowMove = null;
  function renderHitRow() {
    if (machine.st.current === hitRowMove) return;
    hitRowMove = machine.st.current;
    const row = $("tlHitRow");
    row.innerHTML = "";
    const hw = hitWindows(hitRowMove);
    for (const [a, b] of hw.segs) {
      const d = document.createElement("div");
      d.className = "tl-hit-seg";
      d.style.left = `${a * 100}%`;
      d.style.width = `${(b - a) * 100}%`;
      row.append(d);
    }
    if (hw.conc) {
      const d = document.createElement("div");
      d.className = "tl-hit-conc";
      d.style.left = `${hw.conc[0] * 100}%`;
      d.style.width = `${Math.max(0.8, (hw.conc[1] - hw.conc[0]) * 100)}%`;
      row.append(d);
    }
  }

  function renderTimeline() {
    renderHitRow();
    const { t, dur } = machine.st;
    const w = machine.windows;
    const pct = (x) => `${Math.max(0, Math.min(100, x * 100))}%`;
    $("tlQueue").style.left = pct(w.queue);
    $("tlQueue").style.width = pct(1 - w.queue);
    $("tlCancel").style.left = pct(w.cancel);
    $("tlCancel").style.width = pct(1 - w.cancel);
    const c = CLIP[machine.st.current];
    const blendFrac = c && c.blend && c.blend < dur ? c.blend / dur : 0;
    $("tlBlend").style.left = "0";
    $("tlBlend").style.width = pct(blendFrac);
    $("tlBranch").style.left = pct(w.branch);
    $("tlHead").style.left = pct(t / dur);
    // concussion-trigger marker: the tick where the move's comp-422 displacement
    // completes and the authored AoE fires (concussionTime) — only on mapped moves
    const hitEl = $("tlHit");
    const cdM = CONCUSSION[machine.st.current];
    if (cdM && dur) {
      hitEl.style.display = "block";
      hitEl.style.left = pct(concussionTime(machine.st.current) / dur);
    } else hitEl.style.display = "none";
    const fr = Math.floor((t / dur) * dur * 30), tot = Math.round(dur * 30);
    $("tlFrames").textContent = `frame ${Math.min(fr, tot)} / ${tot} @30fps`;
    $("hitNum").textContent = machine.st.hits;
  }

  // ---------- timeline scrubbing (usability) --------------------------------
  // Drag the track to any frame of the current move. Auto-pauses (resume with
  // P / the Pause button). The POSE, blades, and chain re-sample at the scrub
  // time (REAL clip + comp-422 data); trail rows, particles, and hitbox history
  // are accumulated sim state and stay frozen while scrubbing.
  function scrubTo(frac) {
    const st = machine.st;
    st.t = Math.max(0, Math.min(0.999, frac)) * st.dur;
    if (!(rig && skin)) return;
    const world = rig.computePose(st.current, st.t);
    if (rootMotion.on) {
      // resume-safe: track the channels at the scrub position WITHOUT accumulating,
      // so unpausing continues the differencing from exactly here (no teleport)
      rootMotion.prevTrack = rig.rootDisp(st.current, st.t);
      rootMotion.prevTrackY = rig.rootDispY(st.current, st.t);
      rootMotion.prevTrackX = rig.rootDispX(st.current, st.t);
    }
    applyRootPose(world);
    if (!skin.lastWorld) skin.lastWorld = new Float32Array(world.length);
    skin.lastWorld.set(world);
    if (blade) {
      const track0 = rig.bladePos(st.current, st.t);
      const track = track0 ? Array.from(track0) : null;
      if (track) applyRootTrack(track);
      for (const [key, hand, trackOff] of [["l", JID.lWeapIH, 0], ["r", JID.rWeapIH, 3]]) {
        if (hand === undefined) continue;
        const tp = track ? [track[trackOff], track[trackOff + 1], track[trackOff + 2]] : null;
        driveBlade(bladeSim[key], world, hand, tp, Loop.STEP); // chain relaxes toward the scrubbed pose
      }
    }
  }
  // scrub binding shared by the main track AND the hit-active row beneath it
  // (both span the same horizontal geometry, so each maps its own rect)
  for (const tlEl of [$("tlTrack"), $("tlHitRow")]) {
    let tlScrub = false;
    tlEl.style.cursor = "ew-resize";
    if (!tlEl.title) tlEl.title = "drag to scrub the current move (auto-pauses)";
    tlEl.addEventListener("pointerdown", (e) => {
      try { tlEl.setPointerCapture(e.pointerId); } catch {} // stale/synthetic ids throw
      tlScrub = true;
      if (!paused) $("btnPause").click(); // scrubbing implies pause
      const r = tlEl.getBoundingClientRect();
      scrubTo((e.clientX - r.left) / r.width);
    });
    tlEl.addEventListener("pointermove", (e) => {
      if (!tlScrub) return;
      const r = tlEl.getBoundingClientRect();
      scrubTo((e.clientX - r.left) / r.width);
    });
    tlEl.addEventListener("pointerup", () => (tlScrub = false));
    tlEl.addEventListener("pointercancel", () => (tlScrub = false));
  }

  // ---------- inputs --------------------------------------------------------
  const pressBtn = (id) => { const el = $(id); el.classList.add("pressed"); setTimeout(() => el.classList.remove("pressed"), 110); };
  // first-run demo: autoplay runs on page load until the visitor presses any
  // attack input themselves (autoInput guards the automated presses from
  // autoplay/combo-play so they don't stop their own demo)
  let autoDemo = false, autoInput = false;
  function stopDemo() {
    if (!autoDemo) return;
    autoDemo = false;
    setAutoplay(null);
    $("btnAutoplay").classList.remove("latched");
    $("btnAutoplay").innerHTML = "&#9654; Autoplay";
  }
  function autoPress(key) { autoInput = true; input(key); autoInput = false; }
  function input(key) {
    if (!autoInput) stopDemo();
    if (key === "S") pressBtn("btnS");
    if (key === "T") pressBtn("btnT");
    if (key === "C") pressBtn("btnC");
    if (key === "X") pressBtn("btnX");
    machine.press(key);
  }

  // --- autoplay: dev/QA capture aid ------------------------------------------
  // Loops a named input sequence so FX (chain links, sword trail, and the
  // Phase-3 chainglow) can be captured/inspected without hand-timing swings.
  // Ticks inside simStep, so it advances under BOTH the rAF loop and the
  // deterministic KratosLab.step() pump (hidden tabs get no rAF). Purely drives
  // the same input() path a player would — no bespoke animation.
  const AUTOPLAY = {
    light: ["S", "S", "S"],
    heavy: ["T", "T", "T"],
    mix: ["S", "S", "T", "C", "T", "S"],
    grab: ["C", "C"],
  };
  let autoplay = null; // { seq, i, gap, wait } or null when off
  function setAutoplay(name, gapSteps) {
    if (!name) { autoplay = null; log("⏹ autoplay off"); return null; }
    const seq = AUTOPLAY[name] || AUTOPLAY.mix;
    autoplay = { seq, i: 0, gap: gapSteps || 26, wait: 0 };
    log("▶ autoplay: " + name + " (" + seq.join(" ") + ")");
    return name;
  }
  function tickAutoplay() {
    if (!autoplay) return;
    // hold fire until the dummy finishes rising (user) — attacking a
    // half-spawned target read wrong; skipped when the dummy is disabled
    if (dummy && dummy.on && dummy.cur === "spawn") return;
    if (autoplay.wait > 0) { autoplay.wait--; return; }
    autoPress(autoplay.seq[autoplay.i++ % autoplay.seq.length]);
    autoplay.wait = autoplay.gap; // sim steps between inputs (26 ≈ 0.43s @60Hz)
  }

  // hold-detection for Triangle (launcher from stance)
  let tDown = 0;
  function triDown() { tDown = performance.now(); }
  function triUp() {
    const held = performance.now() - tDown;
    if (held > 350 && machine.holdPress("T")) { pressBtn("btnT"); log("▶ △ (hold) launcher"); }
    else input("T");
  }
  $("btnS").addEventListener("click", () => input("S"));
  $("btnT").addEventListener("mousedown", triDown);
  $("btnT").addEventListener("mouseup", triUp);
  $("btnC").addEventListener("click", () => input("C"));
  $("btnX").addEventListener("click", () => input("X"));
  // Autoplay / FX-only inspection controls (dev/QA capture aids)
  $("btnAutoplay").addEventListener("click", () => {
    const on = !autoplay;
    if (on) setComboPlay(false); // mutual exclusion: autoplay takes over from combo play
    setAutoplay(on ? "mix" : null);
    $("btnAutoplay").classList.toggle("latched", on);
    $("btnAutoplay").innerHTML = on ? "&#10073;&#10073; Autoplay" : "&#9654; Autoplay";
  });
  $("btnFxOnly").addEventListener("click", () => {
    window.__fxOnly = !window.__fxOnly;
    $("btnFxOnly").classList.toggle("latched", !!window.__fxOnly);
  });
  $("btnArena").addEventListener("click", () => {
    arenaOn = !arenaOn;
    $("btnArena").classList.toggle("latched", arenaOn);
  });
  $("btnFollow").addEventListener("click", () => {
    followCam = !followCam;
    $("btnFollow").classList.toggle("latched", followCam);
  });
  $("btnHitbox").addEventListener("click", () => {
    window.__hitbox = !window.__hitbox;
    $("btnHitbox").classList.toggle("latched", !!window.__hitbox);
    const leg = $("hbLegend");
    if (leg) leg.style.display = window.__hitbox ? "flex" : "none";
    if (window.__hitbox) status("tip: the Top camera preset reads the sectors best");
  });
  $("btnWpnLv").addEventListener("click", () => {
    weaponLevel = weaponLevel >= 5 ? 1 : 5;
    $("btnWpnLv").textContent = `Weapon Lv ${weaponLevel}`;
    $("btnWpnLv").classList.toggle("latched", weaponLevel >= 5);
  });
  $("btnCostume").addEventListener("click", () => {
    costumeIdx = (costumeIdx + 1) % COSTUMES.length;
    const cs = COSTUMES[costumeIdx];
    $("btnCostume").textContent = `Costume ${costumeIdx}`;
    $("btnCostume").classList.toggle("latched", costumeIdx > 0);
    log(`👕 Costume ${costumeIdx}: reach ${cs.wl} · dmg ×${cs.dmg} · orbs ×${cs.orb} (REAL /Player/ table)`);
  });
  $("btnDummy").addEventListener("click", () => {
    if (!dummy) { status("no dummy assets loaded"); return; }
    dummy.on = !dummy.on;
    $("btnDummy").classList.toggle("latched", dummy.on);
  });
  $("btnRootMo").addEventListener("click", () => {
    rootMotion.on = !rootMotion.on;
    rootMotion.x = rootMotion.z = rootMotion.px = rootMotion.pz = 0; // return home on toggle
    rootMotion.y = rootMotion.vy = rootMotion.hd = 0;
    locoVel.x = locoVel.z = 0;
    rootMotion.prevTrack = rootMotion.prevTrackY = rootMotion.prevTrackX = null;
    $("btnRootMo").classList.toggle("latched", rootMotion.on);
  });
  // Replay controls: pause / frame-step / slow-mo (dev/QA capture aid).
  $("btnPause").addEventListener("click", () => {
    paused = !paused;
    $("btnPause").classList.toggle("latched", paused);
    $("btnPause").innerHTML = paused ? "&#9654; Resume" : "&#10073;&#10073; Pause";
  });
  $("btnStep").addEventListener("click", () => { pendingSteps += 1; });
  $("btnSlow").addEventListener("click", () => {
    timescale = timescale === 1 ? 0.2 : 1;
    $("btnSlow").classList.toggle("latched", timescale !== 1);
    $("btnSlow").innerHTML = timescale !== 1 ? "&#189;&#215; Slo-mo (on)" : "&#189;&#215; Slo-mo";
  });
  $("btnL1").addEventListener("click", () => {
    machine.st.l1 = !machine.st.l1;
    $("btnL1").classList.toggle("latched", machine.st.l1);
    machine.press("L1");
  });
  $("btnRage").addEventListener("click", () => {
    const on = !machine.st.rage;
    $("btnRage").classList.toggle("latched", on);
    machine.setRage(on);
    log(on ? "★ RAGE OF THE GODS — blades stay out, god FX set + buff (re-identified)" : "☆ rage ends");
  });
  $("btnBrawl").addEventListener("click", () => {
    const on = !machine.st.brawl;
    $("btnBrawl").classList.toggle("latched", on);
    machine.setBrawl(on);
    log(on ? "👊 HAND-TO-HAND — blades sheathed, the fists strike (the 'berserk' clip set)" : "🗡 blades drawn — normal moveset");
  });

  let kDown = 0;
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === "j") input("S");
    if (k === "k") kDown = performance.now();
    if (k === "l") input("C");
    if (k === " ") { e.preventDefault(); input("X"); }
    if (k === "shift") { machine.st.l1 = true; $("btnL1").classList.add("latched"); machine.press("L1"); }
    if (k === "r") $("btnRage").click();
    if (k === "n") { nativeRes = !nativeRes; status(nativeRes ? "native res ON — 512×448 → 4:3 (bilinear)" : "native res OFF — full canvas res"); }
    // lab-toggle shortcuts (usability): mirror the grouped buttons
    if (k === "p") $("btnPause").click();
    if (k === ".") $("btnStep").click();
    if (k === "h") $("btnHitbox").click();
    if (k === "f") $("btnFollow").click();
    if (k === "d" && dbgHud) dbgHud.style.display = dbgHud.style.display === "none" ? "block" : "none";
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "k") { const held = performance.now() - kDown; if (held > 350 && machine.holdPress("T")) log("▶ △ (hold) launcher"); else input("T"); }
    if (k === "shift") { machine.st.l1 = false; $("btnL1").classList.remove("latched"); }
  });

  // ---- gamepad support (usability): the PS2 pad, on a real pad -------------
  // Standard-mapping Gamepad API: ✕=0 ○=1 □=2 △=3 L1=4 L2=6 R2=7 Select=8
  // Start=9 L3=10 R3=11. Face buttons map 1:1 (△ keeps the hold-launcher,
  // exactly like the K key); L1 blocks while held; L3+R3 together = RAGE —
  // the game's real activation; Select toggles Hand-to-hand, Start pauses;
  // right stick orbits the camera, L2/R2 analog-zoom. Polled per rendered
  // frame with edge detection (Chrome exposes pads after the first press).
  const padPrevBy = {}; // per-pad edge state, keyed by gamepad index
  let padActive = -1;   // index of the pad the user actually pressed last
  let padSeen = false;
  let padDbg = ""; // raw state line for the debug HUD (press D)
  let padStatusLast = "";
  const padStatusEl = () => $("padStatus");
  const setPadStatus = (txt) => {
    if (txt === padStatusLast) return;
    padStatusLast = txt;
    const el = padStatusEl();
    if (el) el.textContent = txt;
  };
  window.addEventListener("gamepadconnected", (e) => {
    status(`🎮 ${String(e.gamepad.id).slice(0, 44)} — ✕○□△ mapped · L1 block · L3+R3 rage`);
    setPadStatus(`🎮 ${String(e.gamepad.id).slice(0, 34)} exposed — press a button on it`);
  });
  window.addEventListener("gamepaddisconnected", (e) => {
    if (e.gamepad && padPrevBy[e.gamepad.index]) delete padPrevBy[e.gamepad.index];
    if (e.gamepad && e.gamepad.index === padActive) { padActive = -1; padSeen = false; }
    setPadStatus("🎮 waiting for controller — press any button on it");
  });
  // Button-index map. Xbox, DualShock/DualSense, and most modern/generic pads
  // report mapping "standard" in Chrome/Edge/Firefox: bottom=0 right=1 left=2
  // top=3 (✕○□△ positions). Firefox exposes SONY pads NON-standard in
  // DirectInput order (□=0 ✕=1 ○=2 △=3; right-stick Y on axis 5) — detected
  // by id. Unknown non-standard pads get standard-order indices (the majority
  // convention); the D debug HUD's raw line is the remap aid for exotics.
  const PAD_STD = { S: 2, C: 1, X: 0, T: 3, L1: 4, L2: 6, R2: 7, SEL: 8, ST: 9, L3: 10, R3: 11, AX: 2, AY: 3 };
  const PAD_SONY_DINPUT = { S: 0, C: 2, X: 1, T: 3, L1: 4, L2: 6, R2: 7, SEL: 8, ST: 9, L3: 10, R3: 11, AX: 2, AY: 5 };
  const isSonyId = (gp) => /054c|sony|dualshock|dualsense|wireless controller/i.test(gp.id || "");
  function padMap(gp) {
    if (gp.mapping === "standard") return PAD_STD;
    return isSonyId(gp) ? PAD_SONY_DINPUT : PAD_STD;
  }
  const padLabel = (gp) =>
    gp.mapping === "standard" ? "standard" : isSonyId(gp) ? "Sony remap" : "generic — standard order assumed";
  // Scan ALL exposed pads and follow the one the user actually presses —
  // taking the first slot broke on PCs where slot 0 is some other HID device
  // (wheel, joystick, virtual pad): the DS4 sat ignored in a later slot
  // (user-reported: the tester saw it, the lab didn't). Edge state is
  // per-pad; a press on any other pad switches control to it.
  function pollGamepad(wallDt) {
    try { pollGamepadInner(wallDt); } catch (e) {
      padDbg = "pad error: " + e.message; // a pad quirk must never halt the render loop
    }
  }
  function pollGamepadInner(wallDt) {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const pads = [];
    for (const g of gps) if (g && g.connected) pads.push(g);
    if (!pads.length) {
      padDbg = "";
      padStickL.x = padStickL.y = 0; // a vanished pad must not keep walking Kratos
      padEvade = null;
      setPadStatus("🎮 waiting for controller — press any button on it");
      return;
    }
    // pick the active pad: any pad with a pressed button wins; else keep the
    // previous active; else the first exposed one (idle default)
    let gp = pads.find((g) => g.index === padActive) || null;
    for (const g of pads) {
      let any = false;
      for (let i = 0; i < g.buttons.length; i++) if (g.buttons[i] && g.buttons[i].pressed) { any = true; break; }
      if (any && (!gp || g.index !== padActive)) { gp = g; break; }
    }
    if (!gp) {
      gp = pads[0];
      setPadStatus(`🎮 ${pads.length} pad${pads.length > 1 ? "s" : ""} exposed (${String(gp.id).slice(0, 26)}…) — press a button`);
    }
    if (gp.index !== padActive) {
      padActive = gp.index;
      padSeen = false; // announce the newly-adopted pad
    }
    const prev = padPrevBy[gp.index] || (padPrevBy[gp.index] = []);
    const M = padMap(gp);
    const down = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const edge = (i) => down(i) && !prev[i];
    let anyDown = false;
    for (let i = 0; i < gp.buttons.length; i++) if (down(i)) { anyDown = true; break; }
    if (!padSeen && anyDown) {
      padSeen = true;
      log(`🎮 controller active (${padLabel(gp)}) — ✕○□△ · △ hold launcher · L1 block · L3+R3 rage · Select hand-to-hand · Start pause · R-stick orbit · L2/R2 zoom`);
      setPadStatus(`🎮 ${String(gp.id).slice(0, 34)} (${padLabel(gp)})`);
    }
    // raw diagnostic for the debug HUD: pad slot + pressed indices + axes
    const pressedIdx = [];
    for (let i = 0; i < gp.buttons.length; i++) if (down(i)) pressedIdx.push(i);
    padDbg = `pad#${gp.index}[${gp.mapping || "raw"}] btns:${pressedIdx.join(",") || "-"} ax:${Array.from(gp.axes).map((a) => a.toFixed(1)).join(",")}`;
    if (edge(M.S)) input("S");
    if (edge(M.C)) input("C");
    if (edge(M.X)) input("X");
    if (edge(M.T)) triDown();
    if (!down(M.T) && prev[M.T]) triUp();
    if (edge(M.L1)) { machine.st.l1 = true; $("btnL1").classList.add("latched"); machine.press("L1"); }
    if (!down(M.L1) && prev[M.L1]) { machine.st.l1 = false; $("btnL1").classList.remove("latched"); }
    if ((edge(M.L3) && down(M.R3)) || (edge(M.R3) && down(M.L3))) $("btnRage").click(); // L3+R3 — the real activation
    if (edge(M.SEL)) $("btnBrawl").click();
    if (edge(M.ST)) $("btnPause").click();
    // LEFT stick → locomotion (GoW1 movement) — stored for the fixed-step sim
    const dz = (v) => (Math.abs(v) > 0.18 ? v : 0);
    padStickL.x = dz(gp.axes[0] || 0);
    padStickL.y = dz(gp.axes[1] || 0);
    // RIGHT stick → EVADE flick (GoW1's real right-stick role; no camera stick
    // in the game — cameras are authored, and Follow plays that part here)
    const rx = dz(gp.axes[M.AX] || 0), ry = dz(gp.axes[M.AY] || 0);
    const rmag = Math.hypot(rx, ry);
    if (rmag > 0.6 && prev.rMag <= 0.6) padEvade = { x: rx, y: ry };
    prev.rMag = rmag;
    // d-pad nudges the study camera (lab aid), L2/R2 analog zoom
    if (down(12)) pitch = Math.max(-1.4, Math.min(1.5, pitch - wallDt * 1.6));
    if (down(13)) pitch = Math.max(-1.4, Math.min(1.5, pitch + wallDt * 1.6));
    if (down(14)) { autoSpin = false; yaw -= wallDt * 2.2; }
    if (down(15)) { autoSpin = false; yaw += wallDt * 2.2; }
    const zoom = (gp.buttons[M.L2] ? gp.buttons[M.L2].value : 0) - (gp.buttons[M.R2] ? gp.buttons[M.R2].value : 0);
    if (zoom) userDist = Math.max(1.2, Math.min(26, userDist + zoom * wallDt * 10));
    for (let i = 0; i < gp.buttons.length; i++) prev[i] = down(i);
  }

  // sliders
  const bindSlider = (sid, vid, key) => {
    $(sid).addEventListener("input", () => {
      machine.windows[key] = $(sid).value / 100;
      $(vid).textContent = `${$(sid).value}%`;
    });
  };
  bindSlider("sQueue", "vQueue", "queue");
  bindSlider("sBranch", "vBranch", "branch");
  bindSlider("sCancel", "vCancel", "cancel");

  // ---------- combo sequence tester -----------------------------------------
  // User-authored face-button sequence replayed through the SAME input() path
  // the pad buttons use — the machine can't tell playback from a human press.
  // Timing rides the fixed-timestep sim (comboTick runs once per sim tick):
  // presses land just after the queue window opens, so the machine chains at
  // its branch point exactly like a well-timed player input. Mutually exclusive
  // with the scripted autoplay above (each turns the other off).
  const COMBO_DEFAULT = ["S", "S", "T"]; // □ □ △ — Plume of Prometheus
  const COMBO_MAX = 16;                  // keeps the glyph row readable
  const combo = {
    seq: COMBO_DEFAULT.slice(),
    playing: false,
    idx: 0,                 // next sequence entry to send
    wait: 0,                // idle dwell (sim ticks) before pressing from stance
    pressed: false,         // already pressed during the current move instance
    lastMove: "", lastT: 0, // move-instance change detection (name or t reset)
  };

  // simulate the entered sequence through the combo graph (mirrors comboTick's
  // resolution: branch from the current move; no branch → resolve from stance)
  function comboEndState(seq) {
    let cur = "idleCombat";
    // follow pass-through clips (jumpUp → jumpAir): the machine settles on the
    // .next state, and THAT is where the follow-up branches live — without
    // this, an ✕ entry previewed "no branches" instead of the air attacks
    const settle = () => {
      let guard = 0;
      while (guard++ < 4) {
        const n = Combat.GRAPH[cur];
        if (n && !n.loop && !(n.branches || []).length && n.next && Combat.GRAPH[n.next]) cur = n.next;
        else break;
      }
    };
    for (const k of seq) {
      settle();
      const node = Combat.GRAPH[cur];
      let b = node && (node.branches || []).find((x) => x.input === k && !x.mod);
      if (!b) b = (Combat.GRAPH.idleCombat.branches || []).find((x) => x.input === k && !x.mod);
      if (b && Combat.GRAPH[b.to]) cur = b.to;
    }
    settle();
    return cur;
  }

  function renderComboSeq() {
    const box = $("csGlyphs");
    box.innerHTML = "";
    if (!combo.seq.length) {
      const s = document.createElement("span");
      s.className = "cs-empty";
      s.textContent = "empty — add face buttons";
      box.append(s);
    } else combo.seq.forEach((key, i) => {
      const g = Combat.GLYPH[key];
      const s = document.createElement("span");
      s.className = "cs-glyph" + (combo.playing && i === combo.idx % combo.seq.length ? " next" : "");
      s.style.color = g.color;
      s.textContent = g.txt;
      box.append(s);
    });
    $("csPlay").disabled = !combo.seq.length;
    $("csShare").disabled = !combo.seq.length;
    // branch preview: where the sequence ends + the branches available from there,
    // as clickable chips that append that input (decide the next step by sight)
    const nextBox = $("csNext");
    nextBox.innerHTML = "";
    const end = comboEndState(combo.seq);
    const endNode = Combat.GRAPH[end] || Combat.GRAPH.idleCombat;
    let brs = (endNode.branches || []).filter((b) => !b.mod);
    let fromLabel = end;
    if (!brs.length) { // ender → recovers to stance; show stance options
      brs = (Combat.GRAPH.idleCombat.branches || []).filter((b) => !b.mod);
      fromLabel = `${end} → stance`;
    }
    const head = document.createElement("span");
    head.className = "cs-next-label";
    head.textContent = `next from ${fromLabel}:`;
    nextBox.append(head);
    for (const b of brs) {
      const g = Combat.GLYPH[b.input];
      if (!g) continue;
      const chip = document.createElement("button");
      chip.className = "cs-next-chip";
      chip.innerHTML = `<span style="color:${g.color}">${g.txt}</span> → ${b.to}`;
      chip.title = `append ${g.txt} (branches to ${b.to}${DUR[b.to] ? `, ${DUR[b.to].toFixed(2)}s` : ""})`;
      chip.addEventListener("click", () => {
        if (combo.seq.length < COMBO_MAX) { combo.seq.push(b.input); renderComboSeq(); }
      });
      nextBox.append(chip);
    }
    writeComboHash();
  }

  // shareable combos (usability): the entered sequence lives in the URL hash
  // (#combo=SST). replaceState (no history spam / no scroll); deduped because
  // renderComboSeq also fires on playback index changes.
  let comboHashLast = null;
  function writeComboHash() {
    const enc = combo.seq.join("");
    if (enc === comboHashLast) return;
    comboHashLast = enc;
    const h = enc ? "#combo=" + enc : "";
    history.replaceState(null, "", location.pathname + location.search + h);
  }

  function setComboPlay(on) {
    if (on === combo.playing || (on && !combo.seq.length)) return;
    if (on) stopDemo(); // starting a user combo is taking control
    if (on && autoplay) { // mutual exclusion: combo play takes over from autoplay
      setAutoplay(null);
      $("btnAutoplay").classList.remove("latched");
      $("btnAutoplay").innerHTML = "&#9654; Autoplay";
    }
    combo.playing = on;
    combo.idx = 0; combo.wait = 0; combo.pressed = false;
    $("csPlay").classList.toggle("latched", on);
    log(on ? `▶ combo play: ${combo.seq.map((k) => Combat.GLYPH[k].txt).join(" ")}` : "⏹ combo play stopped");
    renderComboSeq();
  }

  function comboTick() {
    if (!combo.playing || !combo.seq.length) return;
    const st = machine.st;
    // new move instance (name change or t reset) → allow one press during it
    if (st.current !== combo.lastMove || st.t < combo.lastT) combo.pressed = false;
    combo.lastMove = st.current; combo.lastT = st.t;
    if (combo.idx >= combo.seq.length) {
      // full sequence sent — loop once the machine settles back to a stance,
      // with a short beat so the restart reads as a new run
      if (!machine.isIdle()) return;
      combo.idx = 0;
      combo.wait = 30;
      // teleport home between runs so every sequence starts from center (user)
      rootMotion.x = rootMotion.z = rootMotion.px = rootMotion.pz = 0;
      rootMotion.y = rootMotion.vy = 0;
      renderComboSeq();
    }
    const key = combo.seq[combo.idx];
    if (machine.isIdle()) {
      if (combo.wait > 0) { combo.wait--; return; }
      const before = st.current;
      autoPress(key);
      // no branch from this stance (e.g. ○ in rage idle): skip the entry so
      // playback can never deadlock on an impossible input
      if (st.current === before) log(`◦ combo skip: ${Combat.GLYPH[key].txt} (no branch from ${before})`);
      combo.idx++;
      combo.pressed = false;
      renderComboSeq();
      return;
    }
    // mid-move: press once, just after the queue window opens; if the machine
    // queued it the entry is consumed, else retry from stance after recovery
    if (combo.pressed) return;
    if (st.t / st.dur < Math.min(machine.windows.queue + 0.05, 0.95)) return;
    combo.pressed = true;
    const qBefore = st.queued;
    autoPress(key);
    if (st.queued && st.queued !== qBefore) { combo.idx++; renderComboSeq(); }
  }

  const addComboKey = (key) => {
    if (combo.seq.length >= COMBO_MAX) return;
    combo.seq.push(key);
    renderComboSeq();
  };
  $("csAddS").addEventListener("click", () => addComboKey("S"));
  $("csAddT").addEventListener("click", () => addComboKey("T"));
  $("csAddC").addEventListener("click", () => addComboKey("C"));
  $("csAddX").addEventListener("click", () => addComboKey("X"));
  $("csClear").addEventListener("click", () => { setComboPlay(false); combo.seq.length = 0; renderComboSeq(); });
  $("csUndo").addEventListener("click", () => {
    combo.seq.pop();
    if (!combo.seq.length) setComboPlay(false);
    renderComboSeq();
  });
  $("csReset").addEventListener("click", () => { setComboPlay(false); combo.seq = COMBO_DEFAULT.slice(); renderComboSeq(); });
  $("csPlay").addEventListener("click", () => setComboPlay(!combo.playing));
  // shareable combo link: capture the incoming hash BEFORE the first render
  // (renderComboSeq writes the hash back — it must not clobber a shared link)
  const hashSeq = (location.hash.match(/^#combo=([STCXstcx]{1,16})/) || [])[1];
  if (hashSeq) combo.seq = hashSeq.toUpperCase().split("").slice(0, COMBO_MAX);
  comboHashLast = combo.seq.join(""); // suppress writing until the user edits
  renderComboSeq();

  // signature combos (usability): the famous strings as one-click chips — load
  // the sequence and play it. End states verified against the branch graph.
  const COMBO_PRESETS = [
    { label: "Plume of Prometheus", seq: ["S", "S", "T"] },
    { label: "Spirit of Hercules", seq: ["T", "T", "T", "T"] },
    { label: "Light chain ender", seq: ["S", "S", "S", "S", "S", "S"] },
    { label: "Air rave", seq: ["X", "S", "S", "S"] },
    { label: "Air slam", seq: ["X", "T"] },
  ];
  for (const p of COMBO_PRESETS) {
    const chip = document.createElement("button");
    chip.className = "cs-next-chip";
    chip.innerHTML = `${p.label}&nbsp;&nbsp;${p.seq.map((k) => `<span style="color:${Combat.GLYPH[k].color}">${Combat.GLYPH[k].txt}</span>`).join("")}`;
    chip.title = `load & play ${p.seq.map((k) => Combat.GLYPH[k].txt).join(" ")}`;
    chip.addEventListener("click", () => {
      setComboPlay(false);
      combo.seq = p.seq.slice();
      renderComboSeq();
      setComboPlay(true);
    });
    $("csPresets").append(chip);
  }

  // copy-share-link (usability): nobody thinks to copy the address bar.
  // Build the URL explicitly — writeComboHash's dedupe skips the initial
  // default sequence, so the address bar may not carry the hash yet.
  $("csShare").addEventListener("click", async () => {
    const enc = combo.seq.join("");
    const url = location.origin + location.pathname + location.search + (enc ? "#combo=" + enc : "");
    history.replaceState(null, "", url);
    comboHashLast = enc;
    try {
      await navigator.clipboard.writeText(url);
      status("combo link copied to clipboard");
      log("⧉ copied " + (enc ? "#combo=" + enc : url));
    } catch {
      log("⧉ share link: " + url); // clipboard blocked → surface it
      status("clipboard blocked — link is in the input log");
    }
  });

  // ---------- move palette (usability): every graph state, one click --------
  // Names are the REAL clip states; fancy labels harvested from the branch rows
  // (msgs_en.txt move names) + the FANCY table. force() routes through the same
  // start() path as input, so the card/branch stack/blend all behave normally.
  const BRANCH_FANCY = {};
  for (const gk of Object.keys(Combat.GRAPH))
    for (const b of Combat.GRAPH[gk].branches || [])
      if (b.fancy && !BRANCH_FANCY[b.to]) BRANCH_FANCY[b.to] = b.fancy;
  function buildPalette() {
    const list = $("paletteList");
    const q = $("paletteFilter").value.trim().toLowerCase();
    list.innerHTML = "";
    for (const name of Object.keys(Combat.GRAPH).sort()) {
      const node = Combat.GRAPH[name];
      const fancy = FANCY[name] || BRANCH_FANCY[name] || (node.loop ? "stance" : "");
      if (q && !(name.toLowerCase().includes(q) || fancy.toLowerCase().includes(q))) continue;
      const row = document.createElement("button");
      row.className = "pal-row";
      row.innerHTML =
        `<span class="pal-name">${name}</span>` +
        (fancy ? `<span class="pal-fancy">${fancy}</span>` : "") +
        (DUR[name] ? `<span class="pal-dur">${DUR[name].toFixed(2)}s</span>` : "");
      row.addEventListener("click", () => {
        stopDemo();
        setComboPlay(false);
        machine.force(name);
      });
      list.append(row);
    }
    if (!list.children.length) list.innerHTML = `<span class="log-line">no move matches "${q}"</span>`;
  }
  $("paletteFilter").addEventListener("input", buildPalette);
  buildPalette();

  // camera preset buttons (view group)
  $("btnCamFront").addEventListener("click", () => camPreset("front"));
  $("btnCamSide").addEventListener("click", () => camPreset("side"));
  $("btnCamTop").addEventListener("click", () => camPreset("top"));

  // Reset lab (usability): one click back to the default state — routed through
  // the existing handlers so every latch/label/legend stays in sync.
  $("btnResetLab").addEventListener("click", () => {
    stopDemo();
    setComboPlay(false);
    if (autoplay) $("btnAutoplay").click();
    if (machine.st.rage) $("btnRage").click();
    if (machine.st.brawl) $("btnBrawl").click();
    if (machine.st.l1) $("btnL1").click();
    if (window.__fxOnly) $("btnFxOnly").click();
    if (!arenaOn) $("btnArena").click();
    if (window.__hitbox) $("btnHitbox").click();
    if (!followCam) $("btnFollow").click();
    if (!rootMotion.on) $("btnRootMo").click();
    else {
      rootMotion.x = rootMotion.z = rootMotion.px = rootMotion.pz = rootMotion.y = rootMotion.vy = rootMotion.hd = 0;
      locoVel.x = locoVel.z = 0;
      rootMotion.prevTrack = rootMotion.prevTrackY = rootMotion.prevTrackX = null;
    }
    if (weaponLevel !== 1) $("btnWpnLv").click();
    if (costumeIdx !== 0) {
      costumeIdx = 0;
      $("btnCostume").textContent = "Costume 0";
      $("btnCostume").classList.remove("latched");
    }
    if (paused) $("btnPause").click();
    if (timescale !== 1) $("btnSlow").click();
    if (dbgHud) dbgHud.style.display = "none";
    combo.seq = COMBO_DEFAULT.slice();
    renderComboSeq();
    if (dummy) {
      dummy.on = true;
      $("btnDummy").classList.add("latched");
      dummy.x = 0; dummy.z = -5 * ARENA_M; dummy.hd = 0;
      dummy.kbx = dummy.kbz = 0; dummy.hp = dummy.maxHp; dummy.hits = 0;
      dummy.play("spawn");
    }
    log("↺ lab reset to defaults");
  });

  // ---------- main loop -----------------------------------------------------
  updateMoveCard();
  pushBranchBlock("idleCombat");
  // shareable combo link: a #combo=SSTX arrival plays its sequence on load
  // (replaces the first-run demo — the link IS the demo)
  if (hashSeq) {
    setComboPlay(true);
  } else {
    // first-run demo (usability): show the chains/trail/shockwave immediately on
    // load; the first REAL input (pad/keyboard/combo play) takes control
    autoDemo = true;
    setAutoplay("mix");
    $("btnAutoplay").classList.add("latched");
    $("btnAutoplay").innerHTML = "&#10073;&#10073; Autoplay";
  }
  status(`ready — ${mesh.verts.toLocaleString()} verts, ${clipsJson.clips.length} clips`);
  // Fixed-timestep sim (REND-03): everything time-authored — combat machine,
  // heat, pose, blade tracks, trail history, blend window — advances in exact
  // Loop.STEP (1/60s) ticks. Phases 4-6 author rates/lifetimes per-tick
  // against this cadence; on a 144Hz display the sim still runs 60 steps/s.
  let simStepCount = 0;
  // FIRE-02 impact-spark edge state: the combat hit counter (machine.st.hits) as of the
  // PREVIOUS sim tick. st.hits starts at 0 (combat.js) and only increments on landed
  // (non-idle) moves; a change since last tick == a new hit → burst sparks. Kept at
  // simStep scope so the edge is detected per SIM TICK, never per rendered frame (Pitfall 5).
  let prevHits = 0;
  function simStep() {
    const STEP = Loop.STEP;
    tickAutoplay(); // dev/QA capture aid — fires the next scripted input when active
    comboTick();    // user-authored combo playback — same input() path, queue-window timed
    locoTick();     // GoW1 stick locomotion + right-stick evades (fixed-step, like everything)
    dummyTick();    // target dummy: idle/taunt beats, reactions, knockback, respawn
    lastState = { name: machine.st.current, t: machine.st.t };
    machine.tick(STEP);
    // touchdown: a fall clip ends the instant the controller reaches the floor
    // (y from last tick's integration; rootMotion OFF falls back to the
    // one-loop settle in combat.js so the fall clip still plays out).
    // Landing WITH the stick held rolls through runLand — the momentum-
    // preserving landing clip — instead of planting into the full stop.
    // anticipation lead (rendered-frame trace): triggering at exactly y=0 made
    // the landing pose kick in a beat late — the feet visibly bounced. Start
    // the land clip ~0.1 s of fall-speed EARLY so the crouch develops through
    // contact (gravity keeps pulling y to the floor during the land state).
    const touchLead = Math.max(0, -rootMotion.vy * 0.05);
    if (rootMotion.on && rootMotion.vy < 0 && rootMotion.y <= touchLead &&
        (FALL_MOVES.test(machine.st.current) || PHYS_JUMP.test(machine.st.current))) {
      const moving = Math.hypot(padStickL.x, padStickL.y) > 0.2 && (locoVel.x || locoVel.z);
      machine.force(moving && !machine.st.brawl ? "runLand"
        : (Combat.GRAPH[machine.st.current].landTo || (machine.st.brawl ? "berLand" : "land")));
    }
    heat = Math.max(machine.st.rage ? 0.45 : 0, heat - STEP * 0.8);
    if (rig && skin) {
      const world = rig.computePose(machine.st.current, machine.st.t);
      // ROOT MOTION chaining: on a move transition, shift the persistent base so the
      // new clip's first authored root lands where the old clip left it — authored
      // lunges then ACCUMULATE across the combo (see rootMotion decl). The base is
      // clamped to the arena so looping combos can't walk Kratos through the walls.
      // The clips' root translation is authored on the PELVIS (joint 0 stays ~fixed).
      // Accumulate ONLY each outgoing clip's NET authored travel (its exit − its OWN
      // start). Matching pelvis poses across the seam instead (first attempt) mixed
      // POSE SWAY into the base: attack clips open with a backward wind-up pose, so
      // every transition shifted the base backward — the reported backward slide.
      // Combo clips are authored from a shared origin stance, so seams stay close
      // and the blend window absorbs the residual pose difference.
      // ROOT MOTION — the REAL decoded controller channel (ANM type-5 comp 422):
      // each attack carries a cumulative 1-D displacement scalar (combo3A 24.3 units
      // = 1.74 m ... combo3F 73.7 = 5.26 m, comboLR3/Plume 40.7 = 2.9 m). Per tick we
      // difference the channel WITHIN the current clip (transition ticks contribute
      // nothing — the blend is never captured) and advance the character along his
      // forward. The AMOUNT and timing are REAL; the world axis the engine applies
      // it along is INFERRED (+Z here = the direction the authored combos lunge; the
      // channel decreases as the character advances, hence the negation).
      if (rootMotion.on) {
        // horizontal controller channels: 422 = local forward (decreases as
        // the character advances; user-corrected axis), 420 = local lateral
        // (the side-evade rolls). Local diffs rotate by the facing heading.
        const rv = rig.rootDisp(machine.st.current, machine.st.t);
        const rvX = rig.rootDispX(machine.st.current, machine.st.t);
        let dZ = 0, dX = 0;
        if (!rootMotion.pendingRebase && rv !== null && rootMotion.prevTrack !== null) dZ = rv - rootMotion.prevTrack;
        if (!rootMotion.pendingRebase && rvX !== null && rootMotion.prevTrackX !== null) dX = rvX - rootMotion.prevTrackX;
        if (dZ || dX) {
          const c = Math.cos(rootMotion.hd), s = Math.sin(rootMotion.hd);
          rootMotion.x += c * dX + s * dZ;
          rootMotion.z += -s * dX + c * dZ;
        }
        rootMotion.prevTrack = rv;
        rootMotion.prevTrackX = rvX;
        // VERTICAL — three-way model matching the engine (see rootMotion decl):
        //  1. clip has a comp-421 channel → drive the REAL authored rise
        //     (differenced within the clip like 422; blends never captured)
        //  2. no channel + air state → HOVER (engine float — INFERRED; the GoW
        //     air-combo stall) — height holds through airH1-3 etc.
        //  3. no channel + ground state → fall under the REAL decoded
        //     /GlobGame/ Gravity (50 m/s²) until the floor, e.g. during `land`
        const curMove = machine.st.current;
        const rvY = rig.rootDispY(curMove, machine.st.t);
        const gn = Combat.GRAPH[curMove];
        const airState = !!(gn && (gn.air || (gn.category && gn.category.includes("air"))));
        const physJump = PHYS_JUMP.test(curMove);
        // takeoff edge: entering a jump state loads the ballistic v0 — the
        // instant launch the game has (the clip channels are reference motion)
        const fromMove = vertPrevMove;
        vertPrevMove = curMove;
        if (curMove !== fromMove) {
          if (curMove === "jumpUp" || (curMove === "berJumpAir" && GROUND_STANCE.test(fromMove))) rootMotion.vy = JUMP_V0;
          else if (curMove === "jumpDoubleAir" || curMove === "berJumpDoubleAir") rootMotion.vy = DJUMP_V0;
        }
        if (physJump || FALL_MOVES.test(curMove)) {
          // BALLISTIC controller: the REAL Gravity 50 on the way up AND down;
          // the clips are skins over the arc
          rootMotion.prevTrackY = null;
          rootMotion.vy -= JUMP_G * STEP; // channel-derived hero gravity (11.25 m/s²)
          rootMotion.y = Math.max(0, rootMotion.y + rootMotion.vy * STEP);
          if (rootMotion.y === 0 && rootMotion.vy < 0) rootMotion.vy = 0;
        } else if (rvY !== null && (!(gn && gn.loop) || airState)) {
          // CHANNEL-owned: the scripted full-magnitude leaps (comboJump,
          // blockLauncher launch-follow, airImpale, evade hops). Ground
          // stances' flat idle-bob constant is excluded by the loop guard.
          if (!rootMotion.pendingRebase && rootMotion.prevTrackY !== null) {
            rootMotion.y += (rvY - rootMotion.prevTrackY);
          }
          rootMotion.prevTrackY = rvY;
          rootMotion.vy = 0;
          if (rootMotion.y < 0) rootMotion.y = 0; // channel never digs below the floor
        } else {
          rootMotion.prevTrackY = null;
          if (airState) {
            // air-attack FLOAT (user-corrected): the combo drifts DOWN slowly —
            // it stalls the fall, it doesn't levitate. Quarter-strength gravity
            // easing into a ~0.9 m/s terminal drift (both INFERRED, feel);
            // a 3-hit air chain settles from the 2 m apex to the ground.
            const FLOAT_V = -0.9 * Chain.METERS_TO_WORLD;
            rootMotion.vy = Math.max(rootMotion.vy - JUMP_G * 0.25 * STEP, FLOAT_V);
            rootMotion.y = Math.max(0, rootMotion.y + rootMotion.vy * STEP);
            if (rootMotion.y === 0) rootMotion.vy = 0;
          } else if (rootMotion.y > 0) {
            // grounded state with residual height (post-touchdown): finish the
            // drop under the same real gravity
            rootMotion.vy -= JUMP_G * STEP; // channel-derived hero gravity (11.25 m/s²)
            rootMotion.y = Math.max(0, rootMotion.y + rootMotion.vy * STEP);
            if (rootMotion.y === 0) rootMotion.vy = 0;
          } else {
            rootMotion.y = 0; rootMotion.vy = 0;
          }
        }
        // The 16 m teleport-home exists for SCRIPTED playback (combo loops /
        // autoplay drifting off the arena). Free pad play always CLAMPS to the
        // walls instead — teleporting mid-run or MID-JUMP read as a bug once
        // the stick could roam (user report: it fired during a running jump).
        const scripted = combo.playing || !!autoplay;
        if (scripted) {
          const RESET_R = 4 * 4 * ARENA_M; // 16 m (user-doubled), instant, no easing
          if (rootMotion.x * rootMotion.x + rootMotion.z * rootMotion.z > RESET_R * RESET_R) {
            rootMotion.x = rootMotion.z = rootMotion.px = rootMotion.pz = 0;
          }
        } else {
          const lim = ARENA_HALF - ARENA_M;
          rootMotion.x = Math.max(-lim, Math.min(lim, rootMotion.x));
          rootMotion.z = Math.max(-lim, Math.min(lim, rootMotion.z));
        }
        rootMotion.px = rootMotion.x; rootMotion.pz = rootMotion.z;
      }
      applyRootPose(world); // heading rotation + accumulated offsets (always — hd persists with root motion off)
      rootMotion.pendingRebase = false;
      // CR-01: computePose fills and returns ONE internal buffer reused across
      // calls (anim.js makeRig closure). Aliasing it here let the blend-window
      // prev-pose call in uploadSkinnedVerts clobber it — freezing the rendered
      // pose AND the drawFx chain anchors at the stale pose for every blend
      // window. Snapshot instead. The local `world` stays valid for driveBlade
      // below: the next computePose call happens after this tick completes.
      if (!skin.lastWorld) skin.lastWorld = new Float32Array(world.length);
      skin.lastWorld.set(world);
      // authored blade tracks + swing trail recording — per sim tick, NOT per
      // rendered frame: TRL-01's stepped-60Hz trail extrusion depends on the
      // trail history being sampled at exactly 60Hz.
      if (blade) {
        const attacking = !machine.isIdle();
        // rage brawling: blades stay sheathed (the track parks them dorsal) —
        // blade-borne FX are wrong on these moves; the strike point is the FIST
        const fists = FIST_MOVES.test(machine.st.current);
        // age + expire the lingering hitbox snapshots + concussion rings (drawFx)
        for (const e of hitboxHist) e.age++;
        while (hitboxHist.length && hitboxHist[0].age > HITBOX_LINGER) hitboxHist.shift();
        for (const r of ringHist) r.age++;
        while (ringHist.length && ringHist[0].age > ringHist[0].durTicks + HITBOX_LINGER * 3) ringHist.shift();
        for (const r of fxRings) r.age++;
        while (fxRings.length && fxRings[0].age > fxRings[0].durTicks + 14) fxRings.shift();
        // FIRE-02: edge-detect the landed-hit counter ONCE per tick (combat.js start()
        // increments st.hits on each non-idle move, combat.js:172). A change since last
        // tick is a new hit → burst impact sparks off the blade (below). prevHits advances
        // AFTER the per-blade loop so BOTH blades see the same edge. Edge-triggered (once
        // per hit), NEVER per attacking frame (Pitfall 5 — a discrete event, not a rate).
        const hitEdge = machine.st.hits !== prevHits;
        // REAL concussion AoE on mapped impact moves: spawn the authored ring at
        // the character's position AT THE SLAM — the tick the move's real motion
        // channel completes (concussionTime), so the ring lands where he lands.
        if (CONCUSSION[machine.st.current]) {
          const cd = CONCUSSION[machine.st.current];
          const tStar = concussionTime(machine.st.current);
          if (machine.st.t >= tStar && machine.st.t - STEP < tStar) {
            const pj = (JID.pelvis !== undefined ? JID.pelvis : 0) * 16;
            const cx = skin.lastWorld[pj + 12], cz = skin.lastWorld[pj + 14];
            ringHist.push({ cx, cz, s: cd.s, e: cd.e, durTicks: Math.max(1, Math.round(cd.dur * 60)), age: 0 });
            if (cd.fx) fxRings.push({ cx, cz, s: cd.fx.s, e: cd.fx.e,
              durTicks: Math.max(1, Math.round(cd.fx.dur * 60)), age: 0 }); // authored shockwave visual
            // TARGET DUMMY inside the REAL concussion AoE → launch + the
            // decoded Ground Impulse Away knockback (KB_SCALE inferred)
            if (dummy && dummy.on && Math.hypot(dummy.x - cx, dummy.z - cz) <= cd.s * ARENA_M) {
              const dmg = 20 * (weaponLevel >= 5 ? 5 : 1) * COSTUMES[costumeIdx].dmg;
              dummyHit(dmg, cx, cz, true, cd.imp);
            }
          }
        }
        // copy before offsetting — bladePos may return a shared internal buffer
        const track0 = rig.bladePos(machine.st.current, machine.st.t);
        const track = track0 ? Array.from(track0) : null;
        if (track) applyRootTrack(track); // heading + offsets, matching the pose
        for (const [key, hand, trackOff] of [["l", JID.lWeapIH, 0], ["r", JID.rWeapIH, 3]]) {
          const hst = trailHist[key];
          for (const e of hst) e.age += STEP;
          while (hst.length && hst[0].age > TRAIL_AGE) hst.shift();
          if (hand === undefined) continue;
          const tp = track ? [track[trackOff], track[trackOff + 1], track[trackOff + 2]] : null;
          const bm = driveBlade(bladeSim[key], world, hand, tp, STEP);
          // FIRE-02 impact-spark burst: on the hit edge, erupt a shower of sparks off THIS
          // blade from the decoded FXC_BDEsparkemit family (A6 — same family as blade fire).
          // World spawn anchor = the emitter's REAL blade-local placement translation
          // transformed by the LIVE blade matrix (Particles.spawnAnchor), sampled ONCE — the
          // sparks then DECOUPLE and advect on their own vel via fxPool.integrate (SC1
          // blade-lag / D-03 / Pitfall 4). Rendered as velocity-aligned STRETCHED billboards
          // (Task 2). EVERY emission constant here is INFERRED (A1 — spark rate/velocity/
          // size/life param semantics undecoded, Pitfall 1); all Phase-7 footage-tunable.
          // The color is NOT set here — the REAL MAT_pticleMat.blendColor is applied at the
          // spark DRAW (Pitfall 4 — never fabricate a real effect color).
          // impact FX anchor: the blade for armed moves, the FIST for rage brawling
          const fistPos = [world[hand * 16 + 12], world[hand * 16 + 13], world[hand * 16 + 14]];
          if (hitEdge && sparkFxc && Array.isArray(sparkFxc.matrix)) {
            const SPARK_BURST_N = 14;             // INFERRED sparks per hit (A1/A6)
            const SPARK_BURST_LIFE = 20 * STEP;   // INFERRED ~0.33s short shower (A1)
            const SPARK_BURST_SIZE = 0.16;        // INFERRED billboard half-size; stretched at draw (A1)
            const SPARK_BURST_ALPHA = 1.8;        // INFERRED peak alpha128 (>1.0 overbright — premult path, A1)
            const SPARK_BURST_RISE = 2.2;         // INFERRED upward base velocity (impact fountain bias, A1)
            const SPARK_BURST_SPREAD = 5.0;       // INFERRED per-component pos+vel fan half-range (units/s, A1)
            // world spawn anchor = decoded blade-local FXC translation × live blade matrix,
            // sampled ONCE (spawnAnchor); the sparks decouple afterward (SC1 / Pitfall 4).
            const spos = fists ? fistPos : Particles.spawnAnchor(bladeSim[key].mat, sparkFxc.matrix);
            // burst() jitters BOTH pos and vel per-component by the sampler (runtime
            // Math.random — the fan, so each spark flies its own direction; D-07 keeps RNG
            // OUT of the pure tested paths). Higher energy than continuous fire = the
            // "impact" burst (A6). Identity rgb (1,1,1); the REAL fire color is applied at
            // the DRAW (Task 2), mirroring the fire batch (single source of truth, Pitfall 4).
            fxPool.burst(SPARK_BURST_N, {
              pos: spos,
              vel: [0, SPARK_BURST_RISE, 0],
              size: SPARK_BURST_SIZE,
              life: SPARK_BURST_LIFE,
              color: [1, 1, 1, SPARK_BURST_ALPHA],
              kind: "spark",
            }, () => (Math.random() - 0.5) * SPARK_BURST_SPREAD);
          }
          // on-hit FLASH: one GFX_flasher03 radial burst at THIS blade's tip on the
          // hit frame (REAL sprite; size/life/alpha INFERRED — no flash-emitter data)
          if (hitEdge && flasherTex) {
            const ftip = fists ? fistPos : xformM(bm, blade.tip);
            fxPool.spawn({
              pos: [ftip[0], ftip[1], ftip[2]],
              vel: [0, 0, 0],
              size: 7.0,               // INFERRED half-size (~0.5 m burst)
              life: 8 * STEP,          // INFERRED ~0.13 s pop
              color: [1, 1, 1, 2.6],   // white-hot, alpha128 overbright (premult path)
              kind: "hitFlash",
            });
          }
          if (attacking) {
            const tip = xformM(bm, blade.tip);
            // character-anchored reach sample: Kratos' position + the strike
            // point's live horizontal distance — blade TIP for armed moves
            // (REAL track), the FIST for rage brawling (blades sheathed)
            {
              const pj = (JID.pelvis !== undefined ? JID.pelvis : 0) * 16;
              const pcx = skin.lastWorld[pj + 12], pcz = skin.lastWorld[pj + 14];
              const rp = fists ? fistPos : tip;
              // record the strike HEIGHT and AZIMUTH — the melee filter IS the
              // sweep (the engine tests the strike path), so the display paints
              // only the sector actually covered: spins fill the circle, forward
              // combos show their true frontal arc, launchers climb at height.
              // reach scaled by the ACTIVE costume's REAL Weapon Length relative to
              // the default (0.7) — Tycoonius-style short/long reach trade-offs
              const reachK = COSTUMES[costumeIdx].wl / COSTUMES[0].wl;
              const reachR = Math.hypot(rp[0] - pcx, rp[2] - pcz) * reachK;
              const reachAng = Math.atan2(rp[2] - pcz, rp[0] - pcx);
              hitboxHist.push({ key, cx: pcx, cz: pcz, y: Math.max(0.3, rp[1]),
                r: reachR, ang: reachAng, age: 0 });
              // TARGET DUMMY melee test — the SAME swept-sector model the
              // Hitboxes display paints (reach + ±15° at the strike azimuth);
              // a 20-tick per-blade cooldown ≈ one hit per swing (works for
              // blades AND the brawl fists, whose strike point is the hand)
              if (dummy && dummy.on && simStepCount - dummy.lastHitSeg[key] > 20) {
                const ddx = dummy.x - pcx, ddz = dummy.z - pcz;
                const dd = Math.hypot(ddx, ddz);
                let da = Math.atan2(ddz, ddx) - reachAng;
                da = Math.atan2(Math.sin(da), Math.cos(da));
                if (dd <= reachR + 3 && Math.abs(da) <= Math.PI / 12) {
                  dummy.lastHitSeg[key] = simStepCount;
                  // damage = base × REAL weapon-level Dmg Mult (1→5) × REAL costume mult
                  const dmg = 8 * (weaponLevel >= 5 ? 5 : 1) * COSTUMES[costumeIdx].dmg;
                  dummyHit(dmg, pcx, pcz, false, 0);
                }
              }
            }
            // rage brawling: no swoosh decal, no blade fire — the blades are on
            // his back; skip everything blade-borne for this tick
            if (fists) continue;
            // hand = the grip/chain anchor at this sample — the trail sheet is swept by
            // the WHOLE chain+blade assembly (footage: at full extension the trail
            // extends down the chain), so rows span hand→tip, not hilt→tip.
            const ts = trailSeg[key];
            if (simStepCount - ts.last > 2) ts.id++; // push gap → new swing → new segment
            ts.last = simStepCount;
            hst.push({ tip, hilt: xformM(bm, blade.hilt), hand: [world[hand * 16 + 12], world[hand * 16 + 13], world[hand * 16 + 14]], age: 0, seg: ts.id });
            if (hst.length > 64) hst.shift();   // INFERRED: hold ~54-frame (TRAIL_AGE 0.9) sweep + margin
            // TRL-01/02 trail-spark riders: REMOVED (user). The per-tick tip specks
            // were an INFERRED richness layer (no decoded trail-spark record exists);
            // once the real swoosh decal carried the detail they read as a ring of
            // dots along the arc. Impact-spark bursts (hit edge, FIRE-02 above) and
            // the blade fire (below) remain — those are decoded-family effects.
            // FIRE-01 blade fire: both level-1 flame systems (flame3 + flame6) burn
            // on THIS blade every attacking tick. Each spawns at the decoded FXC
            // emitter matrix translation transformed to WORLD by the LIVE blade
            // matrix (Particles.spawnAnchor(bladeSim[key].mat, sys.matrix)), sampled
            // ONCE here — the particle then advects on its own vel+gravity via
            // fxPool.integrate and DECOUPLES, so a whipping blade outruns its fire
            // (SC1 blade-lag / D-03 / Pitfall 4). NEVER re-parent a live fire particle
            // to bladeSim in an integrate/draw path — sampling here at spawn is the
            // ONLY blade read (the 06-01 divergence known-answer pins this decouple).
            // EVERY emission constant below is INFERRED — no decoded fire rate/velocity/
            // size/life record exists (Pitfall 1 / A1); all Phase-7 footage-tunable.
            // TODO(Open Q1): promote rates/lifetimes to REAL if an FXC/PTC param-
            // semantics top-up decodes the emission fields (the upgrade path that
            // removes these INFERRED constants).
            const FIRE_PER_TICK = 3;      // INFERRED: modest flame on the blade (the bright blade point), not a scatter of dots — Phase-7 tune
            const FIRE_LIFE = 22 * STEP;  // INFERRED ~22-frame lifetime (0.37s @60Hz) at REST
            // Speed-scaled life (INFERRED): decoupled puffs off a fast blade string
            // BREADCRUMB DOTS along the arc — so a whipping blade kills its fire young
            // (a tight blob hugging the blade) while a slow blade burns fully.
            const pvt = hst.length > 1 ? hst[hst.length - 2].tip : tip;
            const tipSpeed = Math.hypot(tip[0] - pvt[0], tip[1] - pvt[1], tip[2] - pvt[2]) / STEP;
            const fireLife = FIRE_LIFE / (1 + tipSpeed * 0.12);
            const FIRE_SIZE = 0.7;        // INFERRED billboard half-size (fuller flame; was 0.5) — Phase-7 tune
            const FIRE_ALPHA = 1.9;       // INFERRED peak alpha128 (>1.0 overbright — premult path, CLAUDE.md Part 1 alpha-over-1.0)
            const FIRE_POS_JIT = 0.35;    // INFERRED positional jitter radius
            const FIRE_VEL_JIT = 1.2;     // INFERRED per-axis velocity jitter
            const FIRE_RISE = 2.0;        // INFERRED upward drift (embers rise before gravity settles them)
            for (const sys of fireSystems) {
              // world spawn = decoded blade-local FXC translation × live blade matrix,
              // sampled ONCE (spawnAnchor); the particle decouples afterward (SC1).
              const fpos = Particles.spawnAnchor(bladeSim[key].mat, sys.matrix);
              for (let f = 0; f < FIRE_PER_TICK; f++) {
                fxPool.spawn({
                  pos: [fpos[0] + (Math.random() - 0.5) * FIRE_POS_JIT,
                        fpos[1] + (Math.random() - 0.5) * FIRE_POS_JIT,
                        fpos[2] + (Math.random() - 0.5) * FIRE_POS_JIT],
                  vel: [(Math.random() - 0.5) * FIRE_VEL_JIT,
                        (Math.random() - 0.5) * FIRE_VEL_JIT + FIRE_RISE,   // +upward (INFERRED)
                        (Math.random() - 0.5) * FIRE_VEL_JIT],
                  size: FIRE_SIZE,
                  life: fireLife,
                  // per-particle rgb = identity (1,1,1); the REAL fire color is applied
                  // at the fire DRAW from db.meta.colorSource (Task 3), mirroring the
                  // chainglow identity-passthrough. alpha128 = INFERRED overbright peak.
                  color: [1, 1, 1, FIRE_ALPHA],
                  kind: sys.kind,   // "fire3" | "fire6" — batches/textures at draw (D-02)
                });
              }
            }
          }
        }
        // FIRE-02: advance the hit-edge state AFTER both blades have burst, so a single
        // hit fires exactly one burst per blade (not a spurious re-trigger on the 2nd blade).
        if (hitEdge) prevHits = machine.st.hits;
        // Advect + age-cull the whole pool ONCE per sim tick at exactly Loop.STEP
        // (Pitfall 5: NEVER a wall delta — emission/advection must read identical
        // at 60Hz and 144Hz). Runs every tick so sparks keep drifting/fading after
        // the attack ends; an empty pool is a cheap no-op.
        fxPool.integrate(STEP);
      }
      // blend-window bookkeeping: sim owns time; uploadSkinnedVerts only reads
      if (skin.blendLeft > 0) skin.blendLeft -= STEP;
    }
    simStepCount++;
  }
  const accum = Loop.makeAccumulator({ step: Loop.STEP, maxFrame: 0.25 });
  let last = performance.now();
  // Replay controls (dev/QA capture aid): pause freezes the sim (render keeps
  // running so the camera stays live), timescale gives slow-mo, and pendingSteps
  // lets the frame-step button advance N sim ticks while paused.
  let paused = false;
  let timescale = 1.0;
  let pendingSteps = 0;
  function loop(now) {
    // WR-04: the load-time fail-loud contract (#status) must also cover the
    // render-time half of the DEC-01 assert — Fx.applyMaterial throws fire
    // inside this rAF callback, long after the IIFE's .catch resolved. Route
    // loop-time exceptions to #status and halt cleanly instead of freezing
    // on the last frame with a stale "ready" status.
    try {
      const wallDt = (now - last) / 1000;
      last = now;
      pollGamepad(wallDt); // edge-detected pad input, once per rendered frame
      let n;
      if (paused) {
        n = pendingSteps; pendingSteps = 0; // only frame-step advances the sim
      } else {
        n = accum.advance(wallDt * timescale); // 0..15 fixed steps (slow-mo scales dt)
      }
      for (let i = 0; i < n; i++) simStep();
      renderFrame(wallDt); // render every rAF — camera/autospin stay smooth
      renderTimeline();
    } catch (e) {
      status("ERROR: " + e.message);
      console.error(e);
      return; // halt loudly — no further frames are scheduled
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // test hooks (used by automated verification; harmless in normal use)
  window.KratosLab = {
    machine, mesh, rig, skin, camGround, rootMotion, get dummy() { return dummy; },
    // step(): exactly ONE fixed sim step + one render + timeline — the
    // deterministic pump for automated verification (hidden tabs get no rAF
    // ticks, so scripts drive frames through this). The old variable-dt
    // parameter is GONE: sim always advances by exactly Loop.STEP (1/60s),
    // and the render's presentation dt is pinned to STEP for determinism.
    step() { pollGamepad(Loop.STEP); simStep(); renderFrame(Loop.STEP); renderTimeline(); },
    // --- replay controls (dev/QA capture aid) ---
    // pause(v): freeze/unfreeze the sim (render keeps running so the camera stays
    // live and screenshots work). pause() toggles. Returns the new paused state.
    pause(v) { paused = v === undefined ? !paused : !!v; return paused; },
    get paused() { return paused; },
    // setSpeed(x): slow-mo / fast-forward multiplier on sim time (1 = realtime,
    // 0.2 = 5× slow). Does not affect the render loop, only how fast the sim advances.
    setSpeed(x) { timescale = Math.max(0, Number(x) || 0); return timescale; },
    get speed() { return timescale; },
    // frameStep(k): advance exactly k sim ticks (default 1), even while paused —
    // for frame-by-frame capture. Returns the queued count.
    frameStep(k) { pendingSteps += Math.max(1, (k | 0) || 1); return pendingSteps; },
    // diag(): hero-draw health probe — why does Kratos vanish on attack? Reports
    // the current move, GL error, whether the skinned hero verts / blade matrices /
    // decoded light positions are finite. Call while paused on an attack frame.
    diag() {
      const nan = (arr) => { if (!arr) return 'n/a'; let b = 0; for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) b++; return b; };
      const bounds = (arr) => { if (!arr) return null; let mn = 1e30, mx = -1e30, ma = 0; for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v < mn) mn = v; if (v > mx) mx = v; const a = Math.abs(v); if (a > ma) ma = a; } return { min: +mn.toFixed(1), max: +mx.toFixed(1), maxAbs: +ma.toFixed(1) }; };
      const bl = {};
      for (const key of ["l", "r"]) {
        const bs = bladeSim[key];
        const lp = (bs && bs.pos && bs.mat) ? xformM(modelMat, xformM(bs.mat, key === "l" ? bladeLightL.anchor : bladeLightR.anchor)) : null;
        bl[key] = { hasPos: !!(bs && bs.pos), matNaN: nan(bs && bs.mat), posNaN: nan(bs && bs.pos), lightPos: lp, lightPosNaN: nan(lp) };
      }
      return {
        move: machine.st.current, attacking: !machine.isIdle(),
        glError: gl.getError(), heroVerts: heroSet.count,
        skinnedPosNaN: nan(heroSet.pos), skinnedBounds: bounds(heroSet.pos), poseBounds: bounds(skin && skin.lastWorld), poseNaN: nan(skin && skin.lastWorld),
        fxOnly: !!window.__fxOnly, camDist: +dist.toFixed(2), blades: bl,
      };
    },
    // independent 60Hz witness: scripts can sample this across wall time to
    // prove the sim cadence (60±1 steps/s on any display).
    get simStepCount() { return simStepCount; },
    // live particle-pool population — a plain integer for the 60Hz-vs-144Hz
    // particle-count parity check (spawn/integrate cadence). NO GL handles.
    get fxPoolCount() { return fxPool.count; },
    STEP: Loop.STEP,
    wadRecords, matDb, matTuples,
    gl, fxLog,
    // Sampled between frames (console), fxState proves the per-frame restore
    // discipline: blendEnabled false, blendEquation FUNC_ADD, depthMask true.
    fxState() {
      return {
        alpha: gl.getContextAttributes().alpha,
        blendEnabled: gl.isEnabled(gl.BLEND),
        blendEquation: gl.getParameter(gl.BLEND_EQUATION_RGB),
        blendSrcRGB: gl.getParameter(gl.BLEND_SRC_RGB),
        blendDstRGB: gl.getParameter(gl.BLEND_DST_RGB),
        depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
      };
    },
    // chainInfo(): world-scale proof surface for the CHAIN-01 checkpoint —
    // per-side link counts from the last Chain.buildRibbon result. ≈15–16
    // links over CHAIN_LEN 14 is the interim sanity bar (NOT the footage
    // cross-check, which is DEFERRED to Phase-1 polish 01-04). Numeric
    // primitives only — never a decoded string into the DOM (IN-06).
    chainInfo() {
      const side = (c) => (c ? { linkCount: c.nLinks, arcLen: c.arcLen, linkPitch: c.linkPitch, ribbonWidth: c.ribbonWidth } : null);
      return { l: side(bladeSim.l.chain), r: side(bladeSim.r.chain) };
    },
    // autoplay(name, gap): loop a scripted input sequence for hands-free FX
    // capture. Names: "light" | "heavy" | "mix" | "grab"; autoplay(false) stops.
    // Optional gap = sim steps between inputs (default 26 ≈ 0.43s @60Hz).
    autoplay(name, gap) { return setAutoplay(name === false ? null : (name || "mix"), gap); },
    setView(y, p, d) { yaw = y; pitch = p; dist = d; userDist = d; autoSpin = false; },
    // native-res 512×448 → 4:3 toggle (REND-03; same as the N keybind).
    // Default OFF — Phase 7's comparison harness flips it on programmatically.
    setNativeRes(on) { nativeRes = !!on; status(nativeRes ? "native res ON — 512×448 → 4:3 (bilinear)" : "native res OFF — full canvas res"); },
    isNativeRes() { return nativeRes; },
    // fxdb(): JSON-safe view of the runtime FxDb the fire/spark render slices read
    // (FIRE-01). Primitives + arrays only — colorSource (the REAL byte-decoded
    // MAT_pticleMat.blendColor) plus the fxc/ptc key sets — NEVER a GL/DOM handle
    // (IN-06). A node harness asserts the no-3rd-arg in-WAD build populates
    // colorSource + FXC_BDEsparkemit + PTC_flame6, proving the render `db` exists.
    fxdb() {
      return {
        colorSource: db.meta.colorSource,
        fxcKeys: Object.keys(db.fxc),
        ptcKeys: Object.keys(db.ptc),
      };
    },
    input,
    // combo sequence tester: state (seq/playing/idx) + programmatic toggle
    combo, setComboPlay,
  };
})().catch((e) => {
  const s = document.getElementById("status");
  if (/fetch .*(extracted|assets)/.test(e.message)) {
    s.textContent = "game assets not present in this deployment";
    const gl = document.getElementById("gl");
    if (gl) {
      const msg = document.createElement("div");
      msg.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#8a7d6a;font-family:monospace;font-size:13px;padding:24px;";
      msg.innerHTML = "This public build ships code only — the extracted game data is<br>" +
        "copyrighted and not distributed. To run the lab: clone the repo,<br>" +
        "extract assets from your own disc (see repo docs), then<br><br>" +
        "<code>node tools/kratos-lab/server.js</code>";
      gl.parentElement.appendChild(msg);
    }
  } else {
    s.textContent = "ERROR: " + e.message;
  }
  console.error(e);
});
