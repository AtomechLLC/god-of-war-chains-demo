// gen_twk.js — emit designer-browsable .twk text files for each combat animation.
// Reconstructs per-move "tweak" sheets in the spirit of the game's own TWK tree
// (/Animation/goHero/...): real extracted values (duration, blend, keyframe rate,
// clip id) plus the combo-graph branch data, with provenance on every line.
//
// Usage: node tools/kratos-lab/gen_twk.js   (writes design/twk/*.twk)

const fs = require("fs");
const path = require("path");

const LAB = __dirname;
const OUT = path.resolve(LAB, "..", "..", "design", "twk");
const clipsJson = JSON.parse(fs.readFileSync(path.join(LAB, "data", "clips.json"), "utf8").replace(/^﻿/, ""));
const combatSrc = fs.readFileSync(path.join(LAB, "combat.js"), "utf8");
const Combat = eval(combatSrc + ";Combat");

const CLIP = {};
for (const c of clipsJson.clips) CLIP[c.name] = c;

// inferred timing model defaults (mirrors the lab's sliders)
const WIN = { queue: 0.2, branch: 0.7, cancel: 0.5 };

const FANCY = {
  comboLR3: "Plume of Prometheus",
  combo4D: "Spirit of Hercules (ender)",
  dashMultiStab: "Cyclone of Chaos",
  blockLauncher: "Launcher",
};

const BTN = { S: "SQUARE", T: "TRIANGLE", C: "CIRCLE", X: "CROSS", L1: "L1" };

function fmtBranch(b, dur) {
  const input = (b.mod === "L1" ? "L1+" : "") + (BTN[b.input] || b.input) + (b.mod === "hold" ? "(hold)" : "");
  const target = CLIP[b.to];
  const tdur = target ? target.dur.toFixed(3) + "s" : "?";
  const win = `[${(dur * WIN.queue).toFixed(2)}..${dur.toFixed(2)}]s`;
  const tag = b.tag === "real" ? "real-topology" : "inferred";
  const fancy = b.fancy ? `  ; ${b.fancy}` : "";
  return `  branch  input=${input.padEnd(14)} -> ${b.to.padEnd(16)} queueWindow=${win}  targetDur=${tdur}  [${tag}]${fancy}`;
}

fs.mkdirSync(OUT, { recursive: true });
const index = [];

for (const [name, node] of Object.entries(Combat.GRAPH)) {
  const c = CLIP[name];
  const dur = c ? c.dur : 0.4;
  const lines = [];
  lines.push(`; =====================================================================`);
  lines.push(`; ${name}.twk — reconstructed designer tweak sheet (God of War 1, hero)`);
  lines.push(`; Data provenance: [real] = decoded from disc data, [inferred] = model`);
  lines.push(`; =====================================================================`);
  lines.push(``);
  lines.push(`/Animation/goHero/${name}/`);
  if (c) {
    lines.push(`  clipId          ${c.id}            ; [real] ANM_hero.bin act id`);
    lines.push(`  duration        ${c.dur.toFixed(4)}s       ; [real] ${Math.round(c.dur * 30)} frames @30`);
    lines.push(`  blendIn         ${c.blend}s        ; [real] act header +0x04${c.blend === 0 ? " (hard cut)" : ""}`);
    lines.push(`  keyframeRate    ${c.kfHz}Hz         ; [real] sample interval`);
    lines.push(`  anmHeader       0x${c.off.toString(16).toUpperCase()}       ; [real] offset in ANM_hero.bin`);
  } else {
    lines.push(`  ; synthetic state (no ANM clip)`);
  }
  if (FANCY[name]) lines.push(`  moveName        "${FANCY[name]}"  ; [real] from msgs_en.txt move list`);
  if (node.loop) lines.push(`  looping         true          ; stance`);
  if (node.ender) lines.push(`  chainEnder      true          ; recovers to stance`);
  if (node.next) lines.push(`  autoNext        ${node.next}   ; follow-up clip`);
  lines.push(``);
  lines.push(`/Combat/goHero/${name}/Windows/          ; [inferred] adjustable model —`);
  lines.push(`  ; exact per-move windows are compiled into engine code, not data`);
  lines.push(`  queueOpens      ${(dur * WIN.queue).toFixed(2)}s        ; input buffered from here`);
  lines.push(`  branchPoint     ${(dur * WIN.branch).toFixed(2)}s        ; queued branch executes`);
  lines.push(`  cancelOpens     ${(dur * WIN.cancel).toFixed(2)}s        ; L1 block-cancel window`);
  lines.push(``);
  lines.push(`/Combat/goHero/${name}/Branches/`);
  const branches = (node.branches || []);
  if (branches.length === 0) {
    lines.push(`  (none — ${node.loop ? "stance branches only via inputs above" : "recovers to stance"})`);
  } else {
    for (const b of branches) lines.push(fmtBranch(b, dur));
  }
  if (!node.loop && name !== "block") {
    lines.push(`  cancel  input=L1             -> block            window=[${(dur * WIN.cancel).toFixed(2)}..${dur.toFixed(2)}]s  [inferred]  ; block-cancel recovery`);
  }
  lines.push(``);
  fs.writeFileSync(path.join(OUT, `${name}.twk`), lines.join("\n"));
  index.push({ name, dur, branches: branches.length, real: !!c });
}

// index file
const idx = [];
idx.push(`# Kratos animation tweak sheets (.twk)`);
idx.push(``);
idx.push(`Reconstructed designer-browsable branch data for every move in the combo`);
idx.push(`graph — one .twk per animation. Real values (clip id, duration, blend-in,`);
idx.push(`keyframe rate) are decoded from the disc; branch topology comes from clip`);
idx.push(`naming + the in-game move list; window timings are an inferred, adjustable`);
idx.push(`model (the game compiles exact windows into code). Regenerate with:`);
idx.push(``);
idx.push("```");
idx.push(`node tools/kratos-lab/gen_twk.js`);
idx.push("```");
idx.push(``);
idx.push(`| Move | Duration | Branches | ANM data |`);
idx.push(`|------|----------|----------|----------|`);
for (const e of index.sort((a, b) => a.name.localeCompare(b.name))) {
  idx.push(`| [${e.name}](${e.name}.twk) | ${e.dur.toFixed(2)}s | ${e.branches} | ${e.real ? "real" : "synthetic"} |`);
}
idx.push(``);
fs.writeFileSync(path.join(OUT, "README.md"), idx.join("\n"));
console.log(`wrote ${index.length} .twk files + README.md to ${OUT}`);
