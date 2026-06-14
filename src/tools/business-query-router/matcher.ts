import type { BusinessCapability, BusinessIntent } from "./types.js";

const PHRASE_ALIASES: Array<{ pattern: RegExp; inject: string[] }> = [
  {
    pattern: /tomber dessus|c.?est grave/i,
    inject: ["risques", "actifs", "gravite", "mitigation", "alerte"]
  },
  {
    pattern: /finir.{0,20}temps|on est bons|on va finir/i,
    inject: ["confiance", "prevision", "fiabilite", "jalon", "forecast"]
  },
  {
    pattern: /coince|pas pret|sature|saturee|saturee?/i,
    inject: ["prete", "readiness", "zone", "intervention", "salle"]
  }
];

const FR_STOPWORDS = new Set([
  "le", "la", "les", "des", "du", "de", "en", "est", "une", "un",
  "qui", "que", "quoi", "sont", "pour", "par", "avec", "dans", "sur",
  "et", "ou", "il", "elle", "ils", "elles", "ce", "se", "sa", "ses",
  "si", "ne", "pas", "plus", "y", "a", "au", "aux", "je", "tu", "on",
  "nous", "vous", "cette", "ces", "leur", "leurs", "dont", "mais",
  "car", "or", "ni", "donc", "entre", "vers", "quel", "quelle", "quels",
  "quelles", "etre", "avoir", "tout", "tous", "toute", "toutes"
]);

function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const tokens = new Set<string>();
  for (const token of normalized.split(" ")) {
    if (token.length >= 3 && !FR_STOPWORDS.has(token)) {
      tokens.add(token);
    }
  }
  return tokens;
}

function aliasScore(rawQuestion: string, capabilityText: string): number {
  let best = 0;
  for (const { pattern, inject } of PHRASE_ALIASES) {
    if (!pattern.test(rawQuestion)) continue;
    const injectTokens = tokenize(inject.join(" "));
    if (injectTokens.size === 0) continue;
    const capTokens = tokenize(capabilityText);
    let matches = 0;
    for (const token of injectTokens) {
      if (capTokens.has(token)) matches++;
    }
    best = Math.max(best, matches / injectTokens.size);
  }
  return best;
}

function tokenOverlapScore(rawQuestion: string, capabilityText: string): number {
  const queryTokens = tokenize(rawQuestion);
  if (queryTokens.size === 0) return 0;
  const capTokens = tokenize(capabilityText);
  let matches = 0;
  for (const token of queryTokens) {
    if (capTokens.has(token)) matches++;
  }
  return matches / queryTokens.size;
}

function structuredFacetScore(
  intent: BusinessIntent,
  capability: BusinessCapability
): number {
  const structured = intent.structured_facets ?? {};
  const required = new Set(capability.required_facets ?? []);

  if (Object.keys(structured).length === 0 || required.size === 0) {
    return 0;
  }

  let matched = 0;
  let considered = 0;
  for (const [key, value] of Object.entries(structured)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    considered++;
    if (!required.has(key)) continue;
    const renderedValue =
      Array.isArray(value) ? value.join(" ") : String(value).toLowerCase();
    const text = searchableText(capability).toLowerCase();
    if (text.includes(renderedValue)) {
      matched++;
    }
  }

  if (considered === 0) return 0;
  return Math.min(1, (matched / Math.min(considered, 4)) * 0.75);
}

function searchableText(capability: BusinessCapability): string {
  return [
    capability.capability_id,
    capability.label,
    capability.business_question,
    capability.scope,
    capability.projection_id,
    capability.artifact_id,
    ...(capability.example_queries ?? []),
    ...(capability.required_facets ?? []),
    ...(capability.required_schemas ?? [])
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

export function scoreCapability(
  intent: BusinessIntent,
  capability: BusinessCapability,
  rawQuestion?: string
): number {
  const text = searchableText(capability);
  let score = 0;

  if (rawQuestion) {
    const direct = tokenOverlapScore(rawQuestion, text);
    const alias = aliasScore(rawQuestion, text);
    score += Math.min(0.5, Math.max(direct, alias) * 0.6);
  }

  const structuredMatch = structuredFacetScore(intent, capability);
  score += Math.min(0.35, structuredMatch);

  if (intent.id.includes("week") || intent.id.includes("weekly")) {
    if (/\b(hebdomadaire|weekly|semaine|week|s07|demo_week)\b/i.test(text)) {
      score += 0.32;
    }
  }

  if (intent.slots.object === "work_item") {
    if (
      /\b(poste|postes|tache|tache|intervention|work[_ -]?item|chantier)\b/i.test(
        text
      )
    ) {
      score += 0.24;
    }
  }

  if (intent.slots.status === "completed") {
    if (/\b(realise|realises|termine|completed|done|status)\b/i.test(text)) {
      score += 0.18;
    }
  }

  if (typeof intent.slots.demo_week === "string") {
    const required = new Set(capability.required_facets ?? []);
    if (required.has("demo_week") || text.includes("demo_week")) {
      score += 0.2;
    }
  }

  if (capability.availability === "answer_snapshot") score += 0.12;
  if (capability.availability === "live_answer_view") score += 0.1;
  if (capability.availability === "analysis_plan") score += 0.08;

  return Math.min(1, Number(score.toFixed(3)));
}

export function rankCapabilities(
  intent: BusinessIntent,
  capabilities: BusinessCapability[],
  rawQuestion?: string
): Array<{ capability: BusinessCapability; score: number }> {
  return capabilities
    .map((capability) => ({
      capability,
      score: scoreCapability(intent, capability, rawQuestion)
    }))
    .filter((ranked) => ranked.score > 0)
    .sort((a, b) => b.score - a.score);
}
