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
  const meshBuf = await Parsers.fetchBuf("/extracted/kratos/model/hero_0.bin");
  const mesh = Parsers.parseMesh(meshBuf);

  status("decoding skeleton + animations…");
  let rig = null;
  try {
    const objBuf = await Parsers.fetchBuf("/extracted/kratos/model/hero.bin");
    const anmBuf = await Parsers.fetchBuf("/extracted/kratos/animations/ANM_hero.bin");
    rig = GowAnim.makeRig(objBuf, anmBuf);
  } catch (e) { console.error("rig", e); }

  status("decoding Blades of Chaos…");
  let blade = null;
  try {
    const bladeAllMats = {};
    for (let i = 0; i < 16; i++) bladeAllMats[i] = 0;
    const bmesh = Parsers.parseMesh(await Parsers.fetchBuf("/extracted/weapon/MAIBlade_0.bin"), bladeAllMats);
    const bImg = Parsers.decodeTexture(
      await Parsers.fetchBuf("/extracted/weapon/GFX_stage1Btx.bin"),
      await Parsers.fetchBuf("/extracted/weapon/PAL_stage1Btx.bin"));
    const trailImg = Parsers.decodeTexture(
      await Parsers.fetchBuf("/extracted/weapon/GFX_swordtrail.bin"),
      await Parsers.fetchBuf("/extracted/weapon/PAL_swordtrail.bin"));
    const chainImg = Parsers.decodeTexture(
      await Parsers.fetchBuf("/extracted/weapon/GFX_chainlink.bin"),
      await Parsers.fetchBuf("/extracted/weapon/PAL_chainlink.bin"));
    // blade long axis -> hilt (end nearer origin) and tip points in blade-local space
    const ext = [bmesh.mx[0] - bmesh.mn[0], bmesh.mx[1] - bmesh.mn[1], bmesh.mx[2] - bmesh.mn[2]];
    const ax = ext.indexOf(Math.max(...ext));
    const mid = (a) => (a === ax ? 0 : (bmesh.mn[a] + bmesh.mx[a]) / 2);
    const endA = [mid(0), mid(1), mid(2)], endB = [mid(0), mid(1), mid(2)];
    endA[ax] = bmesh.mn[ax]; endB[ax] = bmesh.mx[ax];
    const dA = Math.hypot(...endA), dB = Math.hypot(...endB);
    const hilt = dA < dB ? endA : endB, tip = dA < dB ? endB : endA;
    blade = { mesh: bmesh, bImg, trailImg, chainImg, hilt, tip };
    console.log(`blade: ${bmesh.verts} verts ${bmesh.tris} tris, axis ${ax}, tip @ ${tip.map(v=>v.toFixed(1))}`);
  } catch (e) { console.warn("blade load", e); }

  status("decoding textures…");
  const texPairs = [
    ["GFX_MAI01F", "PAL_MAI01F"],
    ["GFX_MAI02F", "PAL_MAI02F", "PAL_MAI01F"],
    ["GFX_MAI03F", "PAL_MAI03F"],
  ];
  const texImages = [];
  for (const [g, p, fb] of texPairs) {
    try {
      const gfx = await Parsers.fetchBuf(`/extracted/kratos/textures/${g}.bin`);
      let pal;
      try { pal = await Parsers.fetchBuf(`/extracted/kratos/textures/${p}.bin`); }
      catch { pal = await Parsers.fetchBuf(`/extracted/kratos/textures/${fb}.bin`); }
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
    `source: R_HERO0.WAD / R_PERM.WAD`;

  // ---------- WebGL textured mesh renderer ----------------------------------
  const canvas = $("gl");
  const gl = canvas.getContext("webgl", { antialias: true, preserveDrawingBuffer: true });
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
  const bladeTex = blade ? makeTex(blade.bImg) : null;
  const trailTex = blade ? makeTex(blade.trailImg) : null;
  const chainTex = blade ? makeTex(blade.chainImg) : null;

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
  gl.attachShader(fxProg, shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    varying vec3 vT;
    uniform sampler2D uTex; uniform float uAdd;
    void main() {
      vec4 c = texture2D(uTex, vT.xy);
      if (uAdd < 0.5 && c.a < 0.35) discard;
      gl_FragColor = vec4(c.rgb * vT.z, uAdd > 0.5 ? vT.z * c.a : c.a);
    }`));
  gl.linkProgram(fxProg);
  const fxLocs = {
    aP: gl.getAttribLocation(fxProg, "aP"),
    aT: gl.getAttribLocation(fxProg, "aT"),
    uMVP: gl.getUniformLocation(fxProg, "uMVP"),
    uM: gl.getUniformLocation(fxProg, "uM"),
    uTex: gl.getUniformLocation(fxProg, "uTex"),
    uAdd: gl.getUniformLocation(fxProg, "uAdd"),
  };
  const fxBuf = gl.createBuffer();
  const s0 = mesh.scale;
  const modelMat = new Float32Array([
    s0, 0, 0, 0, 0, s0, 0, 0, 0, 0, s0, 0,
    -mesh.ctr[0] * s0, -mesh.ctr[1] * s0, -mesh.ctr[2] * s0, 1,
  ]);
  gl.uniformMatrix4fv(uModel, false, modelMat);
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.DEPTH_TEST);

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

  let yaw = 0.6, pitch = 0.15, dist = 3.6, userDist = 3.6, drag = null, autoSpin = true;
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
  const bladeSim = {
    l: { prevPos: null, mat: new Float32Array(16), pos: null },
    r: { prevPos: null, mat: new Float32Array(16), pos: null },
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

  function updateSkinning(dt) {
    if (!rig || !skin) return;
    let prevOut = null;
    if (skin.blendLeft > 0 && skin.prevAct) {
      const saved = skin.out;
      skin.out = new Float32Array(saved.length);
      skinPose(rig.computePose(skin.prevAct, skin.prevTime));
      prevOut = skin.out;
      skin.out = saved;
    }
    const world = rig.computePose(machine.st.current, machine.st.t);
    skin.lastWorld = world;
    skinPose(world);
    const outPos = skin.out;
    if (prevOut) {
      const f = 1 - skin.blendLeft / skin.blendDur;
      for (let i = 0; i < outPos.length; i++) outPos[i] = prevOut[i] * (1 - f) + outPos[i] * f;
      skin.blendLeft -= dt;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, outPos);
    // authored blade tracks + swing trail recording
    if (blade) {
      const attacking = !machine.isIdle();
      const track = rig.bladePos(machine.st.current, machine.st.t);
      for (const [key, hand, s0] of [["l", JID.lWeapIH, 0], ["r", JID.rWeapIH, 3]]) {
        const hst = trailHist[key];
        for (const e of hst) e.age += dt;
        while (hst.length && hst[0].age > TRAIL_AGE) hst.shift();
        if (hand === undefined) continue;
        const tp = track ? [track[s0], track[s0 + 1], track[s0 + 2]] : null;
        const bm = driveBlade(bladeSim[key], world, hand, tp, Math.max(dt, 1e-3));
        if (attacking) {
          hst.push({ tip: xformM(bm, blade.tip), hilt: xformM(bm, blade.hilt), age: 0 });
          if (hst.length > 26) hst.shift();
        }
      }
    }
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

  function drawFx(mvp) {
    if (!blade || !skin || !skin.lastWorld) return;
    const world = skin.lastWorld;
    const chainV = [], trailV = [];
    for (const [key, handN, chainN] of [["l", "lWeapIH", "lChain"], ["r", "rWeapIH", "rChain"]]) {
      const hand = JID[handN], chainJ = JID[chainN];
      const key = handN[0];
      if (hand !== undefined && chainJ !== undefined && bladeSim[key].pos) {
        // chain ribbon: forearm chain joint -> simulated blade pommel;
        // taut when the blade flies, saggy when gripped
        const a = [world[chainJ * 16 + 12], world[chainJ * 16 + 13], world[chainJ * 16 + 14]];
        const bpt = xformM(bladeSim[key].mat, blade.hilt);
        const d = [bpt[0] - a[0], bpt[1] - a[1], bpt[2] - a[2]];
        const len = Math.hypot(...d) || 1;
        const slack = Math.max(0, 1 - len / CHAIN_LEN);
        let cx = -d[2], cz = d[0];
        const cl = Math.hypot(cx, cz) || 1;
        const hw = 0.14;
        cx = (cx / cl) * hw; cz = (cz / cl) * hw;
        const rows = [];
        const segs = 10, reps = Math.max(1, Math.round(len / 0.9));
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const sag = Math.sin(Math.PI * t) * (0.4 + len * 0.35 * slack);
          const px = a[0] + d[0] * t, py = a[1] + d[1] * t - sag, pz = a[2] + d[2] * t;
          rows.push({ a: [px - cx, py, pz - cz], b: [px + cx, py, pz + cz], u: t * reps, alpha: 1 });
        }
        pushRibbon(rows, chainV);
      }
      const hst = trailHist[key];
      if (hst.length >= 2) {
        const rows = hst.map((e, i) => ({
          a: e.hilt, b: e.tip, u: i / (hst.length - 1),
          alpha: Math.max(0, 1 - e.age / TRAIL_AGE) * 0.85,
        }));
        pushRibbon(rows, trailV);
      }
    }
    if (!chainV.length && !trailV.length) return;
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
    if (chainV.length) {
      gl.uniform1f(fxLocs.uAdd, 0);
      gl.bindTexture(gl.TEXTURE_2D, chainTex);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(chainV), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, chainV.length / 6);
    }
    if (trailV.length) {
      gl.uniform1f(fxLocs.uAdd, 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.bindTexture(gl.TEXTURE_2D, trailTex);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trailV), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, trailV.length / 6);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.useProgram(prog);
  }

  function render(dt) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (autoSpin) yaw += dt * 0.25;
    updateSkinning(dt);
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
    dist += (target - dist) * Math.min(1, dt * (target > dist ? 10 : 2.5));
    const rot = M.mul(M.rotX(pitch), M.rotY(yaw));
    const mvp = M.mul(M.persp(0.9, w / h, 0.05, 50), M.mul(M.trans(0, 0, -dist), rot));
    gl.useProgram(prog);
    bindMeshSet(heroSet);
    gl.uniformMatrix4fv(uMVP, false, mvp);
    gl.uniformMatrix4fv(uRot, false, rot);
    gl.uniform1f(uHeat, heat);
    gl.uniform1f(uPages, atlasPages);
    gl.uniformMatrix4fv(uModel, false, modelMat);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.drawElements(gl.TRIANGLES, heroSet.count, gl.UNSIGNED_SHORT, 0);
    // Blades of Chaos: chain-simulated (gripped when slow, flung when whipped)
    if (bladeSet && skin && skin.lastWorld) {
      gl.uniform1f(uPages, 1);
      gl.bindTexture(gl.TEXTURE_2D, bladeTex);
      bindMeshSet(bladeSet);
      for (const key of ["l", "r"]) {
        if (!bladeSim[key].pos) continue;
        gl.uniformMatrix4fv(uModel, false, M.mul(modelMat, bladeSim[key].mat));
        gl.drawElements(gl.TRIANGLES, bladeSet.count, gl.UNSIGNED_SHORT, 0);
      }
      drawFx(mvp);
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

  // test hooks (used by automated verification; harmless in normal use)
  window.KratosLab = {
    machine, mesh, step, rig, skin,
    setView(y, p, d) { yaw = y; pitch = p; dist = d; userDist = d; autoSpin = false; },
    input,
  };
})().catch((e) => {
  document.getElementById("status").textContent = "ERROR: " + e.message;
  console.error(e);
});
