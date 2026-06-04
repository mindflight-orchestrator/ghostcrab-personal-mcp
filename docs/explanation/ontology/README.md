# Ontologies projet (LinkML / OWL2)

> English hub (short): see [en/README.md](en/README.md) when added; glossary: [../glossary.md](../glossary.md).

Ce dossier documente le **groupe d'ontologies formelles** du produit Personal — pas les schémas MCP `ghostcrab:*`.

**Lecture humaine (explication)** : chapitres [03 → 05](../README.md#parcours-de-lecture--architecture-recommandé), [glossaire](../glossary.md), graphes [diagrams/](diagrams/), matrice [term-slice-matrix.md](term-slice-matrix.md).

**Source LinkML doc (MECE)** : [linkml/ghostcrab-docs/](linkml/ghostcrab-docs/).

**Artefacts compile (machines)** : [compiled-slices/](compiled-slices/) — JSON optionnel ; voir [compiled-slices/README.md](compiled-slices/README.md) pourquoi ce n'est pas de la prose.

---

## Définition

| | Ontologie (ce dossier) | Schéma agent MCP |
|-|------------------------|------------------|
| **Format source** | LinkML YAML | JSON schema registry |
| **Cible logique** | OWL2 / N-Triples | `ghostcrab:task`, `ghostcrab:note`, … |
| **Stockage** | `ontology_*` | métadonnées + lignes `agent_facts` |
| **Opérateur** | `gcp brain ontology compile\|import\|export` | `ghostcrab_schema_register` |
| **Usage principal** | taxonomies documentaires, vocabulaire graphe | faits textuels agent |

---

## Arborescence

```text
docs/explanation/ontology/
├── README.md                 # ce hub
├── term-slice-matrix.md      # termes glossaire → tranche MECE
├── mece-validation.md        # checklist qualité
├── diagrams/                 # graphes Mermaid (lisibles)
├── linkml/ghostcrab-docs/    # YAML source tranches épistémiques
└── compiled-slices/          # JSON sortie compile (audit / import)

ontologies/                   # à la racine repo — domaine métier uniquement
├── ghostcrab/profile.yaml
└── immeuble-demo/core.yaml
```

### Tranches épistémiques `ghostcrab-docs` (MECE)

| Tranche | Ontology id | Graphe | Doc prose |
|---------|-------------|--------|-----------|
| memory-model | `ghostcrab-docs::memory-model` | [diagrams/memory-model.md](diagrams/memory-model.md) | [03 — Mémoire MCP](../03-memoire-mcp-facettes-graphe-projections.md) |
| query-layers | `ghostcrab-docs::query-layers` | [diagrams/query-layers.md](diagrams/query-layers.md) | [Query layers](../../methodology/ghostcrab-query-layers.md) |
| methodology-loop | `ghostcrab-docs::methodology-loop` | [diagrams/methodology-loop.md](diagrams/methodology-loop.md) | [Universal methodology](../../methodology/universal_methodology.md) |
| import-paths | `ghostcrab-docs::import-paths` | [diagrams/import-paths.md](diagrams/import-paths.md) | [06 — Voies import](../methode-starterkit/06-voies-import-ontologie-et-tabulaire.md) |

Validation : [mece-validation.md](mece-validation.md).

```bash
node scripts/render-linkml-ontology-graph.mjs
node bin/gcp.mjs brain ontology compile \
  --workspace-id ghostcrab-docs \
  --ontology-id ghostcrab-docs::memory-model \
  --input docs/explanation/ontology/linkml/ghostcrab-docs/memory-model.yaml \
  --output docs/explanation/ontology/compiled-slices/memory-model.json
```

**Mapping graphing spec (Layer 1–4)** : Layers 1–3 = `ontologies/ghostcrab/profile.yaml` + tranches domaine ; Layer 4 = instances `graph_entity`. Les tranches `ghostcrab-docs` modélisent le **vocabulaire de lecture produit**, pas le graphe métier.

---

## Parcours

| Document | Sujet |
|----------|-------|
| [linkml-owl2-pipeline.md](linkml-owl2-pipeline.md) | compile, dry-run, `--import-db`, import/export N-Triples |
| [platform-profile.md](platform-profile.md) | `ontologies/ghostcrab/profile.yaml` |
| [domain-slice-contract.md](domain-slice-contract.md) | ids `<ws>::core`, dépendances |
| [vs-agent-schemas.md](vs-agent-schemas.md) | LinkML (C) vs `ghostcrab_schema_register` (A) |
| [mece-validation.md](mece-validation.md) | Checklist MECE |
| [term-slice-matrix.md](term-slice-matrix.md) | Termes → tranche |
| [compiled-slices/README.md](compiled-slices/README.md) | Rôle des JSON compile |

---

## Liens méthodologie et StarterKit

- [Ontology dev for LLMs](../../methodology/fr/ontology_dev_for_llm.md)
- [Universal methodology § phases](../../methodology/fr/universal_methodology.md)
- [06 — Voies import](../methode-starterkit/06-voies-import-ontologie-et-tabulaire.md)
- [Operator catalog](../../reference/operator-catalog.md)
