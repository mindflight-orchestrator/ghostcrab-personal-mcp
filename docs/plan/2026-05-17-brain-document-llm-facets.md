# Brain Document Imports: LLM, Facets, Taxonomies

Date: 2026-05-17

## Question

Dans les outils d'import documentaires MindBrain/GhostCrab, lesquels utilisent un
LLM pour qualifier le contenu selon des facettes donnees, taxonomies ou
ontologies ?

## Reponse courte

Les outils actuels utilisent deja le LLM pour profiler et contextualiser les
documents, mais pas encore pour faire une classification complete du type :

1. charger une taxonomie ou une ontologie donnee ;
2. qualifier chaque document ou chunk selon les dimensions et valeurs autorisees ;
3. valider strictement la sortie ;
4. persister les assignments dans les tables de facettes.

La plomberie de stockage existe, mais le flux LLM de classification ontologique
reste a implementer.

## Ce qui existe

### `document-profile`

`document-profile` utilise un LLM pour produire une fiche structuree du document
avant ingestion. Le profil couvre notamment :

- type de document ;
- langue ;
- juridiction ;
- autorite ;
- marqueurs de structure ;
- densite de references ;
- modele temporel ;
- splitter recommande ;
- risques ;
- confiance.

Ce profil sert surtout a choisir une strategie d'import et de chunking. Il ne
produit pas encore des assignments de facettes metier controles par une
ontologie.

References code :

- `../mindbrain/src/standalone/corpus_profile.zig`
- `../mindbrain/src/standalone/corpus_profile_prompt.zig`
- `../mindbrain/docs/document-profile.md`

### `document-profile-worker`

`document-profile-worker` consomme des jobs, appelle le profilage LLM et peut
persister les documents et chunks bruts. Avec l'option de retrieval contextuel,
il peut aussi generer un contexte par chunk.

Ce contexte ameliore la recherche hybride ou contextuelle, mais ne correspond
pas a une qualification taxonomique controlee.

References code :

- `../mindbrain/src/standalone/tool.zig`
- `../mindbrain/docs/document-profile.md`

### `document-ingest --ontology-id`

`document-ingest` accepte un `--ontology-id`, mais l'usage observe est
deterministe. Le code derive des facettes source depuis les metadonnees, la
source et les positions de chunks, puis ecrit dans `facet_assignments_raw`.

Il ne demande pas au LLM de choisir des valeurs autorisees dans une taxonomie ou
ontologie donnee.

References code :

- `../mindbrain/src/standalone/tool.zig`

### Tables et API de facettes

Le modele de donnees a deja les elements utiles pour recevoir une classification
LLM controlee :

- `ontology_namespaces`
- `ontology_dimensions`
- `ontology_values`
- `facet_assignments_raw`
- API pipeline `assignFacetRaw`

Le stockage et les primitives existent donc, mais le flux LLM qui remplit ces
assignments a partir d'une ontologie reste a ajouter.

Reference documentation :

- `../mindbrain/docs/collections.md`

## Manque fonctionnel

Le manque principal est un outil dedie qui fasse :

- chargement d'une ontologie depuis `ontology_id` ;
- selection d'une cible `document`, `chunk` ou les deux ;
- prompt LLM contraint aux dimensions et valeurs autorisees ;
- validation stricte de la sortie ;
- rejet ou marquage des valeurs hors vocabulaire ;
- persistance dans `facet_assignments_raw` avec provenance, confiance et modele
  utilise ;
- mode `--dry-run` pour verifier les assignments avant ecriture.

## Proposition d'implementation

Ajouter un subcommand MindBrain, expose ensuite par `gcp brain document`, par
exemple :

```text
document-facet-classify --db <path> --workspace-id <id> --collection-id <id> \
  --ontology-id <id> --target chunk --confidence-threshold 0.65 --dry-run
```

Comportement attendu :

1. charger les documents ou chunks de la collection ;
2. charger les dimensions et valeurs de l'ontologie ;
3. construire un prompt qui interdit les valeurs hors vocabulaire ;
4. appeler le LLM ;
5. valider la sortie JSON ;
6. ecrire les assignments valides dans `facet_assignments_raw` ;
7. inclure la provenance dans les metadonnees : modele, prompt version,
   confidence, source document/chunk, horodatage.

## Cloture de session

Travail realise dans cette session :

- analyse des outils MindBrain/GhostCrab d'import documentaire ;
- clarification du role de SQLite et du risque de lock cote commandes
  documentaires ;
- ajout d'un plan durable dans `docs/plan/2026-05-17-brain-document.md` ;
- implementation du routage `gcp brain document --db <path>` ;
- ajout de tests unitaires pour la construction des arguments et les diagnostics
  de lock ;
- documentation de l'usage `--db` dans `docs/setup/gcp-client-setup.md` ;
- clarification de la couverture LLM actuelle par rapport aux facettes,
  taxonomies et ontologies dans ce document.

Validations executees :

- `npx prettier --check bin/commands/brain-document.mjs bin/commands/brain.mjs tests/unit/brain-document-cli.test.ts docs/plan/2026-05-17-brain-document.md docs/setup/gcp-client-setup.md`
- `timeout 30s npx vitest run tests/unit/brain-document-cli.test.ts`
- `npm run typecheck`
- `git diff --check`
- `node bin/gcp.mjs brain document --help`
- `node bin/gcp.mjs brain --help`
- `node --check bin/commands/brain-document.mjs`
- `node --check bin/commands/brain.mjs`

Suite implementee :

- ajout d'une commande `qualification-vocab-list` pour lister les
  taxonomies et facettes qualifiables depuis le vocabulaire controle ;
- ajout d'une commande `document-qualify` pour qualifier les documents et
  chunks existants avec `--taxonomies <id,id>` et `--facets
  <namespace.dimension,...>` ;
- les assignments valides sont ecrits dans `facet_assignments_raw`; les
  assignments chunk acceptes sont aussi agreges au niveau document.
