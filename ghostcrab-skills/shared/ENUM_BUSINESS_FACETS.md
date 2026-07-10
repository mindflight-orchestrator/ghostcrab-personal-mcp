# Business enum facets (LinkML / domain)

**Intake:** [ONBOARDING_CONTRACT.md](./ONBOARDING_CONTRACT.md). **Path/content ingest facets:** [PATH_CONTENT_FACETS.md](./PATH_CONTENT_FACETS.md) — different vocabulary, do not mix.

## Mandatory naming rule

Every **business enum facet** derived from LinkML or a domain ontology **must** use:

```text
<module>.<slot_snake_case>
```

| Part              | Rule                             | Example                                                |
| ----------------- | -------------------------------- | ------------------------------------------------------ |
| `module`          | LinkML file stem without `.yaml` | `administrative`, `comptabilite`, `missions`           |
| `slot_snake_case` | Enum slot name in snake_case     | `formule_service`, `statut_exercice`, `statut_mission` |

**Full facet key examples:** `administrative.formule_service`, `comptabilite.statut_exercice`, `missions.statut_mission`.

Apply this rule **automatically** during ontology alignment — do not wait for the user to request prefixing.

## Forbidden patterns

- Bare slots: `formule_service`, `statut_exercice` (missing module prefix)
- Legacy noise: `com_*`, `tec_*`, `serenity_p3.property.*`
- Reusing path/content ingest keys (`path_top_level`, `content_class`) for business enums
- Mixing multiple module prefixes inside one facet schema without explicit `module` metadata

## Two facet families (do not confuse)

| Family              | When                                          | Doc                                                |
| ------------------- | --------------------------------------------- | -------------------------------------------------- |
| Path/content ingest | Repository files, vault paths, code shape     | [PATH_CONTENT_FACETS.md](./PATH_CONTENT_FACETS.md) |
| Business enum       | LinkML slots, domain status/type vocabularies | **this file**                                      |

## MCP workflow (Phase B modeling, after user confirmation)

Order for multi-module domains (example: Serenity `serenity-coproprietes-v4`):

### 1. Import LinkML per module

```json
{
  "workspace_id": "serenity-coproprietes-v4",
  "ontology_id": "serenity-coproprietes-v4::administrative",
  "input_path": "ontology/administrative.yaml",
  "source_format": "linkml"
}
```

CLI alternative: `gcp brain ontology compile --workspace-id … --ontology-id … --input ontology/<module>.yaml` (dry-run first).

Recommended import order when modules depend on each other: `production` → `administrative` → `decisionnel` → `technique` → `comptabilite` → `missions`.

### 2. Register facet schema per module

`ghostcrab_schema_register` with `target: "facets"`:

```json
{
  "target": "facets",
  "definition": {
    "schema_id": "serenity-coproprietes-v4:administrative",
    "description": "Administrative module enum facets",
    "module": "administrative",
    "ontology_id": "serenity-coproprietes-v4::administrative",
    "source_linkml": "ontology/administrative.yaml",
    "status": "provisional",
    "facet_keys": [
      "administrative.formule_service",
      "administrative.statut_mandat"
    ],
    "enum_facets": {
      "administrative.formule_service": [
        "free",
        "essentiel",
        "confort",
        "premium",
        "platinium"
      ],
      "administrative.statut_mandat": [
        "actif",
        "renouvele",
        "resilie",
        "non_renouvele"
      ]
    },
    "generated_from": "linkml"
  }
}
```

### 3. Register each enum facet definition

`ghostcrab_facet_register` for every key in `enum_facets`:

```json
{
  "definition": {
    "facet_name": "administrative.formule_service",
    "label": "Formule de service",
    "description": "Administrative service tier for copropriété management"
  }
}
```

Unknown facet names require explicit `label` or `description`.

### 4. Validate

| Check                                                                       | Expected                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `ghostcrab_schema_list(domain="serenity-coproprietes-v4", target="facets")` | One schema per module (6 for Serenity V4)                         |
| `ghostcrab_facet_inspect("administrative.formule_service")`                 | Known facet                                                       |
| `ghostcrab_facet_inspect("comptabilite.statut_exercice")`                   | Known facet                                                       |
| `ghostcrab_workspace_inspect("serenity-coproprietes-v4")`                   | Empty semantic tables **before structured-import** — not an error |
| `ghostcrab_projections_list("serenity-coproprietes-v4")`                    | Empty **before projections phase** — not an error                 |

Use `ghostcrab_facet_catalog` to list registered definitions; use `ghostcrab_facet_validate` before bulk facet writes.

## Serenity V4 reference (39 enum facets)

Reference catalog for `serenity-coproprietes-v4` — register via workflow above; do not seed automatically.

### production

| Facet                                    | Values                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `production.langue_gestion`              | `fr`, `nl`, `de`                                                                   |
| `production.statut_copropriete`          | `en_gestion_active`, `en_transition_entrante`, `en_transition_sortante`, `archive` |
| `production.type_personne`               | `personne_physique`, `personne_morale`                                             |
| `production.langue`                      | `fr`, `nl`, `de`                                                                   |
| `production.statut_actif`                | `actif`, `ancien`, `archive`                                                       |
| `production.mode_correspondance_prefere` | `email`, `courrier_postal`, `courrier_postal_recommande_convocations`              |
| `production.langue_correspondance`       | `fr`, `nl`, `de`                                                                   |

### administrative

| Facet                                       | Values                                                                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `administrative.formule_service`            | `free`, `essentiel`, `confort`, `premium`, `platinium`                                                                 |
| `administrative.statut_mandat`              | `actif`, `renouvele`, `resilie`, `non_renouvele`                                                                       |
| `administrative.type_lot`                   | `appartement`, `cave`, `parking`, `parking_pmr`, `garage`, `carport`, `emplacement_velo`, `local_commercial`, `bureau` |
| `administrative.statut_occupation_lot`      | `occupe_proprietaire`, `occupe_locataire`, `vacant`, `condamne_decision_ag`                                            |
| `administrative.type_droit_reel`            | `pleine_propriete`, `nue_propriete`, `usufruit`, `indivision`                                                          |
| `administrative.statut_dossier`             | `en_cours`, `cloture`, `actif`, `revoque`, `expire`, `termine`                                                         |
| `administrative.type_mandat_representation` | `general`, `ag_uniquement`, `ponctuel`                                                                                 |
| `administrative.type_occupation`            | `locataire`, `occupant_titre_gratuit`                                                                                  |

### comptabilite

| Facet                                     | Values                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `comptabilite.statut_exercice`            | `en_cours`, `en_cours_de_cloture`, `approuve`                        |
| `comptabilite.statut_budget`              | `en_vigueur`, `remplace`                                             |
| `comptabilite.type_appel_fonds`           | `fdro`, `fdrs`, `fdrop`                                              |
| `comptabilite.statut_paiement`            | `emis`, `partiellement_paye`, `solde`                                |
| `comptabilite.type_decompte`              | `annuel_cloture`, `ponctuel_mutation_sortant`, `attestation_fiscale` |
| `comptabilite.statut_facture_fournisseur` | `en_attente_reception`, `recue`, `codifiee`, `payee`, `en_litige`    |

### decisionnel

| Facet                            | Values                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `decisionnel.type_assemblee`     | `ago`, `age`, `agc`                                                             |
| `decisionnel.statut_convocation` | `brouillon`, `envoyee`, `completee`                                             |
| `decisionnel.statut_decision`    | `adoptee`, `rejetee`, `reportee`, `annulee`, `executee`, `en_attente_execution` |

### technique

| Facet                              | Values                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `technique.type_partie`            | `commune`, `privative`                                                                                                                                                      |
| `technique.statut_demande_travaux` | `recue`, `en_traitement`, `en_offre`, `en_intervention`, `en_attente_retour_tiers`, `en_observation`, `annulee`, `cloturee`, `sans_suite`                                   |
| `technique.statut_offre_prix`      | `en_attente`, `en_attente_apres_relance`, `en_attente_fournisseur_amont`, `acceptee`, `acceptee_conditionnelle`, `refusee`, `soumise_ag`, `abandon_pas_reponse_fournisseur` |
| `technique.statut_intervention`    | `a_planifier`, `planifiee`, `confirmee`, `realisee`, `annulee`, `cloturee`                                                                                                  |
| `technique.statut_technique`       | `actif`, `inactif`, `a_remplacer`, `cloture`                                                                                                                                |

### missions

| Facet                                | Values                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missions.type_mission`              | `gestion_courante`, `sinistre`, `litige`, `onboarding`, `mutation`, `mise_a_jour_signaletique`, `rappel_coproprietaire`, `travaux`, `ag_supplementaire`, `releve_periodique`, `rappel_reglement`, `mediation`, `validation_documentaire`, `autre` |
| `missions.qualification_commerciale` | `usuelle`, `speciale`                                                                                                                                                                                                                             |
| `missions.statut_mission`            | `ouverte`, `en_cours`, `en_attente_tiers`, `en_attente_retour_fournisseur`, `en_attente_expertise`, `tiers_a_recontacter`, `cloturee`, `sans_suite`                                                                                               |
| `missions.origine_signalement`       | `coproprietaire`, `occupant`, `commercant`, `syndic_constat_propre`, `tiers`, `organisme_controle`, `fournisseur`, `automatique`                                                                                                                  |
| `missions.canal`                     | `email`, `telephone`, `telephone_message_vocal`, `telephone_rappel_sortant`, `courrier`, `visite`, `portail`, `interne`                                                                                                                           |
| `missions.statut_signalement`        | `recu`, `rattache_mission`, `sans_suite`, `ecarte_suspicion_fraude`, `document_illisible`, `erreur_identification`                                                                                                                                |
| `missions.famille_evenement_mission` | `communication`, `reference_objet`                                                                                                                                                                                                                |
| `missions.sens_communication`        | `entrant`, `sortant`, `interne`                                                                                                                                                                                                                   |
| `missions.statut_sinistre`           | `ouvert`, `en_qualification`, `en_expertise`, `en_travaux`, `en_indemnisation`, `en_attente_tests_complementaires`, `responsabilite_indeterminee`, `cloture`                                                                                      |
| `missions.statut_litige`             | `ouvert`, `en_mise_en_demeure`, `en_procedure`, `en_execution`, `cloture`                                                                                                                                                                         |

## Related

- [SCHEMA_DESIGN.md](./SCHEMA_DESIGN.md) — schema and facet design rules
- [MCP_VS_GCP_ROUTING.md](./MCP_VS_GCP_ROUTING.md) — MCP vs CLI for ontology and facets
- [STARTERKIT_PATHS.md](./STARTERKIT_PATHS.md) — where `ontology/<module>.yaml` lives in delivery projects
