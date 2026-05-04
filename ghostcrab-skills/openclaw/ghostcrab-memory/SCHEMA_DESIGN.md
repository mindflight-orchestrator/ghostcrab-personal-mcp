# OpenClaw Schema Design Notes

Start with the shared rules:

- [shared/SCHEMA_DESIGN.md](../../shared/SCHEMA_DESIGN.md)

OpenClaw-specific additions:

- use product language first on a first-turn fuzzy request; move into schema language only after clarification
- optimize schemas for repeated long-lived retrieval
- make gap and blocker states explicit
- prefer facets that support dashboards and drill-downs
- do not freeze a new schema family when canonical GhostCrab primitives plus a compact recovery view already cover the need

Good OpenClaw demo schema families:

- obligations
- incidents
- services
- tasks
- decisions
