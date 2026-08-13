// anim.js — God of War (2005) skeleton + animation decoder.
// Format knowledge from mogaika/god_of_war_browser (pack/wad/obj, pack/wad/anm).
// hero.bin  = object: joint hierarchy, idle pose (pos float / rot Q.14), inverse binds.
// ANM_hero  = animation: groups -> acts -> per-datatype states -> sample streams.

const GowAnim = (() => {
  const Q14 = 1 / (1 << 14);

  // ---------- object / skeleton ---------------------------------------------
  function parseObject(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const jointCount = dv.getUint32(0x1c, true);
    const dataOffset = dv.getUint32(0x28, true);
    const joints = [];
    for (let i = 0; i < jointCount; i++) {
      const jo = 0x2c + i * 0x10;
      const no = 0x2c + jointCount * 0x10 + i * 0x18;
      let name = "";
      for (let k = 0; k < 0x18 && b[no + k]; k++) name += String.fromCharCode(b[no + k]);
      const flags = dv.getUint32(jo, true);
      joints.push({
        id: i, name, flags,
        parent: dv.getInt16(jo + 8, true),
        isSkinned: (flags & 0x80) !== 0,
        isQuat: (flags & 0x8000) !== 0,
        invId: -1,
      });
    }
    let inv = 0;
    for (const j of joints) if (j.isSkinned) j.invId = inv++;

    const d = dataOffset;
    const mat3offset = dv.getUint32(d + 12, true);
    const mat3count = dv.getUint32(d + 16, true);
    const vec4offset = dv.getUint32(d + 32, true);
    const vec5offset = dv.getUint32(d + 36, true);
    const pos = new Float32Array(jointCount * 4);
    const rotQ14 = new Int32Array(jointCount * 4);
    for (let i = 0; i < jointCount; i++) {
      for (let k = 0; k < 4; k++) {
        pos[i * 4 + k] = dv.getFloat32(d + vec4offset + i * 16 + k * 4, true);
        rotQ14[i * 4 + k] = dv.getInt32(d + vec5offset + i * 16 + k * 4, true);
      }
    }
    const invBind = [];
    for (let i = 0; i < mat3count; i++) {
      const m = new Float32Array(16);
      for (let k = 0; k < 16; k++) m[k] = dv.getFloat32(d + mat3offset + i * 64 + k * 4, true);
      invBind.push(m);
    }
    return { joints, pos, rotQ14, invBind };
  }

  // ---------- ANM parsing ----------------------------------------------------
  function parseAnm(b) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const dtCount = dv.getUint16(0x10, true);
    const grCount = dv.getUint16(0x12, true);
    const dataTypes = [];
    const dtBase = 0x18 + grCount * 4;
    for (let i = 0; i < dtCount; i++) dataTypes.push(dv.getUint16(dtBase + i * 4, true));
    const skinDescrIdx = dataTypes.indexOf(0);
    const acts = new Map();
    for (let g = 0; g < grCount; g++) {
      const go = dv.getUint32(0x18 + g * 4, true);
      if (go === 0 || go >= b.length) continue;
      if (dv.getUint32(go + 8, true) & 0x20000) continue; // external group
      const actCount = dv.getUint32(go + 0xc, true);
      for (let a = 0; a < actCount; a++) {
        const ao = go + dv.getUint32(go + 0x30 + a * 4, true);
        let name = "";
        for (let k = 0; k < 0x18 && b[ao + 0x24 + k]; k++) name += String.fromCharCode(b[ao + 0x24 + k]);
        if (!acts.has(name)) {
          acts.set(name, {
            off: ao,
            duration: dv.getFloat32(ao + 0x1c, true),
            skinDescrIdx,
          });
        }
      }
    }
    return { acts, dataTypes, skinDescrIdx };
  }

  function readBitmap(b, dv, off, flags) {
    // default: 1 word, 1 paired element, dataOffset 0, bitmap [0x0001]
    if (!(flags & 2)) return { paired: 1, dataOff: 0, words: [1], shiftsOff: -1 };
    const wordCount = b[off], paired = b[off + 1];
    const dataOff = dv.getUint16(off + 2, true);
    const words = [];
    for (let i = 0; i < wordCount; i++) words.push(dv.getUint16(off + 4 + i * 2, true));
    return { paired, dataOff, words, shiftsOff: off + 4 + wordCount * 2 };
  }

  function readShifts(b, bitmap, flags) {
    const shifts = new Int8Array(bitmap.paired);
    if (bitmap.paired === 1) shifts[0] = (flags << 24) >> 28; // int8(flags) >> 4
    else for (let i = 0; i < bitmap.paired; i++) shifts[i] = (b[bitmap.shiftsOff + i] << 24) >> 24;
    return shifts;
  }

  const coeff = (s) => (s === 0 ? 1 : s < 0 ? 1 << -s : 1 / (1 << s));

  // Parse one state entry (0xC bytes at stateOff); emits streams:
  // {kind: "raw"|"add", elemSize, base, frames Float32Array per component...}
  function parseState(b, dv, stateOff, isRot, out) {
    const base = dv.getUint16(stateOff, true);
    const flags = b[stateOff + 2];
    const skip64k = b[stateOff + 3];
    const mCount = dv.getUint16(stateOff + 4, true);
    const mOffset = dv.getUint16(stateOff + 6, true);
    const mDatas3 = dv.getUint16(stateOff + 8, true);
    const mOffData = dv.getUint16(stateOff + 10, true);
    const stateData = stateOff + (skip64k << 16) + mOffData;

    const emit = (mgr, dataStart, additive) => {
      const bitmap = readBitmap(b, dv, additive === "adamant" ? -1 : dataStart, 0); // unused path
    };

    const parseStream = (mgr, bufBase, bitmap, additive, shifts) => {
      const elem = isRot ? (additive ? 1 : 2) : (additive ? 2 : 4);
      const step = bitmap.paired * elem;
      let iter = 0;
      for (let w = 0; w < bitmap.words.length; w++) {
        let mask = bitmap.words[w];
        while (mask) {
          const bit = 31 - Math.clz32(mask & -mask);
          mask = mask ^ (mask & -mask);
          const compIdx = base + w * 16 + bit;
          const frames = new Float32Array(mgr.count);
          for (let f = 0; f < mgr.count; f++) {
            const o = bufBase + bitmap.dataOff + step * f + iter * elem;
            if (isRot) {
              frames[f] = additive
                ? ((b[o] << 24) >> 24) * coeff(shifts[iter])
                : dv.getInt16(o, true);
            } else {
              frames[f] = additive
                ? (dv.getInt16(o, true) * coeff(shifts[iter])) / 256
                : dv.getFloat32(o, true);
            }
          }
          out.push({ comp: compIdx, additive: !!additive, frames, fStart: mgr.offset, hold: mgr.datas3 });
          iter++;
        }
      }
    };

    if (mCount !== 0) {
      const mgr = { count: mCount, offset: mOffset, datas3: mDatas3 };
      const bitmap = readBitmap(b, dv, stateData, flags);
      if (flags & 1) parseStream(mgr, stateData, bitmap, true, readShifts(b, bitmap, flags));
      else parseStream(mgr, stateData, bitmap, false, null);
    } else {
      const addCnt = b[stateData], totalCnt = b[stateData + 1];
      const bitmap = readBitmap(b, dv, stateData + 2 + totalCnt * 8, flags);
      for (let s = 0; s < totalCnt; s++) {
        const mo = stateData + 2 + s * 8;
        const mgr = {
          count: dv.getUint16(mo, true), offset: dv.getUint16(mo + 2, true),
          datas3: dv.getUint16(mo + 4, true),
        };
        const offData = dv.getUint16(mo + 6, true);
        const bufBase = stateOff + (skip64k << 16) + offData;
        if (s < addCnt) parseStream(mgr, bufBase, bitmap, true, readShifts(b, bitmap, flags));
        else parseStream(mgr, bufBase, bitmap, false, null);
      }
    }
  }

  // Decode an act and BAKE absolute per-frame component tables.
  // Additive streams are frame-over-frame deltas (each frame inherits the
  // previous frame's values), raw streams are absolute sets — applied in
  // stream order, exactly like the game's accumulator.
  function decodeAct(b, dv, act, skinDescrIdx, jointCount, initRot, initPos) {
    if (act.decoded) return act.decoded;
    const ao = act.off;
    const sdo = ao + 0x64 + skinDescrIdx * 0x14;
    const rotStateCount = dv.getUint16(sdo + 2, true);
    const rotStatesOff = ao + dv.getUint32(sdo + 8, true);
    const frameTime = dv.getFloat32(sdo + 0xc, true) || 1 / 30;
    const rot = [], pos = [];
    try {
      for (let i = 0; i < rotStateCount; i++) parseState(b, dv, rotStatesOff + i * 0xc, true, rot);
      const posCount = dv.getUint16(ao + 0x7a, true);
      const posTable = dv.getUint32(ao + 0x80, true);
      if (posCount && posTable && ao + posTable < b.length) {
        for (let i = 0; i < posCount; i++) parseState(b, dv, ao + posTable + i * 0xc, false, pos);
      }
    } catch (e) {
      console.warn("act decode", e);
    }
    const frames = Math.max(1, Math.round(act.duration / frameTime) + 1);
    const nc = jointCount * 4;
    const rotTable = new Float32Array(frames * nc);
    const posTable2 = new Float32Array(frames * nc);
    const rv = Float32Array.from(initRot);
    const pv = Float32Array.from(initPos);
    for (let f = 0; f < frames; f++) {
      for (const st of rot) {
        let si = f - st.fStart;
        if (si < 0 || si >= st.frames.length + st.hold || st.comp >= nc) continue;
        if (si >= st.frames.length) si = st.frames.length - 1;
        if (st.additive) rv[st.comp] += st.frames[si];
        else rv[st.comp] = st.frames[si];
      }
      for (const st of pos) {
        let si = f - st.fStart;
        if (si < 0 || si >= st.frames.length + st.hold || st.comp >= nc) continue;
        if (si >= st.frames.length) si = st.frames.length - 1;
        if (st.additive) pv[st.comp] += st.frames[si];
        else pv[st.comp] = st.frames[si];
      }
      rotTable.set(rv, f * nc);
      posTable2.set(pv, f * nc);
    }
    act.decoded = { rotTable, posTable: posTable2, frameTime, frames, nc };
    return act.decoded;
  }

  // ---------- runtime pose ---------------------------------------------------
  function quatToMat(x, y, z, w, out, px, py, pz) {
    const n = Math.hypot(x, y, z, w) || 1;
    x /= n; y /= n; z /= n; w /= n;
    out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y + z * w); out[2] = 2 * (x * z - y * w); out[3] = 0;
    out[4] = 2 * (x * y - z * w); out[5] = 1 - 2 * (x * x + z * z); out[6] = 2 * (y * z + x * w); out[7] = 0;
    out[8] = 2 * (x * z + y * w); out[9] = 2 * (y * z - x * w); out[10] = 1 - 2 * (x * x + y * y); out[11] = 0;
    out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
  }

  function eulerToQuat(exDeg, eyDeg, ezDeg) {
    // matches gl-matrix quat.fromEuler default ("zyx") used by the reference viewer
    const r = Math.PI / 180;
    const cx = Math.cos(exDeg * r / 2), sx = Math.sin(exDeg * r / 2);
    const cy = Math.cos(eyDeg * r / 2), sy = Math.sin(eyDeg * r / 2);
    const cz = Math.cos(ezDeg * r / 2), sz = Math.sin(ezDeg * r / 2);
    return [
      sx * cy * cz - cx * sy * sz,
      cx * sy * cz + sx * cy * sz,
      cx * cy * sz - sx * sy * cz,
      cx * cy * cz + sx * sy * sz,
    ];
  }

  function mulMat(a, c, out) {
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++)
      out[k * 4 + r] = a[r] * c[k * 4] + a[4 + r] * c[k * 4 + 1] + a[8 + r] * c[k * 4 + 2] + a[12 + r] * c[k * 4 + 3];
  }

  // Type-10 descriptor: authored per-frame world-space positions of both
  // blades (stream 0 = left, stream 1 = right), verified against the hand
  // joint positions at idle. Header: {u16, u16 nStreams, u32 frames, ...}[20B]
  // then frames x nStreams x vec3f.
  function decodeBladeTrack(b, dv, act, dataTypes) {
    if (act.bladeTrack !== undefined) return act.bladeTrack;
    act.bladeTrack = null;
    for (let i = 0; i < dataTypes.length; i++) {
      if (dataTypes[i] !== 10) continue;
      const sdo = act.off + 0x64 + i * 0x14;
      const count = dv.getUint16(sdo + 2, true);
      if (count !== 1) continue;
      const off = act.off + dv.getUint32(sdo + 8, true);
      if (off + 20 > b.length) continue;
      const nStreams = dv.getUint16(off + 2, true);
      const frames = dv.getUint32(off + 4, true);
      if (nStreams !== 2 || frames < 1 || frames > 1000) continue;
      if (off + 20 + frames * 24 > b.length) continue;
      const frameTime = dv.getFloat32(sdo + 0xc, true) || 1 / 30;
      const data = new Float32Array(frames * 6);
      for (let k = 0; k < frames * 6; k++) data[k] = dv.getFloat32(off + 20 + k * 4, true);
      act.bladeTrack = { data, frames, frameTime };
      break;
    }
    return act.bladeTrack;
  }

  // Type-5 descriptor: the engine's CHARACTER-CONTROLLER channels (decoded
  // 2026-08). States carry per-frame floats for comps 4/5/6 (pelvis xyz,
  // mirroring the pose) AND the controller TRANSLATION TRIO 420/421/422
  // (decoded 2026-08-12): 420 = lateral, 421 = VERTICAL (jumpUp rises 0→9.37
  // units ≈ 0.67 m, jumpDoubleAir adds a linear boost to 10.95; land/ground
  // moves carry no 421 — the descent is engine physics under the decoded
  // /GlobGame/ Gravity), 422 = forward (decreases as the character advances):
  // the REAL per-attack movement (combo3A -24.3 units = 1.74 m ... combo3F
  // -73.7 = 5.26 m, comboLR3/Plume -40.7 = 2.9 m). Locomotion blends
  // (walk/run) are 0 here — they use engine speed. Sampled at the act's
  // 30 Hz with linear interp.
  //
  // FULL decode (2026-08-12): reuses parseState — the SAME machinery the skin
  // decoder runs — so raw f32, int16-ADDITIVE (comboJump, highFallLand) and
  // multi-manager states (airImpale's 421) all decode. The bake replicates
  // decodeAct's game-verified accumulator EXACTLY: per frame, in stream
  // order, raw streams SET the component, additive streams ADD their delta
  // (frame-over-frame; the last delta keeps applying through hold frames).
  function decodeRootTrack(b, dv, act, dataTypes) {
    if (act.rootTrack !== undefined) return act.rootTrack;
    act.rootTrack = null;
    const t5 = dataTypes.indexOf(5);
    if (t5 < 0) return null;
    const sdo = act.off + 0x64 + t5 * 0x14;
    const cnt = dv.getUint16(sdo + 2, true);
    const statesOff = act.off + dv.getUint32(sdo + 8, true);
    const frameTime = dv.getFloat32(sdo + 0xc, true) || 1 / 30;
    const streams = [];
    try {
      for (let i = 0; i < cnt; i++) parseState(b, dv, statesOff + i * 0xc, false, streams);
    } catch (e) {
      return null; // malformed state — no controller track
    }
    const want = streams.filter((s) => s.comp >= 420 && s.comp <= 422);
    if (!want.length) return null;
    const frames = Math.max(1, Math.round(act.duration / frameTime) + 1);
    const fx = new Float32Array(frames), fy = new Float32Array(frames), fz = new Float32Array(frames);
    const acc = { 420: 0, 421: 0, 422: 0 };
    const seen = { 420: false, 421: false, 422: false };
    for (let f = 0; f < frames; f++) {
      for (const st of want) {
        let si = f - st.fStart;
        if (si < 0 || si >= st.frames.length + st.hold) continue;
        if (si >= st.frames.length) si = st.frames.length - 1;
        if (st.additive) acc[st.comp] += st.frames[si];
        else acc[st.comp] = st.frames[si];
        seen[st.comp] = true;
      }
      fx[f] = acc[420]; fy[f] = acc[421]; fz[f] = acc[422];
    }
    act.rootTrack = {
      frames: seen[422] ? fz : null,
      framesY: seen[421] ? fy : null,
      framesX: seen[420] ? fx : null,
      frameTime,
    };
    return act.rootTrack;
  }

  // shared sampler for one controller-channel frame array
  function sampleTrack(frames, frameTime, t) {
    if (!frames || !frames.length) return null;
    const frame = Math.min(frames.length - 1, Math.max(0, t / frameTime));
    const f0 = Math.floor(frame), f1 = Math.min(frames.length - 1, f0 + 1);
    const fr = frame - f0;
    return frames[f0] * (1 - fr) + frames[f1] * fr;
  }

  function makeRig(objBuf, anmBuf) {
    const obj = parseObject(objBuf);
    const dv = new DataView(anmBuf.buffer, anmBuf.byteOffset, anmBuf.byteLength);
    const anm = parseAnm(anmBuf);
    const n = obj.joints.length;
    const initRot = new Float32Array(n * 4);
    const initPos = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) { initRot[i] = obj.rotQ14[i]; initPos[i] = obj.pos[i]; }
    const comp = new Float32Array(n * 8); // [quat x4, pos x4] working copy
    const world = new Float32Array(n * 16);
    const local = new Float32Array(16);
    const tmp = new Float32Array(16);

    function computePose(actName, t) {
      // init from idle pose
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < 4; k++) {
          comp[j * 8 + k] = initRot[j * 4 + k];          // Q14 (quat or euler)
          comp[j * 8 + 4 + k] = initPos[j * 4 + k];      // float local pos
        }
      }
      const act = anm.acts.get(actName);
      if (act) {
        const dec = decodeAct(anmBuf, dv, act, anm.skinDescrIdx, n, initRot, initPos);
        const frame = Math.min(dec.frames - 1, Math.max(0, t / dec.frameTime));
        const f0 = Math.floor(frame), f1 = Math.min(dec.frames - 1, f0 + 1);
        const fr = frame - f0;
        const r0 = f0 * dec.nc, r1 = f1 * dec.nc;
        for (let j = 0; j < n; j++) {
          for (let k = 0; k < 4; k++) {
            const c = j * 4 + k;
            comp[j * 8 + k] = dec.rotTable[r0 + c] * (1 - fr) + dec.rotTable[r1 + c] * fr;
            comp[j * 8 + 4 + k] = dec.posTable[r0 + c] * (1 - fr) + dec.posTable[r1 + c] * fr;
          }
        }
      }
      // FK
      for (let j = 0; j < n; j++) {
        let qx, qy, qz, qw;
        if (obj.joints[j].isQuat) {
          qx = comp[j * 8] * Q14; qy = comp[j * 8 + 1] * Q14; qz = comp[j * 8 + 2] * Q14; qw = comp[j * 8 + 3] * Q14;
        } else {
          const e = eulerToQuat(comp[j * 8] * Q14 * 360, comp[j * 8 + 1] * Q14 * 360, comp[j * 8 + 2] * Q14 * 360);
          qx = e[0]; qy = e[1]; qz = e[2]; qw = e[3];
        }
        quatToMat(qx, qy, qz, qw, local, comp[j * 8 + 4], comp[j * 8 + 5], comp[j * 8 + 6]);
        const p = obj.joints[j].parent;
        if (p < 0) world.set(local, j * 16);
        else {
          mulMat(world.subarray(p * 16, p * 16 + 16), local, tmp);
          world.set(tmp, j * 16);
        }
      }
      return world;
    }

    // sample the authored blade positions (hero space): [Lx,Ly,Lz,Rx,Ry,Rz]
    function bladePos(actName, t) {
      const act = anm.acts.get(actName);
      if (!act) return null;
      const tr = decodeBladeTrack(anmBuf, dv, act, anm.dataTypes);
      if (!tr) return null;
      const frame = Math.min(tr.frames - 1, Math.max(0, t / tr.frameTime));
      const f0 = Math.floor(frame), f1 = Math.min(tr.frames - 1, f0 + 1);
      const fr = frame - f0;
      const out = new Float32Array(6);
      for (let k = 0; k < 6; k++) out[k] = tr.data[f0 * 6 + k] * (1 - fr) + tr.data[f1 * 6 + k] * fr;
      return out;
    }

    // sample the REAL controller-displacement channel (comp 422) at time t.
    // Returns null when the act has no track (airs/evades/locomotion blends —
    // those use other engine systems). Value is the cumulative scalar; callers
    // difference consecutive samples within one clip for per-tick movement.
    function rootDisp(actName, t) {
      const act = anm.acts.get(actName);
      if (!act) return null;
      const tr = decodeRootTrack(anmBuf, dv, act, anm.dataTypes);
      if (!tr) return null;
      return sampleTrack(tr.frames, tr.frameTime, t);
    }

    // sample the REAL vertical controller channel (comp 421) at time t —
    // the authored jump rise. null when the act has no vertical channel
    // (ground moves, air attacks, landings: the engine handles those).
    function rootDispY(actName, t) {
      const act = anm.acts.get(actName);
      if (!act) return null;
      const tr = decodeRootTrack(anmBuf, dv, act, anm.dataTypes);
      if (!tr) return null;
      return sampleTrack(tr.framesY, tr.frameTime, t);
    }

    // sample the REAL lateral controller channel (comp 420) — the side-evade
    // rolls live here (evadeLeft/Right move ±10 units on X, zero on Z).
    function rootDispX(actName, t) {
      const act = anm.acts.get(actName);
      if (!act) return null;
      const tr = decodeRootTrack(anmBuf, dv, act, anm.dataTypes);
      if (!tr) return null;
      return sampleTrack(tr.framesX, tr.frameTime, t);
    }

    return { obj, anm, computePose, bladePos, rootDisp, rootDispY, rootDispX, jointCount: n };
  }

  return { makeRig };
})();
