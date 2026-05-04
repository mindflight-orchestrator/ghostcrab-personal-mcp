import { z } from "zod";

import {
  createToolSuccessResult,
  registerTool,
  type ToolHandler
} from "../registry.js";

export const GuidanceInput = z.object({
  goal: z
    .string()
    .trim()
    .min(1, "goal is required: describe what you want to model or build.")
    .max(4_096),
  workspace_id: z.string().min(1).optional()
});

// ---------------------------------------------------------------------------
// Multilingual synonym / alias expansion for NL-to-family routing
// ---------------------------------------------------------------------------

interface FamilyAliasBank {
  /** Lowercased keywords and multi-word phrases, FR + EN + slang. */
  terms: string[];
  /** Short natural-language expansions (embedded alongside DB signal content). */
  expansions: string[];
}

/**
 * Expanded pattern bank per activity family.
 * Covers FR/EN, slang, abbreviations, non-exemplar phrasings.
 * Used for both keyword scoring and as embedding anchors.
 */
const FAMILY_ALIAS_BANK: Record<string, FamilyAliasBank> = {
  "workflow-tracking": {
    terms: [
      "kanban", "board", "backlog", "wip", "column", "task", "todo",
      "to-do", "to do", "checklist", "sprint", "workflow", "trello",
      "jira", "asana", "notion", "project board", "task board",
      "tableau", "tâche", "tâches", "colonne", "étape", "suivi",
      "flux de travail", "backlog produit", "en cours", "à faire",
      "fait", "done", "doing", "planification", "planning",
      "ticketing", "ticket", "issue tracker", "issues", "roadmap",
      "feuille de route", "milestone", "jalon", "gestion de projet",
      "project management", "work items", "story", "stories",
      "user story", "epic", "epics"
    ],
    expansions: [
      "I want to track tasks through stages on a board",
      "Je veux suivre mes tâches avec un kanban",
      "build a task management system with columns",
      "organiser mon travail en colonnes et étapes"
    ]
  },
  "software-delivery": {
    terms: [
      "release", "deploy", "deployment", "pr", "pull request",
      "merge request", "migration", "blocker", "bug", "bugfix",
      "hotfix", "ci", "cd", "ci/cd", "pipeline ci", "build",
      "test", "tests", "qa", "staging", "prod", "production",
      "service", "dependency", "version", "versioning", "semver",
      "git", "branch", "feature branch", "livraison", "mise en prod",
      "déploiement", "correctif", "branche", "intégration continue",
      "livraison continue", "régression", "regression"
    ],
    expansions: [
      "track releases, PRs, and deployments",
      "suivre les bugs et les pull requests",
      "manage my software delivery pipeline",
      "gérer mes déploiements et releases"
    ]
  },
  "incident-response": {
    terms: [
      "incident", "outage", "latency", "alert", "runbook",
      "sla", "slo", "degraded", "downtime", "pager", "on-call",
      "oncall", "postmortem", "post-mortem", "root cause",
      "rca", "impact", "severity", "p0", "p1", "critical",
      "panne", "interruption", "alerte", "dégradé", "temps de réponse",
      "astreinte", "cause racine", "indisponibilité",
      "escalation", "escalade", "mitigation",
      "résolution", "diagnostic", "triage"
    ],
    expansions: [
      "manage incidents and track their resolution",
      "gérer les incidents et les pannes de production",
      "track outages, blockers, and runbook execution",
      "suivre les alertes et les impacts sur les services"
    ]
  },
  "compliance-audit": {
    terms: [
      "compliance", "audit", "regulation", "obligation",
      "evidence", "gdpr", "soc2", "soc 2", "iso", "iso27001",
      "pci", "hipaa", "policy", "control", "framework",
      "conformité", "réglementation", "preuve", "obligation légale",
      "rgpd", "norme", "contrôle", "certification", "accréditation",
      "dpia", "pia", "risk assessment", "évaluation des risques",
      "audit trail", "trace d'audit", "gap analysis"
    ],
    expansions: [
      "track compliance obligations and evidence",
      "gérer un audit de conformité RGPD ou SOC2",
      "map regulatory requirements to controls and evidence",
      "suivre les obligations réglementaires et les preuves"
    ]
  },
  "crm-pipeline": {
    terms: [
      "crm", "lead", "leads", "account", "opportunity",
      "deal", "pipeline", "stage", "outreach", "prospect",
      "prospection", "prospecting", "funnel", "sales",
      "vente", "ventes", "client", "contact", "follow-up",
      "relance", "closing", "qualification", "qualified",
      "cold call", "cold email", "demo", "proposal",
      "proposition commerciale", "pipeline commercial",
      "gestion commerciale", "suivi commercial",
      "customer", "conversion", "nurturing", "linkedin",
      "enrichment", "scoring"
    ],
    expansions: [
      "build a CRM to manage leads and deals through stages",
      "je veux un outil de prospection pour mes leads LinkedIn",
      "track my sales pipeline and follow-ups",
      "gérer mes prospects et opportunités commerciales"
    ]
  },
  "knowledge-base": {
    terms: [
      "knowledge", "concept", "topic", "source", "note",
      "notes", "research", "wiki", "briefing", "documentation",
      "doc", "docs", "reference", "glossary", "faq",
      "base de connaissances", "base documentaire", "connaissance",
      "recherche", "synthèse", "mémo", "veille", "curation",
      "bookmark", "bookmarks", "signets", "learning",
      "apprentissage", "formation", "training material",
      "second brain", "zettelkasten", "obsidian", "pkm",
      "personal knowledge", "savoir", "encyclopédie"
    ],
    expansions: [
      "build a knowledge base for research notes and sources",
      "créer une base de connaissances avec des concepts et sources",
      "organize my notes, research, and references",
      "organiser mes notes de recherche et ma documentation"
    ]
  },
  "integration-operations": {
    terms: [
      "api", "webhook", "connector", "integration",
      "schema mapping", "sync", "credentials", "oauth",
      "external postgres", "external db", "etl", "data pipeline",
      "connecteur", "intégration", "synchronisation",
      "mapping de schéma", "flux de données", "ingestion",
      "rest", "graphql", "grpc", "microservice",
      "third party", "third-party", "tiers", "service externe"
    ],
    expansions: [
      "manage API integrations and connector health",
      "gérer mes intégrations API et webhooks",
      "track external data sources and sync status",
      "suivre l'état de mes connecteurs et intégrations"
    ]
  },
  "environment-delivery": {
    terms: [
      "environment", "staging", "production", "rollout",
      "customer environment", "compatibility", "verification",
      "canary", "blue-green", "blue green", "feature flag",
      "feature toggle", "infra", "infrastructure",
      "environnement", "mise en production", "déploiement client",
      "vérification", "compatibilité", "recette", "uat",
      "pre-prod", "preprod", "pré-production"
    ],
    expansions: [
      "manage environment rollouts and customer deployments",
      "gérer les déploiements par environnement",
      "track staging, production, and customer environments",
      "suivre les mises en production et les vérifications"
    ]
  }
};

// ---------------------------------------------------------------------------
// Keyword matching layer
// ---------------------------------------------------------------------------

interface KeywordMatch {
  family: string;
  score: number;
  matched_terms: string[];
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a regex that matches a term allowing common FR/EN plural/verb suffixes.
 * "incident" → matches incident, incidents, incidente, incidentes
 * "tache"    → matches tache, taches
 * "deploy"   → matches deploy, deploys, deployed, deploying
 */
function buildFuzzyTermRegex(termNormalized: string): RegExp {
  const escaped = escapeRegex(termNormalized);
  return new RegExp(`\\b${escaped}(?:s|es|x|ed|ing|tion|ment|e|er|eur|euse)?\\b`);
}

function scoreKeywordMatches(goalNormalized: string): KeywordMatch[] {
  const results: KeywordMatch[] = [];

  for (const [family, bank] of Object.entries(FAMILY_ALIAS_BANK)) {
    const matchedTerms: string[] = [];
    let rawScore = 0;

    for (const term of bank.terms) {
      const termNormalized = normalizeText(term);
      if (termNormalized.includes(" ")) {
        const words = termNormalized.split(" ");
        const multiWordRegex = new RegExp(
          words.map((w) => `${escapeRegex(w)}(?:s|es|x|e)?`).join("\\s+")
        );
        if (multiWordRegex.test(goalNormalized)) {
          matchedTerms.push(term);
          rawScore += 2;
        }
      } else {
        if (buildFuzzyTermRegex(termNormalized).test(goalNormalized)) {
          matchedTerms.push(term);
          rawScore += 1;
        }
      }
    }

    if (rawScore > 0) {
      const maxPossible = Math.max(bank.terms.length, 1);
      const score = Math.min(rawScore / Math.sqrt(maxPossible), 1.0);
      results.push({ family, score, matched_terms: matchedTerms });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Embedding similarity layer (on-the-fly expansion embeddings)
// ---------------------------------------------------------------------------

interface EmbeddingMatch {
  family: string;
  score: number;
  source: "signal_content" | "expansion";
}

type GuidanceContext = Parameters<ToolHandler["handler"]>[1];

async function scoreEmbeddingSimilarity(
  goal: string,
  signalRows: SignalRow[],
  context: GuidanceContext
): Promise<EmbeddingMatch[]> {
  const embeddingRuntime = context.embeddings.getStatus();
  if (!embeddingRuntime.vectorSearchReady) {
    return [];
  }

  let goalEmbedding: number[];
  try {
    const [emb] = await context.embeddings.embedMany([goal]);
    if (!emb || emb.length === 0) return [];
    goalEmbedding = emb;
  } catch {
    return [];
  }

  const familyTexts: Array<{
    family: string;
    text: string;
    source: "signal_content" | "expansion";
  }> = [];

  for (const row of signalRows) {
    const families: string[] = Array.isArray(row.candidate_activity_families)
      ? row.candidate_activity_families
      : [];
    for (const fam of families) {
      familyTexts.push({
        family: fam,
        text: row.content,
        source: "signal_content"
      });
    }
  }

  for (const [family, bank] of Object.entries(FAMILY_ALIAS_BANK)) {
    for (const exp of bank.expansions) {
      familyTexts.push({ family, text: exp, source: "expansion" });
    }
  }

  const uniqueTexts = [...new Set(familyTexts.map((ft) => ft.text))];

  let textEmbeddings: number[][];
  try {
    textEmbeddings = await context.embeddings.embedMany(uniqueTexts);
  } catch {
    return [];
  }

  const textToEmbedding = new Map<string, number[]>();
  for (let i = 0; i < uniqueTexts.length; i++) {
    textEmbeddings[i] && textToEmbedding.set(uniqueTexts[i], textEmbeddings[i]);
  }

  const familyBestScore = new Map<
    string,
    { score: number; source: "signal_content" | "expansion" }
  >();

  for (const ft of familyTexts) {
    const emb = textToEmbedding.get(ft.text);
    if (!emb) continue;
    const sim = cosineSimilarity(goalEmbedding, emb);
    const prev = familyBestScore.get(ft.family);
    if (!prev || sim > prev.score) {
      familyBestScore.set(ft.family, { score: sim, source: ft.source });
    }
  }

  const results: EmbeddingMatch[] = [];
  for (const [family, val] of familyBestScore) {
    if (val.score > 0.15) {
      results.push({ family, score: val.score, source: val.source });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

// ---------------------------------------------------------------------------
// Heuristic LLM-free classification fallback (bounded, no external calls)
// ---------------------------------------------------------------------------

interface ClassificationResult {
  family: string;
  confidence: number;
  reason: string;
}

/**
 * Structural heuristic classifier. Analyses sentence structure, verb patterns,
 * and domain-specific bigrams/trigrams beyond simple keyword matching.
 * Handles FR/EN, slang, and non-exemplar phrasing.
 */
function classifyByHeuristics(goalNormalized: string): ClassificationResult[] {
  const results: ClassificationResult[] = [];

  // Patterns use partial stems to handle FR/EN plural/conjugation naturally.
  // E.g. "gerer" matches "gerer", "gerez", "geres"; "projet" matches "projets".
  const patterns: Array<{
    family: string;
    regex: RegExp;
    confidence: number;
    reason: string;
  }> = [
    {
      family: "workflow-tracking",
      regex: /\b(track\w*|manag\w*|organiz\w*|follow\w*|suiv\w*|ger\w*|organis\w*)\b.*\b(task\w*|work\w*|item\w*|projet\w*|project\w*|activit\w*|tache\w*|avancement\w*)\b/,
      confidence: 0.5,
      reason: "verb+noun pattern: action on trackable work items"
    },
    {
      family: "workflow-tracking",
      regex: /\b(app\w*|tool\w*|outil\w*|application\w*|system\w*)\b.*\b(task\w*|tache\w*|projet\w*|project\w*|todo|to.do)\b/,
      confidence: 0.45,
      reason: "tool-building intent for task/project domain"
    },
    {
      family: "crm-pipeline",
      regex: /\b(track\w*|manag\w*|suiv\w*|ger\w*|relanc\w*)\b.*\b(lead\w*|client\w*|prospect\w*|customer\w*|contact\w*|vente\w*|sale\w*)\b/,
      confidence: 0.5,
      reason: "verb+noun pattern: action on sales/client entities"
    },
    {
      family: "crm-pipeline",
      regex: /\b(outil\w*|tool\w*|app\w*)\b.*\b(prospect\w*|commercial\w*|vente\w*|sale\w*|crm)\b/,
      confidence: 0.55,
      reason: "tool-building intent for CRM/sales domain"
    },
    {
      family: "crm-pipeline",
      regex: /\b(relanc\w*|follow.up\w*|outreach\w*|nurtur\w*)\b/,
      confidence: 0.4,
      reason: "outreach/follow-up activity pattern"
    },
    {
      family: "knowledge-base",
      regex: /\b(organiz\w*|organis\w*|collect\w*|curat\w*|compil\w*|rassembl\w*)\b.*\b(note\w*|info\w*|knowledge\w*|savoir\w*|doc\w*|research\w*|recherche\w*)\b/,
      confidence: 0.5,
      reason: "verb+noun pattern: organizing knowledge"
    },
    {
      family: "knowledge-base",
      regex: /\b(second brain|zettelkasten|pkm|personal knowledge|base de connaissance\w*)\b/,
      confidence: 0.6,
      reason: "explicit knowledge management system reference"
    },
    {
      family: "incident-response",
      regex: /\b(respond\w*|handl\w*|ger\w*|trait\w*|suiv\w*)\b.*\b(incident\w*|panne\w*|outage\w*|alert\w*)\b/,
      confidence: 0.55,
      reason: "verb+noun pattern: responding to incidents"
    },
    {
      family: "compliance-audit",
      regex: /\b(track\w*|suiv\w*|manag\w*|ger\w*)\b.*\b(compliance\w*|conformite\w*|obligation\w*|regulat\w*|reglementat\w*)\b/,
      confidence: 0.55,
      reason: "verb+noun pattern: tracking compliance"
    },
    {
      family: "software-delivery",
      regex: /\b(ship\w*|deliver\w*|releas\w*|deploy\w*|livr\w*)\b.*\b(software\w*|code\w*|app\w*|feature\w*|fonctionnalit\w*)\b/,
      confidence: 0.5,
      reason: "verb+noun pattern: delivering software"
    },
    {
      family: "integration-operations",
      regex: /\b(connect\w*|integr\w*|sync\w*|synchronis\w*)\b.*\b(api\w*|service\w*|system\w*|database\w*|base\w*)\b/,
      confidence: 0.5,
      reason: "verb+noun pattern: integrating systems"
    },
    {
      family: "environment-delivery",
      regex: /\b(deploy\w*|rollout\w*)\b.*\b(environment\w*|staging\w*|production\w*|client\w*)\b/,
      confidence: 0.5,
      reason: "verb+noun pattern: deploying to environments"
    }
  ];

  for (const pat of patterns) {
    if (pat.regex.test(goalNormalized)) {
      const existing = results.find((r) => r.family === pat.family);
      if (!existing || pat.confidence > existing.confidence) {
        if (existing) {
          existing.confidence = pat.confidence;
          existing.reason = pat.reason;
        } else {
          results.push({
            family: pat.family,
            confidence: pat.confidence,
            reason: pat.reason
          });
        }
      }
    }
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

// ---------------------------------------------------------------------------
// Merge scoring layers
// ---------------------------------------------------------------------------

interface MergedFamilyMatch {
  activity_family: string;
  score: number;
  title: string;
  default_projection: string;
  keywords: string[];
  match_sources: string[];
  matched_terms: string[];
}

function mergeScores(
  keywordMatches: KeywordMatch[],
  embeddingMatches: EmbeddingMatch[],
  heuristicMatches: ClassificationResult[],
  familyMeta: Map<string, { title: string; default_projection: string; keywords: string[] }>
): MergedFamilyMatch[] {
  const merged = new Map<string, {
    keyword: number;
    embedding: number;
    heuristic: number;
    matchSources: Set<string>;
    matchedTerms: string[];
  }>();

  const ensure = (family: string) => {
    if (!merged.has(family)) {
      merged.set(family, {
        keyword: 0,
        embedding: 0,
        heuristic: 0,
        matchSources: new Set(),
        matchedTerms: []
      });
    }
    return merged.get(family)!;
  };

  for (const km of keywordMatches) {
    const entry = ensure(km.family);
    entry.keyword = km.score;
    entry.matchSources.add("keyword");
    entry.matchedTerms = km.matched_terms;
  }
  for (const em of embeddingMatches) {
    const entry = ensure(em.family);
    entry.embedding = Math.max(entry.embedding, em.score);
    entry.matchSources.add(`embedding:${em.source}`);
  }
  for (const hm of heuristicMatches) {
    const entry = ensure(hm.family);
    entry.heuristic = hm.confidence;
    entry.matchSources.add(`heuristic:${hm.reason}`);
  }

  const results: MergedFamilyMatch[] = [];
  for (const [family, scores] of merged) {
    const combinedScore =
      0.40 * scores.keyword +
      0.35 * scores.embedding +
      0.25 * scores.heuristic;

    const meta = familyMeta.get(family);
    results.push({
      activity_family: family,
      score: Math.round(combinedScore * 1000) / 1000,
      title: meta?.title ?? family,
      default_projection: meta?.default_projection ?? "mini-heartbeat",
      keywords: meta?.keywords ?? [],
      match_sources: [...scores.matchSources],
      matched_terms: scores.matchedTerms
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ---------------------------------------------------------------------------
// Clarifying questions generation (slot-based, per family)
// ---------------------------------------------------------------------------

interface ClarifyingQuestion {
  kind: "scope" | "entity" | "workflow" | "privacy" | "integration" | "confirmation";
  text: string;
  slot: string;
  applies_to: string[];
}

function generateClarifyingQuestions(
  matchedFamilies: string[],
  workspaceId: string | undefined
): ClarifyingQuestion[] {
  const questions: ClarifyingQuestion[] = [];
  const families = new Set(matchedFamilies);

  if (!workspaceId) {
    questions.push({
      kind: "scope",
      text: "Should this be a new workspace, or does it belong to an existing one?",
      slot: "workspace_id",
      applies_to: matchedFamilies
    });
  }

  if (families.has("workflow-tracking")) {
    questions.push(
      {
        kind: "workflow",
        text: "What stages or columns should items move through? (e.g. To Do → In Progress → Done)",
        slot: "workflow_stages",
        applies_to: ["workflow-tracking"]
      },
      {
        kind: "entity",
        text: "What are the main items you want to track? (e.g. tasks, stories, bugs, tickets)",
        slot: "primary_entity",
        applies_to: ["workflow-tracking"]
      }
    );
  }

  if (families.has("crm-pipeline")) {
    questions.push(
      {
        kind: "workflow",
        text: "What are your pipeline stages? (e.g. New → Contacted → Qualified → Proposal → Won/Lost)",
        slot: "pipeline_stages",
        applies_to: ["crm-pipeline"]
      },
      {
        kind: "entity",
        text: "What do you call your main entities — leads, contacts, accounts, deals?",
        slot: "crm_entities",
        applies_to: ["crm-pipeline"]
      },
      {
        kind: "integration",
        text: "Are you sourcing leads from a specific channel? (e.g. LinkedIn, email, website forms)",
        slot: "lead_source",
        applies_to: ["crm-pipeline"]
      }
    );
  }

  if (families.has("incident-response")) {
    questions.push(
      {
        kind: "entity",
        text: "What services or systems do you need to track incidents for?",
        slot: "monitored_services",
        applies_to: ["incident-response"]
      },
      {
        kind: "workflow",
        text: "Do you have severity levels or SLA tiers? (e.g. P0/P1/P2)",
        slot: "severity_levels",
        applies_to: ["incident-response"]
      }
    );
  }

  if (families.has("compliance-audit")) {
    questions.push(
      {
        kind: "entity",
        text: "Which regulatory framework(s) are you tracking? (e.g. GDPR, SOC 2, ISO 27001)",
        slot: "regulatory_framework",
        applies_to: ["compliance-audit"]
      },
      {
        kind: "entity",
        text: "What types of evidence do you need to collect? (e.g. policies, screenshots, logs)",
        slot: "evidence_types",
        applies_to: ["compliance-audit"]
      }
    );
  }

  if (families.has("knowledge-base")) {
    questions.push(
      {
        kind: "entity",
        text: "What kind of knowledge are you organizing? (e.g. research notes, reference docs, how-to guides)",
        slot: "knowledge_type",
        applies_to: ["knowledge-base"]
      },
      {
        kind: "scope",
        text: "Is this personal knowledge or shared across a team?",
        slot: "knowledge_scope",
        applies_to: ["knowledge-base"]
      }
    );
  }

  if (families.has("software-delivery")) {
    questions.push(
      {
        kind: "entity",
        text: "What do you ship — features, releases, packages, services?",
        slot: "delivery_units",
        applies_to: ["software-delivery"]
      },
      {
        kind: "workflow",
        text: "Do you track dependencies between services or components?",
        slot: "dependency_tracking",
        applies_to: ["software-delivery"]
      }
    );
  }

  if (families.has("integration-operations")) {
    questions.push(
      {
        kind: "integration",
        text: "Which external systems or APIs are involved?",
        slot: "external_systems",
        applies_to: ["integration-operations"]
      },
      {
        kind: "privacy",
        text: "Does the integration handle sensitive or PII data?",
        slot: "data_sensitivity",
        applies_to: ["integration-operations"]
      }
    );
  }

  if (families.has("environment-delivery")) {
    questions.push(
      {
        kind: "entity",
        text: "What environments do you manage? (e.g. dev, staging, production, per-customer)",
        slot: "environments",
        applies_to: ["environment-delivery"]
      },
      {
        kind: "confirmation",
        text: "Do deployments require approval or verification gates?",
        slot: "approval_gates",
        applies_to: ["environment-delivery"]
      }
    );
  }

  return questions;
}

// ---------------------------------------------------------------------------
// Suggested tool steps
// ---------------------------------------------------------------------------

interface ToolStep {
  order: number;
  tool: string;
  action: string;
  params_hint: Record<string, unknown>;
}

function generateToolSteps(
  topFamily: string | undefined,
  workspaceId: string | undefined,
  hasExistingWorkspace: boolean
): ToolStep[] {
  const steps: ToolStep[] = [];
  let order = 1;

  if (!hasExistingWorkspace) {
    steps.push({
      order: order++,
      tool: "ghostcrab_workspace_create",
      action: "Create a dedicated workspace for this domain",
      params_hint: {
        label: `<descriptive name for your ${topFamily ?? "domain"} workspace>`
      }
    });
  }

  steps.push({
    order: order++,
    tool: "ghostcrab_schema_inspect",
    action: "Review the modeling recipe for this activity family",
    params_hint: {
      schema_id: "ghostcrab:modeling-recipe",
      ...(topFamily ? { filters: { activity_family: topFamily } } : {})
    }
  });

  steps.push({
    order: order++,
    tool: "ghostcrab_schema_inspect",
    action: "Review the projection recipe for default views",
    params_hint: {
      schema_id: "ghostcrab:projection-recipe",
      ...(topFamily ? { filters: { activity_family: topFamily } } : {})
    }
  });

  steps.push({
    order: order++,
    tool: "ghostcrab_remember",
    action: "Store your first domain facts (entities, items, records)",
    params_hint: {
      schema_id: "<fact schema from recipe>",
      content: "<first entity or record>",
      facets: { workspace_id: workspaceId ?? "<your workspace>" }
    }
  });

  steps.push({
    order: order++,
    tool: "ghostcrab_learn",
    action: "Create graph nodes and edges for domain relationships",
    params_hint: {
      entities: ["<entity1>", "<entity2>"],
      relations: [
        {
          source: "<entity1>",
          target: "<entity2>",
          type: "<BELONGS_TO | NEXT | BLOCKS>"
        }
      ]
    }
  });

  steps.push({
    order: order++,
    tool: "ghostcrab_project",
    action: "Generate your first working view / heartbeat projection",
    params_hint: {
      projection_kind: topFamily
        ? (FAMILY_ALIAS_BANK[topFamily] ? "from recipe" : "mini-heartbeat")
        : "mini-heartbeat"
    }
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Interpretation generation
// ---------------------------------------------------------------------------

function generateInterpretation(
  goal: string,
  topMatches: MergedFamilyMatch[]
): string {
  if (topMatches.length === 0) {
    return (
      `You want to: "${goal}". ` +
      `I could not confidently match this to a known activity family. ` +
      `Please answer the clarifying questions below so I can suggest the right modeling approach.`
    );
  }

  const top = topMatches[0];
  const others = topMatches.slice(1, 3);

  let interpretation = `You want to: "${goal}". `;
  interpretation += `This looks like a **${top.title}** domain`;

  if (others.length > 0) {
    const alsoNames = others.map((m) => m.title).join(" and ");
    interpretation += `, with possible overlap into ${alsoNames}`;
  }

  interpretation += `. I'll guide you through setting up the right schema, graph structure, and working views for this.`;

  return interpretation;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignalRow {
  signal_id: string;
  signal_type: string | null;
  content: string;
  examples: unknown;
  candidate_activity_families: unknown;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

export const guidanceTool: ToolHandler = {
  definition: {
    name: "ghostcrab_modeling_guidance",
    description:
      "Bootstrap. Describe your domain goal in natural language and get matched activity families, clarifying questions, and a step-by-step modeling plan. Call this when you want to build a new domain model (CRM, kanban, knowledge base, etc.).",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        goal: {
          type: "string",
          description:
            "Natural-language description of what you want to model or build. Examples: 'I want to create a CRM tool to manage my prospecting campaigns', 'un outil kanban pour suivre mes tâches'."
        },
        workspace_id: {
          type: "string",
          description:
            "Optional. Existing workspace to scope this guidance to. If omitted, the response will suggest creating a new workspace."
        }
      }
    }
  },
  async handler(args, context) {
    const input = GuidanceInput.parse(args);
    const goalNormalized = normalizeText(input.goal);
    const notes: string[] = [];

    // 1. Load activity families from DB
    const activityFamilyRows = await context.database.query<{
      activity_family: string;
      title: string | null;
      default_projection: string | null;
      keywords: unknown;
    }>(
      `
        SELECT
          facets_json->>'activity_family' AS activity_family,
          facets_json->>'title' AS title,
          facets_json->>'default_projection' AS default_projection,
          facets_json->'keywords' AS keywords
        FROM mb_pragma.facets
        WHERE schema_id = 'ghostcrab:activity-family'
          AND (valid_until IS NULL OR valid_until > CURRENT_DATE)
      `
    );

    const familyMeta = new Map<
      string,
      { title: string; default_projection: string; keywords: string[] }
    >();
    for (const row of activityFamilyRows) {
      if (row.activity_family) {
        familyMeta.set(row.activity_family, {
          title: row.title ?? row.activity_family,
          default_projection: row.default_projection ?? "mini-heartbeat",
          keywords: Array.isArray(row.keywords)
            ? row.keywords.filter(
                (k): k is string => typeof k === "string"
              )
            : []
        });
      }
    }

    // 2. Load signal patterns from DB
    const signalRows = await context.database.query<SignalRow>(
      `
        SELECT
          facets_json->>'signal_id' AS signal_id,
          facets_json->>'signal_type' AS signal_type,
          content,
          facets_json->'examples' AS examples,
          facets_json->'candidate_activity_families' AS candidate_activity_families
        FROM mb_pragma.facets
        WHERE schema_id = 'ghostcrab:signal-pattern'
          AND (valid_until IS NULL OR valid_until > CURRENT_DATE)
      `
    );

    // 3. Layer 1: keyword matching (expanded pattern bank)
    const keywordMatches = scoreKeywordMatches(goalNormalized);

    // 4. Layer 2: embedding similarity (on-the-fly expansion — SQLite has no pgvector)
    let embeddingMatches: EmbeddingMatch[] = [];

    try {
      embeddingMatches = await scoreEmbeddingSimilarity(
        input.goal,
        signalRows,
        context
      );
    } catch {
      notes.push(
        "Embedding similarity unavailable; using keyword and heuristic matching only."
      );
    }

    // 5. Layer 3: structural heuristic classification
    const heuristicMatches = classifyByHeuristics(goalNormalized);

    // 6. Merge all layers
    const merged = mergeScores(
      keywordMatches,
      embeddingMatches,
      heuristicMatches,
      familyMeta
    );

    // Keep top matches above a minimum threshold
    const MIN_SCORE = 0.05;
    const topMatches = merged.filter((m) => m.score >= MIN_SCORE).slice(0, 5);

    // 7. Check if workspace exists
    let hasExistingWorkspace = false;
    if (input.workspace_id) {
      const wsRows = await context.database.query<{ id: string }>(
        `
          SELECT id FROM workspaces
          WHERE id = $1 OR label = $1
          LIMIT 1
        `,
        [input.workspace_id]
      );
      hasExistingWorkspace = wsRows.length > 0;
      if (!hasExistingWorkspace) {
        notes.push(
          `Workspace "${input.workspace_id}" not found. A new workspace will be suggested.`
        );
      }
    }

    // 8. Generate outputs
    const matchedFamilies = topMatches.map((m) => m.activity_family);
    const interpretation = generateInterpretation(input.goal, topMatches);
    const clarifyingQuestions = generateClarifyingQuestions(
      matchedFamilies,
      hasExistingWorkspace ? input.workspace_id : undefined
    );
    const topFamily = matchedFamilies[0];
    const suggestedSteps = generateToolSteps(
      topFamily,
      input.workspace_id,
      hasExistingWorkspace
    );

    // 9. Load recipe hints for top family
    let recipeHint: Record<string, unknown> | null = null;
    if (topFamily) {
      const recipeRows = await context.database.query<{
        content: string;
        fact_schema_hint: string | null;
        graph_node_hint: string | null;
        graph_edge_labels: unknown;
      }>(
        `
          SELECT
            content,
            facets_json->>'fact_schema_hint' AS fact_schema_hint,
            facets_json->>'graph_node_hint' AS graph_node_hint,
            facets_json->'graph_edge_labels' AS graph_edge_labels
          FROM mb_pragma.facets
          WHERE schema_id = 'ghostcrab:modeling-recipe'
            AND facets_json->>'activity_family' = $1
            AND (valid_until IS NULL OR valid_until > CURRENT_DATE)
          LIMIT 1
        `,
        [topFamily]
      );
      if (recipeRows.length > 0) {
        const r = recipeRows[0];
        recipeHint = {
          summary: r.content,
          fact_schema_hint: r.fact_schema_hint,
          graph_node_hint: r.graph_node_hint,
          graph_edge_labels: Array.isArray(r.graph_edge_labels)
            ? r.graph_edge_labels
            : []
        };
      }
    }

    const embeddingRuntime = context.embeddings.getStatus();

    return createToolSuccessResult("ghostcrab_modeling_guidance", {
      goal: input.goal,
      workspace_id: input.workspace_id ?? null,
      interpretation,
      matched_activity_families: topMatches,
      matching_layers: {
        keyword_matches: keywordMatches.length,
        embedding_matches: embeddingMatches.length,
        heuristic_matches: heuristicMatches.length,
        embedding_available: embeddingRuntime.vectorSearchReady
      },
      clarifying_questions: clarifyingQuestions,
      suggested_tool_steps: suggestedSteps,
      recipe_hint: recipeHint,
      notes,
      confirm_before_freeze:
        "Do not register canonical schemas until the user confirms the proposed model. Use provisional facts and graph nodes first."
    });
  }
};

registerTool(guidanceTool);
