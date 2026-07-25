---
phase: 5
slug: fx-record-decode
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-25
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:assert (built-in — zero external packages, per CLAUDE.md) |
| **Config file** | none |
| **Quick run command** | `node tools/kratos-lab/test/<suite>.test.js` (e.g. `fxc.test.js` / `ptc.test.js` / `fxdb.test.js`) |
| **Full suite command** | `for f in tools/kratos-lab/test/*.test.js; do node "$f" || exit 1; done` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's `<suite>.test.js`
- **After every plan wave:** Run the full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-T1 (RED MSH) | 05-01 | 1 | DEC-02 | T-05-01/02/03/04 | size-gate before field read; rec.size bound; resolve multi-copy | known-answer | `node tools/kratos-lab/test/fxdb.test.js` (RED) | ❌ created here | ⬜ pending |
| 05-01-T2 (parseMsh+buildFxDb) | 05-01 | 1 | DEC-02 | T-05-01/02/04 | named throw; real/INFERRED tags | known-answer | `node tools/kratos-lab/test/fxdb.test.js` | ✅ after T1 | ⬜ pending |
| 05-02-T1 (RED PTC) | 05-02 | 2 | DEC-02 | T-05-01/02/04 | color-provenance guard; variable-length bound | known-answer | `node tools/kratos-lab/test/fxdb.test.js` (RED) | ✅ | ⬜ pending |
| 05-02-T2 (parsePtc) | 05-02 | 2 | DEC-02 | T-05-01/02/04 | magic 0x13 named throw; no real color from PTC | known-answer | `node tools/kratos-lab/test/fxdb.test.js` | ✅ | ⬜ pending |
| 05-03-T1 (RED FXC) | 05-03 | 3 | DEC-02 | T-05-01/02/03/04 | subtype-branched offset; differential invariant | known-answer | `node tools/kratos-lab/test/fxdb.test.js` (RED) | ✅ | ⬜ pending |
| 05-03-T2 (parseFxc+refs) | 05-03 | 3 | DEC-02 | T-05-01/02/03/04 | magic 0x1e named throw; resolve MSH_* or mark runtime | known-answer | `node tools/kratos-lab/test/fxdb.test.js` | ✅ | ⬜ pending |
| 05-04-T1 (color provenance) | 05-04 | 4 | DEC-02 | T-05-02/04/05 | size-bounded texture subarray; no fabricated color | known-answer | `node tools/kratos-lab/test/fxdb.test.js` | ✅ | ⬜ pending |
| 05-04-T2 (corpus + evidence audit) | 05-04 | 4 | DEC-02 | T-05-04 | every field real-or-INFERRED with corrob | known-answer | `node tools/kratos-lab/test/fxdb.test.js && node tools/kratos-lab/test/wad.test.js` | ✅ | ⬜ pending |
| 05-04-T3 (GS-dump decision) | 05-04 | 4 | DEC-02 | T-05-GS | recommended-not-blocking corroboration | checkpoint:decision (manual) | n/a — recorded in SUMMARY | n/a | ⬜ pending |
| 05-05-T1 (RED type-5 locate) | 05-05 | 5 | DEC-03 | T-05-01/03/04 | differential-locate; per-field evidence table | known-answer | `node tools/kratos-lab/test/anm.test.js` (RED) | ❌ created here | ⬜ pending |
| 05-05-T2 (parseAnmType5) | 05-05 | 5 | DEC-03 | T-05-01/02/04 | size-gate; named throw; real/INFERRED | known-answer | `node tools/kratos-lab/test/anm.test.js` | ✅ after T1 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Decode phase note: every decoded field is verified by a byte-exact known-answer assertion against the seed values in 05-RESEARCH.md (per-field evidence tables), plus cross-record consistency (FXC↔PTC slot id, MSH normals unit-length) and the LeftBladeLight REND-02 corroboration anchor. Fields tagged INFERRED are exempt from byte-exact tests but MUST be labeled and corroborated against footage/GS-dump where possible.*

---

## Wave 0 Requirements

- [ ] `tools/kratos-lab/test/` decode suites (fxc/ptc/msh/fxdb) — node:assert known-answer scaffolds copying the `test/wad.test.js` idiom
- [ ] No framework install needed (node:assert is built-in)

*Existing node:assert infrastructure (loop.test.js, wad.test.js, chain.test.js, fx.test.js) covers the harness; new decode suites follow the same pattern.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PCSX2 GS-dump blend/color corroboration | DEC-02 | Requires running PCSX2 + capturing a GS dump (external tool, user hardware) | Capture a blade-swing GS dump; read ALPHA/TEX0/TEST/ZBUF per FX draw; compare to decoded blend interpretation. RECOMMENDED, not blocking. |

*Decode itself is fully automatable via byte known-answers; only the optional GS-dump ground-truth is manual.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (each plan Task 1 creates its RED suite)
- [x] Sampling continuity: every code task has a node:assert automated verify
- [x] Wave 0 folded into each plan Task 1 (RED test scaffold precedes the decoder)
- [x] No watch-mode flags
- [x] Feedback latency < 5s (~5s full suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved by planner 2026-07-25
