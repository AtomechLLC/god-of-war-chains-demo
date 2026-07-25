---
phase: 2
slug: wad-mat-decode-render-pass-foundation
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-24
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — plain Node scripts with `node:assert` (zero-dependency constraint; precedent: server.js, gen_twk.js) |
| **Config file** | none — Wave 1 Task 1 creates `tools/kratos-lab/test/` with the first suite |
| **Quick run command** | `node tools/kratos-lab/test/wad.test.js` |
| **Full suite command** | `for f in tools/kratos-lab/test/*.test.js; do node "$f" || exit 1; done` |
| **Estimated runtime** | ~1 second (three scripts, one 166 KB file read) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command (plus the suite the task touched)
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite green + both human-verify checkpoints passed
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | DEC-01 | T-2-01 / T-2-03 | bounds-checked parse, named errors, marker-safe resolution | unit (Node, known-answer) | `node tools/kratos-lab/test/wad.test.js` | ❌ created by task (RED first) | ⬜ pending |
| 2-01-02 | 01 | 1 | DEC-01 | T-2-02 / T-2-04 | assets/-only fetches; fail-safe regex widened | unit + source assert | `node tools/kratos-lab/test/wad.test.js && grep -q "assets/wads/R_WPN0_0.WAD" tools/kratos-lab/app.js && ! grep -q "\.\./\.\./extracted/" tools/kratos-lab/app.js` | ✅ after 2-01-01 | ⬜ pending |
| 2-02-01 | 02 | 2 | DEC-01 | T-2-05 | throw-on-unknown blend mode (no silent default) | unit (Node, mock gl) | `node tools/kratos-lab/test/fx.test.js` | ❌ created by task (RED first) | ⬜ pending |
| 2-02-02 | 02 | 2 | DEC-01, REND-01 | T-2-06 | full state set per pass + restore after FX block | unit + source assert | `node tools/kratos-lab/test/fx.test.js && grep -q "alpha: false" tools/kratos-lab/app.js && ! grep -q "uAdd" tools/kratos-lab/app.js` | ✅ after 2-02-01 | ⬜ pending |
| 2-02-03 | 02 | 2 | DEC-01, REND-01 | — | N/A (perceptual + mid-frame GPU state) | checkpoint:human-verify | manual (magenta test, fxLog, saturation) | n/a | ⬜ pending |
| 2-03-01 | 03 | 3 | REND-03 | T-2-08 | 0.25s stall clamp (no spiral of death) | unit (Node, known-answer) | `node tools/kratos-lab/test/loop.test.js` | ❌ created by task (RED first) | ⬜ pending |
| 2-03-02 | 03 | 3 | REND-03 | T-2-09 | deterministic KratosLab.step hook semantics | unit + source assert | `node tools/kratos-lab/test/loop.test.js && grep -q "Loop.makeAccumulator" tools/kratos-lab/app.js && ! grep -q "Math.min(0.05" tools/kratos-lab/app.js` | ✅ after 2-03-01 | ⬜ pending |
| 2-04-01 | 04 | 4 | REND-03 | T-2-10 / T-2-11 | FBO completeness assert; dedicated blit program | full suite + source assert | `for f in tools/kratos-lab/test/*.test.js; do node "$f" || exit 1; done && grep -q "FRAMEBUFFER_COMPLETE" tools/kratos-lab/app.js` | ✅ | ⬜ pending |
| 2-04-02 | 04 | 4 | REND-03 | — | N/A (perceptual + wall-clock on real display) | checkpoint:human-verify | manual (softness, 4:3 letterbox, 60±1 simStepCount) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

RESEARCH.md Wave 0 gaps are closed inside the plans (RED-first tasks), not as a separate wave:

- [ ] `tools/kratos-lab/test/wad.test.js` — created RED in task 2-01-01 before implementation (DEC-01 known answers)
- [ ] `tools/kratos-lab/test/loop.test.js` — created RED in task 2-03-01 before implementation (REND-03 accumulator)
- [ ] `module.exports` guards on parsers.js / fxparse.js / fx.js / loop.js — landed by the task creating each file
- [ ] `KratosLab` debug hooks (gl, matDb, fxLog, fxState, simStepCount, setNativeRes) — landed incrementally in tasks 2-01-02, 2-02-02, 2-03-02, 2-04-01

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live draws use MAT state per pass | DEC-01 | Mid-frame GPU state can't be sampled from console hooks | 02-02 Task 3 steps 4 + 7 (fxLog + optional Spector.js) |
| Magenta test / no compositing washout | REND-01 | Perceptual tint check | 02-02 Task 3 step 5 |
| Additive stacks saturate flat white | REND-01 | Perceptual | 02-02 Task 3 step 6 |
| Native-res softness + 4:3 framing | REND-03 | Perceptual on real display | 02-04 Task 2 steps 3-4 |
| 60±1 sim steps/s on real hardware | REND-03 | Depends on the human's actual display/refresh | 02-04 Task 2 step 2 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are checkpoint tasks with numbered manual steps
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (RED-first tasks inside plans)
- [x] No watch-mode flags
- [x] Feedback latency < 2s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-24 (planner)
