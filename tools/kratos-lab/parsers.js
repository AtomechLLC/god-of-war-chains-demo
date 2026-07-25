// parsers.js — decoders for the extracted God of War (2005) binary records.
// Mesh format follows mogaika/god_of_war_browser pack/wad/mesh (gow1) exactly:
// Mesh(0x50 hdr) -> Parts -> Groups -> Objects(0x20 hdr, DMA chains, JointMaps).

const Parsers = (() => {
  async function fetchBuf(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  // ---- mesh: hero_0.bin / MAIBlade_0 ---------------------------------------
  function parseMesh(b, matPageOverride) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (dv.getUint32(0, true) !== 0x0001000f) throw new Error("bad mesh magic");

    // hero model material order (MDL back-reference list) -> texture page:
    //   1 Skirt->maiF03  2 maiFskinh->maiF01  3 maiFskinh2->maiF02
    //   4 maiFclh->maiF02  5 maiFcll->maiF03  6 maiFskinl2->maiF03
    //   0 -> blades part (no hero-page texture; use maiF02 metalwork)
    const MAT_PAGE = matPageOverride || { 0: 1, 1: 2, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2 };

    const strips = [];      // emitted packets
    const palettes = [];    // exact per-object joint maps

    // ---- one VIF packet state -> strip record
    function emitPacket(st, page, palIdx, partJoint, isStatic) {
      if (!st || !st.xyzw) return;
      const num = st.xyzw.num;
      const okn = (a) => (a && a.num === num ? a.off : -1);
      strips.push({
        pos: st.xyzw.off, num, page, palIdx, partJoint, isStatic,
        uv: okn(st.uv), uvW: st.uv ? st.uv.width : 2,
        nrm: okn(st.nrm), col: okn(st.rgba),
        meta: st.meta ? { off: st.meta.off, num: st.meta.num } : null,
      });
    }

    function parseObject(base, partJoint) {
      const type = dv.getUint16(base, true);           // 0xE dynamic, 0x1D static
      if (type !== 0xe && type !== 0x1d) return;
      const dmaTags = dv.getUint32(base + 4, true);
      const matId = dv.getUint16(base + 8, true);
      const jmElems = dv.getUint16(base + 0xa, true);
      const instances = dv.getUint32(base + 0xc, true);
      const layers = b[base + 0x18];
      const dmaCalls = Math.max(1, instances * Math.max(1, layers));
      // exact joint map location: right after all dma chains
      const jmOff = base + 0x20 + dmaCalls * 0x10 * dmaTags;
      const palette = [];
      for (let i = 0; i < jmElems; i++) palette.push(dv.getUint32(jmOff + i * 4, true));
      const palIdx = palettes.length;
      palettes.push(palette);
      const page = matId in MAT_PAGE ? MAT_PAGE[matId] : -1;
      if (page < 0) return;
      const isStatic = type === 0x1d;

      let st = null;
      const flush = () => { emitPacket(st, page, palIdx, partJoint, isStatic); st = null; };

      function parseVifRange(from, to) {
        let off = from;
        while (off + 4 <= to) {
          const imm = dv.getUint16(off, true);
          const num = b[off + 2], cmd = b[off + 3] & 0x7f;
          off += 4;
          if (cmd === 0x14 || cmd === 0x15 || cmd === 0x17) { flush(); continue; } // MSCAL/MSCALF/MSCNT
          if (cmd === 0x20) { off += 4; continue; }              // STMASK
          if (cmd === 0x30 || cmd === 0x31) { off += 16; continue; } // STROW/STCOL
          if (cmd < 0x60) continue;                              // NOP/STCYCL/etc, no payload
          const comps = ((cmd >> 2) & 3) + 1;
          const width = [32, 16, 8, 4][cmd & 3];
          const len = (comps * width * num) >> 3;
          const signed = ((imm >> 14) & 1) === 0;
          const target = imm & 0x3ff;
          if (!st) st = {};
          if (width === 16 && comps === 4 && signed) {
            if (st.xyzw) flush(), (st = {});
            st.xyzw = { off, num };
          } else if (width === 16 && comps === 2 && signed) {
            st.uv = { off, num, width: 2 };
          } else if (width === 32 && comps === 2 && signed) {
            st.uv = { off, num: num, width: 4 };
          } else if (width === 8 && comps === 3 && signed) {
            st.nrm = { off, num };
          } else if (width === 8 && comps === 4) {
            st.rgba = { off, num };
          } else if (width === 32 && comps === 4 && signed) {
            if (target === 0 || target === 0x155 || target === 0x2ab) st.meta = { off, num };
            // else: boundaries — ignored
          }
          off += len;
          off = (off + 3) & ~3;
        }
      }

      // walk first dma chain (instance 0, layer 0)
      for (let t = 0; t < dmaTags; t++) {
        const tagPos = base + 0x20 + t * 0x10;
        const qwc = dv.getUint16(tagPos, true);
        const id = (b[tagPos + 3] >> 4) & 7;
        const addr = dv.getUint32(tagPos + 4, true);
        parseVifRange(tagPos + 8, tagPos + 0x10);                 // inline vif codes
        if (id === 3) parseVifRange(base + addr, base + addr + qwc * 16); // ref
        else if (id === 6) break;                                  // ret
      }
      flush();
    }

    // ---- walk Mesh -> Parts -> Groups -> Objects
    const partsCount = dv.getUint32(8, true);
    for (let p = 0; p < partsCount; p++) {
      const partOff = dv.getUint32(0x50 + p * 4, true);
      const groupsCount = dv.getUint16(partOff + 2, true);
      const partJoint = dv.getUint16(partOff + 4 + groupsCount * 4, true);
      for (let g = 0; g < groupsCount; g++) {
        const gOff = partOff + dv.getUint32(partOff + 4 + g * 4, true);
        const objCount = dv.getUint32(gOff + 4, true);
        for (let o = 0; o < objCount; o++) {
          const oOff = gOff + dv.getUint32(gOff + 0xc + o * 4, true);
          parseObject(oOff, partJoint);
        }
      }
    }

    // ---- bounds in bind-space floats (s16/16)
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], total = 0;
    for (const s of strips) {
      total += s.num;
      for (let i = 0; i < s.num; i++) {
        const p = s.pos + i * 8;
        const v = [dv.getInt16(p, true) / 16, dv.getInt16(p + 2, true) / 16, dv.getInt16(p + 4, true) / 16];
        for (let a = 0; a < 3; a++) {
          if (v[a] < mn[a]) mn[a] = v[a];
          if (v[a] > mx[a]) mx[a] = v[a];
        }
      }
    }
    const ctr = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const scale = 2 / (Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1);

    // ---- emit vertex arrays + triangles
    const pos = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const nrm = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const vertPal = new Int32Array(total);
    const vertJ1 = new Int16Array(total).fill(-1);
    const vertJ2 = new Int16Array(total).fill(-1);
    const vertW = new Float32Array(total);
    const vertStatic = new Uint8Array(total);
    const idx = [];
    let vi = 0;
    for (const s of strips) {
      const base = vi;
      const pal = palettes[s.palIdx] || [];
      if (s.isStatic) {
        for (let i = 0; i < s.num; i++) {
          vertJ1[base + i] = s.partJoint; vertJ2[base + i] = s.partJoint;
          vertW[base + i] = 1; vertStatic[base + i] = 1;
        }
      } else if (s.meta) {
        // real per-vertex joint pairs from VertexMeta blocks (+ stitch rule)
        let mv = 0, stitch = 0;
        const rowJ = (r) => [b[s.meta.off + r * 16 + 13] >> 4, b[s.meta.off + r * 16 + 12] >> 2];
        for (let r = 0; r < s.meta.num && mv < s.num; r++) {
          const bo = s.meta.off + r * 16;
          const cnt = b[bo], b5 = b[bo + 5];
          const own = rowJ(r);
          for (let k = 0; k < cnt && mv < s.num; k++, mv++) {
            let jj = own;
            if (b5 & 0x20) {
              if (b5 & 0x10) { if (stitch % 2) jj = rowJ(r + 1); stitch++; }
              else { stitch--; if (stitch % 2) jj = rowJ(r - 1); }
            }
            if (jj[0] < pal.length && jj[1] < pal.length) {
              vertJ1[base + mv] = pal[jj[0]];
              vertJ2[base + mv] = pal[jj[1]];
            }
          }
          if (b[bo + 1] !== 0) break;
        }
      }
      for (let i = 0; i < s.num; i++) {
        const p = s.pos + i * 8;
        vertPal[vi] = s.palIdx;
        vertW[vi] = s.isStatic ? 1 : (dv.getUint16(p + 6, true) & 0x7fff) / 4096;
        pos[vi * 3] = dv.getInt16(p, true) / 16;
        pos[vi * 3 + 1] = dv.getInt16(p + 2, true) / 16;
        pos[vi * 3 + 2] = dv.getInt16(p + 4, true) / 16;
        if (s.uv >= 0) {
          let ru, rv;
          if (s.uvW === 4) { ru = dv.getInt32(s.uv + i * 8, true) / 4096; rv = dv.getInt32(s.uv + i * 8 + 4, true) / 4096; }
          else { ru = dv.getInt16(s.uv + i * 4, true) / 4096; rv = dv.getInt16(s.uv + i * 4 + 2, true) / 4096; }
          uv[vi * 2] = ru;
          uv[vi * 2 + 1] = s.page + (rv - Math.floor(rv));
        }
        if (s.nrm >= 0) {
          nrm[vi * 3] = (b[s.nrm + i * 3] << 24 >> 24) / 127;
          nrm[vi * 3 + 1] = (b[s.nrm + i * 3 + 1] << 24 >> 24) / 127;
          nrm[vi * 3 + 2] = (b[s.nrm + i * 3 + 2] << 24 >> 24) / 127;
        } else { nrm[vi * 3 + 1] = 1; }
        if (s.col >= 0) {
          col[vi * 3] = b[s.col + i * 4] / 128;
          col[vi * 3 + 1] = b[s.col + i * 4 + 1] / 128;
          col[vi * 3 + 2] = b[s.col + i * 4 + 2] / 128;
        } else { col[vi * 3] = col[vi * 3 + 1] = col[vi * 3 + 2] = 1; }
        vi++;
      }
      for (let i = 2; i < s.num; i++) {
        const w = dv.getUint16(s.pos + i * 8 + 6, true);
        if (w & 0x8000) continue;
        if (i & 1) idx.push(base + i - 1, base + i - 2, base + i);
        else idx.push(base + i - 2, base + i - 1, base + i);
      }
      vi = base + s.num;
    }
    return {
      pos, uv, nrm, col, vertPal, palettes, vertJ1, vertJ2, vertW, vertStatic, ctr, scale, mn, mx,
      idx: total < 65536 ? new Uint16Array(idx) : null,
      idx32: total >= 65536 ? new Uint32Array(idx) : null,
      tris: idx.length / 3, chunks: strips.length, verts: total,
    };
  }

  // ---- textures: GFX_* (8bpp swizzled) + PAL_* (csm1 CLUT) ------------------
  function unswizzle8(data, w, h) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const blockLoc = (y & ~0xf) * w + (x & ~0xf) * 2;
        const swapSel = (((y + 2) >> 2) & 1) * 4;
        const posY = (((y & ~3) >> 1) + (y & 1)) & 7;
        const colLoc = posY * w * 2 + ((x + swapSel) & 7) * 4;
        const byteNum = ((y >> 1) & 1) + ((x >> 2) & 2);
        out[y * w + x] = data[blockLoc + colLoc + byteNum];
      }
    }
    return out;
  }

  function decodeTexture(gfx, pal) {
    const dv = new DataView(gfx.buffer, gfx.byteOffset, gfx.byteLength);
    const w = dv.getUint32(4, true), h = dv.getUint32(8, true);
    const bpi = dv.getUint32(16, true);
    const encoding = dv.getUint32(20, true);
    let idx;
    if (bpi === 4) {
      // PSMT4: linear nibble-packed, 16-color CLUT (identity order)
      idx = new Uint8Array(w * h);
      const data = gfx.subarray(24);
      for (let i = 0; i < w * h; i++) {
        const v = data[i >> 1];
        idx[i] = i & 1 ? v >> 4 : v & 0xf;
      }
    } else if ((encoding & 2) === 0) {
      idx = unswizzle8(gfx.subarray(24, 24 + w * h), w, h);
    } else {
      idx = gfx.subarray(24, 24 + w * h);
    }
    const colors = bpi === 4 ? 16 : 256;
    const clut = new Uint8Array(colors * 4);
    for (let i = 0; i < colors; i++) {
      const j = colors === 256 ? (i & 0xe7) | ((i & 0x10) >> 1) | ((i & 0x08) << 1) : i;
      clut[i * 4] = pal[24 + j * 4];
      clut[i * 4 + 1] = pal[24 + j * 4 + 1];
      clut[i * 4 + 2] = pal[24 + j * 4 + 2];
      const a = pal[24 + j * 4 + 3];
      clut[i * 4 + 3] = a >= 0x80 ? 255 : a * 2;
    }
    const img = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const c = idx[i] * 4;
      img.data[i * 4] = clut[c];
      img.data[i * 4 + 1] = clut[c + 1];
      img.data[i * 4 + 2] = clut[c + 2];
      img.data[i * 4 + 3] = clut[c + 3];
    }
    return img;
  }

  // ---- WAD container: record walk + nearest-preceding-name resolution ------
  // Format verified first-party against R_WPN0_0.WAD (283 records, clean EOF)
  // and against god_of_war_browser pack/wad/wad.go. Record header (32 B):
  //   u16 Tag @+0, u16 Flags @+2, u32 Size @+4, char Name[24] @+8 (NUL-term)
  // NOT a u32 type — real server instances carry nonzero high-u16 flags.
  // Data follows at +32; next record at align16(off + 32 + size).
  function parseWad(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const records = [];
    let off = 0;
    while (off + 32 <= buf.length) {
      const tag = dv.getUint16(off, true);        // wad.go Tag (u16, NOT u32)
      const flags = dv.getUint16(off + 2, true);  // wad.go Flags
      const size = dv.getUint32(off + 4, true);   // wad.go Size
      // strictly NUL-terminated name[24] — bytes after the NUL are garbage
      let name = "";
      for (let i = 0; i < 24; i++) {
        const c = buf[off + 8 + i];
        if (!c) break;
        name += String.fromCharCode(c);
      }
      const dataOff = off + 32;
      records.push({ idx: records.length, off, tag, flags, size, name, dataOff });
      // tag 0x18 (heap declaration): size is a reservation, no data follows
      const dataSize = tag === 0x18 ? 0 : size;
      if (dataSize > buf.length - dataOff) throw new Error(`WAD record ${name} overruns buffer`);
      off = (off + 32 + dataSize + 15) & ~15;
    }
    return records;
  }

  // Nearest-preceding-name resolution — wad.go GetNodeByName(name, id-1,
  // searchForward=false): backward scan from the referencing record.
  // Targets must CARRY DATA: tag 0x1E (server instance) or 0x70 (raw data)
  // with size > 0 — this skips size-0 back-references AND the named GroupEnd
  // markers (tag 0x32), which reuse their group head's name.
  function resolve(records, name, fromIdx) {
    for (let i = fromIdx - 1; i >= 0; i--) {
      const r = records[i];
      if (r.name === name && r.size > 0 && (r.tag === 0x1e || r.tag === 0x70)) return r;
    }
    return null; // caller decides: throw with record name
  }

  return { fetchBuf, parseMesh, decodeTexture, parseWad, resolve };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Parsers;
