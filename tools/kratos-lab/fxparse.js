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

    // Data-first evidence: raw values are byte-decoded (real). idxCount's MEANING
    // is inferred (A5) though its raw value is real. The 0xffffffff sentinels are
    // recorded verbatim, never acted on. NO color is read from a shape (Pitfall 4).
    const p0 = verts.length ? verts[0].pos : [0, 0, 0];
    const evidence = [
      { field: "vertCount", offset: "+0x00", rawHex: hex32(base + 0x00), interp: `${vertCount} vertices`, corrob: "RESEARCH MSH table; unit-length normals confirm interleave", tag: "real" },
      { field: "idxCount", offset: "+0x04", rawHex: hex32(base + 0x04), interp: `${idxCount} — suspected index/strip/triangle count (raw real, meaning INFERRED, A5)`, corrob: "RESEARCH MSH +0x04", tag: "INFERRED" },
      { field: "sentinel0", offset: "+0x08", rawHex: hex32(base + 0x08), interp: "0xffffffff sentinel (constant; verbatim, never acted on)", corrob: "constant across all copies", tag: "real" },
      { field: "sentinel1", offset: "+0x0c", rawHex: hex32(base + 0x0c), interp: "0xffffffff sentinel (constant; verbatim, never acted on)", corrob: "constant across all copies", tag: "real" },
      { field: "verts[0].pos", offset: "+0x10", rawHex: `${hex32(base + 0x10)} ${hex32(base + 0x14)} ${hex32(base + 0x18)}`, interp: `first vertex position (${p0.map((v) => v.toFixed(3)).join(", ")})`, corrob: "RESEARCH: (0, 2.982, -13.684)", tag: "real" },
    ];

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
      { field: "size", offset: "+0x50", rawHex: hex32(base + 0x50), interp: `${size} bytes (== record length)`, corrob: "equals rec.size", tag: "real" },
      { field: "shapeRef", offset: "+0x54", rawHex: `"${shapeRef}"`, interp: `runtime-handle shape name "${shapeRef}" (non-MSH_ -> no WAD record; resolved:false)`, corrob: "RESEARCH cross-ref chain; only MSH_*Shape names resolve", tag: "real" },
      { field: "params", offset: "+0x64", rawHex: `${params.length} f32`, interp: "raw param floats, bounded by rec.size — byte-decoded", corrob: "bounded by dataOff + rec.size (T-05-02)", tag: "real" },
      { field: "paramTicks", offset: "+0x64", rawHex: "—", interp: "params INTERPRETED as NTSC 60Hz tick lifetimes/rates/sizes — MEANING inferred (A2, D-05), pending FXC/footage cross-check", corrob: "D-05 tick unit", tag: "INFERRED" },
      { field: "texFormat", offset: "tail", rawHex: texFormat ? '"1555"' : "—", interp: texFormat ? "'1555' tail — suspected A1R5G5B5 particle-texture format (A1)" : "no '1555' tail marker found", corrob: "RESEARCH PTC tail", tag: "INFERRED" },
      { field: "colorProvenance", offset: "params", rawHex: "—", interp: "static RGBA in the param region is identity (1,1,1) and byte-identical fire-vs-swoosh — effect color is runtime/MAT-sourced, NOT read from PTC (Pitfall 4, A3)", corrob: "BFT vs BGT RGBA-region byte-identity", tag: "INFERRED" },
    ];

    return { magic, slotId, index, matrix, shapeRef, params, texFormat, size, evidence };
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
      const rec = { name: sr.name, idx: 0, tag: sr.tag, size: sr.buf.length, dataOff: 0 };
      const def = parsePtc(sr.buf, rec);
      db.ptc[sr.name] = def;
      addPtcRef(sr.name, def.shapeRef);
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

  return { decodeFlags, buildMats, enumTuples, parseTxr, parseMsh, parsePtc, buildFxDb };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = FxParse;
