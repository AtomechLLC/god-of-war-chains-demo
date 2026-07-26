---
status: partial
phase: 05-fx-record-decode
source: [05-VERIFICATION.md]
started: 2026-07-26T00:53:55Z
updated: 2026-07-26T00:53:55Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. SC3/DEC-03 — accept the type-5 ANM INFERRED escalation disposition
expected: >-
  Developer confirms the D-04 escalation disposition satisfies SC3 for the purpose of unblocking
  Phase-6. What was delivered: a real, byte-decoded `gomaiblade` scene-binding descriptor (off 0xD580,
  size 92 — classId=1, variant=2, bound="maiblade", tierSelector, anchorOffset (0,-0.320,-8.0,1.0),
  sentinel — all tagged real) exposing a queryable visibilityFor("in-combat")="in-hand" /
  ("out-of-combat")="on-back". BUT the combat-state→visibility MAPPING is a hardcoded INFERRED runtime
  mapping (footage-corroborated, ELF-tiebreaker noted), not a decoded byte field; and the "type-5"
  taxonomy label is itself INFERRED because a class-histogram over every data-carrying tag-0x1e WAD
  record shows NO class-5 record exists (no level-1 ANM_maiblade, only god-tier ANM_maigodblade). This
  disposition was sanctioned by 05-05's plan (must-have truth #5); DEC-03 is marked Complete.
result: [pending]

### 2. WR-03 — accept the slot-ref cross-link hand-off to Phase-6 as-is
expected: >-
  Developer confirms Phase-6 will bind emitter→particle via the authoritative shape refs + shapeRef NAME
  discriminator (A4), treating db.refs slot pairs as corroboration only — OR schedules the WR-03 fix
  (confidence/name-stem marker on slot refs) before Phase-6 consumes db.refs. buildFxDb emits slot pairs
  by cross-multiplying every FXC against every PTC sharing a slotId with NO marker distinguishing true
  1:1 bindings from group-collisions. Verified live: slot 0x1d yields false pairs
  FXC_BFTemit1→PTC_BGTpart1 and FXC_BGTemit1→PTC_BFTpart1; slot 0x1 yields FXC_BDepoly6→PTC_CNGpart,
  FXC_BDepoly6→PTC_FXCFpart, FXC_CNGemit→PTC_FXCFpart, FXC_FXCFemit→PTC_CNGpart — all undifferentiated
  from the real bindings. SC2's authoritative shape refs (resolved:true/false) are correct; slot noise is
  a documented corroboration-only design choice (tracked quality follow-up, not a goal-level gap).

result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
