# GhostCrab Personal Glossary (SQLite)

> English version — version française : [`../glossary.md`](../glossary.md)

Canonical vocabulary for [explanations](README.md), [methodology](../../methodology/universal_methodology.md), [skills](../../../ghostcrab-skills/), and the Personal StarterKit. See also [LinkML/OWL2 ontology](../ontology/README.md) and the [operator catalog](../../reference/operator-catalog.md).

---

## Ontology (LinkML / OWL2) — formal sense

| Term | Personal definition | Pro equivalent (if different) |
|------|---------------------|-----------------------------|
| **Ontology** | Formal **LinkML** under `ontologies/`, compiled to slice JSON / **OWL2 N-Triples**, stored in `ontology_*` | Same pattern; optional `pg_*` |
| **Platform profile** | `ontologies/ghostcrab/profile.yaml` | same |
| **Domain slice** | `ontologies/<workspace>/core.yaml`, id `<workspace>::core` | same |
| **Ontology import** | `ghostcrab_ontology_import` from MCP, or `gcp brain ontology compile` / `import` from CLI | same or Pro tooling |

**Not an OWL ontology:** `ghostcrab:task`, `ghostcrab:note`, etc. via `ghostcrab_schema_register` (MCP registry for `agent_facts`).

---

## Three meanings of “facets”

| Sense | Preferred term | Store | Tools |
|-------|----------------|-------|-------|
| **A — Agent facts** | agent facts, MCP memory | `agent_facts` | `ghostcrab_remember`, `upsert`, `search` |
| **B — Document index** | faceting engine | `facet_tables`, `facet_postings` | derived from reindex |
| **C — Ontology vocabulary** | LinkML taxonomies | `ontology_*`, `facet_assignments_raw` | `ghostcrab_ontology_import`, `gcp brain ontology`, `document-qualify` |

JSON field `facets` on an agent fact = **filter**, not the Roaring index (sense B).

Details: [03 — MCP memory layers](../03-memoire-mcp-facettes-graphe-projections.md).

---

## MCP memory layers

| Layer | Storage | Main tools | `artifact_kind` (if any) |
|-------|---------|------------|---------------------------|
| **Session** | MCP process | `ghostcrab_workspace_use` | — |
| **Durable facts** | `agent_facts` | `remember`, `upsert`, `search`, `count` | — |
| **Analysis plan** | `projections` (legacy Type A) | `project`, `pack` | `analysis_plan` |
| **Business graph** | raw + `graph_entity` | `learn`, `graph_search`, `traverse`, `graph_reindex` | — |
| **Snapshot** | `ProjectionResult` (legacy Type B) | `projection_get` | `answer_snapshot` |
| **Live answer** | `mindbrain_answer_artifacts` registry | backend artifact routes | `live_answer_view` |

Backend contract: [`vendor/mindbrain/docs/artifacts/artifact-model.md`](../../../vendor/mindbrain/docs/artifacts/artifact-model.md).

---

## Three naming layers (answer artifacts)

One label must not serve humans, agents, and the filesystem at once.

| Layer | Example | Rule |
|-------|---------|------|
| **Human label** | “Live data — Weekly steering” | Short, no jargon |
| **Agent type (`artifact_kind`)** | `live_answer_view` | Stable, machine-readable |
| **Technical id** | `live_answer_view__weekly_steering` | Kind prefix; **no version in id** (`current_version` column) |

Spec: [renommage.md](../renommage.md).

---

## Answer artifacts vs gaps / rules / diagnostics

**`artifact_kind` is for answer artifacts only.** Gaps, rules, and diagnostics are **not** answer artifacts.

### Answer artifacts (`artifact_kind`)

| Public label | `artifact_kind` | Legacy | Notes |
|--------------|-------------------|--------|-------|
| Analysis plan | `analysis_plan` | Type A / `projections` | agent + `scope` |
| Live answer | `live_answer_view` | *(new)* | workspace; explicit refresh (Personal) |
| Snapshot | `answer_snapshot` | Type B / `ProjectionResult` | frozen, terminal |
| Evidence pack | `evidence_pack` | projection-get evidence links | computed (live) or frozen (snapshot) |

### Answer events (`event_kind`)

| Public label | `event_kind` | Storage | Meaning |
|--------------|--------------|---------|---------|
| Update | `answer_update_event` | `mindbrain_answer_events` | Delta/version event attached to an artifact |

`answer_update_event` answers "what happened to this object?", never "what
answer object is this?".

### Outside `artifact_kind` and `event_kind`

| Meaning | Preferred term | Surface | In answer registry? |
|---------|----------------|---------|---------------------|
| **Graph data gap** | `graph_data_gap` | `ghostcrab_graph_diagnostics` | No |
| **Graph fact conflict** | `graph_conflict` | planned diagnostics + `graph_knowledge_patch` proposals | No |
| **Graph validation rule** | `graph_gap_rule` | `graph_gap_rules` | No — **not** projections |
| **Ontology coverage gap** | `coverage_gap` | `ghostcrab_coverage` | No |
| **Answerability gap** | `answerability_gap` | `ghostcrab-gap-auditor` skill | No |
| **MECE / doc gap** | `mece_gap` | [mece-validation.md](../ontology/mece-validation.md) | No |

Backend detail: [`non-artifact-gaps-and-reports.md`](../../../vendor/mindbrain/docs/artifacts/non-artifact-gaps-and-reports.md). Gap-rules: [02 — MCP, ontology and gap-rules](../02-mcp-ontologie-gap-rules.md).

---

## Projections (legacy — transition)

| Term | Type | Storage | Read / write | → `artifact_kind` |
|------|------|---------|--------------|-------------------|
| **Type A projection** | agent working memory | `projections` | `ghostcrab_project` / `ghostcrab_pack` | `analysis_plan` |
| **Type B projection** | materialized snapshot | `graph_entity` | `ghostcrab_projection_get` | `answer_snapshot` |
| **Graph query** | *not* a projection | domain `graph_entity` | `graph_search`, `traverse`, … | — |
| **`memory_projections`** | legacy TOON pack | `memory_projections` | `GET /api/mindbrain/pack` | Out of registry |

Details: [05 — Projections explained](../en/05-projections-explained.md).

---

## Reindexing

| Term | Definition |
|------|------------|
| **Raw** | `entities_raw`, `relations_raw`, `documents_raw`, `chunks_raw` |
| **Runtime** | `graph_entity`, `graph_relation`, FTS/BM25 indexes |
| **Graph reindex** | `ghostcrab_graph_reindex` or `gcp brain structured-import reindex --scope graph` |

Details: [04 — Reindexing](../04-reindexation-ghostcrab.md).

---

## Allowed terms (Personal)

`agent_facts`, `projections`, `ProjectionResult`, `ghostcrab_*`, `gcp brain …`, `ontology_*`, `GHOSTCRAB_SQLITE_PATH`, LinkML, OWL2, N-Triples.

---

## Pro-only or deprecated (Personal)

| Term | Personal replacement |
|------|----------------------|
| `mindCLI`, `mindbot` | MCP tools + `gcp brain` |
| `DATABASE_URL`, `GHOSTCRAB_DSN` | `GHOSTCRAB_SQLITE_PATH`, `--db` |
| `mb_pragma.*` | `agent_facts`, `projections` tables |
| `mfo_*`, `pg_*` | see StarterKit `EDITIONS.md` |
