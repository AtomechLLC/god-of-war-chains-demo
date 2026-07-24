---
phase: 1
slug: reference-pipeline-validation-criteria
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — capture/documentation phase producing artifacts, not code (kratos-lab has no test framework; this phase adds no runtime code) |
| **Config file** | none — artifact checks are plain bash/grep gates |
| **Quick run command** | `bash -c 'for f in reference/SETTINGS.md reference/TARGET-DEFINITION.md reference/MEASUREMENTS.md reference/ACCEPTANCE.md; do test -f "$f" && echo "OK $f" || echo "MISSING $f"; done'` |
| **Full suite command** | quick check + phase-gate greps (`renderer` in SETTINGS.md, `not CRT` in TARGET-DEFINITION.md, `cycles/s` in MEASUREMENTS.md, no `TBD` in ACCEPTANCE.md) + citation-resolution loop (01-04 `<verification>`) + git media-safety gate |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | VAL-01 | T-1-01 | media dirs ignored before any capture exists | artifact | `grep -q "reference/captures/" .gitignore && grep -q "not CRT" reference/TARGET-DEFINITION.md` | ❌ created by task | ⬜ pending |
| 1-01-02 | 01 | 1 | VAL-01 | — | N/A | artifact | `grep -q "combo3A" reference/shot-list.md && grep -Eq "X ?\+ ?Triangle" reference/shot-list.md` | ❌ created by task | ⬜ pending |
| 1-02-01 | 02 | 1 | VAL-01 | T-1-02 | DLLs only from official PCSX2 deps release, SHA-256 recorded | artifact | `grep -q "pcsx2-windows-dependencies" reference/SETTINGS.md && grep -qi "SHA-*256" reference/SETTINGS.md` | ❌ created by task | ⬜ pending |
| 1-02-02 | 02 | 1 | VAL-01 | T-1-02 | human applies GUI config; ini persisted | checkpoint + artifact | `test -s "$USERPROFILE/Documents/PCSX2/inis/PCSX2.ini" || test -s "$USERPROFILE/OneDrive/Documents/PCSX2/inis/PCSX2.ini"` | ❌ created by human session | ⬜ pending |
| 1-02-03 | 02 | 1 | VAL-01 | — | N/A | artifact | `test -s reference/PCSX2.ini && ! grep -q "PENDING CONFIRM" reference/SETTINGS.md` | ❌ created by task | ⬜ pending |
| 1-03-01 | 03 | 2 | VAL-01 | — | N/A | checkpoint + artifact | `ls "$USERPROFILE/Documents/PCSX2/snaps/"*.png >/dev/null 2>&1 || ls "$USERPROFILE/OneDrive/Documents/PCSX2/snaps/"*.png >/dev/null 2>&1` | ❌ created by human session | ⬜ pending |
| 1-03-02 | 03 | 2 | VAL-01 | T-1-01 | media stays in gitignored dirs | artifact | `test -f reference/frames/calib.png && [ "$(ls reference/frames | grep -Ec '_f[0-9]+_.+_(close|mid|wide)\.png')" -ge 9 ] && [ "$(ls reference/frames/idle-cadence | wc -l)" -ge 120 ]` | ❌ created by task | ⬜ pending |
| 1-03-03 | 03 | 2 | VAL-01 | T-1-01 | `git status --porcelain` clean of media paths | artifact + security gate | `grep -qi "scale factor" reference/SETTINGS.md && git check-ignore -q reference/frames/calib.png && [ -z "$(git status --porcelain | grep -E 'reference/(frames|captures|annotated)/')" ]` | ❌ created by task | ⬜ pending |
| 1-04-01 | 04 | 3 | VAL-01 | — | N/A | artifact | `grep -q "GS px" reference/MEASUREMENTS.md && [ "$(grep -c 'frames/' reference/MEASUREMENTS.md)" -ge 6 ]` | ❌ created by task | ⬜ pending |
| 1-04-02 | 04 | 3 | VAL-01 | — | colors sampled from PNG stills only | artifact | `grep -q "cycles/s" reference/MEASUREMENTS.md && grep -qE "#[0-9A-Fa-f]{6}" reference/MEASUREMENTS.md` | ❌ created by task | ⬜ pending |
| 1-04-03 | 04 | 3 | VAL-01 | — | N/A | artifact | `test -f reference/ACCEPTANCE.md && ! grep -q "TBD" reference/ACCEPTANCE.md && [ "$(grep -c 'ACC-' reference/ACCEPTANCE.md)" -ge 15 ]` | ❌ created by task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `reference/` directory + `.gitignore` entries for `reference/captures/`, `reference/frames/`, `reference/annotated/` — covered by task 1-01-01 (Wave 1, first plan; MUST land before any capture, enforced by wave ordering: captures happen in Wave 2)
- [ ] `reference/shot-list.md` authored before the first capture session — covered by task 1-01-02 (Wave 1)
- No test-framework install needed — none applies to this phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GoW1 combat capture session | VAL-01 | Claude cannot drive emulator gameplay; shots need human timing | Follow reference/shot-list.md PART B; checkpoint task 1-03-01 |
| PCSX2 first-run GUI configuration | VAL-01 | Wizard + settings dialogs are GUI-only | Follow SETTINGS.md table row by row; checkpoint task 1-02-02 |
| Field-combing judgment at 800% zoom | VAL-01 | Visual judgment; executor Reads the zoomed crop but final combing call is recorded as a documented verdict | Task 1-03-03 step 3; verdict recorded in SETTINGS.md |
| Framing classification (close/mid/wide) of ingested frames | VAL-01 | Kratos frame-height estimate from image inspection | Task 1-03-02 step 2; numeric bands defined in shot-list.md |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task, including checkpoints, has an `<automated>` gate)
- [x] Wave 0 covers all MISSING references (all artifacts are created by this phase; gates reference only files their own or earlier tasks create)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-24 (planner)
