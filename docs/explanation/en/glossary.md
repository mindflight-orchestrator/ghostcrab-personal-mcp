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
| **Ontology compile** | `gcp brain ontology compile` (dry-run then `--import-db`) | same or Pro tooling |

**Not an OWL ontology:** `ghostcrab:task`, `ghostcrab:note`, etc. via `ghostcrab_schema_register` (MCP registry for `agent_facts`).

---

## Three meanings of “facets”

| Sense | Preferred term | Store | Tools |
|-------|----------------|-------|-------|
| **A — Agent facts** | agent facts, MCP memory | `agent_facts` | `ghostcrab_remember`, `upsert`, `search` |
| **B — Document index** | faceting engine | `facet_tables`, `facet_postings` | derived from reindex |
| **C — Ontology vocabulary** | LinkML taxonomies | `ontology_*`, `facet_assignments_raw` | `gcp brain ontology`, `document-qualify` |

JSON field `facets` on an agent fact = **filter**, not the Roaring index (sense B).

Details: [03 — MCP memory layers](../03-memoire-mcp-facettes-graphe-projections.md).

---

## MCP memory layers

| Layer | Storage | Main tools |
|-------|---------|------------|
| **Session** | MCP process | `ghostcrab_workspace_use` |
| **Durable facts** | `agent_facts` | `remember`, `upsert`, `search`, `count` |
| **Working memory** | `projections` (Type A) | `project`, `pack` |
| **Business graph** | raw + `graph_entity` | `learn`, `graph_search`, `traverse`, `graph_reindex` |
| **Report snapshot** | `ProjectionResult` (Type B) | `projection_get` |

---

## Projections

| Term | Type | Storage | Read / write |
|------|------|---------|--------------|
| **Type A projection** | agent working memory | `projections` | `ghostcrab_project` / `ghostcrab_pack` |
| **Type B projection** | materialized snapshot | `graph_entity` | `ghostcrab_projection_get` |
| **Graph query** | *not* a projection | domain `graph_entity` | `graph_search`, `traverse`, … |

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
