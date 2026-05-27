# Closed-world contract — immeuble training axioms

Human-readable mapping from ontology edges to gap rules used in the training curriculum.
Each rule expresses a **competency question** the syndic expects to answer from the graph.

Ontology: `immeuble-training::core` (same taxonomy as the narrative demo, distinct workspace IDs).

## Track A — Data repair (rules fixed, fix graph)

| Module | Rules pack | Axiom (plain language) | Edge | Filter |
|--------|------------|------------------------|------|--------|
| A1 | `L0-patrimoine.json` | Every unit has exactly one cellar and sits in a building | `assigned_cellar`, `contains` | none |
| A2 | `L2-syndic-filtered.json` | Occupied units declare occupants; rented units declare leases | `occupies`, `leases` | exclude `vacant` / `vacant_works`; lease rule only on `tenant_occupied`, `owner_abroad_tenant` |
| A3 | same as A2 | After data fixes, syndic contract is green | — | — |

Catalogued draft defects (see `training-manifest.yaml`):

| ID | Violation | Rule |
|----|-----------|------|
| E01 | Tilleuls A1 missing `occupies` | `occupied-unit-has-occupant` |
| E02 | Five tenant units missing `leases` | `tenant-occupied-has-lease` |
| E03 | Marie Lambert isolated | native `isolated_entity` (fixed by `represents` edge in golden) |

## Track B — Rule design (graph fixed, evolve axioms)

| Module | Rules pack | Lesson | Key change |
|--------|------------|--------|------------|
| B1 | `L1-syndic-naive.json` | Unfiltered `unit-has-owner` flags **Érables A4** (`vacant_works`) | no `entity_filter` |
| B2 | `L2-syndic-filtered.json` | Add `usage_status` filters — false positive removed | `not_one_of: [vacant_works, vacant]` |
| B3 | `L3-full.json` + `motifs.json` | Finance + structural motifs | `billing-group-bills-unit`; building→all units motif |

## Rule reference

### `unit-has-owner`

- **Question:** Who owns this lot?
- **Graph:** incoming `owns` from `person`
- **L1:** all units
- **L2/L3:** units where `metadata.usage_status` ∉ `{vacant, vacant_works}`

### `occupied-unit-has-occupant`

- **Question:** Who lives in this owner-occupied lot?
- **Graph:** incoming `occupies` from `person`
- **Filter:** same vacant exclusion as owner rule

### `tenant-occupied-has-lease`

- **Question:** Which lease contract covers this rented lot?
- **Graph:** incoming `leases` from `lease_contract`
- **Filter:** `usage_status` ∈ `{tenant_occupied, owner_abroad_tenant}`

### `billing-group-bills-unit` (L3 only)

- **Question:** Which billing group invoices this lot?
- **Graph:** incoming `bills_to` from `billing_group`
- **Filter:** exclude vacant units

### Patrimoine rules (L0)

- `unit-one-cellar` — outgoing `assigned_cellar` → exactly one `cellar`
- `unit-in-building` — incoming `contains` from building/block
- `garage-at-most-one-unit` — incoming `assigned_garage` cardinality ≤ 1

### Motifs (`motifs.json`)

- **Building complete patrimoine:** building → `contains` → **all** units → cellar path (`require_all_targets: true` on the contains step)
- **Occupied unit household:** unit → occupant → person path for non-vacant units

## Related fixtures

| Fixture | Role |
|---------|------|
| `examples/immeuble/reference/` | Immutable narrative with intentional native issues |
| `examples/immeuble-training/` | Explicit draft/golden pair for exercises |
| `ws_immeuble_scenarios` | Fast synthetic CI (see `immeuble_scenarios_test.sql`) |
