# Graphing specification

Product spec distilled from [proposition.md](./proposition.md). Defines the dual-view graph explorer UX, visual taxonomy, and four-layer ontology architecture used by GhostCrab graphing and LinkML authoring.

## Core principle

> The ontology explains meaning. The graph shows facts. The side panel links both.

Navigation path: **Instance → ontological type → definition → rules → evidence**.

## Dual view

Two separate but linked layers must never be conflated in the UI.

| Layer | Shows | GhostCrab source |
|-------|-------|-------------------|
| **Modèle** | Classes, relation schema, constraints, controlled vocabularies | `ontology_entity_types`, `ontology_edge_types`, `ontology_dimensions` / `ontology_values`, `ontology_triples_raw` |
| **Données** | Real instances, qualified edges, temporal states | `graph_entity`, `graph_relation`, `graph_relation_property` |
| **Inspecteur** | Instance facts + type definition + validation hints | mindbrain ontology/graph APIs |

### Three-panel layout

```
┌─────────────────────────────┬──────────────────┐
│  Graph (Modèle or Données)│  Inspector       │
│                             │  ┌─────────────┐ │
│                             │  │ Instance    │ │
│                             │  ├─────────────┤ │
│                             │  │ Definition  │ │
│                             │  └─────────────┘ │
└─────────────────────────────┴──────────────────┘
```

When the user selects `RelationPropriété_001` in **Données**:

- **Instance**: titulaire, lot, quote-part, statut, dates
- **Definition**: type `RelationPropriété`, required fields, allowed document types, SHACL-style rules

Clicking the ontological type opens **Modèle** centered on that class.

## Header tabs

| Tab | Purpose |
|-----|---------|
| **Modèle** | Ontology schema graph (`ontology_entities_raw` / `ontology_relations_raw` + type metadata) |
| **Données** | Instance subgraph (`graph_entity` / `graph_relation`) |
| **Historique** | Closed relations, triggering events, group versions, proof documents |
| **Projections** | Agent projection pack test panel (`pack-projections`, `projection-get`) |

## Visual taxonomy

| Element | Rendering |
|---------|-----------|
| Ontological classes | Abstract shape (rounded rectangle, muted palette) |
| Real instances | Concrete nodes (standard entity styling) |
| Reified relations | Diamond or intermediate node between endpoints |
| Documents / proof | Document icon |
| Events | Clock or lightning icon |
| Versioned groups | Badge `v1`, `v2`, … |
| Confirmed relations | Solid edge |
| Pending verification | Dashed edge |
| Closed relations | Dotted / grey edge |

### Qualified edge labels

Do not render bare `Jean POSSEDE Lot A3`. Prefer:

```
Jean ── possède [1/3, confirmé, depuis 2020] ──► Lot A3
```

Edge label built from `graph_relation_property` and relation `metadata_json`: quote-part, status, `validFrom`, proof reference.

## Ontology architecture (four layers)

Author in LinkML as stacked modules; runtime stores compiled native ontology in SQLite.

```
Layer 1 — Core patterns
  Entity, Agent, Role, Event, Document, Group,
  Relationship, State, Location, TimeInterval, Rule

Layer 2 — Generic business
  Person, Organization, Contract, Asset, Invoice,
  Account, Case, Communication, Task, Decision

Layer 3 — Domain vocabularies
  Syndic, Assurance, Immobilier, ERP, RH, CRM, Legal, …

Layer 4 — Instance graph
  Jean, Lot A3, DecesJean, Facture2024, …
```

### Universal patterns (encode explicitly, do not mega-class)

| Pattern | Usage |
|---------|-------|
| Entity–Relationship | Base graph |
| Qualified Relation | Rich edges (dates, proof, share) |
| Temporal | `validFrom` / `validTo`, versioned states |
| Event | Transitions without rewriting history |
| Provenance (PROV-O) | Documents confirm relations |
| Role | Person ≠ role |
| Group / Membership | Collectives with validity |
| Lifecycle / State | confirmed, pending, closed |

Avoid domain-specific mega-classes such as `coproprietaireMarieDecedeAvecSuccession`. Compose situations from patterns.

## Standards alignment

| Standard | Role in GhostCrab graphing |
|----------|---------------------------|
| RDF / RDFS | Triple model, classes, domain/range |
| OWL | Logical constraints, equivalences |
| SKOS | Labels, definitions, taxonomies |
| SHACL | Instance validation shapes |
| PROV-O | Proof and document lineage |
| OWL-Time | Temporal validity |

Domain profiles (e.g. syndic) specialize standard patterns; they are not standalone proprietary ontologies.

## Data flow

```
LinkML YAML (authoring)
    → ghostcrab_ontology_import or gcp brain ontology compile (native MindBrain importer)
    → GhostCrab native ontology tables + ontology_triples_raw
    → mindbrain HTTP ontology/graph APIs
    → Sigma dual-view explorer
```

See [linkml-interchange.md](./linkml-interchange.md) for the interchange contract.

## Success criteria

1. **Modèle** tab shows schema graph without instance noise.
2. **Données** tab shows instances; inspector links each node/edge to its type definition.
3. Search focuses subgraph from graph-search, BM25, or facet filters.
4. Qualified edges display composite labels and open a dedicated inspector section.
5. Brain offline falls back to demo SQLite with a clear status badge.
