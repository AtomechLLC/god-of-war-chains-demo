---
phase: 05-fx-record-decode
verified: 2026-07-26T00:53:55Z
resolved: 2026-07-26T01:30:00Z
status: passed
score: 4/4 ROADMAP success criteria verified in code; both human-acceptance items resolved (SC3 disposition accepted by developer; WR-03 remediated + re-verified)
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/4 (2 human-acceptance items pending)
  resolution: >-
    Item 1 (SC3/DEC-03 INFERRED escalation disposition) ACCEPTED by developer on 2026-07-26 — the
    plan-sanctioned D-04 branch satisfies SC3 for unblocking Phase-6. Item 2 (WR-03 slot-ref cross-links)
    developer chose "fix first"; remediated by fix 0f9c769 (slot refs now carry via/corroborationOnly/
    shapeNameMatch/confidence markers so group-collision edges are distinguishable from authoritative
    bindings — grounded against real disc bytes: 0x1d and 0x1 groups split exactly on shapeRef equality),
    with WR-01 (a9ce257, named fail-loud on truncated MSH) and WR-02 (3307267, keep-first guard on
    standalone-PTC merge) fixed alongside. All six test suites (fxdb/anm/wad/fx/chain/loop) green after
    fixes; working tree clean. Status advanced human_needed -> passed.
human_verification:
  - test: >-
      Confirm the DEC-03 / SC3 deliverable is accepted as "the type-5 ANM descriptor is decoded and drives
      blade presentation." What was actually delivered: a real, byte-decoded `gomaiblade` scene-binding
      descriptor (off 0xD580, size 92 — classId=1, variant=2, bound="maiblade", tierSelector, anchorOffset
      (0,-0.320,-8.0,1.0), sentinel — all tagged real) exposing a queryable, JSON-dumpable
      visibilityFor("in-combat")="in-hand" / visibilityFor("out-of-combat")="on-back" result. But the
      combat-state -> visibility MAPPING is a hardcoded INFERRED runtime mapping (footage-corroborated,
      ELF-tiebreaker noted), NOT a decoded byte field; and the "type-5" taxonomy label is itself INFERRED
      because a class-histogram over every data-carrying tag-0x1e WAD record shows NO class-5 record exists
      (and there is no level-1 ANM_maiblade, only god-tier ANM_maigodblade).
    expected: >-
      Developer confirms the D-04 escalation disposition (INFERRED-label the unconfirmable type-5 label +
      runtime show/hide mapping, pin only real framing/binding/placement/tier seeds, never fabricate a byte)
      satisfies SC3 for the purpose of unblocking Phase-6, which depends on "type-5 gating." This disposition
      was sanctioned by 05-05's plan (must-have truth #5) and DEC-03 is marked Complete in REQUIREMENTS.md.
    why_human: >-
      Whether an honestly-labeled INFERRED runtime mapping + INFERRED taxonomy label satisfies a literal
      "the type-5 ANM descriptor is decoded and drives blade presentation" is a design-acceptance judgment
      that grep/tests cannot make — the tests only prove the mapping is present AND tagged INFERRED, not
      that show/hide was decoded from bytes. This is the escalation-gate decision for the phase.
  - test: >-
      Confirm the WR-03 slot-ref hand-off to Phase-6 is acceptable as-is. buildFxDb emits `db.refs` slot
      pairs by cross-multiplying every FXC against every PTC sharing a slotId, with NO marker distinguishing
      true 1:1 bindings from group-collisions. Verified live: slot 0x1d group yields the false pairs
      FXC_BFTemit1->PTC_BGTpart1 and FXC_BGTemit1->PTC_BFTpart1; slot 0x1 group yields
      FXC_BDepoly6->PTC_CNGpart, FXC_BDepoly6->PTC_FXCFpart, FXC_CNGemit->PTC_FXCFpart,
      FXC_FXCFemit->PTC_CNGpart — all undifferentiated from the real bindings in the graph.
    expected: >-
      Developer confirms Phase-6 will bind emitter->particle via the authoritative shape refs + shapeRef
      NAME discriminator (A4), treating slot refs as corroboration only — OR schedules the WR-03 fix
      (confidence/name-stem marker on slot refs) before Phase-6 consumes db.refs.
    why_human: >-
      SC2's authoritative cross-references (shape refs, resolved:true/false) are correct and the slot noise
      is a documented corroboration-only design choice, so this is a tracked quality follow-up rather than a
      goal-level gap — but whether the unmarked false edges are safe to hand to Phase-6 is a consumer-contract
      decision the verifier should surface, not decide.
---

# Phase 5: FX Record Decode — Verification Report

**Phase Goal:** The game's particle and emitter data is decoded with per-field evidence, so the runtime can be driven by real values instead of approximations
**Verified:** 2026-07-26T00:53:55Z
**Status:** passed _(was human_needed; both human-acceptance items resolved 2026-07-26 — see frontmatter `re_verification.resolution`)_
**Re-verification:** No — initial verification

## Goal Achievement

I ran all six test suites myself, independently re-assembled the FxDb from the real `assets/` bytes, empirically reproduced the code-review boundary cases, and read every decoder line-by-line against the four ROADMAP Success Criteria. The decode is real and substantive — not a stub. All four SCs are satisfied in code. Status is `human_needed` (not `passed`) solely because the SC3/DEC-03 deliverable rests on an honestly-labeled INFERRED escalation disposition that requires developer acceptance, per this agent's escalation-gate role.

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth (SC) | Status | Evidence |
| --- | --- | --- | --- |
| SC1 | MSH/PTC/FXC have per-field evidence tables (offset, raw bytes, interp, corroboration), every field tagged real vs INFERRED | ✓ VERIFIED | `parseMsh`/`parsePtc`/`parseFxc` each return `evidence[]` of `{field, offset, rawHex, interp, corrob, tag}` (fxparse.js:216-222, 292-303, 374-385). The evidence-completeness audit (fxdb.test.js:588-599) walks every msh/ptc/fxc entry and asserts non-empty evidence + every tag ∈ {real, INFERRED} + every INFERRED carries a corrob/note. Suite green. |
| SC2 | Colors/rates/sizes/lifetimes for flame3/flame6, BDEsparkemit, BFT/BGT resolve into a queryable FxDb with cross-record refs, JSON-dumpable without a renderer | ✓ VERIFIED | Independent build: db.ptc has PTC_flame3/flame6/BFTpart1/BGTpart1 (+flame5/EGpart/CNGpart/FXCFpart); db.fxc has FXC_BDEsparkemit/BFTemit1/BGTemit1 (+EG/CNG/FXCF). `JSON.stringify(db)` = 56,940 chars, no GL/DOM. Shape refs resolve (MSH resolved:true; runtime handles resolved:false). Color traced to MAT_pticleMat.blendColor=[2,2,2,1] (real) with ramp INFERRED. Rates/lifetimes = PTC params (raw real, tick-meaning INFERRED — honest). **WARNING:** slot cross-refs are noisy (WR-03, non-blocking — see below). |
| SC3 | The type-5 ANM descriptor is decoded and drives blade presentation (on-back out of combat, in-hand during combat) | ⚠ VERIFIED-WITH-CAVEAT (human acceptance) | `parseAnmType5` decodes gomaiblade (0xD580, size 92, u32@0=0x00020001) — framing/binding/placement/tier all byte-exact real; anchorOffset.z=-8.0 real back-anchor candidate. Exposes JSON-dumpable states[] + visibilityFor(). BUT: the show/hide MAPPING is a hardcoded INFERRED runtime mapping (not decoded bytes) and the "type-5" label is INFERRED (no class-5 record exists in the WAD). This is the sanctioned D-04 escalation disposition (05-05 truth #5) — surfaced for developer acceptance (human item 1). |
| SC4 | GS dump confirms per-effect blend; disc region (NTSC vs PAL) confirmed before interpreting rate/lifetime as ticks | ✓ VERIFIED (region) / deferred-by-decision (GS-dump) | Region: db.meta.region="NTSC-U", tickHz=60, corroborated by disc serial SCUS-97399 (fxparse.js:500-502). Decode does NOT depend on a GS-dump (no GS reference in fxparse.js; blend uses DEC-01 MAT decode). GS-dump sub-item was deliberately SKIPPED at the 05-04 D-06 checkpoint (recorded user decision); per instructions, treated as an optional not-done corroboration, not a gap. |

**Score:** 4/4 ROADMAP success criteria verified in code. Status `passed` — SC3 disposition accepted by developer (2026-07-26); WR-03 slot-ref concern remediated (fix 0f9c769, +WR-01 a9ce257, +WR-02 3307267) with all six suites green.

### Plan-Frontmatter Must-Have Truths (sampled, notable)

| Plan | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 05-01 | parseMsh decodes MSH_BDepoly3Shape byte-exact (vertCount 24, unit-length v1 normal); resolve picks correct 768 vs 1008 copy | ✓ VERIFIED | fxdb.test.js (a)/(b) green — vertCount 24, v0≈(0,2.982,-13.684), |v1 nrm|≈1.0, level-1 768 vs god 1008 decode different vertCounts |
| 05-01 | FxDb JSON.stringify-able without renderer; every MSH field evidence-tagged | ✓ VERIFIED | JSON round-trip proven; evidence audit green |
| 05-01 | A short/truncated MSH record throws a **named** error before any field read | ⚠ VERIFIED w/ WARNING | Holds for size < 0x10 (size-gate `MSH <name>: size ... < 0x10`, tested with 0x08). **WR-01:** the 0x10–0x27 band passes the gate, decodes zero verts, then the evidence rawHex reads overrun → **unnamed RangeError** (empirically reproduced). Named-throw invariant has a hole in a narrow band the corpus never hits and no test covers. Robustness WARNING, not a goal blocker. |
| 05-02 | parsePtc decodes flame3/flame6 (in-WAD) + BFT/BGT (standalone .bin) byte-exact; BFT/BGT become real db.ptc keys via 3rd arg; no real-tagged color from PTC | ✓ VERIFIED | fxdb.test.js PTC block green; independent build confirms keys + slot 0x1d; color-provenance guard green |
| 05-03 | parseFxc subtype-branch (2/3 @+0x54, 0xd count+@+0x58); BFT/BGT matrices byte-identical; FXC_BFTemit1↔PTC_BFTpart1 0x1d slot pair emitted; placeholder 0x00/0xffff skipped; whole graph JSON-dumpable | ✓ VERIFIED | fxdb.test.js FXC block green; deepStrictEqual matrix identity; subtype-0xd reads name @+0x58; guard asserts no slot ref carries 0x00/0xffff on either end (confirmed live) |
| 05-04 | Color traced to MAT_pticleMat.blendColor; GFX_swordtrail has no length-wise ramp; full corpus (CNG/FXCF) actual keys; evidence audit passes; region in meta | ✓ VERIFIED | swordtrail no-ramp proof green (hottest texel (243,176,18) amber, hue-shift 0.043<0.12); db.meta.colorSource real+rampTag INFERRED; CNG/FXCF actual keys |
| 05-05 | type-5 identity CONFIRMED before pinning seeds (no literal-5 assumption); queryable JSON-dumpable state→visibility; unconfirmable field escalated/INFERRED, never fabricated; bad/short ANM throws named | ✓ VERIFIED | anm.test.js green — class-histogram proves no class-5 record; gomaiblade↔gomaigodblade differential; visibilityFor() works; type-5 label + show/hide tagged INFERRED w/ corrob; fail-loud named throws green |

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `tools/kratos-lab/fxparse.js` | parseMsh + parsePtc + parseFxc + parseAnmType5 + buildFxDb | ✓ VERIFIED | 680 lines. All five decoders present, substantive (byte-layout JSDoc, size-gates, bounded loops, evidence arrays), and exported (line 675: `return { ..., parseMsh, parsePtc, parseFxc, buildFxDb, parseAnmType5 }`). Wired: consumed by both test suites + independent CLI build. |
| `tools/kratos-lab/test/fxdb.test.js` | MSH+PTC+FXC known-answers + JSON-dump + evidence audit + color provenance | ✓ VERIFIED | 626 lines. Exits 0. Covers all MSH/PTC/FXC seeds, standalone-.bin merge, cross-ref graph, swordtrail no-ramp, full-corpus keys, evidence completeness. |
| `tools/kratos-lab/test/anm.test.js` | type-5 known-answer suite | ✓ VERIFIED | 227 lines. Exits 0. Data-first identity confirmation (no class-5), gomaiblade differential, decoder known-answers, INFERRED-tag audit, fail-loud throws. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| buildFxDb | Parsers.resolve | subtype-0xd FXC→MSH shape ref | ✓ WIRED | fxparse.js:626 `P.resolve(records, ref, idx)`; live: FXC_BDepoly3→MSH_BDepoly3Shape resolved:true, FXC_BDepoly6→MSH_BDepoly6Shape resolved:true |
| buildFxDb | parsePtc / parseFxc | ptc/fxc section keyed by name (WAD + standalone 3rd arg) | ✓ WIRED | fxparse.js:559-604; live: all 8 standalone families are actual db.ptc/db.fxc keys |
| test suites | FxParse.* | known-answer assertions | ✓ WIRED | Both suites require ../fxparse.js and assert on real decoded values |
| parseAnmType5 | Parsers.parseWad | WAD record access for blade ANM | ✓ WIRED | anm.test.js locates gomaiblade via parseWad and passes to parseAnmType5; runs standalone + JSON-dumps |
| buildFxDb refs | slot pairing (FXC.slot ↔ PTC.slot) | guarded cross-link | ⚠ WIRED w/ WARNING | Guard against 0x00/0xffff works; but non-placeholder groups (0x1, 0x1d) cross-multiply into undifferentiated false edges (WR-03) — see human item 2 |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| buildFxDb → db.msh/ptc/fxc | decoded records | Parsers.parseWad over real `assets/wads/R_WPN0_0.WAD` + real `assets/kratos/fx/*.bin` | ✓ Yes — byte-exact known answers (vertCount 24, magic 0x13/0x1e, matrices, slots) | ✓ FLOWING |
| db.meta.colorSource | MAT blendColor | buildMats over MAT_pticleMat (real WAD record) | ✓ Yes — [2,2,2,1] byte-decoded | ✓ FLOWING |
| parseAnmType5 → states[] | show/hide mapping | **hardcoded INFERRED literal** in decoder (not bytes) | ✗ Mapping is a constant, not decoded — but honestly tagged INFERRED (real framing/binding/placement flow from bytes) | ⚠ PARTIAL (by design, D-04) |

The FxDb is genuinely data-driven: every real-tagged value traces to actual disc bytes. The only non-byte-sourced element is the SC3 show/hide mapping, which is a deliberately-INFERRED constant (the escalation disposition) — the crux of human item 1.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| FxDb JSON-dumpable without renderer | `node -e "...JSON.stringify(buildFxDb(...))"` | 56,940 chars, no throw | ✓ PASS |
| Standalone families are actual keys | inspect db.ptc/db.fxc keys | PTC_BFTpart1/BGTpart1/CNGpart/FXCFpart + FXC_BFTemit1/BGTemit1/CNGemit/FXCFemit all present | ✓ PASS |
| MSH shape refs resolve | inspect db.refs shape resolved:true | FXC_BDepoly3/6 → MSH_BDepoly3/6Shape | ✓ PASS |
| WR-01 named-throw on truncated MSH | `parseMsh(0x10-byte buf, size 0x10)` | threw **unnamed** RangeError (not `/MSH_.../`) | ✗ FAIL (narrow band; WARNING) |
| parseAnmType5 runs + JSON-dumps | run on gomaiblade | states + evidence serialize | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist in this repo; the phase's verification contract is the node known-answer suites, which were run directly.

| Probe | Command | Result | Status |
| --- | --- | --- | --- |
| fxdb suite | `node tools/kratos-lab/test/fxdb.test.js` | exit 0 — "MSH + PTC + FXC + swordtrail-provenance + full-corpus known-answers passed" | ✓ PASS |
| anm suite | `node tools/kratos-lab/test/anm.test.js` | exit 0 — "type-5 ANM blade-state descriptor known-answers passed" | ✓ PASS |
| wad regression | `node tools/kratos-lab/test/wad.test.js` | exit 0 — records=283, mats=24 | ✓ PASS |
| fx regression | `node tools/kratos-lab/test/fx.test.js` | exit 0 | ✓ PASS |
| chain regression | `node tools/kratos-lab/test/chain.test.js` | exit 0 | ✓ PASS |
| loop regression | `node tools/kratos-lab/test/loop.test.js` | exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| DEC-02 | 05-01, 05-02, 05-03, 05-04 | FXC/PTC/MSH decoded with per-field evidence table; colors/rates/sizes/lifetimes come from these records | ✓ SATISFIED | SC1 + SC2 verified; evidence audit green; color provenance closed honestly |
| DEC-03 | 05-05 | type-5 ANM descriptor decoded, driving in-hand vs on-back presentation | ⚠ SATISFIED (disposition) | SC3 — real blade-binding descriptor + queryable result; type-5 label + show/hide INFERRED per D-04 (human acceptance requested) |

No orphaned requirements: REQUIREMENTS.md maps only DEC-02 and DEC-03 to Phase 5, and both are claimed by plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| fxparse.js | 216-222 | parseMsh evidence rawHex reads unguarded past rec.size (WR-01) | ⚠ Warning | Named fail-loud invariant breaks in the 0x10–0x27 MSH size band (unnamed RangeError, or silent next-record diagnostic read). Corpus never hits it; no test covers it. |
| fxparse.js | 571-577 | standalone-PTC merge loop missing keep-first guard the FXC loop has (WR-02) | ⚠ Warning | Latent silent overwrite + duplicate ref on a PTC name collision. No collision in current corpus. |
| fxparse.js | 642-650 | slot-pair builder emits undifferentiated false cross-links within a shared slot group (WR-03) | ⚠ Warning | db.refs contains semantically-false emitter→particle edges (fire↔swoosh; BDepoly6/CNG/FXCF slot-0x1 group). Authoritative shape refs are unaffected. See human item 2. |
| fxparse.js | 269, 358-364 | shapeRef readName not bounded by rec.size (IN-01) | ℹ Info | readName self-terminates; harmless on real corpus |
| fxparse.js | 626-628 | resolver-unavailable misreported as "dangling explicit link" (IN-02) | ℹ Info | Environment failure mislabeled as data defect |
| fxparse.js | 280-286 | "1555" texFormat scan spans whole record (IN-03) | ℹ Info | Honestly tagged INFERRED; fragile heuristic |

No debt markers (TBD/FIXME/XXX) and no stub markers (TODO/HACK/PLACEHOLDER/"not implemented") in the modified files — the "placeholder" hits are the legitimate slot-0x00 domain term. Debt-marker gate passes.

### Human Verification Required

**1. Accept the SC3/DEC-03 type-5 INFERRED escalation disposition (primary decision).**
The phase delivered a real, byte-decoded `gomaiblade` blade-binding descriptor with a queryable, JSON-dumpable `in-hand`/`on-back` result — but the combat-state→visibility MAPPING is a hardcoded INFERRED runtime mapping (not decoded bytes), and the "type-5" taxonomy label is INFERRED because no class-5 record exists in `R_WPN0_0.WAD` (proven by a class histogram; and there is no level-1 `ANM_maiblade`). This is exactly the D-04 escalation branch that 05-05's plan sanctioned (pin real seeds, INFERRED-label the residue, never fabricate). Confirm this satisfies "the type-5 ANM descriptor is decoded and drives blade presentation" for unblocking Phase 6 (which depends on type-5 gating). DEC-03 is already marked Complete in REQUIREMENTS.md.
*Why human:* whether an honestly-labeled INFERRED disposition satisfies a literal "decoded" success criterion is a design-acceptance judgment tests cannot make.

**2. Accept or fix the WR-03 slot-ref hand-off before Phase 6 consumes db.refs.**
`db.refs` slot pairs are undifferentiated false edges within shared slot groups (verified live: FXC_BFTemit1→PTC_BGTpart1, FXC_BGTemit1→PTC_BFTpart1, FXC_BDepoly6→PTC_CNGpart/FXCFpart, FXC_CNGemit→PTC_FXCFpart, FXC_FXCFemit→PTC_CNGpart). The authoritative shape refs are correct, and slot refs are corroboration-only by design (A4: shapeRef NAME discriminates). Confirm Phase 6 will bind via shape refs + name stem, OR schedule the WR-03 marker fix first.
*Why human:* the safety of handing unmarked false edges to a downstream consumer is a consumer-contract decision, not a decode correctness question.

### Gaps Summary

**No goal-level gaps.** All four ROADMAP Success Criteria are satisfied by real, byte-exact, data-driven decode: five decoders exist, are substantive, are wired, and produce a JSON-dumpable FxDb from actual disc bytes; all six test suites are green; requirements DEC-02/DEC-03 are covered with no orphans; the data-first discipline (no fabricated real colors/seeds; everything tagged real or INFERRED-with-corroboration) holds throughout. The disc region (NTSC-U/60Hz) is confirmed and recorded; the GS-dump sub-item of SC4 was deliberately skipped by user decision at the 05-04 D-06 checkpoint and the decode does not depend on it.

The status is `human_needed` rather than `passed` because SC3/DEC-03 was delivered via an honestly-labeled INFERRED escalation disposition (the type-5 taxonomy label and the show/hide mapping are INFERRED, not byte-decoded), and this agent's escalation-gate role requires surfacing that for developer acceptance rather than silently passing it.

**On the three code-review warnings (orchestrator's explicit question):** none rises to a goal-level gap.
- **WR-01** touches must-have 05-01 #4 (named throw on truncated MSH). The truth holds for the genuinely header-truncated case it describes (size < 0x10, tested); WR-01 is a *different* degenerate case (valid header, zero verts, diagnostic-read overrun) in a narrow band the corpus never hits and no test covers. It still fails loud — just with an unnamed error. Robustness WARNING → tracked quality follow-up.
- **WR-02** is a latent silent-overwrite with no collision in the current corpus. WARNING → follow-up.
- **WR-03** makes SC2's cross-references noisier, but the *authoritative* references (shape resolution, resolved:true/false) are correct and the slot noise is a documented corroboration-only choice. SC2 ("queryable FxDb with cross-record references") is achieved. WARNING → follow-up + human item 2.

**Informational:** Phase 5 carries `Mode: mvp` in ROADMAP.md but its goal is prose, not a User Story (`user-story.validate` → false). Per the MVP-mode guard the verifier would normally ask to run `/gsd mvp-phase 05` to reformat the goal. Because this is a decode/tooling phase whose "user" is the Phase-6 consumer (the plans supply a faithful "As a Phase-6 particle runtime..." restatement) and the orchestrator directed goal-backward verification against the four testable Success Criteria, I verified against the SCs directly. Consider reformatting the ROADMAP goal to a User Story for MVP-mode consistency, or confirming prose is acceptable for decode phases.

---

_Verified: 2026-07-26T00:53:55Z_
_Verifier: Claude (gsd-verifier)_
