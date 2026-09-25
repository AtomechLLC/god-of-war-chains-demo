---
phase: quick
plan: 260924-vax
type: execute
wave: 1
depends_on: []
files_modified: [.planning/PROJECT.md, .planning/STATE.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md]
autonomous: true
requirements: [QUICK-260924-VAX]

must_haves:
  truths:
    - "PROJECT.md describes the lab as it is now: assets/ curated study set (not extracted/), enemy target dummy, combat/guard model, GoW3 track; enemies are no longer listed as out of scope; Key Decisions rows carry outcomes"
    - "REQUIREMENTS.md has an 'Ad-hoc delivered (pre-GSD, Aug 2026)' section whose IDs carry explicit real-vs-INFERRED notes, a Phase 8 heading with GOW3-01..03, and a Traceability table that lists every new ID"
    - "ROADMAP.md's '### Phase 8' details block sits inside '## Phase Details' (after Phase 7, before '## Progress'), the Progress table has a Phase 8 row, and the execution-order line states Phase 8 runs parallel to Phase 7"
    - "STATE.md 'Current focus' names both open tracks and the Decisions list records the Aug-2026 combat model plus the 2026-09-25 distribution ruling"
    - "No previously validated content was removed from any of the four docs, and no code file changed"
  artifacts:
    - path: ".planning/PROJECT.md"
      provides: "Reconciled What-This-Is / Context / Constraints / Out-of-Scope / Key Decisions (with outcomes) / footer"
      contains: "Ad-hoc"
    - path: ".planning/REQUIREMENTS.md"
      provides: "Ad-hoc delivered section (CMB/ENM/NAV/MOT/DATA/RAGE IDs), Phase 8 GOW3-01..03, extended Traceability"
      contains: "GOW3-03"
    - path: ".planning/ROADMAP.md"
      provides: "Phase 8 block relocated into Phase Details; Progress row; parallel execution-order note; ad-hoc note"
      contains: "8. God of War III Data Breakdown"
    - path: ".planning/STATE.md"
      provides: "Two-track Current focus; combat-model + distribution-policy Decisions bullets"
      contains: "Phase 8"
  key_links:
    - from: ".planning/ROADMAP.md"
      to: ".planning/REQUIREMENTS.md"
      via: "Progress 'Ad-hoc work' note points at the REQUIREMENTS section by name"
      pattern: "Ad-hoc delivered \\(pre-GSD, Aug 2026\\)"
    - from: ".planning/REQUIREMENTS.md Traceability"
      to: ".planning/REQUIREMENTS.md Ad-hoc section"
      via: "every ID defined in the section has a Traceability row"
      pattern: "\\| (CMB|ENM|NAV|MOT-0[34]|DATA|RAGE|GOW3)-0[0-9] \\|"
    - from: ".planning/PROJECT.md Key Decisions"
      to: "design/data-archaeology.html status column"
      via: "real-vs-INFERRED wording copied from the archaeology page, not invented"
      pattern: "INFERRED"
---

<objective>
Reconcile the four planning documents (PROJECT.md, STATE.md, REQUIREMENTS.md, ROADMAP.md) with the codebase as it actually is after 126 ad-hoc commits (2026-08-10 → 2026-09-24, commits 2ee193c…e670303) that shipped before GSD enforcement was added to CLAUDE.md, and fix the structural defect where the SDK appended the Phase 8 details block after `## Progress` instead of inside `## Phase Details`.

Purpose: The docs still describe a weapon-only lab loading from `extracted/`, list enemies as out of scope, show every Key Decision as "Pending", and have no requirement IDs for the target dummy, combat/guard model, action index, root-motion tween, TWK decode campaign, or the GoW3 track. Phase 7 and Phase 8 planning will both read these docs; they must reflect reality, and every delivered value must carry the CLAUDE.md data-first label (REAL = decoded bytes, INFERRED = model/interpretation) so no downstream phase mistakes a tuned constant for a decoded one.

Output: Four updated `.planning/*.md` files. Docs only — zero code changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
@CLAUDE.md
@design/data-archaeology.html
@assets/README.md

<interfaces>
<!-- Reference facts for the executor. Verified against `git log` during planning. Use these verbatim; do NOT invent phase history — none of the ad-hoc commits belong to a planned phase. -->

Ad-hoc themes with anchor commits (commit dates; local-time footers in STATE.md read one day later, e.g. the policy ruling is dated 2026-09-25):
(a) 2026-08-10/11 — trail/root-motion/hitbox refinements + the TWK decode campaign: 2ee193c…85da379; 046e3fd (all TWK instances decoded to design/twk/decoded/ — the archaeology page now says "All 78 decoded instances"; quote the page, not the commit's earlier count), 266c480 (hash-cracking campaign 680/1,408 names), 776ce90 (Rage of the Gods real god-mode FX), ef44391 (Weapon Level 5 stage-5 skin + decoded red Rage trail), 6f6f695 (costume selector from the real /Player/ table), d6ae482 (Data Archaeology page design/data-archaeology.html), 69fa72c (REAL attack hit volumes — /TweakTemplates/Concussion/ decoded), e4a9f9c (REAL root motion — ANM type-5 comp-422 channel).
(b) 2026-08-12 — usability batches; REAL controller channels (780434a comp-421 jump height); gamepad support (f05f7dd…646ceb9); GoW1 stick controls (523304b, dfac242); ballistic jump (b056c6d, d403e54, 3bf499a jump apex = Kratos' model height — USER SPEC); 8a3f28e (rage ≠ berserk re-identified via blade tracks: ber* clips are bare-handed brawling; Rage keeps the blades); 9544d5e (authored jump chain jumpUp → jumpAir → fallV → land from the Navigation bank).
(c) 2026-08-13 — target dummy = the REAL R_SKS undead legionnaire (d908f0a; SKS_0 mesh 3,265 verts, 29-joint sks skeleton, ANM_sks 93 acts) with the impact-VFX arc: 332412d goSklBlood, c9d784d goCombo3fExplode, 9f46160 goFXfirePath, eb9830a goMAISWeffect, e76eb4a explosion shell + real particle materials; 16675c2 difficulty slider from the real /GlobGame/Easy|Normal|Hard|Impossible trees (player Damage Mult 2/1/0.75/0.5); 9793609 TWK_Sold_020 cracked (soldier stats REAL: Max HP 100, Run 8 m/s, Walk 3 m/s; field names INFERRED); f323f2b Fight back (soldier attacks, off by default); 8a51b92 launchers + air juggles; fc271d2 launch apex = the attack's OWN authored comp-421 leap (blockLauncher 6.2 m).
(d) 2026-08-15→18 — combat model: 69b3da7 hit-frame-anchored cancel model (Derek Daniels' "Combat Cancelled": normals cancel pre-hit, L1 specials post-hit only, block instant); a99ef91 true block STATE on authored guard clips; 34da71d guard-evade flips (user-identified); f19d234 Navigation ACTION INDEX (design/twk/decoded/ActionIndex.twk — 2×100 slots in TWK_goHero aligned in order to the ELF ANI* vocabulary; Bank 1 = bare-handed set; combat has NO action slots, verified by exhaustive negative search); 7281220 airBlock (authored air-guard clip); 222ae9c PARRY (timed block, 9-tick window INFERRED); d1a6a8e root-motion TWEEN through branches — confirmed by GoW's combat designer Eric Williams ("all animation branching uses a tween value to blend the animations / root motion").
(e) 2026-09-24 — GoW3 track: 5e2ded8 (disc-folder gitignore, quick 260924-pl8), ff28fa3 (policy ruling — user 2026-09-25: "never distribute source files, only extracted ones"; SOURCE MEDIA = ISOs / disc folder trees / BIOS never; carved-out extracted records distributable; the 123 tracked extracted/ files ratified; extracted/** ignore rule kept purely as a bulk-extraction guard, track deliberately via git add -f), e670303 (Phase 8 added; PSARC reader + 64-byte PS3_BE WAD record walk byte-exact on R_HERO00.WAD cracked the same day).

REAL vs INFERRED register (copy these labels; they match the status column of design/data-archaeology.html):
- REAL (decoded bytes): concussion radii / durations / impulse vectors / Angle (0 = 360° hero, 30–45° enemy cones); difficulty player Damage Mult 2/1/0.75/0.5; TWK_Sold_020 stat values; PlayFX joint anchors ("SKS Blood Top" @ neck, "SKS Blood Mid" @ pelvis); MFX material templates ("Zombie Flesh" → goSklBlood + SND_BLOODSPURT); MAT blend bits; ANM act names / durations; controller channels 420/421/422 (30 Hz); comp-421 jump rise 0 → 9.37 u (0.67 m), jumpUp timing 0.65 s; /GlobGame/ Gravity 50; Trail Tint (1,1,1,0.8); Segment Length 0.25, Link Ø 0.13, Glow Ø 0.18; god-mode FX set + stage-5 skins; costume 0–5 table; the action index table; " Tween"/" Cycle" pair values 0.025–0.3 s (semantically identified, individual base names unrecoverable).
- INFERRED (model / interpretation / user-calibrated): cancel-window span values; parry 9-tick window; hit-flash tint + curve (user-calibrated); launch impulse scale KB_SCALE; dummy scale 0.76; particle counts / velocity fans / spray fan; blood puff runtime tint; units bridge 1 m ≈ 14 u; engine hover model for air combos; jump apex = model height (USER SPEC — named jump params proven absent in the ELF).
- DEAD END (proven absent): joint-based root motion; per-frame hit-window data in the ANM (60 Hz tracks = exporter boilerplate); named hero jump v0/gravity parameters; queue/branch/cancel windows (engine code only — modeled).

Edit anchors (text, not line numbers — the files shift as you edit):
- PROJECT.md: "## What This Is" para; "### Validated" list ends with the Phase 6 bullet; "### Out of Scope" contains the line "- Environment, enemies, HUD fidelity — this project is scoped to the weapon presentation only"; "## Context" first bullet says "loads raw extracted game files from `extracted/`"; "## Constraints" Tech-stack bullet says "all assets loaded from `extracted/` raw game files"; "## Key Decisions" table has 4 rows all ending "| — Pending |"; footer "*Last updated: 2026-07-26 after Phase 6 completion*".
- STATE.md: body line "**Current focus:** Phase 7 — side by side validation & inferred tuning"; "### Decisions" bulleted list ends with the "(06-08) Per-blade warm point lights…" bullet, immediately before "### Roadmap Evolution". The YAML frontmatter is SDK-managed — do not edit it.
- REQUIREMENTS.md: "### Renderer Authenticity" ends with REND-03, followed by "## v2 Requirements (deferred)"; "## Out of Scope" table rows "| God-tier variants (stage5, godchain, godswordtrail) | Level-1 blades only per project decision |" and "| Audio, environment, enemy, HUD fidelity | Weapon presentation only |"; "## Traceability" intro "Mapped by roadmap creation (2026-07-24). Every v1 requirement maps to exactly one phase." and table ending "| REND-03 | Phase 2 | Complete |"; footer two italic lines.
- ROADMAP.md: Phase 7 block ends "**Plans**: TBD" / "**UI hint**: yes" then "## Progress"; the misplaced block starts "### Phase 8: God of War III Data Breakdown" (after the Progress table) and ends "- [ ] TBD (run /gsd-plan-phase 8 to break down)" just before the "---" footer; "**Execution Order:**" line "Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7"; Progress table last row "| 7. Side-by-Side Validation & Inferred Tuning | 0/TBD | Not started | - |".
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reconcile PROJECT.md and STATE.md with the shipped lab</name>
  <files>.planning/PROJECT.md, .planning/STATE.md</files>
  <action>
Use the Edit tool with the text anchors above; never rewrite whole files, never delete an existing Validated bullet, Decisions bullet, or Blockers entry. Use the REAL/INFERRED register verbatim for every value you mention.

PROJECT.md:
1. "## What This Is": keep the existing paragraph and append a second paragraph stating that, beyond the weapon presentation, the lab now includes (all shipped ad-hoc, Aug 2026, pre-GSD): the enemy target dummy (the REAL R_SKS undead legionnaire with its decoded three-layer hit-response VFX chain), a hit-frame-anchored combat model with launchers/air juggles, the guard suite (block / guard-evade / airBlock / parry), root motion from the decoded controller channel tweened through branches, the full TWK tweak-tree decode published at design/data-archaeology.html, and — as of 2026-09-25 — a second, independent reverse-engineering track on God of War III (PS3, big-endian; Phase 8).
2. "### Validated": append one bullet per ad-hoc theme (a)–(d) above, each ending "— *Delivered ad-hoc (pre-GSD, Aug 2026); see REQUIREMENTS.md § Ad-hoc delivered*", and each carrying its REAL vs INFERRED note inline (e.g. the dummy bullet says bindings/joint anchors/MFX templates REAL; hit-flash tint+curve, spray fan, dummy scale 0.76, particle counts INFERRED). Do not attribute any of them to a phase number.
3. "### Out of Scope": change the enemies line to "- Environment, HUD fidelity — this project is scoped to the weapon presentation only" and add directly beneath it a new bullet "- ~~Enemies~~ — SCOPE EXPANDED (user-driven, 2026-08-13): the REAL R_SKS undead legionnaire is now the lab's target dummy with its decoded hit-response chain; see ENM-01/ENM-02". Amend the god-tier bullet to add ": L1 remains the fidelity target; the stage-5 skin + god-mode FX set shipped ad-hoc as a Weapon-Level/Rage selector (decoded real assets, RAGE-01), not a tuning target".
4. "## Context": rewrite the Codebase bullet so it states that kratos-lab loads from the git-tracked `assets/` curated study set (Level-1 weapon records, raw R_WPN0_0.WAD, Kratos set, plus `assets/enemy/` R_SKS legionnaire and `assets/perm/` shared attack FX carved 2026-08-13/14) — the same raw game bytes — while the full `extracted/` set is local-only/gitignored (see assets/README.md); list the module set now present (parsers.js, anim.js, combat.js, app.js, fx.js, fxparse.js, chain.js, loop.js, particles.js — keep it to names already cited in STATE.md decisions). Add a "**TWK tweak tree — DECODED (ad-hoc, Aug 2026)**" bullet: part1.pak magic 0xFEDCBA98, hash h = h·127 + c, 680/1,408 keys cracked (suffix-extension modular inversion + pair-delta " Tween"/" Cycle"), sheets at design/twk/decoded/ (78 per the archaeology page), page at design/data-archaeology.html. Add a "**GoW3 track (Phase 8, opened 2026-09-25)**" bullet: PSARC reader + PS3_BE 64-byte WAD record walk byte-exact on R_HERO00.WAD; extractions land in `extracted-gow3/` (default-ignored, tracked deliberately).
5. "## Constraints" Tech-stack bullet: replace "all assets loaded from `extracted/` raw game files" with the CLAUDE.md wording — "all assets loaded from the git-tracked `assets/` curated subset (same raw game bytes; the full `extracted/` set is local-only/gitignored — see assets/README.md)". Add a bullet "**Distribution policy (user ruling 2026-09-25)**: source media (ISOs, disc folder trees, BIOS) is never committed; carved-out extracted records are distributable and tracked deliberately (git add -f) — the extracted/** ignore rule is a bulk-extraction guard only".
6. "## Key Decisions": fill the four "— Pending" outcomes: fidelity-vs-footage → "Bar unchanged; 03-02 user judged chain+glow too subtle and fast-tracked particles (Phases 5–6 done); Phase 7 verdict still open"; decode-before-visuals → "Done — MAT (Phase 2), FXC/PTC/MSH + type-5 (Phase 5), TWK tweak tree + Concussion + controller channels (ad-hoc Aug 2026)"; land in kratos-lab → "Done — all work landed in place; site + Pages deploy run on assets/"; Level 1 only → "Held as the fidelity target; stage-5 skin + god-mode FX shipped ad-hoc as a selector (RAGE-01)". Then add rows, each with rationale AND outcome: (i) "Data-first labeling: every value is tagged REAL (decoded bytes) / INFERRED (model or user-calibrated) / DEAD END (proven absent)" — rationale CLAUDE.md data-first rule; outcome: register kept on design/data-archaeology.html and in REQUIREMENTS.md; (ii) "rage ≠ berserk" — rationale: ber* clips' type-10 blade tracks pin both tips at the dorsal sheath (bare-handed brawl); outcome: Rage of the Gods keeps the blades and wires the real god-mode FX set; brawl context (Ares duel) INFERRED; corroborated by ACTION INDEX Bank 1; (iii) "Jump = ballistic: REAL Gravity 50 + comp-421 channel timing (0.65 s), apex = Kratos' model height (USER SPEC)" — rationale: named jump v0/gravity params proven absent in the ELF; outcome: shipped 3bf499a, no free parameters beyond the user-spec apex; (iv) "Launch apex = the attack's OWN authored comp-421 leap (e.g. blockLauncher 6.2 m)" — rationale user-corrected fc271d2; outcome: shipped, KB_SCALE impulse scale INFERRED; (v) "Root motion tweens through branches" — rationale: pair-delta " Tween" family + Eric Williams' confirmation; outcome: shipped d1a6a8e; (vi) "Distribution policy 2026-09-25: source media never / extracted records OK" — rationale: user ruling; outcome: .gitignore comments encode it, 123 tracked extracted/ files ratified, no history rewrite; (vii) "Phase 8 GoW3 track opened as an independent parallel track" — rationale: user added the PS3 disc data; outcome: containers cracked same day, phase unplanned.
7. Footer: replace with "*Last updated: 2026-09-25 — reconciled with the ad-hoc Aug-2026 work and the Phase 8 GoW3 track (quick 260924-vax)*".

STATE.md (body only — leave the YAML frontmatter untouched, it is SDK-managed):
8. Replace the "**Current focus:**" line with "**Current focus:** Two open tracks — Phase 7 (side-by-side validation & inferred tuning, blocked on Phase 1 captures) and Phase 8 (God of War III data breakdown, independent and parallel to Phase 7). 126 ad-hoc commits (2026-08-10 → 2026-09-24, pre-GSD) are catalogued in REQUIREMENTS.md § Ad-hoc delivered, not attributed to any phase."
9. Append two bullets to the end of the "### Decisions" list (after the (06-08) bullet, before "### Roadmap Evolution"): one summarising theme (d) — "(ad-hoc 2026-08-15→18, pre-GSD): combat model = hit-frame-anchored cancel model (Daniels 'Combat Cancelled': normals cancel pre-hit, L1 specials post-hit only, block instant — structure sourced, window spans INFERRED), true block STATE on authored guard clips, guard-evade flips (user-identified), airBlock on the authored air-guard clip, PARRY (timed block, 9-tick window INFERRED), Navigation ACTION INDEX decoded (design/twk/decoded/ActionIndex.twk, REAL; combat has no action slots), root-motion TWEEN through branches (Eric Williams confirmation; root channel comp-422 REAL). None belongs to a planned phase." — and one for the ruling — "(2026-09-25, user ruling): distribution policy — source media (ISOs / disc folders / BIOS) never; carved-out extracted records distributable; 123 tracked extracted/ files ratified; extracted/** rule kept only as a bulk-extraction guard (track via git add -f)."
  </action>
  <verify>
    <automated>cd /c/Projects/GameDesignSkills/GodOfWarChains && P=.planning/PROJECT.md && S=.planning/STATE.md && grep -q 'Ad-hoc delivered' $P && grep -q 'git-tracked `assets/`' $P && ! grep -q '^- Environment, enemies, HUD fidelity' $P && grep -q 'SCOPE EXPANDED' $P && ! grep -q -- '| — Pending |' $P && grep -q 'rage ≠ berserk' $P && grep -q 'USER SPEC' $P && grep -q 'Last updated: 2026-09-25' $P && grep -q 'Current focus:\*\* Two open tracks' $S && grep -q 'Phase 8' $S && grep -q 'Eric Williams' $S && grep -q 'distribution policy' $S && [ "$(git diff -U0 $S | grep '^-' | grep -vE '^--- ' | grep -c .)" -eq 1 ] && ! git diff -U0 $P | grep '^-' | grep -vE '^--- ' | grep -vqE 'Environment, enemies|God-tier|extracted|Pending|Last updated|Codebase|combat\.js|kratos-lab' && echo T1-OK</automated>
  </verify>
  <done>PROJECT.md: What-This-Is names the dummy/combat/guard/GoW3 additions; Context and Constraints cite assets/ as the tracked set; enemies moved out of Out of Scope with the user-driven expansion note; all Key Decisions rows have outcomes and the seven new rows exist; footer dated 2026-09-25. STATE.md: exactly one body line removed (the old Current focus), two Decisions bullets appended, frontmatter untouched. No prior Validated/Decisions/Blockers content removed (every removed PROJECT.md line matches the expected-edit allowlist).</done>
</task>

<task type="auto">
  <name>Task 2: Add ad-hoc and Phase 8 requirement IDs to REQUIREMENTS.md</name>
  <files>.planning/REQUIREMENTS.md</files>
  <action>
Use Edit with text anchors. MOT-01, MOT-02, VAL-01, VAL-02 and every DEC/CHAIN/FIRE/TRL/REND line stay byte-identical. Every new ID carries an explicit "REAL:" and "INFERRED:" clause (write "INFERRED: none" only if the register has nothing); pull wording from the REAL/INFERRED register, not from memory.

1. After the REND-03 line and before "## v2 Requirements (deferred)", insert a new H2 "## Ad-hoc delivered (pre-GSD, Aug 2026)" with a one-paragraph preamble: 126 commits 2026-08-10 → 2026-09-24 shipped outside any planned phase before GSD enforcement was added to CLAUDE.md; these IDs are retro-catalogued so Phases 7–8 can reference them; none maps to a phase (Traceability lists them as "Ad-hoc (pre-GSD)"). Then, as checked "- [x]" items grouped under H3s:
   - "### Combat model": **CMB-01** hit-frame-anchored cancel model (Derek Daniels' "Combat Cancelled": normals cancel pre-hit, L1 specials post-hit only, block instant) with launchers + air juggles — REAL: act names/durations, the attack's own comp-421 leap as launch apex (blockLauncher 6.2 m), engine Gravity 50; INFERRED: cancel-window span values (queue/branch/cancel windows are engine code — DEAD END, modeled), KB_SCALE launch impulse scale. **CMB-02** guard suite — true block STATE on authored guard clips, guard-evade flips (user-identified), airBlock on the authored air-guard clip, PARRY timed block that deflects and staggers — REAL: guard/air-guard/parry clips; INFERRED: parry 9-tick window.
   - "### Enemy target": **ENM-01** target dummy = the REAL R_SKS undead legionnaire (SKS_0 3,265 verts, 29-joint sks, ANM_sks 93 acts, TWK_Sold_020 stats) with the decoded three-layer hit-response chain (MFX "Zombie Flesh" → goSklBlood + SND_BLOODSPURT; PlayFX anchors SKS Blood Top @ neck / Mid @ pelvis; FXC_BloodXemitT → PTC_BloodXpartT → MAT_blood → GFX_blood) plus the Kratos-side goCombo3fExplode / goFXfirePath / goMAISWeffect chains and the explosion shell from R_PERM.WAD; "Fight back" soldier attacks off by default — REAL: all bindings, joint anchors, MAT blend modes, Sold stat values (Max HP 100, Run 8 m/s, Walk 3 m/s); INFERRED: Sold field names, hit-flash tint + curve (user-calibrated), blood puff runtime tint, spray fan, dummy scale 0.76, particle counts / velocity fans. **ENM-02** difficulty slider from the real /GlobGame/Easy|Normal|Hard|Impossible trees applying the player Damage Mult ×2 / ×1 / ×0.75 / ×0.5 to the dummy — REAL: all four multipliers, the "Impossible" internal name; INFERRED: none.
   - "### Navigation & motion": **NAV-01** Navigation ACTION INDEX — two banks of 100 slots in TWK_goHero aligned in order with the ELF ANI* action vocabulary (ANIVJump → jumpUp, ANIFall → fallv …), Bank 1 = the bare-handed (ber*) set; full table design/twk/decoded/ActionIndex.twk — REAL: the table; DEAD END: combat has no action slots (exhaustive negative search). **MOT-03** root motion + tween — the ANM type-5 controller trio (420 lateral / 421 vertical / 422 forward, 30 Hz) drives forward root motion, tweened through every branch — REAL: the channels and per-move distances (combo3F 5.26 m …), the " Tween"/" Cycle" pair values 0.025–0.3 s; INFERRED: the tween family's individual base names (semantically identified, unrecoverable; confirmed by Eric Williams). **MOT-04** ballistic jump + controls — jumpUp → jumpAir → fallV → land authored chain from the Navigation bank, gamepad + GoW1 stick controls (left-stick locomotion, right-stick evade, camera-planar mapping) — REAL: Gravity 50, comp-421 rise 0 → 9.37 u / 0.65 s; INFERRED: apex = Kratos' model height (USER SPEC; named jump params proven absent — DEAD END), air-combo hover model.
   - "### Data archaeology": **DATA-01** the TWK tweak tree decoded end-to-end — part1.pak magic 0xFEDCBA98, hash h = h·127 + c, 680/1,408 keys cracked (suffix-extension modular inversion + pair-delta), 78 sheets at design/twk/decoded/, /TweakTemplates/Concussion/ hit volumes decoded and visualized, published at design/data-archaeology.html — REAL: every listed value (Trail Tint 1,1,1,0.8; Segment Length 0.25; Link Ø 0.13; Glow Ø 0.18; concussion radii/impulses/Angle; costume 0–5 table); INFERRED: units bridge 1 m ≈ 14 u; DEAD END: per-frame hit-window data in the ANM. **RAGE-01** Rage of the Gods + Weapon Level 5 — the real god-mode FX set (chain, glow, trail) wired to the Rage toggle, stage-5 blade skin + decoded red Rage trail, costume selector from the real /Player/ table; rage ≠ berserk (ber* clips are bare-handed brawling per their type-10 blade tracks) — REAL: assets, trail tint values, blade tracks; INFERRED: the brawl set's context (disarmed Ares duel). Note: Level 1 remains the fidelity target — this is a selector, not a tuning target. (DATA-01, MOT-04, RAGE-01 are planner-added beyond the orchestrator's suggested set so themes (a)/(b) are represented; keep unless the user objects.)
2. Directly after that section, still before "## v2 Requirements (deferred)", insert "### God of War III Track (Phase 8)" with three unchecked "- [ ]" items: **GOW3-01** containers + PS3_BE record walk — a PSARC container reader and the PS3_BE WAD record walker (64-byte headers) walk R_HERO00.WAD byte-exact and are covered by a known-answer test (note: cracked ad-hoc 2026-09-25; formal verification lands in Phase 8); **GOW3-02** hero set decode — the R_HERO00–08 set is decoded with per-field evidence: ANM_hero act table and its readable att* combat vocabulary, MAT records (magic 8), DDS-named textures, the shipped dbg_ hash-dictionary records, and the string-keyed "Tween" property system; extractions curated into a tracked `extracted-gow3/` study set; **GOW3-03** a GoW3 data-archaeology page mirroring design/data-archaeology.html with the same real / inferred / dead-end tagging.
3. "## Out of Scope" table: amend (do not delete) the god-tier row's reason to "Level-1 blades remain the fidelity target; stage-5 skin + god-mode FX set shipped ad-hoc as a selector (RAGE-01), not a tuning target"; change the last row to "| Audio, environment, HUD fidelity | Weapon presentation only — enemies moved IN as a user-driven scope expansion (2026-08-13, ENM-01/02) |".
4. "## Traceability": change the intro to "Mapped by roadmap creation (2026-07-24). Every v1 requirement maps to exactly one phase; ad-hoc IDs (added 2026-09-25) map to no phase and GOW3-* map to Phase 8." Append rows after REND-03: CMB-01, CMB-02, ENM-01, ENM-02, NAV-01, MOT-03, MOT-04, DATA-01, RAGE-01 as "| ID | Ad-hoc (pre-GSD) | Complete |"; GOW3-01, GOW3-02, GOW3-03 as "| ID | Phase 8 | Pending |".
5. Footer: append a third italic line "*Reconciled: 2026-09-25 (quick 260924-vax) — ad-hoc Aug-2026 deliveries catalogued, Phase 8 GOW3-01..03 added*".
  </action>
  <verify>
    <automated>cd /c/Projects/GameDesignSkills/GodOfWarChains && F=.planning/REQUIREMENTS.md && grep -q '^## Ad-hoc delivered (pre-GSD, Aug 2026)' $F && grep -q '^### God of War III Track (Phase 8)' $F && for id in CMB-01 CMB-02 ENM-01 ENM-02 NAV-01 MOT-03 MOT-04 DATA-01 RAGE-01 GOW3-01 GOW3-02 GOW3-03; do grep -q "\*\*$id\*\*" $F || { echo "missing def $id"; exit 1; }; grep -qE "^\| $id \| (Ad-hoc \(pre-GSD\)|Phase 8) \| (Complete|Pending) \|" $F || { echo "missing trace $id"; exit 1; }; done && [ "$(grep -c 'INFERRED' $F)" -ge 9 ] && ! grep -q 'Audio, environment, enemy, HUD' $F && ! git diff -U0 $F | grep '^-' | grep -vE '^--- ' | grep -qE 'MOT-0[12]|VAL-0[12]|DEC-0|CHAIN-0|FIRE-0|TRL-0|REND-0' && echo T2-OK</automated>
  </verify>
  <done>REQUIREMENTS.md defines the nine ad-hoc IDs (each with REAL/INFERRED clauses) and GOW3-01..03 under a Phase 8 heading; the Traceability table has a row for all twelve; the Out of Scope enemy row records the expansion; no MOT-01/02, VAL-01/02, DEC/CHAIN/FIRE/TRL/REND line was removed or altered.</done>
</task>

<task type="auto">
<name>Task 3: Fix ROADMAP.md structure — relocate Phase 8, add Progress row, parallel-order note</name>
  <files>.planning/ROADMAP.md</files>
  <action>
Use Edit with text anchors; the Phase 8 block must be moved VERBATIM (byte-identical content), not rewritten.

1. Cut the misplaced block — from the line "### Phase 8: God of War III Data Breakdown" through "- [ ] TBD (run /gsd-plan-phase 8 to break down)" inclusive (plus the blank line before the "---" footer) — out of its position after the Progress table.
2. Paste it unchanged into "## Phase Details" immediately after the Phase 7 block's last line "**UI hint**: yes" (blank line, block, blank line), so "## Progress" follows Phase 8. Keep "**Plans:** 0 plans" and the "Plans:" list as-is.
3. Replace the "**Execution Order:**" line "Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7" with "Phases 1–7 execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7. Phase 8 (God of War III Data Breakdown) is an independent track with no dependency on Phases 4–7 and runs in parallel with Phase 7." Extend the "Parallelism note:" sentence with "; Phase 8 is parallel to Phase 7 (reuses Phase 2/5 decode tooling as lineage only)".
4. Append to the Progress table, after the Phase 7 row: "| 8. God of War III Data Breakdown | 0/TBD | Not started | - |".
5. Immediately after the Progress table add a short paragraph: "**Ad-hoc work (Aug 2026, pre-GSD):** 126 commits (2026-08-10 → 2026-09-24, 2ee193c…e670303) shipped outside any phase before GSD enforcement — TWK decode campaign, root motion + controller channels, hit volumes, the R_SKS target dummy + hit-response VFX, difficulty, the combat/guard model, and the GoW3 container crack. They are not attributed to any phase; see REQUIREMENTS.md § "Ad-hoc delivered (pre-GSD, Aug 2026)"."
6. Footer: add an italic line after the Phase 6 line: "*Phase 8 added: 2026-09-25 — GoW3 track (unplanned); docs reconciled 2026-09-25 (quick 260924-vax)*". Leave all other footer lines intact.
  </action>
  <verify>
    <automated>cd /c/Projects/GameDesignSkills/GodOfWarChains && F=.planning/ROADMAP.md && P8=$(grep -n '^### Phase 8: God of War III Data Breakdown' $F | cut -d: -f1) && PR=$(grep -n '^## Progress' $F | cut -d: -f1) && P7=$(grep -n '^### Phase 7:' $F | cut -d: -f1) && [ "$(grep -c '^### Phase 8:' $F)" -eq 1 ] && [ "$P7" -lt "$P8" ] && [ "$P8" -lt "$PR" ] && grep -q '^| 8. God of War III Data Breakdown | 0/TBD | Not started | - |' $F && grep -q 'runs in parallel with Phase 7' $F && grep -q 'Ad-hoc work (Aug 2026, pre-GSD)' $F && grep -q 'Ad-hoc delivered (pre-GSD, Aug 2026)' $F && diff -q <(git show HEAD:$F | sed -n '/^### Phase 8: God of War III Data Breakdown/,/^- \[ \] TBD (run \/gsd-plan-phase 8 to break down)/p') <(sed -n '/^### Phase 8: God of War III Data Breakdown/,/^- \[ \] TBD (run \/gsd-plan-phase 8 to break down)/p' $F) && ! git diff --name-only | grep -vqE '^\.planning/' && echo T3-OK</automated>
  </verify>
  <done>Exactly one "### Phase 8" heading exists, positioned after Phase 7 and before "## Progress", with byte-identical block content to HEAD; the Progress table has the Phase 8 row; the execution-order and parallelism lines state Phase 8 is independent and parallel to Phase 7; the ad-hoc note points at the REQUIREMENTS section; `git diff --name-only` lists only .planning/ files (no code touched).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Planning docs → future phase planners | Phases 7/8 planners consume these docs as ground truth; a mislabeled INFERRED value would propagate as a "decoded" constant |
| Git history → docs | Reconciliation quotes commits; a wrong attribution invents phase history |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering | All four docs | mitigate | Removed-line diff gates in every `<verify>` (`git diff -U0 | grep '^-' | grep -vE '^--- '`) prove no validated content was deleted; Phase 8 block byte-compared against HEAD |
| T-quick-02 | Repudiation | REAL/INFERRED labels | mitigate | Labels copied from the register in `<interfaces>` (mirrors design/data-archaeology.html status column); every new ID must carry explicit REAL:/INFERRED: clauses (grep count gate ≥ 9) |
| T-quick-03 | Information disclosure | Distribution-policy wording | mitigate | Quote the ff28fa3 ruling exactly (source media never / extracted OK); do not weaken the never-commit rule for disc folders |
| T-quick-04 | Tampering | STATE.md frontmatter | mitigate | Body-only edits; frontmatter is SDK-managed (STATE diff gate = exactly 1 removed line) |
| T-quick-SC | Tampering | package installs | accept | No package-manager installs in this plan (docs only) |
</threat_model>

<verification>
- All three task gates print T1-OK / T2-OK / T3-OK.
- `git diff --name-only` == exactly `.planning/PROJECT.md .planning/STATE.md .planning/REQUIREMENTS.md .planning/ROADMAP.md` (no code, no assets, no .gitignore).
- Cross-doc consistency: the string "Ad-hoc delivered (pre-GSD, Aug 2026)" appears in PROJECT.md, ROADMAP.md, and as the H2 in REQUIREMENTS.md; "2026-09-25" is the ruling/footer date everywhere (STATE.md's existing convention).
- Spot-read the new REQUIREMENTS section: no value labeled REAL appears in the INFERRED list of the register in `<interfaces>` and vice versa.
</verification>

<success_criteria>
- A Phase 7 or Phase 8 planner reading only the four docs learns: the lab loads from `assets/`, has an enemy target dummy + combat/guard model, which shipped values are REAL vs INFERRED, that 126 ad-hoc commits belong to no phase, and that Phase 8 is an independent parallel track.
- ROADMAP.md is structurally valid for `gsd-sdk` (Phase 8 block inside Phase Details, one heading, Progress row present).
- Nothing previously validated was removed; MOT-01/02 and VAL-01/02 are unchanged.
- No code file modified.
</success_criteria>

<output>
Create `.planning/quick/260924-vax-reconcile-planning-docs-with-the-ad-hoc-/260924-vax-SUMMARY.md` when done
</output>
