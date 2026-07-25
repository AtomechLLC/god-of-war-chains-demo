---
phase: 5
slug: fx-record-decode
status: draft
nyquist_compliant: false
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
| _(filled by planner)_ | | | DEC-02 / DEC-03 | | | known-answer | | | ⬜ pending |

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
