---
phase: 3
slug: chain-link-ribbon-glow
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-25
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Design source: 03-RESEARCH.md → "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | plain Node.js + `node:assert` known-answer suites (project bans runtime deps) |
| **Config file** | none — no install; suites are standalone `node` scripts under `tools/kratos-lab/test/` |
| **Quick run command** | `node tools/kratos-lab/test/chain.test.js` (per-task, geometry slice) |
| **Full suite command** | `node tools/kratos-lab/test/chain.test.js && node tools/kratos-lab/test/wad.test.js && node tools/kratos-lab/test/fx.test.js && node tools/kratos-lab/test/loop.test.js` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan's quick command (`chain.test.js` for 03-01, `wad.test.js` for 03-02).
- **After every plan wave:** Run the full suite command.
- **Before `/gsd:verify-work`:** Full suite must be green.
- **Max feedback latency:** 3 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | CHAIN-01 | T-3-01 | Degenerate-curve NaN guarded by epsilon; asserted in suite | unit (RED) | `node tools/kratos-lab/test/chain.test.js` | ❌ W0 (this task creates it) | ⬜ pending |
| 3-01-02 | 01 | 1 | CHAIN-01 | T-3-01 / T-3-02 | chainInfo → DOM via textContent (no innerHTML) | unit (GREEN) + browser checkpoint | `node tools/kratos-lab/test/chain.test.js` | ✅ | ⬜ pending |
| 3-01-03 | 01 | 1 | CHAIN-01 | — | N/A (human-verify checkpoint) | manual | see Manual-Only below | ✅ | ⬜ pending |
| 3-02-01 | 02 | 2 | CHAIN-01, CHAIN-02 | T-3-03 | parseTxr size-bound-then-magic named throws on truncated record | unit (RED) | `node tools/kratos-lab/test/wad.test.js` | ✅ (extends existing) | ⬜ pending |
| 3-02-02 | 02 | 2 | CHAIN-02 | T-3-03 / T-3-04 | Fetches stay under assets/; public-build fail-safe regex intact | unit (GREEN) + browser checkpoint | `node tools/kratos-lab/test/wad.test.js` | ✅ | ⬜ pending |
| 3-02-03 | 02 | 2 | CHAIN-02 | — | N/A (human-verify checkpoint) | manual | see Manual-Only below | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/kratos-lab/test/chain.test.js` — new known-answer geometry suite (RED-first in 3-01-01): link count from `LINK_PITCH`, alternating-twist frames, degenerate-curve epsilon guard, vert-count contract.
- [x] `tools/kratos-lab/test/wad.test.js` — exists (Phase 2); 3-02-01 extends it with TXR/texture known-answers (32px U-autocorrelation lag-32, chainglow identity-color pins).
- No framework install — plain `node`, project bans runtime deps.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Segmented twisted links read as 3D at gameplay camera; visible alpha gaps; trail tip-arc bias | CHAIN-01 | Perceptual — pixel geometry is auto-verified, but "reads as links not a strip" is a human judgment | Open lab, trigger combo (J), observe chain shows individual links with gaps and alternating twist; orchestrator captures screenshot for the checkpoint |
| Chainglow heat overlay shows real black→red→orange→yellow ramp, no hand-picked tint, occludes correctly over links | CHAIN-02 | Perceptual — texel pass-through is auto-verified, but heat-read fidelity is human judgment | Open lab post-03-02, observe glow over the chain; magenta-background test confirms no tint leak; orchestrator captures screenshot |
| On-screen link count matches Phase-1 freeze-frame measurements | CHAIN-01 (sub) | **DEFERRED** — reference/MEASUREMENTS.md does not exist (Phase 1 paused mid 01-03). Recalibration is one `LINK_PITCH` constant in chain.js | Deferred to Phase-1 polish pass (01-04). Interim: square-texel invariant + texture-geometry known-answers + `KratosLab.chainInfo()` world-scale hook ship now |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (checkpoints follow green GREEN tasks)
- [x] Wave 0 covers all MISSING references (chain.test.js created in 3-01-01)
- [x] No watch-mode flags
- [x] Feedback latency < 3s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-25
