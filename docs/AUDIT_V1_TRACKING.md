# GhostCrab V1 — program scope and tracking hub

This document is the **canonical place** for what “V1” means in this repo: goals, definition of done, and where to maintain execution state. It does **not** duplicate the full working checklist (that lives in the root [ROADMAP.md](../ROADMAP.md)).

---

## What V1 is

V1 is a **testable product slice** for human and agent users on:

- Codex, Claude Code, Cursor, OpenClaw

It is meant to validate:

1. **First-turn onboarding** — fuzzy intake without schema/tool-first language or premature writes.
2. **Cross-surface coherence** — same rails and persona across clients.
3. **Long-running recovery** — checkpoints and honest resume after pauses.
4. **Product readability** — users understand what GhostCrab does without knowing internals.

V1 **does not** aim at universal domain coverage, heavy modeling sophistication, or broad product surface area. Deferred modeling and seed work is listed under **V2** in [ROADMAP.md](../ROADMAP.md).

**Authoritative narrative and execution order** (V1.1–V1.10): [.cursor/plans/ghostcrab_v1_reduced_plan_9f3c2b11.plan.md](../.cursor/plans/ghostcrab_v1_reduced_plan_9f3c2b11.plan.md).

---

## Definition of done (V1)

V1 is ready for serious external testing when:

- The four target surfaces behave consistently on a **fuzzy first turn** (questions, compact view, prompt offer, no write-first / schema-first / file-first defaults).
- Users grasp the **product** without schema or tool names unless they ask for technical detail.
- **Checkpoints** after meaningful sessions or phases are usable for resume.
- **Limits** are documented honestly (see `ghostcrab-skills/CAPABILITIES.md` and related docs).

**Cross-surface validation** (minimal natural scenarios pack) is the practical bar for “done”; see V1.10 in the reduced plan.

---

## Where to update status

| Need | File |
|------|------|
| Checkbox backlog: audit fixes, deferred platform items, **V2** backlog | [ROADMAP.md](../ROADMAP.md) |
| V2 native dual-mode (extensions, DockerHub, CI) | [ROADMAP-V2.md](ROADMAP-V2.md) |
| Phased product story (architecture, long-term phases) | [roadmap.md](roadmap.md) |
| Full V1 task list and rationale | [.cursor/plans/ghostcrab_v1_reduced_plan_9f3c2b11.plan.md](../.cursor/plans/ghostcrab_v1_reduced_plan_9f3c2b11.plan.md) |

**Stub policy:** this file stays the stable URL for “V1 tracking”; bookmark **AUDIT_V1_TRACKING** for intent and DoD, **ROADMAP** for day-to-day `[x]` / `[ ]` maintenance.
