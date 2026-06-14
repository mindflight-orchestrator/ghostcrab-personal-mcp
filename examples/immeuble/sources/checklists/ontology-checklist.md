# Ontology checklist — MCP lab reference

Read-only target for agent validation. Canonical source: [`ontologies/immeuble/core.yaml`](../../../ontologies/immeuble/core.yaml).

## Entity types (minimum)

| Type | Expected count (approx.) | Notes |
|------|--------------------------|-------|
| building | 2 | Tilleuls, Érables |
| block | 3 | 1 + 2 |
| unit | 13 | 5 + 8 |
| person | ~30 | owners, occupants, tenants, children |
| household | 13 | one per unit |
| lease_contract | 5 | tenant units |
| cellar | 13 | one per unit |
| parking_space | 7 | garages assignés |
| private_garden | 6 | RDC units |
| coda_entry | 3 | payment cases |
| billing_group | 2+ | per building |
| organization | 2+ | syndic, landlords |

## Edge types (minimum)

| Edge | Role |
|------|------|
| contains | building → block → unit |
| owns | person → unit |
| occupies | person → unit |
| household_member | person → household |
| primary_residence_of | household → unit |
| leases | lease_contract → unit |
| rented_to | person → lease_contract |
| assigned_cellar | unit → cellar |
| assigned_garage | unit → parking_space |
| uses_exclusive | unit → private_garden |
| uses_common | unit → shared space |
| matched_to | coda_entry → payment |
| allocated_to | payment → billing_group |
| represents | person → organization (syndic staff) |

## Facet dimensions (documents)

| Namespace | Dimension | Example values |
|-----------|-----------|----------------|
| source | document_type | statuts_copropriete, bail, pv_ag, extrait_coda, … |
| domain | building | Résidence Les Tilleuls, Résidence Les Érables |
| domain | unit | Tilleuls Appartement A1, … |
| domain | role | coproprietaire, locataire, occupant |
| domain | scenario | scenario:tenant-lease, … |
| finance | payment_status | complete, partial, review |

## Competency questions

See [`../reference/scenarios.yaml`](../reference/scenarios.yaml).
