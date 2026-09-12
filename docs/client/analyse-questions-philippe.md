# Préparation réunion — questions de Philippe (juriste) à François, et comment y répondre

Rôles : Philippe est un juriste qui construit SyntheseLLM ; il écrit à François (mon frère), qui lui a transmis les concepts MindBrain. L'ébauche « Bonjour, tes deux questions… » est la réponse de François à Philippe, que nous préparons ensemble.
Source : `docs/client/question-juridique.md` (message de Philippe à François en août, ses deux questions de septembre, l'ébauche de réponse).
Réponse rédigée sur cet état : `reponse-philippe-etat-actuel.md`.
Vérifié le 2026-09-11 contre `../ghostcrab-mcp` (pg_mindbrain 3.1), ce dépôt (Personal/SQLite) et `../belgian-legal-archive`.

## 1. Ce que Philippe a déjà construit (SyntheseLLM)

| Brique chez lui | Ce qu'il en dit |
|---|---|
| Conversion documentaire | Il y tient, la garde extérieure. Produit pages, passages, coordonnées, versions, hash. |
| Extraction | Passages, entités, assertions, provenance. Ouvert entre MindBrain et des composants standards « autour de ses propres contrats ». |
| Modèle relationnel | assertion / événement / preuve / question, « construit aux trois quarts, pas exploité ». |
| Sorties de modèle | Marquées candidats dès l'origine. Indicateurs « à revoir » calculés par le pipeline, file de revue produite, mais aucun verdict humain persistant. En cours d'ajout. |
| Confiance | Cinq axes stockés séparément : extraction, fiabilité de la source, corroboration, poids probatoire, validation. Le champ « confiance d'extraction » existe mais n'est alimenté par rien. |
| Diagnostics de couverture | Corpus → grille (ce que le corpus montre et que la grille n'attrape pas) et grille → corpus (ce que la grille demande et que le corpus ne documente pas). |
| Métrique de base | 70 % des assertions reliées à la fois à un passage et à une pièce. |
| Découpage | dossier / collections documentaires, index à facettes. |
| Types de dossier | TBox « expertise », « triage », « veille documentaire ». Exemples d'objets : contrat, partie, rapport, réception du 14 mars, réserve n°17. Distinction recette technique / réception contractuelle. Domaine probable : expertise judiciaire en construction/immobilier. |

Posture de Philippe : « je n'ai pas décidé MindBrain ou pas MindBrain », « je m'approprie le domaine », veut le partage des responsabilités plus que les commandes. Il évalue, et il teste réellement (il a fait l'ingestion native et l'import structuré). Risque : qu'il conclue que MindBrain n'est qu'un store de graphe. Atout : c'est un juriste praticien qui a déjà formalisé les objets du métier (pièce, passage, assertion, qualification, verdict) ; c'est le domaine qui manque à l'archive juridique belge.

## 2. Le vocabulaire de Philippe → nos objets

| Lui | Pro (pg_mindbrain 3.1) | Personal (ce dépôt) | Archive juridique belge |
|---|---|---|---|
| TBox « expertise » | `mb_ontology.registry_ontologies`, `ontology_releases` (snapshot immuable, version, hash), loadouts (`compliance`, `knowledge-base` les plus proches) | `ghostcrab_schema_register`, `ghostcrab_ontology_import`, loadouts | `belgian-law::core`, `belgian-case-law::core`, AI Act (3 couches TBox structurelle / TBox sémantique / ABox intentionnelle) |
| Une TBox, plusieurs dossiers | `workspace_ontology_subscriptions` (release épinglée, overlay local) ; un workspace = un dossier ou un tenant | un workspace par dossier | un workspace `belgian-law` |
| ABox / seeds / objets connus | `entities_raw`, `relations_raw`, `agent_facts` via `structured_import_apply`. Aucune primitive « seeds de dossier » (`loadout_seed` seed une TBox, pas des objets) | `ghostcrab_upsert`, `ghostcrab_remember`, `gcp brain structured-import` | `rows.json` + `edges.json` → structured import |
| Axes d'investigation / questions | business queries (`business_query_answer`, `query_templates`), answer artifacts (`analysis_plan`, `live_answer_view`, `answer_snapshot`, `evidence_pack`). « Answer path » n'est pas un objet stocké côté Pro | `ghostcrab_business_query_*`, `ghostcrab_projections_list`, `docs/methodology/graphing/spec.md` | projections AI Act (`obligation_cascade`, `penalty_path`…) |
| Passage | chunk = (workspace, collection, doc_id, chunk_index), `chunks_raw` | `search_documents` / chunks de collection | enregistrement preuve : `source_pdf_sha256`, `physical_page`, `section_eid`, `quotation_text`, `confidence` (`relations/constitutional-court-91-2024-…json`) |
| Assertion | ligne `agent_facts` : `version`, `supersedes`, `valid_from`, `valid_until`, `confidence` sur relation | idem, plus états candidate/accepted (mémoire personnelle) | échelle `official_assertion` / `explicit_reference` / `extracted_proposal` / `reviewed_assertion` (seul `explicit_reference` utilisé) |
| Provenance | `structured_import_provenance` (source_ref ↔ fact ↔ entity), `validate_provenance` | idem | PROV-O, `transform_runs`, `validation_results`, events append-only |
| Pièce / version du document | `documents_raw` + `doc_nanoid`, `document_links_raw` | collections | Work / Expression / Manifestation, identité `/akn/be/…`, ELI et NUMAC en alias seulement |
| Objet → passages de preuve | `entity_chunks_raw` → `ghostcrab_graph_entity_chunks` | `ghostcrab_entity_chunks`, `ghostcrab_combined_search`, `ghostcrab_csearch`, `ghostcrab_graph_path` (absents du Pro) | relation preuve ci-dessus |
| Constat d'expert / verdict | motif uniforme `pending → approved/rejected → applied` (`document_qualification_proposals`, `knowledge_patch`, `reasoner_proposals`, `quality_remediation_actions`). Pas d'objet « verdict sur une assertion » | états candidate / accepted / retracted / archived | ontologies en `draft`, publication sous `LEGALONTOLOGY_PUBLISH=1` ; PR d'enrichissement relues (AI Act) |
| Contradiction entre assertions | rien au niveau ABox (`ontology_conflicts` = définitions de types) ; proches : `contract_violations`, `rule_events`, `facet_reconcile` | rien | collision d'alias ou sources officielles contradictoires → import bloqué, quarantaine |
| Réponse figée / vue actualisable / delta | `answer_snapshot` vs `live_answer_view` + `answer_events` (from_version → to_version) — c'est son « quatrième artefact » | `ghostcrab_live_refresh`, `ghostcrab_artifact_get` | — |
| Couverture dans les deux sens | `ghostcrab_coverage`, `ontology_coverage_ref`, gap rules, `quality_convergence` | `ghostcrab_coverage`, `graph_gap_rules` | 8 anomalies publiées dans le slice de référence |
| Temporalité des normes | `valid_from` / `valid_until` sur les faits, `facet_temporal_resolve` | fenêtre de validité complète (v0.6.8) | Lot 7 planifié, rien d'implémenté |

## 3. Question 1 décodée : partage des responsabilités

Il demande : jusqu'où puis-je donner documents + ontologie + seeds + questions et laisser MindBrain construire, qualifier, consolider ?

Réponse honnête :
- Le pipeline documentaire natif fait normalize → stage → chunk → profile (LLM) → qualify avec `review_mode='proposal_first'`. C'est « construire et qualifier », mais piloté par prompt packs et facettes, pas par des seeds de dossier ni des axes d'investigation.
- L'import structuré prend exactement ce qu'il produit déjà (entités, relations, faits, provenance). C'est la route qu'il utilise, et c'est aussi celle que nous utilisons nous-mêmes pour la législation belge (le pipeline documentaire y est le lot 11.3, pas fait).
- La boucle « seeds + questions dirigent l'extraction » n'existe pas dans le moteur. C'est un workflow d'agent au-dessus. L'ébauche de réponse le dit bien.
- Ce que le moteur apporte qu'il n'a pas : releases d'ontologie partagées entre dossiers, versionnage et fenêtres de validité des faits, answer artifacts avec snapshot/delta, convergence qualité, et bientôt la mémoire personnelle transactionnelle.

## 4. Question 2 décodée : retrieval après import structuré

Il demande : pourquoi mes faits importés ne ressortent pas comme les documents ingérés, et pourquoi je ne remonte plus à mes passages ? Ses trois hypothèses : mauvaise primitive / import destiné à autre chose / MindBrain suppose son pipeline natif.

Cause vérifiée dans le code Pro :
- L'import structuré n'accepte aucun passage. Il écrit `agent_facts`, `entities_raw`, `relations_raw`, provenance. Jamais `documents_raw`, `chunks_raw`, `entity_chunks_raw`, ni les tables vecteur.
- `structured_import_reindex` ne fait que `reindex_graph` et renvoie littéralement `graph_projection_only`. Le scope `facets` est un no-op.
- Les faits importés sont trouvables par `ghostcrab_search` (BM25 sur `agent_facts.bm25_vector`), mais ce tsvector est généré avec la config `'english'` sur du texte français, et `embedding` reste NULL sans `pnpm embeddings:backfill`.
- Les documents ingérés ne sont pas dans cet index BM25. Ils sont atteints par `collection_facet_search`, par les vecteurs de chunks et par le grounding graphe.
- Donc deux stores disjoints, deux surfaces de retrieval disjointes. Le pont objet → passage est `entity_chunks_raw`, que son import ne peut pas remplir.
- Vérifié plus loin : `entity_chunks_raw` n'est écrit que par `mb_core.apply_document_links` (candidats de kind `entity_chunk` : entité par id ou type+nom, collection/doc/chunk_index, `role`, `confidence`) et par la restauration de backup. Et `apply_document_links` n'est appelé que par `extract_document_links`, un extracteur regex interne au pipeline documentaire natif (URLs, etc.). Aucun tool MCP, aucune commande CLI, aucun chemin de l'import structuré ne permet à Philippe de fournir ses propres liens assertion → passage. Le tool `ghostcrab_graph_entity_chunks` est en lecture seule.

Verdict : son hypothèse 3 est juste, et l'hypothèse 1 aussi en partie (il ne connaît probablement pas `graph_entity_chunks` ni le backfill d'embeddings). Ce n'est pas un contresens de sa part, c'est une frontière de produit.

Ce que ça implique pour nous :
- Décision produit : exposer `apply_document_links` (kind `entity_chunk`) via l'import structuré ou un tool MCP dédié, pour que des liens assertion → passage fournis de l'extérieur soient acceptés. Aujourd'hui le protocole en deux temps (ingérer les documents pour obtenir des chunks, puis importer les assertions) s'arrête à la porte : les chunks existent, les assertions existent, rien ne les relie sauf l'extracteur natif.
- Le Personal a déjà `combined_search`, `csearch`, `entity_chunks`, `graph_path`. Le Pro n'a pas de recherche combinée faits + chunks. C'est précisément ce qu'il attend.
- La config `'english'` du tsvector est un défaut réel pour tout corpus juridique francophone.

## 5. Ébauche de réponse : ce qui tient, ce qui manque

Tient : la séparation passage / assertion / qualification / validation ; ne pas vectoriser les assertions comme des documents ; deux moteurs de retrieval qui se rejoignent sur l'identifiant de passage ; axes d'investigation traités comme projections plutôt que comme ontologies.

Manque ou surpromet :
- Ne donne pas la cause concrète (stores disjoints, reindex graphe seul). Il a besoin de savoir que ce n'est pas lui.
- « La projection réunit les deux » : le Pro n'a pas aujourd'hui de surface qui joigne faits et chunks. Ne pas le promettre sans dire que c'est à construire.
- « Answer path » est un terme de notre méthodologie Personal, pas une primitive Pro.
- Silence sur le verdict humain persistant : nous avons le motif proposal/review partout sauf sur l'assertion elle-même. Sa couche de validation est une bonne spec pour nous.

## 6. Questions à faire poser par François à Philippe (ou à lui poser directement)

1. À quoi ressemblent ses identifiants de passage (hash de fichier, page, offsets, id de paragraphe) et survivent-ils à une reconversion ?
2. Par quel chemin importe-t-il (CLI, tool MCP, mapping, `edges_mode`) et que met-il dans `content` des faits ?
3. Langue et volume du corpus, besoin lexical ou sémantique.
4. Version utilisée : Pro Postgres ou Personal SQLite ? (probablement Pro).
5. Comment veut-il stocker ses cinq axes de confiance : propriétés de relation, facettes, ou faits séparés ?
6. Forme souhaitée du verdict d'expert : objet séparé qui pointe l'assertion, ou état de l'assertion ?
7. Ses dossiers citent-ils la législation ? Si oui, `CITES` vers nos `legal_article` est un pont naturel entre son ABox et l'archive belge.

## 7. Plan de réponse détaillé pour François

### Réponse à la question 1 (partage des responsabilités)

Message : « Ton découpage est le bon, et il correspond à des objets qui existent. Ce que le moteur ne fait pas, c'est la boucle dirigée par tes questions. »

| Sa couche | Ce que François peut affirmer | Statut |
|---|---|---|
| Conversion documentaire | À garder chez lui. MindBrain veut des passages avec identifiants stables, pas des PDF. | vrai aujourd'hui |
| TBox « expertise » partagée | Une release d'ontologie versionnée, souscrite par chaque workspace-dossier, avec overlay local possible. | vrai aujourd'hui (Pro) |
| ABox / seeds | Import structuré d'entités, relations et faits avec provenance. Pas de notion de « seed qui guide l'extraction ». | vrai, avec la limite |
| Extraction | Soit son pipeline (import structuré), soit le pipeline natif (profile LLM + qualification en proposal_first). Les deux sont légitimes, mais ils n'aboutissent pas au même endroit (voir Q2). | vrai |
| Axes d'investigation | Pas une ontologie : des business queries et des answer artifacts (plan d'analyse, vue vivante, snapshot figé, dossier de preuves). Son « quatrième artefact » (rejouer une analyse sur l'état courant et voir le delta) est exactement vue vivante vs snapshot avec événements de version. | vrai (Pro) |
| Consolidation / curation | Reasoner proposals, convergence qualité, remédiations proposées → approuvées → appliquées, gap rules. | vrai, mais à montrer |
| Verdict d'expert | Motif proposé / approuvé / rejeté partout, mais pas d'objet verdict attaché à une assertion. Sa couche de validation est une spec que nous prendrions volontiers. | manque |
| « Documents + ontologie + seeds + questions, et il construit » | Workflow d'agent au-dessus du moteur, pas une obligation du moteur. | position à assumer |

### Réponse à la question 2 (retrieval après import structuré)

Message : « Tu ne rates pas une primitive. Les deux routes atterrissent dans deux stores distincts, et le lien objet → passage n'est aujourd'hui écrit que par le pipeline natif. C'est une frontière du produit, et nous allons l'ouvrir. »

Ce qu'il faut lui dire tel quel :
1. L'import structuré produit faits + entités + relations + provenance, et un reindex graphe seul. Aucun passage, aucun embedding.
2. Ses faits sont trouvables en lexical, mais l'analyseur est configuré en anglais (à corriger pour du français juridique) ; le sémantique demande un backfill d'embeddings explicite.
3. Les documents ingérés vivent dans collections / chunks, atteints par facettes, vecteurs et grounding graphe, jamais par la recherche de faits.
4. Le lien entité → chunk existe en base et se lit par `ghostcrab_graph_entity_chunks`, mais seule l'extraction native le remplit.

Ce que nous devons décider avant de répondre (produit) :
- Ouvrir l'écriture de liens `entity_chunk` à l'import structuré ou à un tool MCP. C'est le déblocage minimal : il ingère ses passages (route native, sans profile LLM) puis importe ses assertions avec leurs liens vers les chunks. Effort modéré : la fonction SQL existe, il manque le tool et le format de mapping.
- Une recherche combinée faits + chunks côté Pro. Le Personal l'a (`combined_search`, `csearch`, `graph_path`). Sans elle, la promesse « la projection réunit les deux » n'est pas tenable.
- Passer le tsvector des faits, entités et projections en configuration française ou `simple`.

Ce qu'il ne faut pas faire : lui conseiller de vectoriser ses assertions comme des documents pour retrouver le recall. L'ébauche a raison de le refuser ; en juridique, l'assertion calculée ne peut pas se substituer à la pièce.

### Protocole de test à lui proposer

Un type de dossier, une TBox stable, trois questions d'investigation, puis vérifier les deux parcours :
- question → assertion (recherche de faits ou graphe) → chunks liés → document versionné → pièce ;
- passage (recherche de collection) → entités liées → assertions → qualification → verdict.
Le critère de réussite est son propre chiffre : passer de 70 % à 100 % d'assertions reliées à un passage et à une pièce, avec identifiants qui survivent à une reconversion.

### Lien avec l'archive juridique belge

Son ABox de dossier (contrat, réception, réserve, rapport d'expert) cite de la législation. Notre archive a des articles avec identité stable (Work / Expression / Manifestation, `/akn/be/…`, ELI en alias) et un enregistrement de passage de preuve (hash, page, eid, citation verbatim, confiance). Une relation `CITES` de son assertion vers notre `legal_article` est le premier pont concret, et son échelle de validation rejoint notre échelle official / explicit_reference / extracted_proposal / reviewed. Ce qu'il apporte : le domaine « dossier / expertise / verdict » que l'archive n'a pas.
