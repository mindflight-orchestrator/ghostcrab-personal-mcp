# 01 — Audit des explications actuelles (avec StarterKit)

Documents audités :

- [`03-memoire-mcp-facettes-graphe-projections.md`](../03-memoire-mcp-facettes-graphe-projections.md)
- [`04-reindexation-ghostcrab.md`](../04-reindexation-ghostcrab.md)
- [`05-projections-expliquees.md`](../05-projections-expliquees.md)

Méthode externe : [StarterKit personal-mcp SOP5](../../../../starter-kit-ghostcrab-perso/starterkit/personal-mcp/SOP5_structured_import.md) — voir [02 — Méthode](02-methode-starterkit.md).

---

## Verdict

Les documents 03–05 corrigent la confusion principale : « projection » ≠ requête ad hoc sur le graphe. Trois usages distincts :

| Usage | Stockage | Lecture |
|-------|----------|---------|
| Type A — mémoire de travail | `projections` | `ghostcrab_pack` |
| Type B — snapshot analytique | `graph_entity` (`ProjectionResult`) | `ghostcrab_projection_get` |
| Reindex interne raw → runtime | `entities_raw` → `graph_entity` | outils graphe |

Le StarterKit **confirme** la séparation pack vs graphe ([`consumer_contract.yaml`](../../../../starter-kit-ghostcrab-perso/starterkit/templates/consumer_contract.yaml) L52–54) mais **ne formalise pas** Type B ni la qualification documentaire — voir [04 — Écarts](04-ecarts-starterkit-personal.md).

---

## Ce qui est clair et aligné StarterKit

- `FACT/GOAL/STEP/CONSTRAINT` = Type A, pas nœuds graphe (SOP5 Gate 7)
- `ghostcrab_search` lit **`agent_facts`**, pas `graph_entity` (Gate 5 vs Gate 6)
- `facet_assignments_raw` ≠ faits agent (Personal ; StarterKit implicite via gates séparées)
- Projections et snapshots **stale** après changement graphe (Gates 6→7 sans sync)
- Reindex requis quand seul le raw change ([04](../04-reindexation-ghostcrab.md) = extension Personal de Gate 6)

---

## Matrice concept → code (Personal)

| Concept | Code | Tables |
|---------|------|--------|
| Session MCP | [`session-context.ts`](../../../src/mcp/session-context.ts) | mémoire process |
| Faits agent | [`remember.ts`](../../../src/tools/facets/remember.ts), [`search.ts`](../../../src/tools/facets/search.ts) | **`agent_facts`**, `facets_json` |
| Qualification docs | CLI qualify | **`facet_assignments_raw`** → `facet_postings` |
| Graphe MCP | [`learn.ts`](../../../src/tools/dgraph/learn.ts), [`graph.ts`](../../../src/db/graph.ts) | raw + `graph_entity` |
| Reindex | [`graph-reindex.ts`](../../../src/tools/dgraph/graph-reindex.ts) | raw → runtime |
| Type A | [`project.ts`](../../../src/tools/pragma/project.ts), [`pack.ts`](../../../src/tools/pragma/pack.ts) | `projections` |
| Type B | [`projection-get.ts`](../../../src/tools/pragma/projection-get.ts) | `ProjectionResult`, `DeltaFinding` |
| Combined | [`combined-search.ts`](../../../src/tools/search/combined-search.ts) | graphe puis faits |

---

## Corrections conceptuelles (confirmées par StarterKit)

### `facet_assignments_raw` ≠ `agent_facts`

Qualification documentaire vs notes agent. Gate 5 StarterKit cible les faits upsertables — pas les postings collection.

### `learn` = runtime + raw ; batch raw seul = reindex

SOP5 Gate 6 liste learn **ou** tables SQLite PERSO **ou** edges materialisés — cohérent avec [04](../04-reindexation-ghostcrab.md).

### Pack OK ≠ graphe OK

Explicitement dans le template consumer StarterKit ; c'était le principal risque de sur-interprétation des explications MCP.

### Type B non recalculé

StarterKit silencieux ; [05](../05-projections-expliquees.md) et tests SEO comblent le trou.

---

## Ce que l'audit StarterKit ajoute aux docs 03–05

| Manque dans 03–05 seuls | Apport StarterKit |
|-------------------------|-------------------|
| Procédure import reproductible | Gates 0–9, scripts, manifest |
| Preuve par consommateur | `consumer_contract.yaml` |
| Refus d'écriture aveugle | pending_review / pending_ddl |
| Séparation mapping / écriture | Gates 2–4 avant 5–6 |

| Manque dans StarterKit seul | Apport docs 03–05 |
|-----------------------------|-------------------|
| Trois sens facets | [03](../03-memoire-mcp-facettes-graphe-projections.md) |
| Type B, reindex détaillé | [05](../05-projections-expliquees.md), [04](../04-reindexation-ghostcrab.md) |
| collection_reindex après qualify | [04 §7](../04-reindexation-ghostcrab.md) |

---

## Avocat du diable — limites de cet audit

1. **Scripts StarterKit non exécutés ici** — cette doc ne remplace pas un run réel de `audit_import_pipeline.mjs` sur votre source.
2. **Pas de validation automatique** entre ce dossier markdown et le repo StarterKit — un drift SOP futur ne sera pas détecté sans relecture.
3. **EN 05-projections-explained.md** reste orienté lab/immeuble ; l'audit porte sur la série FR 03–05.
4. Toute la doc vit dans **`docs/explanation/`** (versionnée git).

---

## Conclusion

Les docs 03–05 sont **techniquement défendables** et **renforcés** par la méthode StarterKit (gates + consumers). Ils sont **insuffisants seuls** pour un import bout-en-bout ; le StarterKit est **insuffisant seul** pour Personal (qualify, Type B, reindex fin).

Lire ensemble : **03 → 04 → 05** (architecture) + **02 → 03 → 04** (StarterKit) + **05 écarts** avant tout import production.

Suite : [02 — Méthode StarterKit](02-methode-starterkit.md)
