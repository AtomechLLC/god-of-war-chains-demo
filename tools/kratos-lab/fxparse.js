// fxparse.js — pure MAT record decode for the God of War (2005) weapon WAD.
// Layout follows mogaika/god_of_war_browser pack/wad/mat/mat.go exactly
// (re-verified first-party against all 24 R_WPN0_0.WAD MAT records, see
// .planning/phases/02-wad-mat-decode-render-pass-foundation/02-RESEARCH.md).
//
// Pure decode: no rendering calls, no DOM — Node-requireable with zero build
// step. Render-state application lives elsewhere (app-side mapping table).
//
// MAT record = WAD tag 0x1E, size > 0, name starting "MAT_".
//   Header (0x38 bytes):
//     +0x00 u32 magic — must equal 0x8            (mat.go: Magic)
//     +0x08 f32[3] material color RGB             (mat.go: Color)
//     +0x34 u32 layer count                       (mat.go: LayersCount)
//   Layer n (0x40 bytes each, at header + 0x38 + n*0x40):
//     +0x00 u32 Flags[0] — the blend/state field  (mat.go: Flags[0])
//     +0x10 char[24] texture name, NUL-terminated (mat.go: TextureName)
//     +0x28 f32[4] blend color RGBA               (mat.go: BlendColor)
//     +0x38 f32 floatUnk (suspected transparency) (mat.go: FloatUnk)
//     +0x3C u32 game flags (bit0 UV anim, bit1 color anim)
//
// MAT colors are ALREADY 1.0-based floats — no divide-by-128, no doubling;
// 2.0 is intentional overbright and must pass through untouched.

const FxParse = (() => {
  // Flags[0] bit map (mat.go ParseFlags):
  const F_HAVE_TEXTURE = 0x00000080; // bit 7
  const F_FILTER_LINEAR = 0x00010000; // bit 16
  const F_DISABLE_DEPTH_WRITE = 0x00080000; // bit 19
  // bits 24..27: blend mode — exactly ONE must be set on a real layer
  // (mat.go errors on more than one; we also error on zero-of-four).
  const MODE_BITS = [
    [0x01000000, "strange"], // bit 24
    [0x02000000, "subtract"], // bit 25
    [0x04000000, "usual"], // bit 26
    [0x08000000, "additive"], // bit 27
  ];
  // Bits 2 (0x4, only on Bstage blade-texture MATs) and 30 (0x40000000, on
  // every real MAT) are unparsed by mogaika: recorded verbatim in rawFlags0,
  // never acted on.

  function decodeFlags(flags0, recName) {
    const set = MODE_BITS.filter(([bit]) => (flags0 & bit) !== 0);
    const hex = "0x" + (flags0 >>> 0).toString(16);
    if (set.length === 0) {
      throw new Error(`MAT ${recName}: no blend-mode bit set in flags ${hex} (bits 24-27 all clear)`);
    }
    if (set.length > 1) {
      const names = set.map(([, m]) => m).join("+");
      throw new Error(`MAT ${recName}: multiple blend-mode bits set in flags ${hex} (${names})`);
    }
    return {
      mode: set[0][1],
      disableDepthWrite: (flags0 & F_DISABLE_DEPTH_WRITE) !== 0,
      filter: (flags0 & F_FILTER_LINEAR) !== 0 ? "linear" : "nearest",
      haveTexture: (flags0 & F_HAVE_TEXTURE) !== 0,
    };
  }

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

  // Decode every real MAT record (tag 0x1E, size > 0, "MAT_" prefix).
  // byName is last-record-wins (gow1 server-instance rule: later same-name
  // instances overwrite predecessors); list keeps ALL records so tuple
  // enumeration counts every layer.
  function buildMats(records, buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const list = [];
    const byName = {};
    for (const r of records) {
      if (r.tag !== 0x1e || r.size === 0 || !r.name.startsWith("MAT_")) continue;

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
      const materialColor = [
        dv.getFloat32(base + 0x08, true), // mat.go Color R
        dv.getFloat32(base + 0x0c, true), // mat.go Color G
        dv.getFloat32(base + 0x10, true), // mat.go Color B
      ];
      const layerCount = dv.getUint32(base + 0x34, true); // mat.go LayersCount
      if (layerCount === 0) throw new Error(`MAT ${r.name}: zero layers`);
      if (r.size < 0x38 + layerCount * 0x40) {
        throw new Error(`MAT ${r.name}: size ${r.size} too small for ${layerCount} layer(s)`);
      }
      // WR-02: only layer 0 is decoded below, and enumTuples attributes the
      // FULL layerCount to layer 0's mode/depthWrite/filter tuple. A
      // multi-layer MAT with differing per-layer modes would silently claim
      // inventory coverage it doesn't have — the exact silent-mistranslation
      // failure DEC-01's throw-on-unknown exists to prevent. Enforce the
      // single-layer assumption loudly until per-layer decode exists.
      if (layerCount !== 1) {
        throw new Error(`MAT ${r.name}: ${layerCount} layers — only single-layer decode implemented`);
      }

      // layer 0 (all 24 weapon MATs have exactly one layer, enforced above)
      const l0 = base + 0x38;
      const rawFlags0 = dv.getUint32(l0 + 0x00, true) >>> 0; // mat.go Flags[0]
      const texName = readName(buf, l0 + 0x10, 24); // mat.go TextureName
      const blendColor = [
        dv.getFloat32(l0 + 0x28, true), // mat.go BlendColor R
        dv.getFloat32(l0 + 0x2c, true), // mat.go BlendColor G
        dv.getFloat32(l0 + 0x30, true), // mat.go BlendColor B
        dv.getFloat32(l0 + 0x34, true), // mat.go BlendColor A
      ];
      const floatUnk = dv.getFloat32(l0 + 0x38, true); // mat.go FloatUnk
      const gameFlags = dv.getUint32(l0 + 0x3c, true); // mat.go GameFlags

      const d = decodeFlags(rawFlags0, r.name);
      const mat = {
        name: r.name,
        off: r.off,
        mode: d.mode,
        disableDepthWrite: d.disableDepthWrite,
        filter: d.filter,
        haveTexture: d.haveTexture,
        texName,
        blendColor,
        materialColor,
        floatUnk,
        gameFlags,
        rawFlags0,
        layerCount,
      };
      list.push(mat);
      byName[r.name] = mat; // last record wins
    }
    return { byName, list };
  }

  // One-pass blend-tuple inventory over ALL decoded materials.
  // Tuple key = (mode, depthWrite, filter); layerCount sums every layer of
  // every material in the tuple (duplicate names count — they are distinct
  // records in the WAD).
  function enumTuples(list) {
    const tuples = new Map();
    for (const mat of list) {
      const depthWrite = !mat.disableDepthWrite;
      const key = `${mat.mode}|${depthWrite}|${mat.filter}`;
      let t = tuples.get(key);
      if (!t) {
        t = { mode: mat.mode, depthWrite, filter: mat.filter, layerCount: 0, materials: [] };
        tuples.set(key, t);
      }
      t.layerCount += mat.layerCount;
      t.materials.push(mat.name);
    }
    return [...tuples.values()];
  }

  return { decodeFlags, buildMats, enumTuples };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = FxParse;
