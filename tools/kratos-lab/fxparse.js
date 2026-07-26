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

  // parseTxr — decode a TXR record (WAD tag 0x1E, size 88). Layout verified
  // first-party against all 3 weapon TXRs (03-RESEARCH "TXR record layout"):
  //   +0x00 u32       magic — must equal 7
  //   +0x04 char[24]  GFX record name, NUL-terminated (e.g. "GFX_chainlink")
  //   +0x1C char[24]  PAL record name, NUL-terminated (e.g. "PAL_chainlink")
  //   +0x56 u16       tail flags: 0x0001 (strip) / 0x0051 (additive sprite) —
  //                   semantics UNKNOWN (Open Q2); recorded verbatim, NEVER
  //                   acted on (revisit when Phase-5 cross-references TXRs).
  // Fail-loud (WR-01): size gate BEFORE magic, both naming the record —
  // parseWad guarantees the record fits the BUFFER, not that the decoder stays
  // inside the RECORD; a short size would silently read the next record.
  function parseTxr(buf, rec) {
    if (rec.size < 0x58) {
      throw new Error(`TXR ${rec.name}: size ${rec.size} < 0x58 (88-byte TXR record)`);
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const magic = dv.getUint32(rec.dataOff, true);
    if (magic !== 7) {
      throw new Error(`TXR ${rec.name}: bad magic 0x${magic.toString(16)} (expected 7)`);
    }
    return {
      gfxName: readName(buf, rec.dataOff + 0x04, 24), // TXR gfx record name
      palName: readName(buf, rec.dataOff + 0x1c, 24), // TXR pal record name
      tailFlags: dv.getUint16(rec.dataOff + 0x56, true), // verbatim (Open Q2)
    };
  }

  // parseLight — decode a LIGHT record (WAD tag 0x1e, 88 B): the per-blade warm
  // point light REND-02 renders (D-09b RESOLVED — the values are REAL/decoded, not
  // roadmap constants; D-06). LeftBladeLight @0x6a60 / RightBladeLight @0x6b20 are
  // byte-identical; the four core values are byte-EXACT (VERIFIED first-party probe
  // this session — 06-RESEARCH § "Decoded Data Inventory" + § "Code Examples ->
  // parseLight"):
  //   +0x10 f32[3] anchor    (-0.32, -8.0, 1.0)   — blade-local light offset
  //                                                  (z=-8.0 agrees with the type-5
  //                                                  ANM blade anchor)
  //   +0x2c f32[3] color     (1.0, 0.622, 0.288)  — warm amber RGB (REAL)
  //   +0x38 f32    intensity 2.5
  //   +0x44 f32    range     160                  — linear attenuation range
  // Ancillary fields (+0x24 (1,1,1) triple, +0x3c=8.0, +0x40=1.5) are read verbatim
  // as evidence ONLY; their MEANING (ambient? falloff exponent? inner range?) is
  // INFERRED (A5) — no falloff exponent is ever claimed real (T-06-02-02, Pitfall 4).
  // Fail-loud (WR-01 / Security V5 / T-06-02-01): size-gate BEFORE any field read,
  // naming the record — parseWad guarantees the record fits the BUFFER, not that the
  // decoder stays inside the 88-byte RECORD; a short size would spill into the
  // adjacent WAD record. Mirrors the parseTxr size-gate-then-DataView idiom.
  function parseLight(buf, rec) {
    if (rec.size < 0x48) {
      throw new Error(`LIGHT ${rec.name}: size ${rec.size} < 0x48 (88-byte LIGHT record)`);
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const b = rec.dataOff;
    const f = (o) => dv.getFloat32(b + o, true);

    const anchor = [f(0x10), f(0x14), f(0x18)]; // blade-local light offset
    const color = [f(0x2c), f(0x30), f(0x34)]; // warm amber RGB (real)
    const intensity = f(0x38); // 2.5
    const range = f(0x44); // 160 — linear attenuation range

    // Ancillary raw values (real bytes, INFERRED meaning — A5): recorded for the
    // low-priority evidence pass only; never surfaced as a real light parameter.
    const ambientTriple = [f(0x24), f(0x28), f(0x2c)]; // (1,1,1) — ambient? candidate
    const ancA = f(0x3c); // 8.0 — falloff-exponent? / inner-range? candidate
    const ancB = f(0x40); // 1.5 — falloff-exponent? / inner-range? candidate

    // Data-first evidence: the four core values are byte-decoded (real); the
    // ancillary block's MEANING is INFERRED (never a real-claimed falloff exponent).
    const evidence = [
      { field: "anchor", offset: "+0x10", rawHex: `(${anchor.map((v) => v.toFixed(3)).join(", ")})`, interp: "blade-local light anchor offset (transformed by bladeSim[key].mat at render)", corrob: "RESEARCH parseLight (-0.32,-8.0,1.0); z=-8.0 matches the type-5 ANM blade anchor", tag: "real" },
      { field: "color", offset: "+0x2c", rawHex: `(${color.map((v) => v.toFixed(3)).join(", ")})`, interp: "warm amber light RGB (real, NOT an INFERRED/hand-picked color)", corrob: "RESEARCH REND-02 (1.0,0.622,0.288); Left≡Right byte-identical", tag: "real" },
      { field: "intensity", offset: "+0x38", rawHex: intensity.toFixed(3), interp: `light intensity ${intensity}`, corrob: "RESEARCH REND-02 intensity 2.5", tag: "real" },
      { field: "range", offset: "+0x44", rawHex: range.toFixed(3), interp: `linear attenuation range ${range} (atten = max(0, 1 - dist/range))`, corrob: "RESEARCH REND-02 range 160", tag: "real" },
      { field: "ancillary", offset: "+0x24/+0x3c/+0x40", rawHex: `triple (${ambientTriple.map((v) => v.toFixed(3)).join(", ")}) / ${ancA.toFixed(3)} / ${ancB.toFixed(3)}`, interp: "ancillary fields — ambient / falloff-exponent / inner-range CANDIDATES; raw bytes real, MEANING INFERRED (A5) — REND-02 needs only color/intensity/range/anchor", corrob: "RESEARCH Open Q3 (short evidence pass, low priority)", tag: "INFERRED" },
    ];

    return { anchor, color, intensity, range, evidence };
  }

  // parseMsh — decode an MSH_BDepoly*Shape record (WAD tag 0x70 "raw data", the
  // record mogaika treats as opaque TAG_GOW1_FILE_RAW_DATA). Layout recovered
  // first-party by differential decode this session (DEC-02; 05-RESEARCH
  // "Record Structure -> MSH_BDepoly shape"):
  //   +0x00 u32     vertex count       (24 for the 768-B level-1 copy)
  //   +0x04 u32     index/strip count  (22 — MEANING inferred (A5); raw is real)
  //   +0x08 u32     0xffffffff sentinel (constant)
  //   +0x0c u32     0xffffffff sentinel (constant)
  //   +0x10.. f32   interleaved (pos vec3, nrm vec3) per vertex, 0x18 B each;
  //                 decoded normals are unit-length -> confirms the interleave.
  // MSH has NO magic — size-gate FIRST (WR-01): a short record must fail loud
  // and name itself BEFORE any field read, never spilling into the next record.
  // Variable-length record (768 vs 1008 copies): bound EVERY read by rec.size.
  function parseMsh(buf, rec) {
    if (rec.size < 0x10) {
      throw new Error(`MSH ${rec.name}: size ${rec.size} < 0x10 header`);
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const base = rec.dataOff;
    const end = base + rec.size; // hard upper bound — never read past (V5 control)
    const hex32 = (off) => "0x" + (dv.getUint32(off, true) >>> 0).toString(16).padStart(8, "0");

    const vertCount = dv.getUint32(base + 0x00, true);
    const idxCount = dv.getUint32(base + 0x04, true);

    // Walk interleaved (pos, nrm) f32 pairs from +0x10, BOUNDED by the record.
    const verts = [];
    let off = base + 0x10;
    for (let i = 0; i < vertCount; i++) {
      if (off + 0x18 > end) break; // never read past dataOff + rec.size
      verts.push({
        pos: [dv.getFloat32(off + 0x00, true), dv.getFloat32(off + 0x04, true), dv.getFloat32(off + 0x08, true)],
        nrm: [dv.getFloat32(off + 0x0c, true), dv.getFloat32(off + 0x10, true), dv.getFloat32(off + 0x14, true)],
      });
      off += 0x18;
    }

    // WR-01: the first-vertex evidence entry below reads base+0x10..+0x1c (the pos
    // rawHex) AND interprets verts[0].pos. The 0x10 header gate does NOT cover those
    // bytes — a record that passes the header gate but is too short to hold a full
    // first vertex (0x10 <= size < 0x28) would spill past dataOff + rec.size: a bare
    // (UNNAMED) RangeError at buffer end, or a SILENT read of the next record's bytes
    // into the diagnostic rawHex. Fail loud NAMED here — the file-wide "never read
    // past dataOff + rec.size" invariant — instead of a nameless crash / cross-record
    // spill. (A full first vertex spans +0x10..+0x28; real MSH copies are 768/1008 B.)
    if (base + 0x28 > end) {
      throw new Error(`MSH ${rec.name}: size ${rec.size} < 0x28 — too short for the first vertex (+0x10..+0x28) the evidence reads`);
    }

    // Data-first evidence: raw values are byte-decoded (real). idxCount's MEANING
    // is inferred (A5) though its raw value is real. The 0xffffffff sentinels are
    // recorded verbatim, never acted on. NO color is read from a shape (Pitfall 4).
    const evidence = [
      { field: "vertCount", offset: "+0x00", rawHex: hex32(base + 0x00), interp: `${vertCount} vertices`, corrob: "RESEARCH MSH table; unit-length normals confirm interleave", tag: "real" },
      { field: "idxCount", offset: "+0x04", rawHex: hex32(base + 0x04), interp: `${idxCount} — suspected index/strip/triangle count (raw real, meaning INFERRED, A5)`, corrob: "RESEARCH MSH +0x04", tag: "INFERRED" },
      { field: "sentinel0", offset: "+0x08", rawHex: hex32(base + 0x08), interp: "0xffffffff sentinel (constant; verbatim, never acted on)", corrob: "constant across all copies", tag: "real" },
      { field: "sentinel1", offset: "+0x0c", rawHex: hex32(base + 0x0c), interp: "0xffffffff sentinel (constant; verbatim, never acted on)", corrob: "constant across all copies", tag: "real" },
    ];
    // Emit the first-vertex evidence only when a full vertex was decoded (guarded
    // above): guarantees the raw pos reads stay within rec.size and the interp is a
    // real decoded position, never a fabricated (0,0,0) over a zero-vertex header.
    if (verts.length) {
      const p0 = verts[0].pos;
      evidence.push({ field: "verts[0].pos", offset: "+0x10", rawHex: `${hex32(base + 0x10)} ${hex32(base + 0x14)} ${hex32(base + 0x18)}`, interp: `first vertex position (${p0.map((v) => v.toFixed(3)).join(", ")})`, corrob: "RESEARCH: (0, 2.982, -13.684)", tag: "real" });
    }

    return { vertCount, idxCount, verts, size: rec.size, evidence };
  }

  // parsePtc — decode a PTC particle-definition record (DEC-02, Wave 2; decode
  // order MSH -> PTC -> FXC per D-02). ONE format, TWO sources:
  //   in-WAD  (tag 0x1e): PTC_flame3 / PTC_flame6 — the fire particles
  //   standalone .bin    : PTC_BFTpart1 / PTC_BGTpart1 — the trail particles, a
  //                        HEADERLESS record (dataOff:0; absent from the WAD —
  //                        Pitfall 1, so they reach the FxDb only via buildFxDb's
  //                        standalone 3rd arg).
  // Layout — VARIABLE LENGTH 520-632 B (05-RESEARCH "Record Structure -> PTC"):
  //   +0x00 u32     magic — must equal 0x13 (constant across all 10 PTC read)
  //   +0x04 u32     0
  //   +0x08 u16     slot id — links FXC<->PTC (part1 = 0x1d, part2 = 0x32)
  //   +0x0a u16     0xffff / index
  //   +0x10..0x4f   f32[16] 4x4 placement matrix (same convention as FXC; often identity)
  //   +0x50 u32     record size (== record length)
  //   +0x54 char[]  NUL-terminated "...Shape" runtime-handle name ("BFTpart1Shape")
  //   +0x64.. f32[] particle params — lifetimes/rates/sizes as NTSC 60Hz TICK
  //                 CANDIDATES (D-05); raw values are real, their TICK MEANING is
  //                 INFERRED (A2), pending FXC/footage cross-check.
  //   tail   ascii  "1555" (31 35 35 35) — suspected 16-bit A1R5G5B5 particle-
  //                 texture-format tag (A1, INFERRED).
  // Pitfall 4 / A3: the static RGBA region reads identity (1,1,1) and is byte-
  //   identical fire-vs-swoosh — effect color is runtime/MAT-sourced, NOT a PTC
  //   field. parsePtc emits NO color field; provenance is an INFERRED note only.
  // Fail-loud (WR-01): size-gate BEFORE magic, both naming the record; every read
  //   is bounded by rec.size (variable length — never assume a fixed layout).
  const PTC_MAGIC = 0x13;
  const PTC_PARAM_OFF = 0x64;
  function parsePtc(buf, rec) {
    if (rec.size < 0x58) {
      throw new Error(`PTC ${rec.name}: size ${rec.size} < 0x58`);
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const base = rec.dataOff;
    const magic = dv.getUint32(base + 0x00, true);
    if (magic !== PTC_MAGIC) {
      throw new Error(`PTC ${rec.name}: bad magic 0x${magic.toString(16)} (expected 0x13)`);
    }
    const slotId = dv.getUint16(base + 0x08, true);
    const index = dv.getUint16(base + 0x0a, true);
    const matrix = [];
    for (let i = 0; i < 16; i++) matrix.push(dv.getFloat32(base + 0x10 + i * 4, true));
    const size = dv.getUint32(base + 0x50, true);
    const shapeRef = readName(buf, base + 0x54, 0x20); // NUL-terminated "...Shape"

    // Params: raw f32 region from +0x64, BOUNDED by dataOff + rec.size (T-05-02).
    // A short size that slipped the gate must never spill into the next record.
    const end = base + rec.size;
    const params = [];
    for (let off = base + PTC_PARAM_OFF; off + 4 <= end; off += 4) {
      params.push(dv.getFloat32(off, true));
    }

    // "1555" ASCII tail marker — suspected A1R5G5B5 texture format (A1, INFERRED).
    let texFormat = null;
    for (let i = base; i + 4 <= end; i++) {
      if (buf[i] === 0x31 && buf[i + 1] === 0x35 && buf[i + 2] === 0x35 && buf[i + 3] === 0x35) {
        texFormat = "1555?";
        break;
      }
    }

    const hex32 = (off) => "0x" + (dv.getUint32(off, true) >>> 0).toString(16).padStart(8, "0");
    // Data-first evidence: magic/slot/size/shapeRef are byte-decoded (real); the
    // param TICK meaning + texFormat are INFERRED; color provenance is documented
    // INFERRED, never a real field (Pitfall 4). NO color/rgba field is emitted.
    const evidence = [
      { field: "magic", offset: "+0x00", rawHex: hex32(base + 0x00), interp: "0x13 PTC magic (constant, all 10 PTC)", corrob: "RESEARCH PTC table", tag: "real" },
      { field: "slotId", offset: "+0x08", rawHex: "0x" + (slotId >>> 0).toString(16), interp: `slot ${slotId} — links FXC<->PTC via +0x08`, corrob: "PTC_BFTpart1 +0x08 == FXC_BFTemit1 +0x08 == 0x1d", tag: "real" },
      { field: "index", offset: "+0x0a", rawHex: "0x" + (index >>> 0).toString(16), interp: `index / 0xffff field 0x${index.toString(16)} (+0x0a, byte-decoded)`, corrob: "RESEARCH PTC +0x0a; mirrors FXC +0x0a index", tag: "real" },
      { field: "matrix", offset: "+0x10", rawHex: `row0 (${[matrix[0], matrix[1], matrix[2]].map((v) => v.toFixed(5)).join(", ")})`, interp: `4x4 placement matrix (same convention as FXC; often identity), row0 len ${Math.hypot(matrix[0], matrix[1], matrix[2]).toFixed(5)}`, corrob: "RESEARCH PTC +0x10 f32[16]; matches the FXC placement-matrix convention", tag: "real" },
      { field: "size", offset: "+0x50", rawHex: hex32(base + 0x50), interp: `${size} bytes (== record length)`, corrob: "equals rec.size", tag: "real" },
      { field: "shapeRef", offset: "+0x54", rawHex: `"${shapeRef}"`, interp: `runtime-handle shape name "${shapeRef}" (non-MSH_ -> no WAD record; resolved:false)`, corrob: "RESEARCH cross-ref chain; only MSH_*Shape names resolve", tag: "real" },
      { field: "params", offset: "+0x64", rawHex: `${params.length} f32`, interp: "raw param floats, bounded by rec.size — byte-decoded", corrob: "bounded by dataOff + rec.size (T-05-02)", tag: "real" },
      { field: "paramTicks", offset: "+0x64", rawHex: "—", interp: "params INTERPRETED as NTSC 60Hz tick lifetimes/rates/sizes — MEANING inferred (A2, D-05), pending FXC/footage cross-check", corrob: "D-05 tick unit", tag: "INFERRED" },
      { field: "texFormat", offset: "tail", rawHex: texFormat ? '"1555"' : "—", interp: texFormat ? "'1555' tail — suspected A1R5G5B5 particle-texture format (A1)" : "no '1555' tail marker found", corrob: "RESEARCH PTC tail", tag: "INFERRED" },
      { field: "colorProvenance", offset: "params", rawHex: "—", interp: "static RGBA in the param region is identity (1,1,1) and byte-identical fire-vs-swoosh — effect color is runtime/MAT-sourced, NOT read from PTC (Pitfall 4, A3)", corrob: "BFT vs BGT RGBA-region byte-identity", tag: "INFERRED" },
    ];

    return { magic, slotId, index, matrix, shapeRef, params, texFormat, size, evidence };
  }

  // parseFxc — decode an FXC_* emitter record (DEC-02, Wave 3; FXC decoded LAST per
  // D-02 — it is the FxDb root that links emitter -> particle -> shape). ONE magic,
  // FOUR subtypes; the layout AFTER +0x50 BRANCHES on the subtype (Pitfall 2). TWO
  // sources:
  //   in-WAD  (tag 0x1e): FXC_BDEsparkemit (0x3), FXC_BDepoly3/6 (0xd), FXC_EG* ...
  //   standalone .bin    : FXC_BFTemit1 / FXC_BGTemit1 (0x2) — trail emitters, a
  //                        HEADERLESS record (dataOff:0; absent from the WAD, Pitfall 1),
  //                        reaching the FxDb only via buildFxDb's standalone 3rd arg.
  // Layout (05-RESEARCH "Record Structure -> FXC"; byte-exact this session):
  //   +0x00 u16     magic — must equal 0x1e (constant across all 9 FXC)
  //   +0x02 u16     subtype — 0x2 emitter / 0x3 spark / 0xc grav / 0xd poly
  //   +0x04 u32     0
  //   +0x08 u16     slot/class id — links FXC<->PTC (same id in the paired PTC;
  //                 standalone BFT/BGT = 0x1d, WAD-native = placeholder 0x00)
  //   +0x0a u16     per-emitter index / 0xffff root sentinel
  //   +0x10..0x4f   f32[16] 4x4 row-major placement matrix (the 3x3 rotation rows are
  //                 orthonormal for a real rotation — the real-vs-noise interleave check)
  //   +0x50 u32     record size (0xe4=228 for subtype 2/3; 0x88=136 for subtype 0xd)
  //   SUBTYPE 2/3:  +0x54 char[] NUL-terminated particle/shape reference name
  //   SUBTYPE 0xd:  +0x54 u32 count, then +0x58 char[] MSH name (explicit FXC->MSH link)
  // A4: BFT & BGT emit1 BOTH carry slot 0x1d (a trail-position GROUP id, not a
  //   fire/swoosh discriminator) and BYTE-IDENTICAL matrices — the shapeRef NAME
  //   discriminates fire (BFTpart1Shape) vs swoosh (BGTpart1Shape); slot corroborates.
  // Fail-loud (WR-01 / T-05-01): size-gate BEFORE magic, both naming the record; the
  //   subtype BRANCH runs BEFORE the name read (Pitfall 2 / T-05-02) so a poly emitter
  //   never mis-reads the count bytes at +0x54 as a name.
  const FXC_MAGIC = 0x1e;
  function parseFxc(buf, rec) {
    if (rec.size < 0x58) {
      throw new Error(`FXC ${rec.name}: size ${rec.size} < 0x58`);
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const base = rec.dataOff;
    const magic = dv.getUint16(base + 0x00, true);
    if (magic !== FXC_MAGIC) {
      throw new Error(`FXC ${rec.name}: bad magic 0x${magic.toString(16)} (expected 0x1e)`);
    }
    const subtype = dv.getUint16(base + 0x02, true);
    const slotId = dv.getUint16(base + 0x08, true);
    const index = dv.getUint16(base + 0x0a, true);
    const matrix = [];
    for (let i = 0; i < 16; i++) matrix.push(dv.getFloat32(base + 0x10 + i * 4, true));
    const size = dv.getUint32(base + 0x50, true);

    // Subtype BRANCH for the reference-name offset (Pitfall 2). A single hardcoded
    // offset mis-reads poly emitters (garbled or mid-word name = the warning sign).
    let shapeRef;
    let count = null;
    let nameTag = "real";
    if (subtype === 0x2 || subtype === 0x3) {
      shapeRef = readName(buf, base + 0x54, 0x20); // emitter/spark: name @+0x54
    } else if (subtype === 0xd) {
      count = dv.getUint32(base + 0x54, true); // poly: u32 count @+0x54 ...
      shapeRef = readName(buf, base + 0x58, 0x20); // ... then the MSH name @+0x58
    } else {
      // 0xc grav (and any future subtype): best-effort name @+0x54, MEANING inferred.
      shapeRef = readName(buf, base + 0x54, 0x20);
      nameTag = "INFERRED";
    }

    const hex16 = (off) => "0x" + (dv.getUint16(off, true) >>> 0).toString(16);
    const hex32 = (off) => "0x" + (dv.getUint32(off, true) >>> 0).toString(16).padStart(8, "0");
    const r0 = [matrix[0], matrix[1], matrix[2]];
    const rowLen = Math.hypot(r0[0], r0[1], r0[2]);
    // Data-first evidence: magic/subtype/slot/idx/size/matrix are byte-decoded (real);
    // the ref name is real for known subtypes (2/3/d), INFERRED for the best-effort 0xc.
    const evidence = [
      { field: "magic", offset: "+0x00", rawHex: hex16(base + 0x00), interp: "0x1e FXC magic (constant, all 9 FXC)", corrob: "RESEARCH FXC table", tag: "real" },
      { field: "subtype", offset: "+0x02", rawHex: hex16(base + 0x02), interp: `subtype 0x${subtype.toString(16)} — 0x2 emitter / 0x3 spark / 0xc grav / 0xd poly`, corrob: "RESEARCH FXC subtype branch (Pitfall 2)", tag: "real" },
      { field: "slotId", offset: "+0x08", rawHex: hex16(base + 0x08), interp: `slot 0x${slotId.toString(16)} — links FXC<->PTC via +0x08 (0x1d = BFT/BGT trail group; 0x00 = WAD placeholder)`, corrob: "FXC_BFTemit1 +0x08 == PTC_BFTpart1 +0x08 == 0x1d (A4: group id, NOT fire/swoosh discriminator)", tag: "real" },
      { field: "index", offset: "+0x0a", rawHex: hex16(base + 0x0a), interp: `per-emitter index 0x${index.toString(16)} (0xffff = root sentinel)`, corrob: "BFT idx 0x05 vs BGT idx 0x06", tag: "real" },
      { field: "matrix", offset: "+0x10", rawHex: `row0 (${r0.map((v) => v.toFixed(5)).join(", ")})`, interp: `4x4 row-major placement; rotation row0 len ${rowLen.toFixed(5)} (orthonormal => real rotation)`, corrob: "BFT & BGT matrices byte-identical (shared placement)", tag: "real" },
      { field: "size", offset: "+0x50", rawHex: hex32(base + 0x50), interp: `${size} bytes (0xe4=228 subtype 2/3; 0x88=136 subtype 0xd)`, corrob: "equals rec.size for standalone; WAD copy size matches", tag: "real" },
      { field: "shapeRef", offset: subtype === 0xd ? "+0x58" : "+0x54", rawHex: `"${shapeRef}"`, interp: `reference name "${shapeRef}"${subtype === 0xd ? " (MSH shape @+0x58 after a u32 count — explicit FXC->MSH link)" : " (particle/shape handle @+0x54)"}`, corrob: subtype === 0xd ? "MSH_* resolves via Parsers.resolve" : "non-MSH_ = runtime handle (resolved:false); NAME discriminates fire vs swoosh (A4)", tag: nameTag },
    ];
    if (count !== null) {
      evidence.push({ field: "count", offset: "+0x54", rawHex: hex32(base + 0x54), interp: `subtype-0xd shape count ${count} (u32 @+0x54, precedes the +0x58 name)`, corrob: "FXC_BDepoly3 count == 1", tag: "real" });
    }

    return { magic, subtype, slotId, index, matrix, shapeRef, count, size, evidence };
  }

  // Decode the type-5 ANM blade-state descriptor (DEC-03, Wave 5 — deferred LAST
  // per D-07 so it never blocks the DEC-02 payoff). Decode-only: Phase-6 wires the
  // blade presentation that consumes this. Located + confirmed this session by the
  // differential-decode protocol (see test/anm.test.js top-of-file evidence table).
  //
  // TYPE-5 IDENTITY (escalation disposition, D-04 / Warning 2): the WAD has NO
  // instance-class-5 record and NO level-1 ANM_maiblade (god-tier ANM only), so the
  // prescribed ANM pair-diff is impossible and "type-5" is mogaika's ANM-taxonomy
  // LABEL, not a magic. The descriptor with a genuine level-1<->god pair that binds
  // the blade presentation is the `gomaiblade`/`gomaigodblade` scene-binding node
  // (class id 1, variant 2 => u32@0 = 0x00020001). Its type-5 attribution is
  // corroborated by the ANM resource context (ANMX_R_Wpn type-id 3) but CANNOT be
  // byte-confirmed to a literal magic — so the label is INFERRED and the ELF path is
  // the tiebreaker. No byte-exact seed is fabricated for an unconfirmed field.
  //
  // Layout (level-1 `gomaiblade`, off 0xD580, size 92 — byte-exact this session):
  //   +0x00 u16     instance class id = 1                                    [real]
  //   +0x02 u16     descriptor variant = 2  => u32@0 = 0x00020001 (identity) [real]
  //   +0x04 char[24] bound blade INSTANCE name ("maiblade")                  [real]
  //   +0x1c u16     selector — differential-confirmed TIER (1 L1 / 2 god),   [real raw;
  //                 NOT the combat show/hide field                            meaning tier]
  //   +0x40 f32[4]  placement/anchor offset (0, -0.320, -8.0, 1.0); the -8.0 [real raw;
  //                 z is an on-back-anchor candidate                          INFERRED interp]
  //   +0x58 u32     0xffffffff end sentinel                                  [real]
  // The in-hand/on-back show/hide MAPPING is runtime/animation-driven (D-04) —
  // footage-corroborated, tagged INFERRED, never a fabricated byte seed.
  // Fail-loud (WR-01 / T-05-01): size-gate BEFORE the identity read, both naming the
  // record; every read is bounded by rec.size (T-05-02).
  const ANM_T5_ID = 0x00020001;
  function parseAnmType5(buf, rec) {
    if (rec.size < 0x5c) {
      throw new Error(`ANM ${rec.name}: size ${rec.size} < 0x5c (92-byte type-5 descriptor)`);
    }
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const base = rec.dataOff;
    const end = base + rec.size; // hard upper bound — never read past (V5 / T-05-02)
    const subtype = dv.getUint32(base + 0x00, true) >>> 0;
    if (subtype !== ANM_T5_ID) {
      throw new Error(
        `ANM ${rec.name}: not a type-5 descriptor (u32@0 0x${subtype.toString(16).padStart(8, "0")} != 0x00020001)`
      );
    }
    const classId = dv.getUint16(base + 0x00, true);
    const variant = dv.getUint16(base + 0x02, true);
    const bound = readName(buf, base + 0x04, 24); // bound blade instance name
    const tierSelector = dv.getUint16(base + 0x1c, true);

    // placement/anchor offset vec4 @+0x40, BOUNDED by rec.size (a short size that
    // slipped the gate must never spill into the next record).
    const anchorOffset = [];
    for (let i = 0; i < 4; i++) {
      const o = base + 0x40 + i * 4;
      anchorOffset.push(o + 4 <= end ? dv.getFloat32(o, true) : 0);
    }
    const sentinel = base + 0x5c <= end ? dv.getUint32(base + 0x58, true) >>> 0 : 0;

    // Queryable state -> visibility (the Phase-6 gate). The MAPPING is runtime/
    // animation-driven (D-04): in-hand during combat, on-back when sheathed — the
    // only differential-varying selector (@0x1c) is TIER, not this state, so the
    // mapping is INFERRED (footage-corroborated), never a fabricated byte field.
    const states = [
      {
        combat: "out-of-combat",
        visibility: "on-back",
        tag: "INFERRED",
        corrob:
          "footage: blades sheathed on Kratos's back out of combat; anchorOffset.z -8.0 is a back-offset candidate (D-04 runtime; ELF-disassembly tiebreaker)",
      },
      {
        combat: "in-combat",
        visibility: "in-hand",
        tag: "INFERRED",
        corrob: "footage: blades drawn in-hand during combat (D-04 runtime; ELF-disassembly tiebreaker)",
      },
    ];
    // Query helper — a method (not serialized by JSON.stringify; the `states` array
    // carries the same data for the JSON hand-off).
    const visibilityFor = (combat) => {
      const s = states.find((x) => x.combat === combat);
      return s ? s.visibility : null;
    };

    const hex32 = (off) => "0x" + (dv.getUint32(off, true) >>> 0).toString(16).padStart(8, "0");
    const evidence = [
      { field: "classId", offset: "+0x00", rawHex: "0x" + (classId >>> 0).toString(16), interp: `instance class id ${classId} (object/instance class)`, corrob: "matches maiblade/maigodblade class id 1", tag: "real" },
      { field: "variant", offset: "+0x02", rawHex: "0x" + (variant >>> 0).toString(16), interp: `descriptor variant ${variant} => u32@0 = 0x00020001 (type-5 blade-binding identity)`, corrob: "constant across the gomaiblade/gomaigodblade pair", tag: "real" },
      { field: "type5Label", offset: "—", rawHex: "—", interp: "the 'type-5' ANM-taxonomy attribution — NO literal class-5 record exists in the WAD; corroborated only by the ANM resource context (ANMX_R_Wpn type-id 3, ANM_maigodblade u32@0 3)", corrob: "escalation disposition: label not byte-confirmable; ELF-disassembly is the tiebreaker (D-04)", tag: "INFERRED" },
      { field: "bound", offset: "+0x04", rawHex: `"${bound}"`, interp: `bound blade instance name "${bound}" (the record this node presents)`, corrob: "differential: name differs by tier (maiblade vs maigodblade)", tag: "real" },
      { field: "tierSelector", offset: "+0x1c", rawHex: "0x" + (tierSelector >>> 0).toString(16), interp: `selector ${tierSelector} — differential-confirmed TIER field (gomaiblade=1, gomaigodblade=2), NOT the combat show/hide field`, corrob: "the ONLY differential-varying u16; varies with tier, not combat state", tag: "real" },
      { field: "anchorOffset", offset: "+0x40", rawHex: `(${anchorOffset.map((v) => v.toFixed(3)).join(", ")})`, interp: `placement/anchor offset vec4; z=${anchorOffset[2]} is an on-back-anchor candidate (raw real, back-offset interp INFERRED)`, corrob: "differential-varying vec; RESEARCH per-field table", tag: "real" },
      { field: "sentinel", offset: "+0x58", rawHex: hex32(base + 0x58), interp: "0xffffffff end sentinel (== last 4 bytes; constant; verbatim, never acted on)", corrob: "constant across the pair; equals rec.size-4 tail", tag: "real" },
      { field: "showHideMapping", offset: "runtime", rawHex: "—", interp: "in-combat -> in-hand / out-of-combat -> on-back — runtime/animation-driven blade presentation, NOT a decoded byte (the only differential-varying selector, @0x1c, is TIER)", corrob: "D-04 runtime-computed; footage-corroborated; ELF-disassembly tiebreaker — never a fabricated byte seed", tag: "INFERRED" },
    ];

    return { subtype, classId, variant, bound, tierSelector, anchorOffset, sentinel, states, visibilityFor, size: rec.size, evidence };
  }

  // buildFxDb — assemble the decoded FX records into a queryable, JSON-dumpable
  // FxDb (05-RESEARCH "FxDb Shape"; the Phase-6 hand-off boundary). This slice
  // populates meta + msh (05-01) + ptc (this plan); fxc/refs grow as later slices
  // land. Pure: no GL/DOM handles and no fs — the caller supplies bytes (the WAD
  // buffer + the optional standalone .bin buffers) — so JSON.stringify round-trips
  // (same purity discipline as buildMats' { byName, list }).
  //
  // standaloneRecs (optional 3rd arg): [{ name, buf, tag }] — the BFT/BGT trail
  // particle defs are standalone-ONLY (absent from the WAD, Pitfall 1), so they
  // enter db.ptc EXCLUSIVELY through here (the D-01 payoff-first trail data). Each
  // is decoded as a headerless rec (dataOff:0), same as the tests load them.
  function buildFxDb(records, wadBuf, standaloneRecs = []) {
    const db = {
      // region/tick are byte-corroborated from the disc serial SCUS-97399
      // (D-05, NTSC-U 60Hz) — tagged real, not hand-picked.
      meta: { region: "NTSC-U", tickHz: 60, source: "R_WPN0_0.WAD" },
      msh: {},
      ptc: {},
      fxc: {},
      refs: [],
    };

    // Color provenance (DEC-02 "colors come from these records" clause, closed
    // HONESTLY; Pitfall 4 / A3 / RESEARCH Open Q1). Effect color is NOT a static
    // PTC field (identity RGBA, byte-identical fire-vs-swoosh) and is NOT painted
    // into GFX_swordtrail (a uniform additive streak with NO length-wise age->color
    // ramp — verified this session: the hot region is a cross-strip edge, the fire
    // hue is a single amber family with no white-hot->ember gradient along U). It is
    // traced to the particle material MAT_pticleMat.blendColor, a REAL byte-decoded
    // MAT field; its application as the runtime white-hot->orange->ember ramp is the
    // INFERRED part (D-04). NO per-effect color is ever fabricated as `real`.
    // Decode ONLY MAT_pticleMat (filter first) so buildFxDb's success never couples
    // to decoding every unrelated MAT in the WAD.
    const pmat = buildMats(records.filter((r) => r.name === "MAT_pticleMat"), wadBuf).byName["MAT_pticleMat"];
    if (pmat) {
      db.meta.colorSource = {
        record: "MAT_pticleMat",
        field: "blendColor",
        value: pmat.blendColor.slice(), // real byte-decoded MAT blendColor
        tag: "real", // the blendColor VALUE is byte-decoded (real)
        rampTag: "INFERRED", // its use as the age->color ramp is a runtime tint
        note:
          "runtime tint applies MAT_pticleMat.blendColor; the white-hot->orange->ember " +
          "age->color ramp is INFERRED (D-04) — GFX_swordtrail has no painted length-wise " +
          "ramp and the static PTC RGBA is identity, byte-identical fire-vs-swoosh (Pitfall 4/A3)",
      };
    }
    for (const r of records) {
      if (r.tag !== 0x70 || r.size === 0) continue;
      if (!r.name.startsWith("MSH_") || !r.name.endsWith("Shape")) continue;
      // KEEP-FIRST per name: the WAD stores the level-1 copy (768 B) BEFORE the
      // god-tier copy (1008 B). Level 1 is the project target; god-tier is out
      // of scope (PROJECT.md), so the first (level-1) copy wins. Deviation from
      // the plan's "last-copy-wins" note — required by the size-768 known answer
      // and correct for the Level-1 target. The resolve-based per-referrer copy
      // selection is exercised by the callers/tests, not this bulk index.
      if (r.name in db.msh) continue;
      db.msh[r.name] = parseMsh(wadBuf, r);
    }

    // All PTC shapeRefs this slice are runtime handles: non-MSH_ names with NO
    // WAD record (RESEARCH cross-ref chain). Record { resolved:false } and do NOT
    // throw (an MSH_* ref would be resolvable, but no PTC references one here).
    const addPtcRef = (name, shapeRef) => {
      if (!shapeRef.startsWith("MSH_")) {
        db.refs.push({ from: name, kind: "shape", to: shapeRef, resolved: false, note: "runtime handle" });
      }
    };

    // PTC (in-WAD): the fire particles PTC_flame3 / PTC_flame6. Keep-FIRST per name
    // (the level-1 copy precedes the god-tier copy in WAD order; god tier is out of
    // scope — PROJECT.md), mirroring the MSH keep-first rule from 05-01.
    for (const r of records) {
      if (r.tag !== 0x1e || r.size === 0 || !r.name.startsWith("PTC_")) continue;
      if (r.name in db.ptc) continue; // keep-first (level-1 copy wins)
      const def = parsePtc(wadBuf, r);
      db.ptc[r.name] = def;
      addPtcRef(r.name, def.shapeRef);
    }

    // PTC (standalone 3rd arg): the BFT/BGT trail particles are standalone-ONLY
    // (Pitfall 1), so this is the ONLY way the D-01 priority trail data enters the
    // queryable FxDb. buildFxDb stays pure — the caller loads assets/kratos/fx/*.bin
    // and passes the bytes; here we synthesize the headerless rec (dataOff:0).
    for (const sr of standaloneRecs) {
      if (!sr.name.startsWith("PTC_")) continue;
      // WR-02: keep-first, mirroring the FXC standalone loop (:599) and the MSH
      // (:543) / in-WAD PTC (:561) / in-WAD FXC (:586) loops. Without this guard a
      // standalone PTC whose name collides with an in-WAD PTC would (a) silently
      // OVERWRITE the WAD-decoded entry and (b) push a second, contradictory shape
      // ref — the exact silent-wrong-decode the keep-first contract prevents.
      if (sr.name in db.ptc) continue; // keep-first (level-1 WAD copy wins)
      const rec = { name: sr.name, idx: 0, tag: sr.tag, size: sr.buf.length, dataOff: 0 };
      const def = parsePtc(sr.buf, rec);
      db.ptc[sr.name] = def;
      addPtcRef(sr.name, def.shapeRef);
    }

    // FXC (in-WAD): decode every real FXC record (keep-first per name — the level-1
    // copy precedes any god-tier copy in WAD order; god tier out of scope, PROJECT.md).
    // Track each record's idx so the subtype-0xd MSH shape ref can resolve nearest-
    // preceding from the referencing FXC (the Parsers.resolve contract).
    const fxcEntries = []; // { name, def, idx }
    for (const r of records) {
      if (r.tag !== 0x1e || r.size === 0 || !r.name.startsWith("FXC_")) continue;
      if (r.name in db.fxc) continue; // keep-first (level-1 copy wins)
      const def = parseFxc(wadBuf, r);
      db.fxc[r.name] = def;
      fxcEntries.push({ name: r.name, def, idx: r.idx });
    }

    // FXC (standalone 3rd arg): the BFT/BGT trail emitters are standalone-ONLY
    // (Pitfall 1) — this is the ONLY way the D-01 payoff-first trail emitters enter the
    // queryable FxDb (completing the D-01 slice). Synthesize the headerless rec
    // (dataOff:0), same as the tests load them; their shapeRefs are runtime handles
    // (non-MSH_), so idx is unused for resolution.
    for (const sr of standaloneRecs) {
      if (!sr.name.startsWith("FXC_")) continue;
      if (sr.name in db.fxc) continue;
      const rec = { name: sr.name, idx: 0, tag: sr.tag, size: sr.buf.length, dataOff: 0 };
      const def = parseFxc(sr.buf, rec);
      db.fxc[sr.name] = def;
      fxcEntries.push({ name: sr.name, def, idx: 0 });
    }

    // resolve is needed ONLY for the subtype-0xd FXC->MSH explicit link. Access Parsers
    // cross-env: Node requires parsers.js (same cached module the tests load); the
    // browser exposes it as a global lexical binding (parsers.js loads first). buildFxDb
    // is Node-only this phase (Phase 6 wires the browser), so the require path is what runs.
    const P =
      typeof require !== "undefined"
        ? require("./parsers.js")
        : typeof Parsers !== "undefined"
        ? Parsers
        : null;

    // refs (1) — FXC shape refs. An MSH_* name is an EXPLICIT shape link that MUST
    // resolve: resolve() returns null on a true miss -> THROW naming the record (the
    // parsers.js "caller decides" contract; no dangling explicit links). A non-MSH_ name
    // is a runtime handle -> recorded resolved:false, NEVER thrown (Anti-Pattern
    // "…Shape refs always resolvable"; T-05-04 no fabricated resolution).
    for (const { name, def, idx } of fxcEntries) {
      const ref = def.shapeRef;
      if (!ref) continue;
      if (ref.startsWith("MSH_")) {
        const mshRec = P && P.resolve(records, ref, idx);
        if (!mshRec) {
          throw new Error(`FXC ${name}: MSH shape ref "${ref}" does not resolve (dangling explicit link)`);
        }
        db.refs.push({ from: name, kind: "shape", to: ref, resolved: true });
      } else {
        db.refs.push({ from: name, kind: "shape", to: ref, resolved: false, note: "runtime handle" });
      }
    }

    // refs (2) — slot pairs (GUARDED, Warning 1 / T-05-04). SKIP placeholder slot 0x00
    // and the 0xffff root sentinel: every WAD-native FXC/PTC carries slot 0x00, so
    // pairing on it would fabricate false 0x00×0x00 links. Otherwise pair the FXC with
    // every PTC sharing its non-placeholder slot.
    //
    // WR-03: a slotId is a GROUP id, NOT a 1:1 emitter->particle binding (A4: 0x1d is
    // the BFT+BGT trail group; 0x1 is the CNG+FXCF+BDepoly6 group). Cross-multiplying a
    // group of N FXCs × M PTCs emits N×M edges where only the name-matched DIAGONAL is a
    // true binding (e.g. FXC_BFTemit1<->PTC_BFTpart1) and the off-diagonal edges are
    // false cross-links (fire emitter -> swoosh particle, and vice-versa). Slot refs are
    // corroboration-ONLY by design (never authoritative), so keep them ALL — but make
    // each SELF-DESCRIBING so the Phase-6 consumer can tell a true binding from a group
    // collision: `via:"slot"` + `corroborationOnly:true` flag the provenance, and
    // `shapeNameMatch` encodes the A4 discriminator (the emitter's authoritative shapeRef
    // equals the particle's shapeRef ONLY on the real pair). `confidence` summarizes it.
    for (const { name, def } of fxcEntries) {
      const slot = def.slotId;
      if (slot === 0x00 || slot === 0xffff) continue; // placeholder / root sentinel
      for (const ptcName of Object.keys(db.ptc)) {
        const ptcDef = db.ptc[ptcName];
        if (ptcDef.slotId !== slot) continue;
        // A4 name discriminator: the FXC emitter's shapeRef names the particle's own
        // shape ONLY for the true pair (BFTpart1Shape==BFTpart1Shape); a group collision
        // names a different shape (BFTpart1Shape != BGTpart1Shape).
        const shapeNameMatch = def.shapeRef === ptcDef.shapeRef;
        db.refs.push({
          from: name,
          kind: "slot",
          to: ptcName,
          via: "slot",
          corroborationOnly: true, // slot refs corroborate; NEVER an authoritative binding
          shapeNameMatch, // A4: true only for the real emitter<->particle diagonal
          confidence: shapeNameMatch ? "name-confirmed" : "group",
        });
      }
    }

    return db;
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

  return { decodeFlags, buildMats, enumTuples, parseTxr, parseLight, parseMsh, parsePtc, parseFxc, buildFxDb, parseAnmType5 };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = FxParse;
