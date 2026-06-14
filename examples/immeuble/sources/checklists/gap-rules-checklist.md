# Gap rules checklist — MCP lab reference

Progressive closed-world rules the agent should produce. Compare imports against these packs.

## L0 — Patrimoine

File: [`../gap-rules/L0-patrimoine.json`](../gap-rules/L0-patrimoine.json)

| rule_id | Check |
|---------|-------|
| unit-one-cellar | each unit → exactly one assigned_cellar |
| unit-in-building | each unit → inbound contains from building/block |
| garage-at-most-one-unit | parking not shared across units |

## L1 — Syndic naïf (pedagogy)

File: [`../gap-rules/L1-syndic-naive.json`](../gap-rules/L1-syndic-naive.json)

Unfiltered `unit-has-owner` → false positive on **Érables Appartement A4** (`vacant_works`).

## L2 — Syndic filtré (target for MCP lab + reference)

Files:

- [`../gap-rules/L2-syndic-filtered.json`](../gap-rules/L2-syndic-filtered.json)
- [`../../gap-rules/syndic.json`](../../gap-rules/syndic.json) (syndic L2 for workspace `immeuble`)

| rule_id | Filter |
|---------|--------|
| unit-has-owner | usage_status ∉ {vacant, vacant_works} |
| occupied-unit-has-occupant | same |
| tenant-occupied-has-lease | usage_status ∈ {tenant_occupied, owner_abroad_tenant} |

## L3 — Finance + motifs

File: [`../gap-rules/L3-full.json`](../gap-rules/L3-full.json) + [`motifs.json`](../gap-rules/motifs.json)

Optional for MCP lab; required for training module B3.

## Axioms (human-readable)

See [`../gap-rules/closed-world-contract.md`](../gap-rules/closed-world-contract.md).
