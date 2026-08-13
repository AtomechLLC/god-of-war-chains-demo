// particles.js — pure world-space billboard particle sim for the Blades of Chaos
// FX runtime (FIRE-01/02, TRL-01/02, CHAIN-03). The automatable core of the
// Phase-6 payoff slices: spawn/integrate/cull, the blade-local→world spawn
// anchor, the velocity-aligned stretch axis, and the INFERRED gating helpers
// (trail-variant select, glow gain, age→color ramp). The GL submission (buffer,
// VS billboard, draw batch) stays in app.js — this module is pure (no gl/DOM),
// JSON-dumpable, and Node-requireable exactly like chain.js / loop.js.
//
// SC1 BLADE-LAG (D-03): a particle takes its spawn position from the decoded FXC
// placement-matrix translation transformed by the LIVE blade world matrix ONCE at
// spawn (spawnAnchor), then integrates in world space only — it never re-reads the
// blade. A fast blade outruns its already-spawned fire → the flame LAGS the whip
// (the whole point). Parenting live particles to the blade is the anti-pattern
// (Pitfall 4); the blade-lag divergence known-answer pins the decouple.
//
// FIXED-STEP (D-03 / Pitfall 5): integrate(dt) is called with exactly Loop.STEP
// (1/60 s) from simStep — never a wall-clock delta — so emission/advection read
// identical at 60Hz and 144Hz. Rates/lifetimes are NTSC 60Hz tick units (D-05).
//
// DETERMINISM BOUNDARY (D-07): this module is deterministic. Per-particle
// randomness is INJECTED by the caller passing a `sampler` to burst(); tests feed
// sampler=()=>0 for fixed jitter (as chain.test.js feeds fixed curve arrays).
// Math.random stays OUT of the tested paths.
//
// SECURITY (ASVS V5 DoS guards): the pool is hard-capped (maxParticles) and every
// non-finite pos/vel/size/life/color component is rejected before a particle
// enters the pool — non-finite values must never reach a GL uniform (render
// corruption). An age>life cull each integrate bounds lifetime growth.
//
// REAL vs INFERRED (data-first, CLAUDE.md):
//   REAL     — the spawnAnchor transform math + the FXC matrix translation it
//              reads (indices 12..14; decoded, byte-exact placement).
//   INFERRED — gravity constant G, burst jitter ranges, the variantFor table,
//              glowGain rest/hot, the rampColor stops, and particle life/size
//              defaults. NEVER fabricate a real-tagged effect color (Pitfall 4):
//              rampColor is explicitly INFERRED runtime tint (05-04 proved
//              GFX_swordtrail carries no painted length-wise ramp).

const Particles = (() => {
  // --- tiny vec helpers (mirror chain.js) ---
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  // Gravity: -43.64 world units/s² (≈3.1 m/s² on the meters bridge) — the value
  // DECODED from PTC_BFTpart1/2 +0x1e4, byte-identical across BOTH blade-fire
  // particle systems (other systems carry different per-system values at the
  // same field: BGT -51.8/-69.2, FXCF -54.8 — a real per-system parameter).
  // Reading that field AS gravity is the INFERRED part; the magnitude is real.
  const G = [0, -43.64, 0];
  const EPS = 1e-6;   // |velocity| below which stretchAxis falls back to camUp

  const finite3 = (v) =>
    Array.isArray(v) && v.length >= 3 &&
    Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);

  // xformM — the app.js:540 3×4 transform, replicated so this module needs no
  // app.js. out = [ m0·x+m4·y+m8·z+m12, m1·x+m5·y+m9·z+m13, m2·x+m6·y+m10·z+m14 ].
  function xformM(m, p) {
    return [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ];
  }

  // makePool({ maxParticles }) — the shared world-space particle pool (D-02).
  // Returns { spawn, integrate, burst, particles, count } — a plain JSON-dumpable
  // structure with NO GL handles (same purity contract as chain.buildRibbon).
  function makePool({ maxParticles } = {}) {
    const cap = Number.isFinite(maxParticles) && maxParticles > 0 ? Math.floor(maxParticles) : 1024;
    let particles = [];

    // spawn(p) — push { pos, vel, age:0, life, size, color, kind }. REJECT
    // (return false) when at cap OR any pos/vel/size/life/color component is
    // non-finite (V5 guard: the drop happens BEFORE the value can reach a GL
    // uniform). Choice: reject-when-full (not drop-oldest) — the caller's emission
    // rate is INFERRED, so silently dropping the newest is the least-surprising
    // bound and keeps existing particles' arcs intact.
    function spawn(p) {
      if (particles.length >= cap) return false;                     // hard cap (T-06-01-02)
      if (!p || !finite3(p.pos) || !finite3(p.vel)) return false;    // non-finite pos/vel (T-06-01-01)
      if (!Number.isFinite(p.size) || !Number.isFinite(p.life)) return false;
      if (p.color && !p.color.every(Number.isFinite)) return false;  // color → GL uniform
      particles.push({
        pos: [p.pos[0], p.pos[1], p.pos[2]],   // COPY — decouple from caller's array
        vel: [p.vel[0], p.vel[1], p.vel[2]],
        age: 0,
        life: p.life,
        size: p.size,
        color: p.color ? p.color.slice() : [1, 1, 1, 1],
        kind: p.kind,
        // per-kind gravity scale: 1 = the decoded fire gravity G; blood's
        // PTC carries its own (stronger) accel — gscale = theirs / G
        gscale: Number.isFinite(p.gscale) ? p.gscale : 1,
        // ground-matter (blood/debris/rocks) ends at the floor, never below
        floorKill: !!p.floorKill,
      });
      return true;
    }

    // integrate(dt) — fixed-step semi-implicit Euler + age cull. dt MUST be
    // Loop.STEP (Pitfall 5). pos advances with the PRE-gravity velocity, then
    // gravity updates vel, then age advances; particles with age>life are culled
    // in a single filter pass (bounds lifetime growth).
    function integrate(dt) {
      for (const q of particles) {
        const gs = q.gscale || 1;
        q.pos[0] += q.vel[0] * dt; q.pos[1] += q.vel[1] * dt; q.pos[2] += q.vel[2] * dt;
        q.vel[0] += G[0] * gs * dt; q.vel[1] += G[1] * gs * dt; q.vel[2] += G[2] * gs * dt;
        q.age += dt;
      }
      particles = particles.filter((q) => q.age <= q.life && !(q.floorKill && q.pos[1] <= 0));
    }

    // burst(n, template, sampler) — spawn up to n particles from `template`,
    // jittering pos/vel per component by sampler() (INFERRED range; sampler=()=>0
    // in tests → deterministic, sharing the template position). Respects the cap
    // (spawns min(n, remaining)). Returns the number actually added.
    function burst(n, template, sampler) {
      const jit = typeof sampler === "function" ? sampler : () => 0;
      let added = 0;
      for (let i = 0; i < n && particles.length < cap; i++) {
        const ok = spawn({
          pos: [template.pos[0] + jit(), template.pos[1] + jit(), template.pos[2] + jit()],
          vel: [template.vel[0] + jit(), template.vel[1] + jit(), template.vel[2] + jit()],
          size: template.size,
          life: template.life,
          color: template.color,
          kind: template.kind,
        });
        if (ok) added++;
      }
      return added;
    }

    // getters keep `particles`/`count` live across the integrate() filter-reassign.
    return {
      spawn, integrate, burst,
      get particles() { return particles; },
      get count() { return particles.length; },
    };
  }

  // spawnAnchor(bladeMat, fxcMatrix) — world spawn position (SC1). Reads the
  // decoded FXC placement translation (indices 12..14 — REAL/byte-exact) and
  // transforms it by the live blade world matrix. Sampled ONCE at spawn; the
  // particle decouples afterward (the source of blade-lag).
  function spawnAnchor(bladeMat, fxcMatrix) {
    return xformM(bladeMat, [fxcMatrix[12], fxcMatrix[13], fxcMatrix[14]]);
  }

  // stretchAxis(vel, camUp) — velocity-aligned spark axis; camUp fallback when the
  // velocity is ~zero (CLAUDE.md Part 3 velocity-aligned stretched billboard).
  function stretchAxis(vel, camUp) {
    return len3(vel) > EPS ? norm(vel) : camUp;
  }

  // variantFor(moveName) — INFERRED move→trail-variant table (TRL-02). Light □
  // chains read as the crimson BFT fire trail; heavy △ chains as the BGT neutral
  // swoosh. Seeded with two representative combat.js GRAPH states + a family
  // heuristic fallback. INFERRED — refine vs footage in Phase 7.
  const TRAIL_VARIANT = { combo3A: "BFT", combo4A: "BGT" };
  function variantFor(moveName) {
    if (Object.prototype.hasOwnProperty.call(TRAIL_VARIANT, moveName)) return TRAIL_VARIANT[moveName];
    return /4|LR|heav/i.test(String(moveName)) ? "BGT" : "BFT";   // heavy family → BGT (INFERRED)
  }

  // glowGain(isIdle, {rest, hot}) — INFERRED dark↔hot chain-glow rule (CHAIN-03 /
  // D-05). No decoded state gate exists; dark at rest, hot on attack. The rest/hot
  // magnitudes are the INFERRED, footage-calibrated values (Phase 7).
  function glowGain(isIdle, { rest, hot } = {}) {
    return isIdle ? rest : hot;
  }

  // rampColor(t) — INFERRED runtime age→color ramp (TRL-01 / A3). t∈[0,1] is the
  // trail-age fraction: white-hot core (0) → orange → ember (1), a monotone
  // luminance falloff. 05-04 PROVED GFX_swordtrail carries no painted length-wise
  // ramp, so this tint is runtime/INFERRED — NEVER a fabricated real effect color.
  const RAMP = [
    [1.00, 1.00, 0.95],   // t=0    white-hot core (whitish)
    [1.00, 0.55, 0.15],   // t=0.5  orange
    [0.50, 0.08, 0.02],   // t=1    ember (red-dominant, dim)
  ];
  function rampColor(t) {
    const c = Math.min(Math.max(t, 0), 1) * 2;    // 0..2 across the 3 stops
    const i = Math.min(Math.floor(c), 1);          // segment 0 (0→0.5) or 1 (0.5→1)
    const f = c - i;
    const a = RAMP[i], b = RAMP[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  // fireBindings(db) — join db.fxc→db.ptc by matching shapeRef NAME (D-08 /
  // Pitfall 6). The WAD-native fire family uses placeholder slot 0x0, which
  // buildFxDb deliberately does NOT pair; the real discriminator is the shapeRef
  // string (emitter and particle both point at flameNShape). db.refs slot pairs
  // are intentionally NOT consulted here.
  function fireBindings(db) {
    const out = [];
    const fxc = (db && db.fxc) || {};
    const ptc = (db && db.ptc) || {};
    for (const emitter of Object.keys(fxc)) {
      const shapeRef = fxc[emitter] && fxc[emitter].shapeRef;
      if (!shapeRef) continue;
      for (const particle of Object.keys(ptc)) {
        if (ptc[particle] && ptc[particle].shapeRef === shapeRef) {
          out.push({ emitter, particle, shapeRef });
        }
      }
    }
    return out;
  }

  return { makePool, spawnAnchor, stretchAxis, variantFor, glowGain, rampColor, fireBindings, G };
})();

// dual-environment guard: browser <script> global + Node require (no build step)
if (typeof module !== "undefined" && module.exports) module.exports = Particles;
