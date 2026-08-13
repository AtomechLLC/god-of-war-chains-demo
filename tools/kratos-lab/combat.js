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
    // jump chain — REAL clip assignments from the /Animation/goHero/Navigation/
    // action bank (decoded TWK): ANIVJump="jumpUp" → ANIJump="jumpAir" →
    // ANIFall="fallv" → ANILand="land". The transition *timing* is the engine's
    // controller (rise channel → gravity), mirrored in app.js; landTo here
    // routes each air stance into its authored fall clip.
    jumpUp: { next: "jumpAir", branches: [] },
    jumpAir: {
      loop: true, category: "air idle", landTo: "fallV",
      branches: [
        { input: "S", to: "airH1", fancy: "air light chain", tag: "real" },
        { input: "T", to: "airV1", fancy: "air slam", tag: "real" },
        { input: "C", to: "airImpale", fancy: "air impale", tag: "inferred" },
        { input: "X", to: "jumpDoubleAir", fancy: "double jump (✕ ✕)", tag: "real" },
      ],
    },
    jumpDoubleAir: {
      loop: true, category: "air idle", landTo: "fallV",
      branches: [
        { input: "S", to: "airH1", fancy: "air light chain", tag: "real" },
        { input: "T", to: "airV1", fancy: "air slam", tag: "real" },
        { input: "C", to: "airImpale", fancy: "air impale", tag: "inferred" },
      ],
    },
    // ANIFall="fallv": the descending loop between the jump float and touchdown
    fallV: { loop: true, category: "air fall", landTo: "land", branches: [] },
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
    // ---- hand-to-hand brawl (the "berserk" set) -----------------------------
    // RE-IDENTIFIED 2026-08-12: these clips author the blades SHEATHED (their
    // type-10 blade tracks pin both tips at the dorsal sheath while the hands
    // strike) — a complete bare-handed moveset with enter/exit transitions.
    // This is NOT Rage of the Gods: rage keeps the normal blade moveset (the
    // wiki-corroborated visual is blue blade glyphs + aura — the god-mode FX
    // set), while this brawl set matches the disarmed hand-to-hand duel
    // (INFERRED: the Ares finale).
    berserkEnter: { next: "berserkIdle", branches: [] },
    berserkIdle: {
      loop: true, category: "brawl idle",
      branches: [
        { input: "S", to: "berComboH1", fancy: "fists — horizontal chain", tag: "real" },
        { input: "T", to: "berComboV1", fancy: "fists — vertical chain", tag: "real" },
        { input: "X", to: "berJumpAir", fancy: "fists — jump", tag: "real" },
      ],
    },
    berComboH1: { branches: [ { input: "S", to: "berComboH2", fancy: "fists H2", tag: "real" },
                              { input: "T", to: "berComboStab", fancy: "fists stab finisher", tag: "inferred" } ] },
    berComboH2: { branches: [ { input: "S", to: "berComboH3", fancy: "fists H3", tag: "real" },
                              { input: "T", to: "berComboStab", fancy: "fists stab finisher", tag: "inferred" } ] },
    berComboH3: { branches: [ { input: "S", to: "berComboH4", fancy: "fists H ender", tag: "real" } ] },
    berComboH4: { ender: true, branches: [] },
    berComboV1: { branches: [ { input: "T", to: "berComboV2", fancy: "fists V2", tag: "real" } ] },
    berComboV2: { branches: [ { input: "T", to: "berComboV3", fancy: "fists V3", tag: "real" } ] },
    berComboV3: { branches: [ { input: "T", to: "berComboV4", fancy: "fists V ender", tag: "real" } ] },
    berComboV4: { ender: true, branches: [] },
    berComboStab: { ender: true, branches: [] },
    berJumpAir: { loop: true, category: "brawl air", landTo: "berFallN",
      branches: [ { input: "S", to: "berAirH1", fancy: "fists air chain", tag: "real" },
                  { input: "T", to: "berAirV2", fancy: "fists air slam", tag: "real" } ] },
    // brawl fall clip (berFallN) — mirrors fallV for the bare-handed set
    berFallN: { loop: true, category: "air fall", landTo: "berLand", branches: [] },
    berAirH1: { air: true, branches: [ { input: "S", to: "berAirH2", fancy: "fists air 2", tag: "real" } ] },
    berAirH2: { air: true, ender: true, landTo: "berLand", branches: [] },
    berAirV2: { air: true, next: "berAirV2Land", branches: [] },
    berAirV2Land: { branches: [] },
    berLand: { branches: [] },
    berserkExit: { branches: [] },
  };

  // ---- stick locomotion + evades (GoW1 controls) ---------------------------
  // The walkBlend clips are the authored locomotion blend tree (Navigation
  // bank: ANIWalk="bwalk…"); ground speed is DERIVED from the clips (the
  // planted foot backslides at exactly the authored speed): walkBlend1
  // 1.74 m/s, walkBlend2 8.82 m/s (brawl 1.55/9.65). They share the stance
  // branch sets so combat flows straight out of movement, like the game.
  GRAPH.walkBlend1 = { loop: true, category: "locomotion", branches: GRAPH.idleCombat.branches };
  GRAPH.walkBlend2 = { loop: true, category: "locomotion", branches: GRAPH.idleCombat.branches };
  GRAPH.berWalkBlend1 = { loop: true, category: "brawl locomotion", branches: GRAPH.berserkIdle.branches };
  GRAPH.berWalkBlend2 = { loop: true, category: "brawl locomotion", branches: GRAPH.berserkIdle.branches };
  // Right-stick evades (GoW1's real right-stick function — there is no camera
  // stick). Roll distances are the clips' REAL controller channels: front/back
  // on comp 422, left/right on comp 420. Non-loop → recover to stance.
  // momentum-preserving landing (touchdown while the stick is held) — the
  // authored running-landing clip; recovers straight into locomotion
  GRAPH.runLand = { branches: [] };
  GRAPH.evadeFront = { branches: [] };
  GRAPH.evadeBack = { branches: [] };
  GRAPH.evadeLeft = { branches: [] };
  GRAPH.evadeRight = { branches: [] };

  // universal cancel available inside the block-cancel window (block-canceling
  // recovery is a documented GoW mechanic; window extent is the inferred part)
  const CANCEL = { input: "L1", to: "block", fancy: "block-cancel recovery", tag: "inferred" };

  function makeMachine(clipDur, callbacks) {
    const windows = { queue: 0.20, branch: 0.70, cancel: 0.50 }; // fractions of clip
    const st = {
      current: "idleCombat", t: 0, dur: clipDur("idleCombat") || 1.4,
      queued: null, rage: false, brawl: false, l1: false, hits: 0,
      idle: () => (st.brawl ? "berserkIdle" : "idleCombat"),
      airIdle: () => (st.brawl ? "berJumpAir" : "jumpAir"),
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
        // air stances settle after one full loop — into their authored fall
        // clip (landTo, from the Navigation action bank) when they have one,
        // else straight to the moveset's land. (st.brawl, not st.rage —
        // rage is a buff and keeps the normal set.)
        if (st.t >= st.dur) {
          if (n.category && n.category.includes("air")) {
            start(n.landTo || (st.brawl ? "berLand" : "land"), null);
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

    // RAGE OF THE GODS (re-identified 2026-08-12): a BUFF, not a moveset —
    // Kratos keeps the normal blade combos; the aura + god-mode FX set +
    // damage/armor change. No stance transition on toggle.
    function setRage(on) {
      st.rage = on;
    }

    // HAND-TO-HAND BRAWL: the "berserk" clip set — blades sheathed, fists
    // strike (INFERRED context: the disarmed Ares-duel finale). Enter/exit
    // transitions are the authored berserkEnter/berserkExit clips.
    function setBrawl(on) {
      st.brawl = on;
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

    return { st, windows, GRAPH, press, holdPress, tick, setRage, setBrawl, visibleBranches, isIdle, force };
  }

  return { GRAPH, GLYPH, makeMachine };
})();
