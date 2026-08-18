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
    jumpUp: { next: "jumpAir", air: true, branches: [
      // the ballistic hop is quick (~0.5 s) — the air moveset must be
      // reachable from the ASCENT, not only the brief jumpAir float
      { input: "S", to: "airH1", fancy: "air light chain", tag: "real" },
      { input: "T", to: "airV1", fancy: "air slam", tag: "real" },
      { input: "C", to: "airImpale", fancy: "air impale", tag: "inferred" },
      { input: "X", to: "jumpDoubleAir", fancy: "double jump (✕ ✕)", tag: "real" },
    ] },
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
    // ---- hit reactions (Fight back) ----------------------------------------
    // Forced by incoming enemy strikes (app.js hurtKratos), never by input —
    // REAL clips from the hero ANM's hit suite; each settles to idle via the
    // standard end-of-clip path. hitKnockdown chains its REAL getup.
    hitFront: { branches: [] },
    hitBack: { branches: [] },
    hitLeft: { branches: [] },
    hitRight: { branches: [] },
    hitAir: { air: true, landTo: "land", branches: [] },
    hitKnockdown: { next: "hitGetup", branches: [] },
    hitGetup: { branches: [] },
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

  // GUARD: a true block STATE on the authored clips (the article's gap the
  // lab lacked). Hold L1 = guard; strikes that land are blocked (app.js
  // hurtKratos) and play the authored blockReaction flinch. From guard the
  // L1-modified specials + the launcher + jump remain available — matching
  // GoW's L1+button layer. Branch topology INFERRED; clips REAL.
  GRAPH.block = { loop: true, category: "guard", branches: [
    { input: "S", mod: "L1", to: "dashMultiStab", fancy: "Cyclone of Chaos", tag: "inferred" },
    { input: "T", mod: "L1", to: "blockSlam", fancy: "block slam", tag: "inferred" },
    { input: "T", mod: "hold", to: "blockLauncher", fancy: "launcher", tag: "inferred" },
    { input: "X", to: "jumpUp", fancy: "jump out of guard", tag: "inferred" },
  ] };
  GRAPH.berBlockIdle = { loop: true, category: "guard", branches: [
    { input: "X", to: "jumpUp", fancy: "jump out of guard", tag: "inferred" },
  ] };
  GRAPH.blockReaction = { next: "block", category: "guard", branches: [] };    // authored block-impact flinch
  GRAPH.berBlockHit01 = { next: "berBlockIdle", category: "guard", branches: [] };
  // guard-state evades (user-identified): the evade stick WHILE blocking
  // runs the authored block-flip clips - each carries its own REAL root
  // channels (blockBackFlip even a comp-421 leap arc). Mapping INFERRED:
  // back -> backflip, forward -> forward flip, sideways -> the 360 spin.
  GRAPH.blockBackFlip = { next: "block", category: "guard", branches: [] };
  GRAPH.blockForwardFlip = { next: "block", category: "guard", branches: [] };
  GRAPH.block360 = { next: "block", category: "guard", branches: [] };
  // AIR BLOCK: L1 while airborne guards the fall (the authored airBlock
  // clip). Category carries BOTH markers: "air" (falls, lands) and
  // "guard" (negates frontal strikes). hold=true exempts it from the
  // one-loop air settle — it guards until touchdown or L1 release.
  GRAPH.airBlock = { loop: true, hold: true, category: "air guard", landTo: "land", branches: [] };

  // universal cancel available inside the block-cancel window (block-canceling
  // recovery is a documented GoW mechanic; window extent is the inferred part)
  const CANCEL = { input: "L1", to: "block", fancy: "block-cancel into guard", tag: "inferred" };

  function makeMachine(clipDur, callbacks, hitSpan) {
    // Flat fallback windows for moves with NO derived hit span (stances,
    // traversal). Moves WITH a span use the HIT-FRAME-ANCHORED model
    // below (Derek Daniels, "Combat Cancelled": GoW normals cancel
    // PRE-hit-frame; L1/hold specials only POST-hit — the anti-lockdown
    // rule; block is an instant cancel). Structure = the designer's own
    // description; the derived spans remain sweep-derived (engine truth
    // is compiled code — documented).
    const windows = { queue: 0.20, branch: 0.70, cancel: 0.50 }; // fractions of clip
    const st = {
      current: "idleCombat", t: 0, dur: clipDur("idleCombat") || 1.4,
      queued: null, rage: false, brawl: false, l1: false, hits: 0, special: false,
      idle: () => (st.brawl ? "berserkIdle" : "idleCombat"),
      guard: () => (st.brawl ? "berBlockIdle" : "block"),
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

    // the current move's hit span {a, b} (clip fractions) or null
    function span() { return hitSpan ? hitSpan(st.current) : null; }
    // where a buffered branch fires: post-hit (span end) when known
    function fireFrac() { const sp = span(); return sp ? sp.b : windows.branch; }

    function start(name, viaInput) {
      const prev = st.current;
      st.current = name;
      st.t = 0;
      st.dur = clipDur(name) || 0.8;
      st.queued = null;
      // L1/hold entries are SPECIALS — they lock until post-hit (article)
      st.special = !!(viaInput && (viaInput.mod === "L1" || viaInput.mod === "hold"));
      if (!GRAPH[name]?.loop && GRAPH[name]?.category !== "guard") st.hits += 1;
      callbacks.onMove(name, prev, viaInput);
    }

    function press(input) {
      callbacks.onInput(input, st.l1);
      const n = node();
      if (n.loop) {
        if (input === "L1" && !(n.category || "").includes("guard")) {
          // raise guard — the AIR guard when the stance is airborne
          start((n.category || "").includes("air") ? "airBlock" : st.guard(), CANCEL);
          return;
        }
        const b = pickBranch(n, input);
        if (b) start(b.to, b);
        return;
      }
      // during a move — the hit-frame-anchored cancel model:
      const frac = st.t / st.dur;
      const sp = span();
      if (input === "L1") {
        // BLOCK: instant cancel across the whole animation on normals;
        // specials unlock only after their hit frames (anti-lockdown).
        // No-span moves keep the old 0.50 window.
        const ok = sp ? (!st.special || frac >= sp.b) : frac >= windows.cancel;
        if (ok) {
          // cancel INTO guard — the AIR guard when the move is airborne
          start(n.air || (n.category || "").includes("air") ? "airBlock" : st.guard(), CANCEL);
          callbacks.onCancel();
        }
        return;
      }
      const b = pickBranch(n, input);
      if (!b) return;
      if (sp && !st.special && frac < sp.a) {
        // PRE-HIT-FRAME CANCEL (GoW's rule for normals): the wind-up
        // aborts into the new attack immediately.
        start(b.to, b);
        return;
      }
      // otherwise BUFFER — fires post-hit (see tick). No-span moves keep
      // the old early-press gate.
      if (sp || frac >= windows.queue) { st.queued = b; callbacks.onQueue(b); }
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

    function release(input) { // L1 up: lower the guard back to stance
      const n = node();
      if (input === "L1" && (n.category || "").includes("guard") && n.loop)
        start((n.category || "").includes("air") ? st.airIdle() : st.idle(), null);
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
          if (!n.hold && n.category && n.category.includes("air")) {
            start(n.landTo || (st.brawl ? "berLand" : "land"), null);
            return;
          }
          st.t %= st.dur;
        }
        return;
      }
      st.t += dt;
      const frac = st.t / st.dur;
      if (st.queued && frac >= fireFrac()) { // post-hit for spanned moves
        const b = st.queued;
        start(b.to, b);
        return;
      }
      if (st.t >= st.dur) {
        callbacks.onComplete(st.current);
        // a guard-bound next (flinch/flip -> block) honors a RELEASED L1:
        // if the guard was dropped mid-clip, recover to stance instead
        if (n.next) start(GRAPH[n.next] && GRAPH[n.next].category === "guard" && !st.l1 ? st.idle() : n.next, null);
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

    // timeline introspection: the current move's anchored windows
    function cancelInfo() {
      const sp = span();
      return { span: sp, special: st.special, fire: fireFrac() };
    }

    return {
      cancelInfo, release, st, windows, GRAPH, press, holdPress, tick, setRage, setBrawl, visibleBranches, isIdle, force };
  }

  return { GRAPH, GLYPH, makeMachine };
})();
