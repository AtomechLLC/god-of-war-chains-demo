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
    berserkEnter: "RAGE OF THE GODS",
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
  const TRAIL_SPARK_KINDS = new Set(["trailSpark"]);

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
  // alpha:false — opaque canvas: page compositing can never tint/wash out the
  // additive FX passes (REND-01; verify with the magenta-background test).
  // Gamma stance: naive 8-bit gamma-space math IS the target — no sRGB, no
  // tonemap (authority: reference/TARGET-DEFINITION.md).
  const gl = canvas.getContext("webgl", { alpha: false, antialias: true, preserveDrawingBuffer: true });
  const vsrc = `
    attribute vec3 aPos; attribute vec2 aUV; attribute vec3 aNrm; attribute vec3 aCol;
    uniform mat4 uMVP; uniform mat4 uRot; uniform mat4 uModel;
    varying vec2 vUV; varying vec3 vNrm; varying vec3 vCol;
    void main() {
      gl_Position = uMVP * (uModel * vec4(aPos, 1.0));
      vUV = aUV;
      vNrm = mat3(uRot[0].xyz, uRot[1].xyz, uRot[2].xyz) * aNrm;
      vCol = aCol;
    }`;
  const fsrc = `
    precision mediump float;
    varying vec2 vUV; varying vec3 vNrm; varying vec3 vCol;
    uniform sampler2D uTex; uniform float uHeat; uniform float uPages;
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
    gl.bindBuffer(gl.ARRAY_BUFFER, set.pos);
    gl.vertexAttribPointer(LOCS.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, set.uv);
    gl.vertexAttribPointer(LOCS.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, set.nrm);
    gl.vertexAttribPointer(LOCS.aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, set.col);
    gl.vertexAttribPointer(LOCS.aCol, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, set.ibo);
  }

  // ---------- skinning: real two-bone weights from the mesh VertexMeta ------
  // vertJ1/vertJ2 are the decoded per-vertex joint pair (weight w to J1, 1-w to
  // J2, from the position W word). Vertices without meta fall back to nearest
  // skinned joint in their chunk palette.
  let skin = null;
  if (rig) {
    const idle = rig.computePose(null, 0);
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
    for (const j of rig.obj.joints) {
      if (j.isSkinned) invBinds.push(rig.obj.invBind[j.invId]);
      else {
        const m = new Float32Array(16);
        rigidInverse(idle.subarray(j.id * 16, j.id * 16 + 16), m);
        invBinds.push(m);
      }
    }
    const valid = (id) => id >= 0 && id < rig.jointCount;
    const j1 = new Int16Array(mesh.verts), j2 = new Int16Array(mesh.verts);
    const wgt = new Float32Array(mesh.verts);
    let metaBound = 0, staticBound = 0, fallback = 0;
    for (let v = 0; v < mesh.verts; v++) {
      let a = mesh.vertJ1[v], bJ = mesh.vertJ2[v], w = mesh.vertW[v];
      if (mesh.vertStatic[v]) staticBound++;
      else if (valid(a) && valid(bJ)) metaBound++;
      else { a = 1; bJ = 1; w = 1; fallback++; } // pelvis fallback (should be ~0)
      j1[v] = a; j2[v] = bJ; wgt[v] = Math.max(0, Math.min(1, w));
    }
    console.log(`skinning: ${metaBound} two-bone, ${staticBound} static (blades), ${fallback} fallback of ${mesh.verts}`);
    skin = {
      j1, j2, wgt, metaBound, staticBound, fallback, invBinds,
      bindPos: mesh.pos.slice(),
      out: new Float32Array(mesh.pos.length),
      jointMats: new Float32Array(rig.jointCount * 16),
      prev: null, prevTime: 0, blendLeft: 0, blendDur: 0,
    };
  }

  function skinPose(world) {
    // dynamic: joint matrix = world * inverseBind; static verts: world only
    const jm = skin.jointMats;
    for (const j of rig.obj.joints) {
      const w = world.subarray(j.id * 16, j.id * 16 + 16);
      const ib = skin.invBinds[j.id];
      const o = j.id * 16;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
        jm[o + c * 4 + r] = w[r] * ib[c * 4] + w[4 + r] * ib[c * 4 + 1] + w[8 + r] * ib[c * 4 + 2] + w[12 + r] * ib[c * 4 + 3];
    }
    const bp = skin.bindPos, out = skin.out;
    const j1 = skin.j1, j2 = skin.j2, wg = skin.wgt, vs = mesh.vertStatic;
    for (let v = 0; v < mesh.verts; v++) {
      const x = bp[v * 3], y = bp[v * 3 + 1], z = bp[v * 3 + 2];
      if (vs[v]) { // static: coords live in joint-local space
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
    // TRL-01 runtime age->color ramp (INFERRED). 05-04 PROVED GFX_swordtrail
    // carries NO painted length-wise ramp, so the white-hot->orange->ember tint
    // MUST be computed at runtime here rather than sampled. Gated by uTrailRamp
    // so it touches ONLY the swordtrail pass — the chain/glow passes upload
    // uTrailRamp=0 (no bleed, T-06-03-01). uRampHot/uRampCool are the
    // Particles.rampColor(0)/(1) endpoints (per-move-variant tinted in drawFx);
    // vT.z is the per-row age proxy (0.85 fresh/young -> 0 old) that selects them.
    uniform float uTrailRamp; uniform vec3 uRampHot; uniform vec3 uRampCool;
    void main() {
      vec4 c = texture2D(uTex, vT.xy);
      vec3 rgb = c.rgb * uLayerColor.rgb * uMaterialColor;
      float a = c.a * uLayerColor.a * vT.z;
      // cutout 0.35 is INFERRED — GS TEST-register alpha test is not in MAT
      // records (02-RESEARCH A3); Phase 5's GS dump reads the real value.
      if (a < uCutoff) discard;
      if (uTrailRamp > 0.5) {
        // age fraction: young/hot (t=0) at high alpha -> old/ember (t=1) at low.
        float t = clamp(1.0 - vT.z / 0.85, 0.0, 1.0);
        rgb *= mix(uRampHot, uRampCool, t);   // MODULATE texel by the INFERRED ramp
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
    uRampHot: gl.getUniformLocation(fxProg, "uRampHot"),
    uRampCool: gl.getUniformLocation(fxProg, "uRampCool"),
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
  const POOL_CAP = 512;
  const fxPool = Particles.makePool({ maxParticles: POOL_CAP });
  const POOL_FLOATS_PER_VERT = 11;                 // aCenter(3)+aCorner(2)+aUV(2)+aColor(4)
  const POOL_STRIDE = POOL_FLOATS_PER_VERT * 4;    // interleaved stride in bytes
  const poolProg = gl.createProgram();
  gl.attachShader(poolProg, shader(gl.VERTEX_SHADER, `
    attribute vec3 aCenter;   // particle center (mesh-local — same space as the trail verts)
    attribute vec2 aCorner;   // ±halfSize corner offset
    attribute vec2 aUV;
    attribute vec4 aColor;    // rgb + alpha128 (may exceed 1.0 — premultiplied in the fragment)
    uniform mat4 uMVP; uniform vec3 uCamRight; uniform vec3 uCamUp;
    varying vec2 vUV; varying vec4 vColor;
    void main() {
      // Billboard: expand the quad along the camera right/up axes so every
      // sprite faces the camera with NO per-particle CPU matrix (CLAUDE.md Part
      // 3). uCamRight/uCamUp are the view matrix's row-0/row-1 (columns of its
      // transpose), supplied by drawPool.
      vec3 world = aCenter + uCamRight * aCorner.x + uCamUp * aCorner.y;
      gl_Position = uMVP * vec4(world, 1.0);
      vUV = aUV; vColor = aColor;
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
    uMVP: gl.getUniformLocation(poolProg, "uMVP"),
    uCamRight: gl.getUniformLocation(poolProg, "uCamRight"),
    uCamUp: gl.getUniformLocation(poolProg, "uCamUp"),
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
    trans(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
  };

  // start highly zoomed out (full figure + blade-path space); user wheel-zooms in
  let yaw = 0.6, pitch = 0.15, dist = 9.0, userDist = 9.0, drag = null, autoSpin = true;
  canvas.addEventListener("mousedown", (e) => { drag = [e.clientX, e.clientY]; autoSpin = false; });
  window.addEventListener("mouseup", () => (drag = null));
  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    yaw += (e.clientX - drag[0]) * 0.008;
    pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - drag[1]) * 0.006));
    drag = [e.clientX, e.clientY];
  });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); userDist = Math.max(1.2, Math.min(16, userDist + e.deltaY * 0.002)); }, { passive: false });

  let heat = 0;
  const JID = {};
  if (rig) for (const j of rig.obj.joints) JID[j.name] = j.id;
  const trailHist = { l: [], r: [] };
  const TRAIL_AGE = 0.22;

  // ---- blade transforms from the game's authored type-10 tracks ------------
  // Each act stores per-frame world-space positions for both blades
  // (stream 0 = left, stream 1 = right; verified against the idle hand
  // positions). Gripped when the track sits at the hand; flying otherwise,
  // tip (-Z) leading along the track velocity.
  const CHAIN_LEN = 14; // ribbon slack reference only
  // TRAIL_INNER_T: fraction from hilt→tip that the trail sheet's inner edge is
  // biased toward (Pattern 7). INFERRED (A9) from footage analysis in
  // trail-fidelity-from-footage.md — NOT a decoded value. 0.6 makes the trail
  // hug the tip arc (the outer sweep) instead of the full hilt→tip sheet.
  const TRAIL_INNER_T = 0.6;
  const bladeSim = {
    l: { prevPos: null, mat: new Float32Array(16), pos: null, chain: null },
    r: { prevPos: null, mat: new Float32Array(16), pos: null, chain: null },
  };

  function driveBlade(sim, world, hand, trackPos, dt) {
    const handM = world.subarray(hand * 16, hand * 16 + 16);
    const anchor = [handM[12], handM[13], handM[14]];
    const pos = trackPos ? [trackPos[0], trackPos[1], trackPos[2]] : anchor;
    if (!sim.prevPos) sim.prevPos = pos.slice();
    const vel = [(pos[0] - sim.prevPos[0]) / dt, (pos[1] - sim.prevPos[1]) / dt, (pos[2] - sim.prevPos[2]) / dt];
    sim.prevPos = pos.slice();
    sim.pos = pos;
    const distToHand = Math.hypot(pos[0] - anchor[0], pos[1] - anchor[1], pos[2] - anchor[2]);
    const speed = Math.hypot(...vel);
    if (distToHand < 2.0) {
      // gripped: follow the hand frame at the authored position
      sim.mat.set(handM);
      sim.mat[12] = pos[0]; sim.mat[13] = pos[1]; sim.mat[14] = pos[2];
    } else {
      // flying: tip leads the motion; radial from the hand when slow
      let zx, zy, zz;
      if (speed > 12) { zx = -vel[0] / speed; zy = -vel[1] / speed; zz = -vel[2] / speed; }
      else {
        zx = -(pos[0] - anchor[0]) / distToHand;
        zy = -(pos[1] - anchor[1]) / distToHand;
        zz = -(pos[2] - anchor[2]) / distToHand;
      }
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
      skinPose(rig.computePose(skin.prevAct, skin.prevTime));
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
      const p = q.pos, c = q.color, size = q.size;
      // per-particle fade: peak alpha128 (c[3], INFERRED overbright) × life-left.
      const fade = q.life > 0 ? Math.max(0, 1 - q.age / q.life) : 0;
      const a = (c && c.length > 3 ? c[3] : 1) * fade;
      // Guard non-finite BEFORE the value reaches bufferSubData (V5 / T-06-04-03).
      // Particles.spawn already rejects non-finite inputs at emission; this is
      // defense-in-depth for the runtime-derived fade/size so NaN never uploads.
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2]) ||
          !Number.isFinite(size) || !Number.isFinite(a)) continue;
      // Fire batch overrides per-particle rgb with the REAL decoded fire color
      // (tint = db.meta.colorSource / MAT_pticleMat.blendColor [2,2,2,1] overbright);
      // the per-particle alpha128 (INFERRED overbright peak) is UNTOUCHED, so the
      // additive-premult fragment (rgb·alpha128, ONE,ONE) recovers GS brightness
      // ABOVE the 1.0 clamp (CLAUDE.md Part 1 alpha-over-1.0). Spark batch: no tint,
      // per-particle rgb as-is. NO fabricated crimson anywhere (Pitfall 4).
      const cr = tint ? tint[0] : (c ? c[0] : 1);
      const cg = tint ? tint[1] : (c ? c[1] : 1);
      const cb = tint ? tint[2] : (c ? c[2] : 1);
      for (let k = 0; k < 4; k++) {
        const cor = POOL_CORNERS[k];
        V[o++] = p[0]; V[o++] = p[1]; V[o++] = p[2];       // aCenter (mesh-local)
        V[o++] = cor[0] * size; V[o++] = cor[1] * size;     // aCorner (±size)
        V[o++] = cor[2]; V[o++] = cor[3];                   // aUV
        V[o++] = cr; V[o++] = cg; V[o++] = cb; V[o++] = a;  // aColor rgb + alpha128
      }
      drawn++;
    }
    if (drawn === 0) return;
    gl.useProgram(poolProg);
    gl.uniformMatrix4fv(poolLocs.uMVP, false, M.mul(mvp, modelMat)); // aCenter is mesh-local
    gl.uniform3f(poolLocs.uCamRight, rx, ry, rz);
    gl.uniform3f(poolLocs.uCamUp, ux, uy, uz);
    gl.uniform1i(poolLocs.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, poolVertBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, V.subarray(0, drawn * 4 * POOL_FLOATS_PER_VERT));
    gl.enableVertexAttribArray(poolLocs.aCenter);
    gl.enableVertexAttribArray(poolLocs.aCorner);
    gl.enableVertexAttribArray(poolLocs.aUV);
    gl.enableVertexAttribArray(poolLocs.aColor);
    gl.vertexAttribPointer(poolLocs.aCenter, 3, gl.FLOAT, false, POOL_STRIDE, 0);
    gl.vertexAttribPointer(poolLocs.aCorner, 2, gl.FLOAT, false, POOL_STRIDE, 12);
    gl.vertexAttribPointer(poolLocs.aUV, 2, gl.FLOAT, false, POOL_STRIDE, 20);
    gl.vertexAttribPointer(poolLocs.aColor, 4, gl.FLOAT, false, POOL_STRIDE, 28);
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
  }

  function drawFx(mvp, view) {
    fxLog.length = 0;
    if (!blade || !skin || !skin.lastWorld) return;
    const world = skin.lastWorld;
    const chainV = [], trailV = [];
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
      }
      const hst = trailHist[key];
      if (hst.length >= 2) {
        const rows = hst.map((e, i) => ({
          // inner edge biased toward the tip arc (Pattern 7, fair-game overlap);
          // u/v orientation is unchanged — the decoded swordtrail texture
          // confirms bright ember edge at v=1 (tip) and age ramp toward u=1.
          a: lerp3(e.hilt, e.tip, TRAIL_INNER_T), b: e.tip, u: i / (hst.length - 1),
          alpha: Math.max(0, 1 - e.age / TRAIL_AGE) * 0.85,
        }));
        pushRibbon(rows, trailV);
      }
    }
    // Reach the pool pass even when chain/trail are empty (the pool draws its own
    // program/buffer). An empty pool no-ops inside drawPool, so state stays clean.
    if (!chainV.length && !trailV.length && fxPool.count === 0) return;
    gl.useProgram(fxProg);
    gl.uniformMatrix4fv(fxLocs.uMVP, false, mvp);
    gl.uniformMatrix4fv(fxLocs.uM, false, modelMat);
    gl.uniform1i(fxLocs.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf);
    gl.enableVertexAttribArray(fxLocs.aP);
    gl.enableVertexAttribArray(fxLocs.aT);
    gl.vertexAttribPointer(fxLocs.aP, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(fxLocs.aT, 3, gl.FLOAT, false, 24, 12);
    gl.disable(gl.CULL_FACE);
    // Every FX pass takes its FULL blend/depth state from its decoded MAT via
    // Fx.applyMaterial — no hardcoded blendFunc/depthMask here (DEC-01).
    if (chainV.length) {
      // Convert the chain verts to a Float32Array ONCE so PASS 1 (links) and
      // PASS 2 (glow) draw bit-identical bytes -> bit-identical depth. That is
      // what makes the coplanar LEQUAL glow overlay exact (Pattern 5 / Pitfall 1).
      const chainVerts = new Float32Array(chainV);
      const chainVertCount = chainV.length / 6;

      // The age->color ramp is a swordtrail-ONLY tint — keep it OFF for both
      // chain passes so it never bleeds into the decoded chain/glow texels
      // (T-06-03-01). The trail pass below re-enables it.
      gl.uniform1f(fxLocs.uTrailRamp, 0.0);

      // PASS 1 — links: real decoded state = usual alpha blend + depth-write ON
      // (MAT_chainlink 0x44010080). The ONLY pass that uploads.
      const matL = matDb.byName.MAT_chainlink;
      Fx.applyMaterial(gl, matL);
      fxLog.push({ name: matL.name, mode: matL.mode, depthWrite: !matL.disableDepthWrite });
      // __fxBright (debug): overbright the dark metal so the segmented link
      // geometry is legible WITHOUT the chainglow. Inspection aid only — real
      // visibility comes from the PASS-2 glow overlay below.
      gl.uniform3fv(fxLocs.uMaterialColor, window.__fxBright ? [8, 8, 8] : matL.materialColor);
      gl.uniform4fv(fxLocs.uLayerColor, matL.blendColor);
      gl.uniform1f(fxLocs.uCutoff, 0.35); // INFERRED cutout threshold (02-RESEARCH A3)
      gl.bindTexture(gl.TEXTURE_2D, chainlinkTex);
      gl.bufferData(gl.ARRAY_BUFFER, chainVerts, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, chainVertCount);

      // PASS 2 — chainglow: additive + depth-write OFF (MAT_chainglow 0x48090080),
      // drawing the SAME vertex bytes (NO re-upload -> bit-identical depth). The
      // heat-ramp colors come straight from the decoded texture: MAT_chainglow
      // carries identity material/blend colors, so the MODULATE shader passes
      // texels through unchanged — there is NO hand-picked glow color anywhere.
      // Visible over the links because depthFunc(LEQUAL) (set once at init)
      // admits the coplanar equal-depth fragments.
      const matG = matDb.byName.MAT_chainglow;
      Fx.applyMaterial(gl, matG);
      fxLog.push({ name: matG.name, mode: matG.mode, depthWrite: !matG.disableDepthWrite });
      gl.uniform3fv(fxLocs.uMaterialColor, matG.materialColor); // identity — texels pass through
      gl.uniform4fv(fxLocs.uLayerColor, matG.blendColor); // identity RGBA
      gl.uniform1f(fxLocs.uCutoff, 0.0); // additive: alpha ≡ 1, no cutout (a 0.35 copy would be wrong by construction)
      gl.bindTexture(gl.TEXTURE_2D, chainglowTex);
      gl.drawArrays(gl.TRIANGLES, 0, chainVertCount); // SAME bytes — no bufferData
    }
    if (trailV.length) {
      // MAT_swordtrail decodes additive + depth-write OFF (0x48090080) — the
      // former hardcoded guess, now data-confirmed.
      const mat = matDb.byName.MAT_swordtrail;
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
      // TRL-02 dual variant: Particles.variantFor(machine.st.current) picks BFT
      // (crimson fire) vs BGT (neutral swoosh) per move. BOTH variants reuse this
      // ONE decoded GFX_swordtrail texture + MAT_swordtrail blend — only the
      // runtime tint on the ramp stops differs. The per-variant tint is INFERRED
      // and traces to the runtime ramp; it NEVER introduces a fabricated real
      // color (Pitfall 4). An unknown/idle move defaults safely inside variantFor.
      const variant = Particles.variantFor(machine.st.current);   // "BFT" | "BGT"
      const hot0 = Particles.rampColor(0.0);    // INFERRED white-hot core (t=0)
      const cool0 = Particles.rampColor(1.0);   // INFERRED ember (t=1)
      let rampHot, rampCool;
      if (variant === "BGT") {
        // BGT neutral swoosh: pull the ramp stops toward white -> a faint,
        // near-hueless streak (INFERRED per-variant tint; Phase-7 footage-tunable).
        const toWhite = (c, k) => [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k];
        rampHot = toWhite(hot0, 0.15);
        rampCool = toWhite(cool0, 0.70);
      } else {
        // BFT crimson fire: keep red, damp green/blue -> a hot crimson streak
        // (INFERRED per-variant tint; Phase-7 footage-tunable).
        const crimson = (c) => [c[0], c[1] * 0.50, c[2] * 0.45];
        rampHot = crimson(hot0);
        rampCool = crimson(cool0);
      }
      gl.uniform1f(fxLocs.uTrailRamp, 1.0);
      gl.uniform3fv(fxLocs.uRampHot, rampHot);
      gl.uniform3fv(fxLocs.uRampCool, rampCool);
      gl.bindTexture(gl.TEXTURE_2D, trailTex);
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
    drawPool(mvp, view, trailTex, { name: "fxSpark", kinds: TRAIL_SPARK_KINDS });
    // PASS — blade fire (flame3 + flame6, FIRE-01): its OWN batch by texture (D-02).
    // Color = the REAL decoded fire color from db.meta.colorSource
    // (MAT_pticleMat.blendColor, [2,2,2,1] overbright) applied as the per-vertex rgb
    // tint; the per-particle alpha128 (INFERRED overbright peak) carries the extra
    // brightness so the additive-premult fragment (rgb·alpha128, ONE,ONE) recovers GS
    // brightness ABOVE the 1.0 clamp (CLAUDE.md Part 1 alpha-over-1.0). Sprite =
    // fireTex (resolved MAT_pticleMat texture, or the documented trailTex fallback —
    // MAT_pticleMat has no texName). NO fabricated crimson: the color is decoded
    // (Pitfall 4); only the runtime age fade (life-left in drawPool) is INFERRED.
    drawPool(mvp, view, fireTex, { name: "fxFire", kinds: FIRE_KINDS, tint: db.meta.colorSource.value });
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
    // auto-frame: pull back so flying blades stay in view, ease back in after
    let reach = 0;
    for (const key of ["l", "r"]) {
      const p = bladeSim[key].pos;
      if (!p) continue;
      const gx = (p[0] - mesh.ctr[0]) * mesh.scale, gy = (p[1] - mesh.ctr[1]) * mesh.scale, gz = (p[2] - mesh.ctr[2]) * mesh.scale;
      reach = Math.max(reach, Math.hypot(gx, gy, gz));
    }
    const required = reach > 1.1 ? reach * 1.5 + 1.4 : 0;
    const target = Math.max(userDist, required);
    dist += (target - dist) * Math.min(1, wallDt * (target > dist ? 10 : 2.5));
    const rot = M.mul(M.rotX(pitch), M.rotY(yaw));
    // view = camera transform (world→view); its row-0/row-1 give the world-space
    // camera right/up the billboard pool needs (drawPool). Split out of the mvp
    // compose so drawFx can hand it to drawPool.
    const view = M.mul(M.trans(0, 0, -dist), rot);
    // native pass projects at the 4:3 DISPLAY aspect (non-square GS pixels) —
    // NOT the 512/448 storage aspect (02-RESEARCH A2)
    const mvp = M.mul(M.persp(0.9, nativeRes ? NATIVE.displayAspect : w / h, 0.05, 50), view);
    gl.useProgram(prog);
    bindMeshSet(heroSet);
    gl.uniformMatrix4fv(uMVP, false, mvp);
    gl.uniformMatrix4fv(uRot, false, rot);
    gl.uniform1f(uHeat, heat);
    gl.uniform1f(uPages, atlasPages);
    gl.uniformMatrix4fv(uModel, false, modelMat);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // __fxOnly (debug): skip the hero + blade MESHES so the FX passes render
    // alone against the black clear — isolates chain/trail visibility.
    if (!window.__fxOnly) gl.drawElements(gl.TRIANGLES, heroSet.count, gl.UNSIGNED_SHORT, 0);
    // Blades of Chaos: chain-simulated (gripped when slow, flung when whipped)
    if (bladeSet && skin && skin.lastWorld) {
      gl.uniform1f(uPages, 1);
      gl.bindTexture(gl.TEXTURE_2D, bladeTex);
      bindMeshSet(bladeSet);
      if (!window.__fxOnly) for (const key of ["l", "r"]) {
        if (!bladeSim[key].pos) continue;
        gl.uniformMatrix4fv(uModel, false, M.mul(modelMat, bladeSim[key].mat));
        gl.drawElements(gl.TRIANGLES, bladeSet.count, gl.UNSIGNED_SHORT, 0);
      }
      drawFx(mvp, view);
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
  let lastState = { name: "idleCombat", t: 0 };
  const machine = Combat.makeMachine((n) => DUR[n], {
    onMove(name, prev, via) {
      heat = machine.st.rage ? 0.75 : 0.35;
      if (skin && prev) {
        const bl = CLIP[name] && CLIP[name].blend > 0 && CLIP[name].blend <= 0.5 ? CLIP[name].blend : 0.08;
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
      $("moveData").innerHTML =
        `<b>${c.name}</b> — ANM clip id ${c.id}<br>` +
        `duration <b>${c.dur.toFixed(4)}s</b> (${Math.round(c.dur * 30)} frames)<br>` +
        `blend-in <b>${c.blend}s</b>${c.blend === 0 ? " (hard cut)" : ""}<br>` +
        `keyframes sampled at <b>${c.kfHz} Hz</b><br>` +
        `header @ 0x${c.off.toString(16).toUpperCase()} in ANM_hero.bin`;
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
  function renderTimeline() {
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
    const fr = Math.floor((t / dur) * dur * 30), tot = Math.round(dur * 30);
    $("tlFrames").textContent = `frame ${Math.min(fr, tot)} / ${tot} @30fps`;
    $("hitNum").textContent = machine.st.hits;
  }

  // ---------- inputs --------------------------------------------------------
  const pressBtn = (id) => { const el = $(id); el.classList.add("pressed"); setTimeout(() => el.classList.remove("pressed"), 110); };
  function input(key) {
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
    if (autoplay.wait > 0) { autoplay.wait--; return; }
    input(autoplay.seq[autoplay.i++ % autoplay.seq.length]);
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
    setAutoplay(on ? "mix" : null);
    $("btnAutoplay").classList.toggle("latched", on);
    $("btnAutoplay").innerHTML = on ? "&#10073;&#10073; Autoplay" : "&#9654; Autoplay";
  });
  $("btnFxOnly").addEventListener("click", () => {
    window.__fxOnly = !window.__fxOnly;
    $("btnFxOnly").classList.toggle("latched", !!window.__fxOnly);
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
    log(on ? "★ RAGE OF THE GODS" : "☆ rage ends");
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
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "k") { const held = performance.now() - kDown; if (held > 350 && machine.holdPress("T")) log("▶ △ (hold) launcher"); else input("T"); }
    if (k === "shift") { machine.st.l1 = false; $("btnL1").classList.remove("latched"); }
  });

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

  // ---------- main loop -----------------------------------------------------
  updateMoveCard();
  pushBranchBlock("idleCombat");
  status(`ready — ${mesh.verts.toLocaleString()} verts, ${clipsJson.clips.length} clips`);
  // Fixed-timestep sim (REND-03): everything time-authored — combat machine,
  // heat, pose, blade tracks, trail history, blend window — advances in exact
  // Loop.STEP (1/60s) ticks. Phases 4-6 author rates/lifetimes per-tick
  // against this cadence; on a 144Hz display the sim still runs 60 steps/s.
  let simStepCount = 0;
  function simStep() {
    const STEP = Loop.STEP;
    tickAutoplay(); // dev/QA capture aid — fires the next scripted input when active
    lastState = { name: machine.st.current, t: machine.st.t };
    machine.tick(STEP);
    heat = Math.max(machine.st.rage ? 0.45 : 0, heat - STEP * 0.8);
    if (rig && skin) {
      const world = rig.computePose(machine.st.current, machine.st.t);
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
        const track = rig.bladePos(machine.st.current, machine.st.t);
        // TRL-02: BFT (crimson fire) vs BGT (neutral swoosh) tint for THIS move —
        // reuses the pure Particles.variantFor + rampColor(0) hot stop (06-03), so
        // the sparks read the SAME family as the trail sheet. INFERRED runtime
        // tint, never a fabricated real color (05-04: no painted ramp).
        const variant = Particles.variantFor(machine.st.current);   // "BFT" | "BGT"
        const hot = Particles.rampColor(0.0);
        const sparkTint = variant === "BGT"
          ? [hot[0] + (1 - hot[0]) * 0.15, hot[1] + (1 - hot[1]) * 0.15, hot[2] + (1 - hot[2]) * 0.15]
          : [hot[0], hot[1] * 0.50, hot[2] * 0.45];
        for (const [key, hand, trackOff] of [["l", JID.lWeapIH, 0], ["r", JID.rWeapIH, 3]]) {
          const hst = trailHist[key];
          for (const e of hst) e.age += STEP;
          while (hst.length && hst[0].age > TRAIL_AGE) hst.shift();
          if (hand === undefined) continue;
          const tp = track ? [track[trackOff], track[trackOff + 1], track[trackOff + 2]] : null;
          const bm = driveBlade(bladeSim[key], world, hand, tp, STEP);
          if (attacking) {
            const tip = xformM(bm, blade.tip);
            const prevTip = hst.length ? hst[hst.length - 1].tip : tip;
            hst.push({ tip, hilt: xformM(bm, blade.hilt), age: 0 });
            if (hst.length > 26) hst.shift();
            // TRL-01/02 trail-spark riders (D-04c — the user's #1 richness lever):
            // a few hot specks spawn on the tip arc each attacking tick, then
            // DECOUPLE (they advect on their own vel + gravity via fxPool.integrate,
            // so a whipping blade outruns its sparks — the authentic lag, D-03).
            // EVERY emission constant here is INFERRED — no decoded trail-spark
            // rate/velocity/size/life record exists (Pitfall 1); all Phase-7
            // footage-tunable. Determinism boundary (D-07): the jitter is runtime
            // Math.random, kept OUT of the pure tested Particles paths.
            const SPARKS_PER_TICK = 3;        // INFERRED emission rate (few per tick, per side)
            const SPARK_LIFE = 30 * STEP;     // INFERRED ~30-frame trail-gone anchor (0.5s @60Hz)
            const SPARK_SIZE = 0.18;          // INFERRED billboard half-size (mesh-local units)
            const SPARK_ALPHA = 1.6;          // INFERRED peak alpha128 (>1.0 overbright — premult path)
            const POS_JIT = 0.25;             // INFERRED positional jitter radius
            const VEL_JIT = 1.5;              // INFERRED per-axis velocity jitter
            // swing velocity along the tip arc (tip - prevTip)/STEP; sparks inherit
            // a SMALL fraction so they trail the blade rather than track it (lag),
            // plus a slight INFERRED upward drift so embers rise before gravity.
            const sw = [(tip[0] - prevTip[0]) / STEP, (tip[1] - prevTip[1]) / STEP, (tip[2] - prevTip[2]) / STEP];
            for (let s = 0; s < SPARKS_PER_TICK; s++) {
              fxPool.spawn({
                pos: [tip[0] + (Math.random() - 0.5) * POS_JIT,
                      tip[1] + (Math.random() - 0.5) * POS_JIT,
                      tip[2] + (Math.random() - 0.5) * POS_JIT],
                vel: [sw[0] * 0.10 + (Math.random() - 0.5) * VEL_JIT,
                      sw[1] * 0.10 + (Math.random() - 0.5) * VEL_JIT + 1.2,   // +upward (INFERRED)
                      sw[2] * 0.10 + (Math.random() - 0.5) * VEL_JIT],
                size: SPARK_SIZE,
                life: SPARK_LIFE,
                color: [sparkTint[0], sparkTint[1], sparkTint[2], SPARK_ALPHA],
                kind: "trailSpark",
              });
            }
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
            const FIRE_PER_TICK = 2;      // INFERRED per-system, per-side emission rate
            const FIRE_LIFE = 22 * STEP;  // INFERRED ~22-frame lifetime (0.37s @60Hz)
            const FIRE_SIZE = 0.5;        // INFERRED billboard half-size (mesh-local units)
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
                  life: FIRE_LIFE,
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
  function loop(now) {
    // WR-04: the load-time fail-loud contract (#status) must also cover the
    // render-time half of the DEC-01 assert — Fx.applyMaterial throws fire
    // inside this rAF callback, long after the IIFE's .catch resolved. Route
    // loop-time exceptions to #status and halt cleanly instead of freezing
    // on the last frame with a stale "ready" status.
    try {
      const wallDt = (now - last) / 1000;
      last = now;
      const n = accum.advance(wallDt); // 0..15 fixed steps owed this frame
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
    machine, mesh, rig, skin,
    // step(): exactly ONE fixed sim step + one render + timeline — the
    // deterministic pump for automated verification (hidden tabs get no rAF
    // ticks, so scripts drive frames through this). The old variable-dt
    // parameter is GONE: sim always advances by exactly Loop.STEP (1/60s),
    // and the render's presentation dt is pinned to STEP for determinism.
    step() { simStep(); renderFrame(Loop.STEP); renderTimeline(); },
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
