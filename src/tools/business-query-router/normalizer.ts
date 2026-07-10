import type { BusinessIntent, StructuredFacets } from "./types.js";

const STATUS_COMPLETED =
  /\b(realisee?s?|termin[eé]e?s?|verifi[eé]e?s?|completed|done|finished)\b/i;
const STATUS_IN_PROGRESS =
  /\b(en\s+cours|en\s+attente|a\s+faire|todo|non\s+fini)\b/i;
const WORK_ITEM =
  /\b(postes?|t[aâ]ches?|interventions?|work[-_\s]?items?|items?)\b/i;
const LIST = /\b(liste|list|voir|show|affiche[rz]?|donne[rz]?)\b/i;
const ACTION_VERB =
  /\b(montre[rz]?|liste[rz]?|explique[rz]?|donne[rz]?|affiche[rz]?|resume[rz]?|prepare[rz]?|fais|fait|cree[rz]?|enregistre[rz]?|compare[rz]?|calcule[rz]?|analyse[rz]?|identifie[rz]?|resoud[st]?|veux|voudrais|quelles?|quels?|pourquoi|comment|quand|combien)\b/i;

const CREATION_VERBS =
  /\b(cree[rz]?|enregistre[rz]?|ajoute[rz]?|configure[rz]?|mets en place|mettez en place|on devrait avoir)\b/i;
const CREATION_NOUNS =
  /\b(snapshot|dashboard|vue live|vue reutilisable|kpi[s]?)\b/i;
const COMPOSITE_SIGNALS =
  /\b(combine|assemble[rz]?|synthese|comite|hebdo.*direction|vue.*direction)\b/i;

const PROJECT = /\b(?:projet|project)\s+(?:de\s+)?([\p{L}\p{N}_-]+)\b/iu;
const TEAM = /\b(?:equipe|équipe|team|groupe)\s+([\p{L}\p{N}_-]+)\b/iu;
const OWNER =
  /\b(?:owner|responsable|m[ée]nage|chef|pilote)\s+([\p{L}\p{N}_-]+)\b/iu;
const LIMIT =
  /\b(?:montre|affiche|list|liste|voir|donne|donner)\s+(?:les\s+)?(?:premi[èe]r|premi[èe]res?|meilleur|meilleures|top)?\s*(?:\s*de\s+)?(\d{1,3})\b/iu;
const LIMIT_SHORT = /\b(\d{1,3})\b/;
const ORDER =
  /\b(trier|ordonner|tri(er|ée)?|ordre)\s+(par\s+)?(priorit[eé]|importance|critic|chronolog|alphabet|date|deadline|delai|due)\b/i;

const FRAGMENT_STOPWORDS = new Set([
  "le",
  "la",
  "les",
  "des",
  "du",
  "de",
  "en",
  "est",
  "une",
  "un",
  "qui",
  "que",
  "sont",
  "pour",
  "par",
  "avec",
  "dans",
  "sur",
  "et",
  "ou",
  "il",
  "elle",
  "ce",
  "se",
  "sa",
  "ses",
  "si",
  "ne",
  "pas",
  "y",
  "a",
  "au",
  "aux",
  "on",
  "nous",
  "vous",
  "ca",
  "c",
  "j",
  "m",
  "t",
  "je",
  "tu",
  "me",
  "ma",
  "mon",
  "ils",
  "elles",
  "cette",
  "cest"
]);

function countMeaningfulTokens(normalized: string): number {
  return normalized
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length >= 3 && !FRAGMENT_STOPWORDS.has(token))
    .length;
}

function normalizeText(question: string): string {
  return question
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function extractWeek(question: string): StructuredFacets {
  const match =
    /\b(?:semaine|week|s)\s*0?(\d{1,2})\b/i.exec(question) ??
    /\bS\s*0?(\d{1,2})\b/.exec(question);
  if (!match) return {};

  const weekNumber = Number(match[1]);
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 53) {
    return {};
  }

  return {
    demo_week: `S${String(weekNumber).padStart(2, "0")}`,
    week_number: weekNumber
  };
}

function extractProject(question: string): string | undefined {
  const match = PROJECT.exec(question);
  if (!match) return undefined;
  const raw = match[1];
  return raw ? raw.normalize("NFD").replace(/\p{Diacritic}/gu, "") : undefined;
}

function extractTeam(question: string): string | undefined {
  const match = TEAM.exec(question);
  if (!match) return undefined;
  const raw = match[1];
  return raw ? raw.normalize("NFD").replace(/\p{Diacritic}/gu, "") : undefined;
}

function extractOwner(question: string): string | undefined {
  const match = OWNER.exec(question);
  if (!match) return undefined;
  const raw = match[1];
  return raw ? raw.normalize("NFD").replace(/\p{Diacritic}/gu, "") : undefined;
}

function extractLimit(question: string): number | undefined {
  const long = LIMIT.exec(question);
  const fallback = LIMIT_SHORT.exec(question);
  const numberText = long?.[1] ?? fallback?.[1];
  if (!numberText) return undefined;
  const limit = Number(numberText);
  return Number.isFinite(limit) && limit > 0 && limit <= 500
    ? limit
    : undefined;
}

function extractOrder(question: string): string | undefined {
  const match = ORDER.exec(question);
  if (!match) return undefined;
  if (/(desc|d[eé]croissant)/i.test(match[3])) return "desc";
  if (/(asc|croissant)/i.test(match[3])) return "asc";
  return "desc";
}

function extractObjectOrIntentType(
  question: string,
  normalized: string
): string {
  if (/(?:snapshot|snapshotter|voir|liste)/i.test(question)) {
    return "list";
  }

  if (/propositions?|suggestions?/i.test(question)) {
    return "recommendation";
  }

  if (WORK_ITEM.test(normalized)) {
    return "work_item_query";
  }

  return "general_query";
}

function addFacet(
  facets: StructuredFacets,
  key: string,
  value: string | number | boolean | string[] | null | undefined
) {
  if (value === undefined) return;
  if (value === null) return;
  if (typeof value === "string" && value.trim().length === 0) return;
  if (Array.isArray(value) && value.length === 0) return;
  facets[key] = value;
}

function buildStructuredFacets(
  question: string,
  normalized: string
): {
  slots: Record<string, unknown>;
  structured: StructuredFacets;
} {
  const extractedWeek = extractWeek(question);
  const slots: Record<string, unknown> = {
    ...extractedWeek
  };
  const structured: StructuredFacets = {
    ...extractedWeek
  };

  const intentType = extractObjectOrIntentType(question, normalized);
  slots.intent_type = intentType;
  structured.intent_type = intentType;

  if (WORK_ITEM.test(normalized)) {
    slots.object = "work_item";
    structured.object = "work_item";
  }

  if (STATUS_COMPLETED.test(normalized)) {
    slots.status = "completed";
    structured.status = "completed";
  } else if (STATUS_IN_PROGRESS.test(normalized)) {
    slots.status = "in_progress";
    structured.status = "in_progress";
  }

  if (/(\b\d+\b)/.test(normalized) && /\blimi[te]t\b/.test(normalized)) {
    const limit = extractLimit(normalized);
    if (limit !== undefined) {
      slots.limit = limit;
      addFacet(structured, "limit", limit);
    }
  }

  const order = extractOrder(normalized);
  if (order) {
    slots.order = order;
    addFacet(structured, "order", order);
  }

  const project = extractProject(question);
  const team = extractTeam(question);
  const owner = extractOwner(question);

  if (project) {
    slots.project = project;
    addFacet(structured, "project", project);
  }
  if (team) {
    slots.team = team;
    addFacet(structured, "team", team);
  }
  if (owner) {
    slots.owner = owner;
    addFacet(structured, "owner", owner);
  }

  return { slots, structured };
}

export function normalizeBusinessQuestion(question: string): BusinessIntent {
  const normalized = normalizeText(question);
  const { slots, structured } = buildStructuredFacets(question, normalized);

  const listRequested = LIST.test(normalized);
  const hasWeek = typeof slots.demo_week === "string";
  const isWorkItem = slots.object === "work_item";
  const isCompleted = slots.status === "completed";

  if (listRequested && hasWeek && isWorkItem && isCompleted) {
    return {
      id: "list_completed_work_items_by_week",
      label: "List completed work items by week",
      slots,
      structured_facets: structured,
      canonical_phrase: "list completed work items by week",
      intent_type: "list",
      flags: { has_week: true, has_status: true },
      confidence: 0.92
    };
  }

  if (hasWeek && isWorkItem) {
    return {
      id: "work_items_by_week",
      label: "Work items by week",
      slots,
      structured_facets: structured,
      canonical_phrase: "work items by week",
      intent_type: "list",
      flags: { has_week: true },
      confidence: 0.72
    };
  }

  if (listRequested) {
    return {
      id: "generic_list_request",
      label: "Generic list request",
      slots,
      structured_facets: structured,
      canonical_phrase: "generic list request",
      intent_type: "list",
      flags: { requested_list: true },
      confidence: Object.keys(slots).length > 0 ? 0.55 : 0.38
    };
  }

  if (CREATION_VERBS.test(normalized) || CREATION_NOUNS.test(normalized)) {
    return {
      id: "creation_request",
      label: "Create or register a reusable view",
      slots: { ...slots, intent_kind: "creation" },
      structured_facets: structured,
      canonical_phrase: "create business view",
      intent_type: "creation",
      flags: { creation: true },
      confidence: 0.52
    };
  }

  if (COMPOSITE_SIGNALS.test(normalized)) {
    return {
      id: "composite_request",
      label: "Composite dashboard or KPI view",
      slots: { ...slots, intent_kind: "composite" },
      structured_facets: structured,
      canonical_phrase: "composite dashboard",
      intent_type: "composite",
      flags: { composite: true },
      confidence: 0.48
    };
  }

  if (countMeaningfulTokens(normalized) <= 2 && !ACTION_VERB.test(normalized)) {
    return {
      id: "ambiguous_fragment",
      label: "Ambiguous fragment",
      slots,
      structured_facets: structured,
      canonical_phrase: "ambiguous fragment",
      intent_type: "unknown",
      flags: { ambiguous: true },
      confidence: 0.15
    };
  }

  return {
    id: "unknown_business_query",
    label: "Unknown business query",
    slots,
    structured_facets: structured,
    canonical_phrase: "unknown business query",
    intent_type: "unknown",
    flags: { fallback: true },
    confidence: Object.keys(slots).length > 0 ? 0.35 : 0.2
  };
}
