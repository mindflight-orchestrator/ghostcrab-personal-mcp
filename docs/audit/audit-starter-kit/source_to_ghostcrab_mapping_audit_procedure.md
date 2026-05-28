# Source-to-GhostCrab Mapping Procedure

Date: 2026-05-28

## Why This Exists

The graph visualization issue exposed a broader ingestion problem: a source file can be correctly loaded somewhere, but still fail the actual target contract.

Examples:

- CSV rows become facet records, but required dimensions are missing.
- Edges are represented as text fields, but never become traversable graph relations.
- A source object does not fit any target entity type.
- A source enum value does not match the model.
- Record ids are unstable, so re-import creates duplicates.
- A projection works on text search, but graph traversal fails.
- A viewer, report, or downstream agent expects native graph rows, not only facets.

The fix is not "more prompting". The fix is a deterministic import pipeline with explicit gates.

## Core Principle

Treat ingestion as compilation:

```text
source data
  -> source profile
  -> target model contract
  -> mapping contract
  -> normalized staging records
  -> validated facet records
  -> validated graph edges
  -> projections / consumers
```

Every phase must produce an artifact and a validation report. No phase should silently repair or guess structural meaning.

## Target Truth

The target model must be read before mapping begins.

Preferred source:

- `ghostcrab_workspace_export_model(workspace_id, depth = full)`

Fallback source:

- local ontology contract, e.g. `models/crm_mindbrain_ontology_contract.json`

The target truth must expose:

- workspace id
- entity types
- schema ids
- required facets
- optional facets
- allowed enum values
- graph edge labels
- source/target type constraints for edges
- projection scopes
- consumer requirements, if any

## Required Artifacts

### 1. Source Profile

The source profile describes what is actually present in the input.

For CSV:

- file path
- delimiter and encoding
- header names
- sample rows
- null rate per column
- uniqueness candidates
- detected enums
- detected date formats
- likely entity columns
- likely relation columns
- ignored columns with reason

For API/JSON:

- endpoint or file path
- object paths
- repeated arrays
- primary id candidates
- nested relation paths
- nullable fields
- enum-like values

### 2. Target Model Contract

The target model contract is the GhostCrab/mindBrain ontology surface.

It should be exported or loaded before any mapping decisions:

- entity schemas
- required facets
- allowed values
- edge labels
- projection scopes

### 3. Mapping Contract

The mapping contract is the central deterministic artifact. It says how the source becomes GhostCrab records.

It must define:

- source object or row type
- target `schema_id`
- `record_id` formula
- field-to-facet mappings
- default values
- normalization transforms
- enum translations
- relation extraction rules
- edge labels
- source and target reference formulas
- quarantine rules

No import should run without this contract.

### 4. Quarantine Ledger

Some objects will not fit. They should not be forced into the model.

Quarantine records should include:

- source row/object id
- reason code
- raw excerpt or redacted source payload
- proposed target type, if any
- missing facets or unresolved references
- severity
- action required

Reason codes:

- `unknown_entity_type`
- `missing_required_facet`
- `invalid_enum_value`
- `unresolved_reference`
- `ambiguous_reference`
- `duplicate_record_id`
- `invalid_edge_label`
- `edge_type_mismatch`
- `unsafe_inference`
- `needs_model_extension`

## Deterministic Pipeline

### Gate 0 - Identify Runtime and Target Workspace

Questions:

- Which GhostCrab runtime is active?
- Which SQLite/Postgres DB is active?
- Which workspace is the target?
- Is the target workspace empty, partial, or already populated?

Checks:

- runtime status
- DB path or connection identity
- workspace id exists
- current counts by schema

Output:

- `runtime_identity_report`

### Gate 1 - Export or Load Target Model

Questions:

- What does the target model allow?
- Which facets are required?
- Which edge labels are legal?
- Which projections will be tested?

Checks:

- model is readable
- schema ids are namespaced
- required facets are explicit
- edge definitions are explicit

Output:

- `target_model_contract`

### Gate 2 - Profile Source Data

Questions:

- What columns/fields exist?
- Which fields are stable ids?
- Which fields imply entities?
- Which fields imply relations?
- Which values are outside expected enums?

Checks:

- every source field is classified as mapped, ignored, derived, or quarantined
- no source column disappears without reason

Output:

- `source_profile_report`

### Gate 3 - Build Mapping Contract

Questions:

- How is each target entity created?
- How is each `record_id` formed?
- How are facets normalized?
- How are relations extracted?
- What is the fallback when a relation endpoint is missing?

Checks:

- every target required facet has a source mapping, default, or quarantine rule
- every edge has a source formula and target formula
- every enum has a translation table or strict validator

Output:

- `mapping_contract`

### Gate 4 - Dry Run Transform

The dry run creates normalized records without writing to GhostCrab.

Checks:

- unique `record_id`
- valid target `schema_id`
- required facets present
- enum values valid
- edge labels valid
- edge endpoints resolvable
- no circular impossible dependencies, unless allowed

Outputs:

- `normalized_records.jsonl`
- `normalized_edges.jsonl`
- `quarantine.jsonl`
- `dry_run_report`

### Gate 5 - Human/Agent Review of Exceptions

Quarantine must be reviewed before import.

Decision options:

- fix source data
- extend mapping contract
- extend target model
- drop record with reason
- import as provisional note
- keep quarantined

Important:

- model extension is a freeze-level decision
- do not silently create a new entity type because one row does not fit

Output:

- `exception_resolution_report`

### Gate 6 - Import Facets

Use `ghostcrab_upsert` or batch/direct SQL depending on volume.

Checks:

- imported facet count equals normalized records count
- all records scoped to target workspace
- all records have stable `record_id`
- all mutable records use upsert, not duplicate remember rows

Output:

- `facet_import_report`

### Gate 7 - Import or Materialize Graph

Graph relations must become traversable if downstream tasks require traversal or visualization.

Options:

- use GhostCrab graph tools when available
- write graph-native rows through approved import path
- materialize from semantic-edge facet records

Checks:

- graph node count equals expected graph-capable entities
- graph edge count equals expected resolved edges
- all edge endpoints exist
- all edge labels are legal
- source/target entity types match model constraints

Output:

- `graph_import_report`

### Gate 8 - Projection Tests

Run projection tests only after facets and graph are both validated.

Checks:

- `ghostcrab_pack` returns relevant facts
- blocker queries return expected blockers
- next-action queries return expected entities
- missing-context detection triggers on known gaps

Output:

- `projection_test_report`

### Gate 9 - Consumer Tests

Each consumer has its own contract.

Examples:

- Sigma/Graphology requires `graph_entity` and `graph_relation`.
- Agents may require `ghostcrab_pack`.
- Reports may require grouped facet counts.
- Traversal tasks may require graph endpoint resolution.

Checks:

- API count endpoints return non-zero data
- expected filters work
- expected projection scopes work
- expected graph traversals work

Output:

- `consumer_readiness_report`

## Contract Template

The mapping contract should look like this:

```json
{
  "workspace_id": "crm-mindbrain",
  "source": {
    "kind": "csv",
    "path": "data/source.csv",
    "encoding": "utf-8",
    "delimiter": ",",
    "primary_key_candidates": ["id", "email", "domain"]
  },
  "target_model": {
    "source": "ghostcrab_workspace_export_model",
    "fallback_path": "models/crm_mindbrain_ontology_contract.json",
    "version": "0.1.0"
  },
  "entities": [
    {
      "source_selector": "rows where type = company",
      "target_schema_id": "crm-mindbrain:organization",
      "record_id": "organization:{normalized_domain}",
      "facets": {
        "type": { "const": "organization" },
        "domain": { "const": "crm" },
        "status": { "from": "status", "enum_map": "organization_status" },
        "owner": { "from": "owner_email", "transform": "user_record_id" }
      },
      "quarantine_if": [
        "missing normalized_domain",
        "status not in organization_status"
      ]
    }
  ],
  "edges": [
    {
      "label": "works_for",
      "source_record_id": "contact:{normalized_email}",
      "target_record_id": "organization:{normalized_domain}",
      "quarantine_if": [
        "source missing",
        "target missing"
      ]
    }
  ],
  "enum_maps": {
    "organization_status": {
      "Lead": "prospect",
      "Customer": "customer",
      "Archived": "archived"
    }
  }
}
```

## Handling Objects That Escape the Rules

Objects that escape the model are signal, not noise.

They should be split into four classes:

1. Bad source data
   - malformed row
   - missing id
   - duplicate id
   - invalid date

2. Mapping gap
   - source has a field that should map but no rule exists
   - source enum has a new value
   - relation is implied but not encoded

3. Model gap
   - the target ontology genuinely lacks an entity or edge
   - should trigger model review, not automatic schema creation

4. Consumer gap
   - GhostCrab memory can represent it, but a downstream consumer cannot
   - e.g. Sigma needs native graph rows

Each class has a different action. Mixing them creates drift.

## Anti-Patterns To Avoid

- Importing directly from CSV to GhostCrab without a mapping contract.
- Treating `ghostcrab_pack` success as graph import success.
- Creating new schema ids for one-off source anomalies.
- Converting unresolved references into free-text notes without quarantine.
- Using display labels as stable ids.
- Letting agent inference create edges without source evidence.
- Validating only counts, not endpoint resolution.
- Validating only endpoint resolution, not source/target type constraints.

## Minimum Ready Definition

An import is ready only when all are true:

- model contract loaded
- source profile generated
- mapping contract exists
- dry run has zero blocking issues
- quarantine is reviewed
- facet counts match expected counts
- graph counts match expected counts when graph is required
- projection tests pass
- consumer tests pass
- manifest records source, target, counts, and exceptions

## Recommended Next Implementation

Create a reusable import harness:

```text
scripts/profile_source.mjs
scripts/validate_mapping_contract.mjs
scripts/transform_source_to_records.mjs
scripts/import_facets.mjs
scripts/materialize_graph_from_edges.mjs
scripts/audit_import_pipeline.mjs
```

For the CRM repo, `scripts/audit_crm_graph_pipeline.mjs` is the first slice of this harness.
