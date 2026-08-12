// combat.js — Kratos combo state machine.
// Chain topology uses the real clip inventory of ANM_hero.bin (names/ids/durations).
// Named moves come from the in-game move list (msgs_en.txt / FLP_HUD text).
// Input->branch mapping and window timings are an inferred reconstruction — the game
// bakes these in binary event tracks per clip; sliders expose the assumptions.

const Combat = (() => {
  // button glyphs for the branch rows
  const GLYPH = {
    S: { txt: "□", color: "#d77bb6" },  // square
    T: { txt: "△", color: "#3fa66c" },  // triangle
    C: { txt: "○", color: "#e5533f" },  // circle
    X: { txt: "✕", color: "#7a9cc6" },  // cross
  };

  // Move graph. Every branch: {input, mod?, to, fancy?, tag: "real"|"inferred"}
  // "real" = the sequence itself is documented in the game's own move-list text
  //          or unambiguous from clip naming (A->B->C steps of one chain).
  // "inferred" = placement reconstructed from naming conventions.
  const GRAPH = {
    // ---- ground -------------------------------------------------------------
    idleCombat: {
      loop: true, category: "ground idle",
      branches: [
        { input: "S", to: "combo3A", fancy: "light chain", tag: "real" },
        { input: "T", to: "combo4A", fancy: "heavy chain — Spirit of Hercules", tag: "real" },
        { input: "T", mod: "hold", to: "blockLauncher", fancy: "launcher", tag: "inferred" },
        { input: "C", to: "grab", fancy: "grab", tag: "real" },
        { input: "X", to: "jumpUp", fancy: "jump", tag: "real" },
        { input: "S", mod: "L1", to: "dashMultiStab", fancy: "Cyclone of Chaos", tag: "inferred" },
        { input: "T", mod: "L1", to: "blockSlam", fancy: "block slam", tag: "inferred" },
      ],
    },
    // light chain (square): the full 6-step string exists as clips A..F
    combo3A: { branches: [
      { input: "S", to: "combo3B", fancy: "light chain 2", tag: "real" },
      { input: "T", to: "comboLR2", fancy: "early heavy finisher", tag: "inferred" },
    ]},
    combo3B: { branches: [
      { input: "S", to: "combo3C", fancy: "light chain 3", tag: "real" },
      { input: "T", to: "comboLR3", fancy: "Plume of Prometheus (□ □ △)", tag: "real" },
    ]},
    combo3C: { branches: [
      { input: "S", to: "combo3D", fancy: "light chain 4", tag: "real" },
      { input: "T", to: "comboLR4", fancy: "late heavy finisher", tag: "inferred" },
    ]},
    combo3D: { branches: [
      { input: "S", to: "combo3E", fancy: "light chain 5", tag: "real" },
      { input: "T", to: "comboJump", fancy: "jumping finisher", tag: "inferred" },
    ]},
    combo3E: { branches: [ { input: "S", to: "combo3F", fancy: "light chain ender", tag: "real" } ] },
    combo3F: { ender: true, branches: [] },
    comboLR2: { ender: true, branches: [] },
    comboLR3: { ender: true, branches: [] },
    comboLR4: { ender: true, branches: [] },
    comboJump: { ender: true, branches: [] },
    // heavy chain (triangle)
    combo4A: { branches: [
      { input: "T", to: "combo4B", fancy: "heavy chain 2", tag: "real" },
      { input: "S", to: "combo5A", fancy: "mixed string", tag: "inferred" },
    ]},
    combo4B: { branches: [
      { input: "T", to: "combo4C", fancy: "heavy chain 3", tag: "real" },
      { input: "S", to: "combo6A", fancy: "mixed string", tag: "inferred" },
    ]},
    combo4C: { branches: [
      { input: "T", to: "combo4D", fancy: "Spirit of Hercules ender", tag: "real" },
      { input: "S", to: "combo7A", fancy: "mixed string", tag: "inferred" },
    ]},
    combo4D: { ender: true, branches: [] },
    combo5A: { branches: [ { input: "S", to: "combo5B", fancy: "mixed string 2", tag: "real" } ] },
    combo5B: { ender: true, branches: [] },
    combo6A: { ender: true, branches: [] },
    combo7A: { ender: true, branches: [] },
    dashMultiStab: { ender: true, branches: [] },
    blockLauncher: { branches: [ { input: "X", to: "jumpUp", fancy: "chase the launch", tag: "inferred" } ] },
    blockSlam: { ender: true, branches: [] },
    grab: { ender: true, branches: [] },
    // ---- air ----------------------------------------------------------------
    jumpUp: { next: "jumpAir", branches: [] },
    jumpAir: {
      loop: true, category: "air idle",
      branches: [
        { input: "S", to: "airH1", fancy: "air light chain", tag: "real" },
        { input: "T", to: "airV1", fancy: "air slam", tag: "real" },
        { input: "C", to: "airImpale", fancy: "air impale", tag: "inferred" },
        { input: "X", to: "jumpDoubleAir", fancy: "double jump (✕ ✕)", tag: "real" },
      ],
    },
    jumpDoubleAir: {
      loop: true, category: "air idle",
      branches: [
        { input: "S", to: "airH1", fancy: "air light chain", tag: "real" },
        { input: "T", to: "airV1", fancy: "air slam", tag: "real" },
        { input: "C", to: "airImpale", fancy: "air impale", tag: "inferred" },
      ],
    },
    airH1: { air: true, branches: [ { input: "S", to: "airH2", fancy: "air chain 2", tag: "real" },
                                    { input: "T", to: "airV1", fancy: "air slam", tag: "real" } ] },
    airH2: { air: true, branches: [ { input: "S", to: "airH3", fancy: "air chain ender", tag: "real" },
                                    { input: "T", to: "airV1", fancy: "air slam", tag: "real" } ] },
    airH3: { air: true, ender: true, landTo: "land", branches: [] },
    airV1: { air: true, ender: true, landTo: "combatLand2", branches: [] },
    airImpale: { air: true, next: "airImpaleLand", branches: [] },
    airImpaleLand: { branches: [] },
    land: { branches: [] },
    combatLand2: { branches: [] },
    // ---- rage of the gods (berserk) ----------------------------------------
    berserkEnter: { next: "berserkIdle", branches: [] },
    berserkIdle: {
      loop: true, category: "rage idle",
      branches: [
        { input: "S", to: "berComboH1", fancy: "rage horizontal chain", tag: "real" },
        { input: "T", to: "berComboV1", fancy: "rage vertical chain", tag: "real" },
        { input: "X", to: "berJumpAir", fancy: "rage jump", tag: "real" },
      ],
    },
    berComboH1: { branches: [ { input: "S", to: "berComboH2", fancy: "rage H2", tag: "real" },
                              { input: "T", to: "berComboStab", fancy: "rage stab finisher", tag: "inferred" } ] },
    berComboH2: { branches: [ { input: "S", to: "berComboH3", fancy: "rage H3", tag: "real" },
                              { input: "T", to: "berComboStab", fancy: "rage stab finisher", tag: "inferred" } ] },
    berComboH3: { branches: [ { input: "S", to: "berComboH4", fancy: "rage H ender", tag: "real" } ] },
    berComboH4: { ender: true, branches: [] },
    berComboV1: { branches: [ { input: "T", to: "berComboV2", fancy: "rage V2", tag: "real" } ] },
    berComboV2: { branches: [ { input: "T", to: "berComboV3", fancy: "rage V3", tag: "real" } ] },
    berComboV3: { branches: [ { input: "T", to: "berComboV4", fancy: "rage V ender", tag: "real" } ] },
    berComboV4: { ender: true, branches: [] },
    berComboStab: { ender: true, branches: [] },
    berJumpAir: { loop: true, category: "rage air",
      branches: [ { input: "S", to: "berAirH1", fancy: "rage air chain", tag: "real" },
                  { input: "T", to: "berAirV2", fancy: "rage air slam", tag: "real" } ] },
    berAirH1: { air: true, branches: [ { input: "S", to: "berAirH2", fancy: "rage air 2", tag: "real" } ] },
    berAirH2: { air: true, ender: true, landTo: "berLand", branches: [] },
    berAirV2: { air: true, next: "berAirV2Land", branches: [] },
    berAirV2Land: { branches: [] },
    berLand: { branches: [] },
    berserkExit: { branches: [] },
  };

  // universal cancel available inside the block-cancel window (block-canceling
  // recovery is a documented GoW mechanic; window extent is the inferred part)
  const CANCEL = { input: "L1", to: "block", fancy: "block-cancel recovery", tag: "inferred" };

  function makeMachine(clipDur, callbacks) {
    const windows = { queue: 0.20, branch: 0.70, cancel: 0.50 }; // fractions of clip
    const st = {
      current: "idleCombat", t: 0, dur: clipDur("idleCombat") || 1.4,
      queued: null, rage: false, l1: false, hits: 0,
      idle: () => (st.rage ? "berserkIdle" : "idleCombat"),
      airIdle: () => (st.rage ? "berJumpAir" : "jumpAir"),
    };

    function node() { return GRAPH[st.current] || { branches: [] }; }
    function isIdle() { return !!node().loop; }

    function visibleBranches() {
      const n = node();
      const rows = n.branches.map((b) => ({ ...b }));
      if (!n.loop && !n.ender && rows.length === 0 && n.next) {
        // pass-through clips advertise nothing
      }
      if (!n.loop && st.current !== "block") rows.push({ ...CANCEL, cancel: true });
      return rows;
    }

    function start(name, viaInput) {
      const prev = st.current;
      st.current = name;
      st.t = 0;
      st.dur = clipDur(name) || 0.8;
      st.queued = null;
      if (!GRAPH[name]?.loop && name !== "block") st.hits += 1;
      callbacks.onMove(name, prev, viaInput);
    }

    function press(input) {
      callbacks.onInput(input, st.l1);
      const n = node();
      if (n.loop) {
        const b = pickBranch(n, input);
        if (b) start(b.to, b);
        return;
      }
      // during a move: cancel first, else queue
      if (input === "L1" && st.t / st.dur >= windows.cancel) {
        start(st.idle(), CANCEL); // represent block-cancel as return to stance
        callbacks.onCancel();
        return;
      }
      if (st.t / st.dur >= windows.queue) {
        const b = pickBranch(n, input);
        if (b) { st.queued = b; callbacks.onQueue(b); }
      }
    }

    function pickBranch(n, input) {
      const mods = st.l1 ? "L1" : null;
      let best = null;
      for (const b of n.branches) {
        if (b.input !== input) continue;
        if (b.mod === "L1" && mods !== "L1") continue;
        if (b.mod !== "L1" && b.mod !== "hold" && mods === "L1" && n.branches.some((o) => o.input === input && o.mod === "L1")) continue;
        if (b.mod === "hold") continue; // hold moves triggered via dedicated long-press only
        best = b;
        if (b.mod === "L1" && mods === "L1") break;
      }
      return best;
    }

    function holdPress(input) { // long-press triggers "hold" branches from idle
      const n = node();
      if (!n.loop) return false;
      const b = n.branches.find((x) => x.input === input && x.mod === "hold");
      if (b) { start(b.to, b); return true; }
      return false;
    }

    function tick(dt) {
      const n = node();
      if (n.loop) {
        st.t += dt;
        // air stances settle back to the ground after one full loop
        if (st.t >= st.dur) {
          if (n.category && n.category.includes("air")) {
            start(st.rage ? "berLand" : "land", null);
            return;
          }
          st.t %= st.dur;
        }
        return;
      }
      st.t += dt;
      const frac = st.t / st.dur;
      if (st.queued && frac >= windows.branch) {
        const b = st.queued;
        start(b.to, b);
        return;
      }
      if (st.t >= st.dur) {
        callbacks.onComplete(st.current);
        if (n.next) start(n.next, null);
        else if (n.air && n.landTo) start(n.landTo, null);
        else start(GRAPH[st.current]?.air ? st.airIdle() : st.idle(), null);
      }
    }

    function setRage(on) {
      st.rage = on;
      if (on) start("berserkEnter", null);
      else start("berserkExit", null);
    }

    // force(name) — jump straight to a graph state (move-palette navigation).
    // Routed through start() so every callback (move card, branch stack, blend
    // window) fires exactly as if the move were reached by input.
    function force(name) {
      if (!GRAPH[name]) return false;
      start(name, null);
      return true;
    }

    return { st, windows, GRAPH, press, holdPress, tick, setRage, visibleBranches, isIdle, force };
  }

  return { GRAPH, GLYPH, makeMachine };
})();
