/**
 * Deterministic analysis lenses for projection candidate discovery.
 * Port of starterkit analyze_projection_candidates.py lens patterns.
 */

/** @typedef {import('./analyze-projection-candidates.mjs').AnalysisPattern} AnalysisPattern */

/** @type {AnalysisPattern[]} */
export const BLIND_SPOT_MANAGER_PATTERNS = [
  {
    lens: "blind_spot_manager",
    name: "impayes_et_relances",
    label: "Impayes et relances en cours",
    business_question: "Quels coproprietaires ont des impayes ou relances actives ?",
    description: "Detecte les impayes partiels et les relances non traitees.",
    suggested_proj_type: "CONSTRAINT",
    retrieval_jobs: ["monitor", "summary"],
    kpi_hints: ["unpaid_count", "reminder_level_count"],
    required_schemas: ["immeuble:core:receipt", "immeuble:core:reminder", "immeuble:core:charge_call"],
    required_facets: ["receipt.amount", "reminder.level", "reminder.amount_due", "charge_call.amount"],
    required_edges: ["REQUIRES_REVIEW", "MATCHED_TO"],
    human_jobs: ["relancer les impayes", "prioriser les relances"],
    ai_agent_jobs: ["detecter impayes partiels", "agreger par copropriete"],
    impact_summary: "Ajoute une projection de suivi impayes avec facettes montant et niveau de relance.",
    pattern_tags: ["finance", "reminder", "syndic"]
  },
  {
    lens: "blind_spot_manager",
    name: "baux_echeance",
    label: "Baux proches de l'echeance",
    business_question: "Quels baux arrivent a echeance dans les 90 prochains jours ?",
    description: "Anticipe les renouvellements et vacances locatives.",
    suggested_proj_type: "STEP",
    retrieval_jobs: ["monitor", "list"],
    kpi_hints: ["expiring_lease_count"],
    required_schemas: ["immeuble:core:lease_contract", "immeuble:core:unit"],
    required_facets: ["lease_contract.validFrom", "lease_contract.monthly_rent", "unit.usage_status"],
    required_edges: ["LEASES", "RENTED_TO"],
    human_jobs: ["planifier renouvellement", "anticiper vacance"],
    ai_agent_jobs: ["calculer echeances", "alerter gestionnaire"],
    impact_summary: "Connecte baux, lots et menages pour pilotage locatif.",
    pattern_tags: ["lease", "expiry", "tenant"]
  },
  {
    lens: "blind_spot_manager",
    name: "quotites_anomalie",
    label: "Anomalies de quotites",
    business_question: "Quels immeubles ont des quotites qui ne totalisent pas le quota_basis ?",
    description: "Verifie la coherence des tantiemes par building.",
    suggested_proj_type: "CONSTRAINT",
    retrieval_jobs: ["aggregate", "summary"],
    kpi_hints: ["quota_delta", "anomaly_building_count"],
    required_schemas: ["immeuble:core:building", "immeuble:core:unit"],
    required_facets: ["building.quota_basis", "unit.tantiemes", "unit.quota_basis"],
    required_edges: ["CONTAINS"],
    human_jobs: ["corriger les tantiemes", "valider AG"],
    ai_agent_jobs: ["sommer tantiemes par building", "signaler ecarts"],
    impact_summary: "Projection de controle quotites pour conformite copropriete.",
    pattern_tags: ["quota", "tantiemes", "validation"]
  },
  {
    lens: "blind_spot_manager",
    name: "occupation_orpheline",
    label: "Lots sans occupation declaree",
    business_question: "Quels lots n'ont ni proprietaire occupant ni locataire declare ?",
    description: "Repere les lots vacants ou mal renseignes.",
    suggested_proj_type: "FACT",
    retrieval_jobs: ["monitor", "graph_traversal"],
    kpi_hints: ["vacant_unit_count", "orphan_occupancy_count"],
    required_schemas: ["immeuble:core:unit", "immeuble:core:person", "immeuble:core:household"],
    required_facets: ["unit.usage_status", "person.name", "household.household_status"],
    required_edges: ["OCCUPIES", "OWNS", "PRIMARY_RESIDENCE_OF"],
    human_jobs: ["clarifier occupation", "mettre a jour registre"],
    ai_agent_jobs: ["detecter lots sans lien occupation", "croiser baux et menages"],
    impact_summary: "Ameliore la fiabilite du registre des occupations.",
    pattern_tags: ["occupancy", "vacant", "data_quality"]
  },
  {
    lens: "blind_spot_manager",
    name: "manager_attention_today",
    label: "Top actions manager du jour",
    business_question: "Quelles 3 a 5 actions doivent remonter au gestionnaire aujourd'hui ?",
    description: "Resume les arbitrages qui changent le resultat de la journee.",
    suggested_proj_type: "STEP",
    retrieval_jobs: ["summary", "monitor"],
    kpi_hints: ["top_action_count", "overdue_critical_count"],
    required_schemas: ["immeuble:core:reminder", "immeuble:core:decision", "immeuble:core:lease_contract"],
    required_facets: ["reminder.level", "decision.date", "lease_contract.validFrom"],
    required_edges: ["REQUIRES_REVIEW", "LEASES"],
    human_jobs: ["savoir quoi traiter aujourd'hui"],
    ai_agent_jobs: ["prioriser par impact et urgence"],
    impact_summary: "Projection d'attention quotidienne consommant les autres signaux.",
    pattern_tags: ["attention", "daily_brief", "prioritization"]
  }
];

/** @type {AnalysisPattern[]} */
export const JTBD_HUMAN_PATTERNS = [
  {
    lens: "jtbd_human",
    name: "gestionnaire_decide_arbitrer",
    label: "JTBD gestionnaire: arbitrer avec preuves",
    business_question: "Quand plusieurs signaux se contredisent, quelle decision puis-je prendre avec suffisamment de preuves ?",
    description: "Vue d'arbitrage humain: preuves, confiance, responsabilite et impact.",
    suggested_proj_type: "STEP",
    retrieval_jobs: ["summary", "monitor", "graph_traversal"],
    kpi_hints: ["decision_confidence", "evidence_gap_count"],
    required_schemas: ["immeuble:core:decision", "immeuble:core:reminder", "immeuble:core:coda_entry"],
    required_facets: ["decision.date", "coda_entry.amount", "coda_entry.status"],
    required_edges: ["MATCHED_TO", "REQUIRES_REVIEW"],
    human_jobs: ["decider", "arbitrer", "expliquer la decision"],
    ai_agent_jobs: ["compiler preuves", "montrer contradictions"],
    impact_summary: "Projection d'aide a la decision centree sur preuve et confiance.",
    pattern_tags: ["jtbd", "human_manager", "decision"]
  },
  {
    lens: "jtbd_human",
    name: "syndic_coordinate_intervention",
    label: "JTBD syndic: coordonner la prochaine intervention",
    business_question: "Que faut-il coordonner pour la prochaine intervention sur un lot ou une zone commune ?",
    description: "Vue terrain: acces, preconditions, equipements communs.",
    suggested_proj_type: "STEP",
    retrieval_jobs: ["monitor", "graph_traversal"],
    kpi_hints: ["ready_intervention_count", "blocked_intervention_count"],
    required_schemas: ["immeuble:core:unit", "immeuble:core:shared_space", "immeuble:core:shared_equipment"],
    required_facets: ["unit.usage_status", "shared_space.category", "shared_equipment.equipment_type"],
    required_edges: ["CONTAINS", "USES_COMMON"],
    human_jobs: ["coordonner intervention", "eviter attente"],
    ai_agent_jobs: ["verifier preconditions", "detecter conflits ressources"],
    impact_summary: "Complete les projections manager avec une vue execution terrain.",
    pattern_tags: ["jtbd", "syndic", "coordination"]
  }
];

/** @type {AnalysisPattern[]} */
export const JTBD_AI_PATTERNS = [
  {
    lens: "jtbd_ai",
    name: "agent_watchtower_prioritize",
    label: "JTBD agent IA: tour de controle priorisee",
    business_question: "Quels signaux dois-je surveiller et remonter sans saturer le gestionnaire ?",
    description: "Role agent IA de veille: filtrage, explication, priorisation.",
    suggested_proj_type: "STEP",
    retrieval_jobs: ["monitor", "summary"],
    kpi_hints: ["signal_to_noise_ratio", "escalated_signal_count"],
    required_schemas: ["immeuble:core:reminder", "immeuble:core:lease_contract", "immeuble:core:unit"],
    required_facets: ["reminder.level", "lease_contract.validFrom", "unit.usage_status"],
    required_edges: ["REQUIRES_REVIEW", "LEASES"],
    human_jobs: ["recevoir uniquement les sujets qui meritent attention"],
    ai_agent_jobs: ["surveiller", "prioriser", "expliquer", "escalader"],
    impact_summary: "Formalise une projection consommee par agent IA avant synthese humaine.",
    pattern_tags: ["jtbd", "ai_agent", "watchtower"]
  },
  {
    lens: "jtbd_ai",
    name: "agent_reconciliation_detective",
    label: "JTBD agent IA: detective de reconciliation CODA",
    business_question: "Quelles incoherences entre paiements CODA et appels de charges dois-je investiguer ?",
    description: "Role agent IA de qualite de donnees: rapprochement finance.",
    suggested_proj_type: "CONSTRAINT",
    retrieval_jobs: ["monitor", "graph_traversal"],
    kpi_hints: ["reconciliation_issue_count", "unmatched_coda_count"],
    required_schemas: ["immeuble:core:coda_entry", "immeuble:core:charge_call", "immeuble:core:receipt"],
    required_facets: ["coda_entry.amount", "coda_entry.status", "charge_call.amount", "receipt.amount"],
    required_edges: ["MATCHED_TO", "ALLOCATED_TO"],
    human_jobs: ["etre alerte quand la donnee n'est pas fiable"],
    ai_agent_jobs: ["rapprocher", "verifier", "investiguer"],
    impact_summary: "Projection agent specialisee reconciliation finance.",
    pattern_tags: ["jtbd", "ai_agent", "reconciliation"]
  }
];

/** @type {Record<string, AnalysisPattern[]>} */
export const LENS_PATTERNS = {
  blind_spot_manager: BLIND_SPOT_MANAGER_PATTERNS,
  jtbd_human: JTBD_HUMAN_PATTERNS,
  jtbd_ai: JTBD_AI_PATTERNS
};

export const VALID_PROJ_TYPES = new Set(["FACT", "GOAL", "STEP", "CONSTRAINT"]);
export const VALID_ARTIFACT_KINDS = new Set(["analysis_plan", "live_answer_view", "answer_snapshot", "evidence_pack"]);
