# Phase 5: FX Record Decode - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-25
**Phase:** 5-fx-record-decode
**Areas presented:** Decode priority / MVP slice, INFERRED tolerance & escalation, GS-dump ground truth, Type-5 blade-state scope

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Decode priority / MVP slice | All at once vs payoff-first (trail+fire) | |
| INFERRED tolerance & escalation | ELF disassembly vs labeled-INFERRED fallback | |
| GS-dump ground truth | Capture a PCSX2 GS dump + confirm NTSC/PAL, or plan around | |
| Type-5 blade-state scope | Decode blade presentation now vs defer | |

**User's choice:** "[No preference]" — deferred all decisions to Claude's judgment.
**Notes:** User had earlier redirected to fast-track particles and repeatedly emphasized the trail/fire visual payoff vs reference footage. All four decisions were made on the user's behalf, grounded in the data-first ethos, unconstrained budget, and that stated priority. User can adjust before planning.

---

## Claude's Discretion

All four areas resolved by Claude (user "no preference"):
- **Decode priority:** payoff-first — trails (BFT/BGT) + spark emitter + swordtrail texture ramp in slice 1; blade fire slice 2; chain-glow/MSH-only lower. Roadmap MSH→PTC→FXC(0x2) dependency order preserved within each slice.
- **INFERRED tolerance:** decode-first/aggressive (differential across 15+ instances); ELF-disassembly escalation for look-critical resistant fields; labeled-INFERRED fallback only for runtime-computed or genuinely-undecodable fields.
- **GS-dump & region:** region resolved to NTSC-U from footage serial SCUS-97399 (rates = 60Hz ticks); GS dump treated as recommended-not-blocking corroboration — NEEDS USER CONFIRMATION on availability.
- **Type-5 blade-state:** deferred out of the fast-track slice (presentation, not particles).

## Deferred Ideas

- Type-5 ANM blade-state descriptor — later Phase-5 slice or Phase-6 blade work.
- Chain-glow (CNG) intensity refinement + alpha-over-1.0 fix — slice 2.
- Phase 4 (chain motion) — deferred by the fast-track pivot.
- `hitbox-visualization` todo — reviewed, not folded (unrelated to FX decode).
