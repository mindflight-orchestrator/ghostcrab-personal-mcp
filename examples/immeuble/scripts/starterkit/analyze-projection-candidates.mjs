#!/usr/bin/env node
/**
 * Extract and score projection candidates from ontology notes and catalog.
 * Port of starterkit/scripts/analyze_projection_candidates.py for immeuble lab.
 *
 * Usage:
 *   node analyze-projection-candidates.mjs \
 *     --db /path/to/immeuble.sqlite \
 *     --workspace immeuble \
 *     --projection-catalog ../../contracts/projection_catalog.yaml \
 *     --model-contract ../../contracts/model_contract.json \
 *     [--include-blind-spots] [--include-jtbd] \
 *     [--output-dir ../../reports] [--strict]
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  LENS_PATTERNS,
  VALID_ARTIFACT_KINDS,
  VALID_PROJ_TYPES
} from "./analysis-lenses.mjs";
import { fmtFacetValues, knownTermsFromContract } from "./facet-prefix.mjs";
import { parseArgs, parseFlag, sqliteQuery, sqliteTableExists } from "./sqlite-utils.mjs";

/**
 * @typedef {Object} AnalysisPattern
 * @property {string} lens
 * @property {string} name
 * @property {string} label
 * @property {string} business_question
 * @property {string} description
 * @property {string} suggested_proj_type
 * @property {string[]} retrieval_jobs
 * @property {string[]} kpi_hints
 * @property {string[]} required_schemas
 * @property {string[]} required_facets
 * @property {string[]} required_edges
 * @property {string[]} human_jobs
 * @property {string[]} ai_agent_jobs
 * @property {string} impact_summary
 * @property {string[]} pattern_tags
 * @property {number} [confidence]
 */

const scriptDir = dirname(fileURLToPath(import.meta.url));
const immeubleRoot = resolve(scriptDir, "..", "..");

const args = parseArgs(process.argv.slice(2));
const dbPath = resolve(parseFlag(args, "db", join(immeubleRoot, "..", "..", "..", "data", "immeuble-lab.sqlite")));
const workspaceId = parseFlag(args, "workspace", "immeuble");
const sourceDir = resolve(parseFlag(args, "source-dir", immeubleRoot));
const catalogPath = resolve(parseFlag(args, "projection-catalog", join(immeubleRoot, "contracts", "projection_catalog.yaml")));
const managerQuestionsPath = parseFlag(args, "manager-questions", "");
const modelContractPath = resolve(parseFlag(args, "model-contract", join(immeubleRoot, "contracts", "model_contract.json")));
const outputDir = resolve(parseFlag(args, "output-dir", join(immeubleRoot, "reports")));
const role = parseFlag(args, "role", "gestionnaire_syndic");
const strict = args.strict === "true";
const includeBlindSpots = args["include-blind-spots"] === "true";
const includeJtbd = args["include-jtbd"] === "true";
const recursiveMarkdown = args["recursive-markdown"] === "true";

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function asList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value) return [value];
  return [String(value)];
}

function materializedLookupSqlite(dbPath, workspaceId) {
  const scopes = new Set();
  const liveIds = new Set();
  const liveSlugs = new Set();
  const legacyRefs = new Set();

  if (!existsSync(dbPath)) {
    return { analysis_plan_scopes: scopes, live_answer_view_ids: liveIds, live_answer_view_slugs: liveSlugs, live_answer_legacy_refs: legacyRefs };
  }

  if (sqliteTableExists(dbPath, "projections")) {
    const ws = workspaceId.replace(/'/g, "''");
    for (const row of sqliteQuery(
      dbPath,
      `SELECT scope FROM projections WHERE scope = '${ws}' OR scope LIKE '${ws}:%'`
    )) {
      if (row.scope) scopes.add(String(row.scope));
    }
  }

  if (sqliteTableExists(dbPath, "mindbrain_answer_artifacts")) {
    const ws = workspaceId.replace(/'/g, "''");
    for (const row of sqliteQuery(
      dbPath,
      `SELECT artifact_id, slug, legacy_ref FROM mindbrain_answer_artifacts
       WHERE artifact_kind = 'live_answer_view' AND (workspace_id = '${ws}' OR workspace_id IS NULL)`
    )) {
      if (row.artifact_id) liveIds.add(String(row.artifact_id));
      if (row.slug) liveSlugs.add(String(row.slug));
      if (row.legacy_ref) legacyRefs.add(String(row.legacy_ref));
    }
  }

  return {
    analysis_plan_scopes: scopes,
    live_answer_view_ids: liveIds,
    live_answer_view_slugs: liveSlugs,
    live_answer_legacy_refs: legacyRefs
  };
}

function suggestedType(jobs) {
  if (jobs.includes("monitor")) return "STEP";
  if (jobs.includes("aggregate") || jobs.includes("summary")) return "FACT";
  return "STEP";
}

function normalizeProjType(value, jobs = []) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (VALID_PROJ_TYPES.has(normalized)) return { type: normalized, warning: "" };
  if (normalized === "NOTE") {
    const fallback = suggestedType(jobs);
    return { type: fallback, warning: "NOTE is pack-ranking only; use STEP/FACT/CONSTRAINT/GOAL for ghostcrab_project" };
  }
  if (jobs.length) {
    const fallback = suggestedType(jobs);
    return { type: fallback, warning: `Unknown proj_type \`${value}\`; inferred ${fallback}` };
  }
  return { type: "STEP", warning: `Unknown proj_type \`${value}\`; defaulting to STEP` };
}

function inferArtifactKind(jobs, label, description, explicit) {
  if (explicit && VALID_ARTIFACT_KINDS.has(explicit)) return explicit;
  const text = `${label} ${description}`.toLowerCase();
  if (
    jobs.includes("monitor") &&
    ["tableau", "dashboard", "direct", "temps reel", "live", "quotidien", "journalier"].some((w) => text.includes(w))
  ) {
    return "live_answer_view";
  }
  return "analysis_plan";
}

function inferMaterializationTarget(artifactKind, origin) {
  if (origin === "manager_questions") return "review_only";
  if (artifactKind === "live_answer_view") return "answer_artifact_seed";
  if (artifactKind === "analysis_plan") return "ghostcrab_project";
  return "review_only";
}

function materializationStatusForCandidate(candidate, lookup) {
  if (candidate.suggested_artifact_kind === "live_answer_view") {
    const slug = candidate.name;
    const artifactId = `live_answer_view__${slug}`;
    if (
      lookup.live_answer_view_ids.has(artifactId) ||
      lookup.live_answer_view_slugs.has(slug) ||
      lookup.live_answer_legacy_refs.has(candidate.expected_scope)
    ) {
      return "materialized";
    }
    return "candidate";
  }
  if (lookup.analysis_plan_scopes.has(candidate.expected_scope)) return "materialized";
  return "candidate";
}

function finalizeCandidateFields(input, lookup) {
  const jobs = input.retrieval_jobs || ["summary"];
  const { type: suggestedProjType, warning } = normalizeProjType(input.proj_type, jobs);
  const suggestedArtifactKind = inferArtifactKind(jobs, input.label, input.description, input.artifact_kind);
  const materializationTarget = inferMaterializationTarget(suggestedArtifactKind, input.origin || "source_table");

  /** @type {Record<string, unknown>} */
  const candidate = {
    name: input.name,
    label: input.label,
    ontology: input.ontology,
    description: input.description,
    source_file: input.source_file,
    source_section: input.source_section,
    expected_scope: input.expected_scope,
    suggested_proj_type: suggestedProjType,
    suggested_artifact_kind: suggestedArtifactKind,
    materialization_target: materializationTarget,
    retrieval_jobs: jobs,
    kpi_hints: input.kpi_hints || [],
    data_dependencies: input.data_dependencies || input.required_schemas || [],
    materialization_status: "candidate",
    recommendation: input.recommendation || "review",
    business_question: input.business_question || "",
    origin: input.origin || "source_table",
    lens: input.lens || "",
    role: input.role || "",
    materialization_warning: warning,
    required_schemas: input.required_schemas || [],
    required_facets: input.required_facets || [],
    required_edges: input.required_edges || [],
    human_jobs: input.human_jobs || [],
    ai_agent_jobs: input.ai_agent_jobs || [],
    impact_summary: input.impact_summary || "",
    pattern_tags: input.pattern_tags || [],
    confidence: input.confidence ?? 1.0
  };

  candidate.materialization_status = materializationStatusForCandidate(candidate, lookup);
  if (!input.recommendation) {
    if (candidate.materialization_status === "materialized") candidate.recommendation = "keep";
    else if (materializationTarget === "review_only") candidate.recommendation = "review";
    else if (candidate.data_dependencies.length || candidate.required_schemas.length) candidate.recommendation = "add";
    else candidate.recommendation = "review";
  }
  return candidate;
}

function extractProjectionSection(markdown) {
  const match = markdown.match(/^## Projections \/ rapports types\s*$/m);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = rest.match(/^##\s+/m);
  return next ? rest.slice(0, next.index) : rest;
}

function parseMarkdownTable(section) {
  const rows = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || trimmed.includes("---")) continue;
    const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length < 2 || ["projection", "rapport"].includes(cells[0].toLowerCase())) continue;
    rows.push([cells[0], cells[1]]);
  }
  return rows;
}

function inferRetrievalJobs(label, description) {
  const text = `${label} ${description}`.toLowerCase();
  const jobs = [];
  if (["liste", "annuaire", "calendrier", "historique"].some((w) => text.includes(w))) jobs.push("list");
  if (["suivi", "en cours", "retard", "alerte", "echeance"].some((w) => text.includes(w))) jobs.push("monitor");
  if (["fiche", "vue complete", "situation"].some((w) => text.includes(w))) jobs.push("summary");
  if (["repartition", "comparaison", "par "].some((w) => text.includes(w))) jobs.push("aggregate");
  if (["chaine", "roles", "multi", "impact"].some((w) => text.includes(w))) jobs.push("graph_traversal");
  return jobs.length ? jobs : ["summary"];
}

function extractMarkdownCandidates(sourceDir, dbPath, workspaceId, recursive) {
  const lookup = materializedLookupSqlite(dbPath, workspaceId);
  const candidates = [];
  const paths = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && recursive) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) paths.push(full);
    }
  }

  if (recursive) walk(sourceDir);
  else {
    try {
      for (const name of readdirSync(sourceDir)) {
        if (name.endsWith(".md")) paths.push(join(sourceDir, name));
      }
    } catch {
      // source dir may not exist
    }
  }

  for (const path of paths.sort()) {
    const markdown = readFileSync(path, "utf8");
    const section = extractProjectionSection(markdown);
    if (!section) continue;
    const ontology = slugify(path.split("/").pop()?.replace(/\.md$/, "") ?? "catalog");
    for (const [label, description] of parseMarkdownTable(section)) {
      const name = slugify(label);
      candidates.push(
        finalizeCandidateFields(
          {
            name,
            label,
            ontology,
            description,
            source_file: path,
            source_section: "Projections / rapports types",
            expected_scope: `${workspaceId}:${ontology}:${name}`,
            retrieval_jobs: inferRetrievalJobs(label, description),
            kpi_hints: [],
            data_dependencies: [],
            business_question: description.endsWith("?") ? description : "",
            required_schemas: [],
            origin: "source_table"
          },
          lookup
        )
      );
    }
  }
  return candidates;
}

function extractProjectionCatalogCandidates(catalogPath, dbPath, workspaceId) {
  if (!existsSync(catalogPath)) return [];
  const payload = parseYaml(readFileSync(catalogPath, "utf8"));
  const lookup = materializedLookupSqlite(dbPath, workspaceId);
  const candidates = [];

  for (const item of payload.projections ?? []) {
    if (!item || typeof item !== "object") continue;
    const name = slugify(item.name || item.label || item.business_question || "projection");
    const scope = String(item.scope || `${workspaceId}:catalog:${name}`);
    const parts = scope.split(":");
    const ontology = parts.length > 2 && parts[0] === workspaceId ? parts[1] : "catalog";
    const jobs = asList(item.retrieval_jobs).length ? asList(item.retrieval_jobs) : ["summary"];
    const requiredSchemas = asList(item.required_schemas).map((s) =>
      s.includes(":") ? s : `immeuble:core:${s}`
    );

    candidates.push(
      finalizeCandidateFields(
        {
          name,
          label: String(item.label || name),
          ontology,
          description: String(item.description || item.business_question || ""),
          source_file: catalogPath,
          source_section: "projection_catalog.yaml",
          expected_scope: scope,
          retrieval_jobs: jobs,
          kpi_hints: asList(item.kpi_hints),
          data_dependencies: requiredSchemas,
          recommendation: lookup.analysis_plan_scopes.has(scope) ? "keep" : "add",
          business_question: String(item.business_question || ""),
          origin: "projection_catalog",
          required_schemas: requiredSchemas,
          required_facets: asList(item.required_facets),
          required_edges: asList(item.required_edges),
          impact_summary: "Projection declaree dans le catalogue decisionnel.",
          confidence: 1.0,
          proj_type: String(item.proj_type || ""),
          artifact_kind: String(item.artifact_kind || "") || undefined
        },
        lookup
      )
    );
  }
  return candidates;
}

function extractManagerQuestionCandidates(path, dbPath, workspaceId) {
  if (!path || !existsSync(path)) return [];
  const payload = parseYaml(readFileSync(path, "utf8"));
  const lookup = materializedLookupSqlite(dbPath, workspaceId);
  const scopes = lookup.analysis_plan_scopes;
  const candidates = [];

  for (const [family, questions] of Object.entries(payload.families ?? {})) {
    if (!Array.isArray(questions)) continue;
    for (const question of questions) {
      if (!question || typeof question !== "object") continue;
      const projection = String(question.projection || "");
      const qText = String(question.question || "");
      if (!qText) continue;
      const name = slugify(projection || question.id || qText);
      let scope = `${workspaceId}:${slugify(String(family))}:${name}`;
      const matching = [...scopes].find((s) => projection && s.endsWith(`:${projection}`));
      if (matching) scope = matching;

      candidates.push(
        finalizeCandidateFields(
          {
            name,
            label: qText,
            ontology: slugify(String(family)),
            description: qText,
            source_file: path,
            source_section: "manager_questions.yaml",
            expected_scope: scope,
            retrieval_jobs: ["summary"],
            recommendation: scopes.has(scope) ? "keep" : "review",
            business_question: qText,
            origin: "manager_questions",
            impact_summary: `Question manager associee a la projection \`${projection}\`.`,
            proj_type: "NOTE"
          },
          lookup
        )
      );
    }
  }
  return candidates;
}

function candidateSignature(candidate) {
  return new Set([candidate.name, slugify(candidate.label), slugify(candidate.business_question || candidate.description)]);
}

function appendUniqueCandidates(base, additions) {
  const seen = new Set();
  const merged = [];
  for (const candidate of [...base, ...additions]) {
    const signature = `${candidate.origin}|${candidate.expected_scope}|${slugify(candidate.business_question || candidate.label)}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    merged.push(candidate);
  }
  return merged;
}

function extractLensCandidates(workspaceId, dbPath, lenses, roleName, sourceCandidates) {
  const lookup = materializedLookupSqlite(dbPath, workspaceId);
  const existing = new Set();
  for (const c of sourceCandidates) {
    for (const sig of candidateSignature(c)) existing.add(sig);
  }

  const candidates = [];
  for (const lens of lenses) {
    for (const pattern of LENS_PATTERNS[lens] ?? []) {
      const name = slugify(pattern.name);
      if (existing.has(name) || existing.has(slugify(pattern.business_question))) continue;
      candidates.push(
        finalizeCandidateFields(
          {
            name,
            label: pattern.label,
            ontology: slugify(roleName),
            description: pattern.description,
            source_file: "analysis_lens",
            source_section: pattern.lens,
            expected_scope: `${workspaceId}:${slugify(roleName)}:${name}`,
            retrieval_jobs: pattern.retrieval_jobs,
            kpi_hints: pattern.kpi_hints,
            data_dependencies: [...new Set(pattern.required_schemas)].sort(),
            recommendation: "add",
            business_question: pattern.business_question,
            origin: "analysis_lens",
            lens: pattern.lens,
            role: roleName,
            required_schemas: pattern.required_schemas,
            required_facets: pattern.required_facets,
            required_edges: pattern.required_edges,
            human_jobs: pattern.human_jobs,
            ai_agent_jobs: pattern.ai_agent_jobs,
            impact_summary: pattern.impact_summary,
            pattern_tags: pattern.pattern_tags,
            confidence: pattern.confidence ?? 0.8,
            proj_type: pattern.suggested_proj_type
          },
          lookup
        )
      );
    }
  }
  return candidates;
}

function selectedLenses() {
  const lenses = [];
  if (includeBlindSpots) lenses.push("blind_spot_manager");
  if (includeJtbd) lenses.push("jtbd_human", "jtbd_ai");
  return lenses.filter((l, i, arr) => LENS_PATTERNS[l] && arr.indexOf(l) === i);
}

function collectModelImpacts(candidates) {
  const impactCandidates = candidates.filter((c) => ["analysis_lens", "llm_review"].includes(c.origin));
  return {
    lens_candidate_count: impactCandidates.length,
    by_lens: Object.fromEntries(
      [...new Set(impactCandidates.map((c) => c.lens))].map((l) => [l, impactCandidates.filter((c) => c.lens === l).length])
    ),
    required_schemas: [...new Set(impactCandidates.flatMap((c) => c.required_schemas || []))].sort(),
    required_facets: [...new Set(impactCandidates.flatMap((c) => c.required_facets || []))].sort(),
    required_edges: [...new Set(impactCandidates.flatMap((c) => c.required_edges || []))].sort()
  };
}

function collectValidationGaps(candidates, contract) {
  const sourceOrigins = new Set(["source_table", "projection_catalog", "manager_questions"]);
  const proposalOrigins = new Set(["analysis_lens", "llm_review"]);
  const sourceCandidates = candidates.filter((c) => sourceOrigins.has(c.origin));
  const proposalCandidates = candidates.filter((c) => proposalOrigins.has(c.origin));

  const sourceSchemas = new Set(sourceCandidates.flatMap((c) => c.required_schemas || []));
  const sourceFacets = new Set(sourceCandidates.flatMap((c) => c.required_facets || []));
  const sourceEdges = new Set(sourceCandidates.flatMap((c) => c.required_edges || []));
  const proposalSchemas = new Set(proposalCandidates.flatMap((c) => c.required_schemas || []));
  const proposalFacets = new Set(proposalCandidates.flatMap((c) => c.required_facets || []));
  const proposalEdges = new Set(proposalCandidates.flatMap((c) => c.required_edges || []));

  const terms = knownTermsFromContract(contract);
  return {
    extension_schemas: [...proposalSchemas].filter((s) => !sourceSchemas.has(s)).sort(),
    extension_facets: [...proposalFacets].filter((f) => !sourceFacets.has(f)).sort(),
    extension_edges: [...proposalEdges].filter((e) => !sourceEdges.has(e)).sort(),
    unknown_schemas: contract && Object.keys(contract).length ? [...proposalSchemas].filter((s) => !terms.schemas.has(s)).sort() : [],
    unknown_facets: contract && Object.keys(contract).length ? [...proposalFacets].filter((f) => !terms.facets.has(f)).sort() : [],
    unknown_edges: contract && Object.keys(contract).length ? [...proposalEdges].filter((e) => !terms.edges.has(e)).sort() : [],
    contract_checked: Boolean(contract && Object.keys(contract).length)
  };
}

function writeValidationMarkdown(payload, path) {
  const byOrigin = {};
  for (const item of payload.candidates) {
    const origin = item.origin || "source_table";
    if (!byOrigin[origin]) byOrigin[origin] = [];
    byOrigin[origin].push(item);
  }
  const gaps = payload.validation_gaps || {};
  const lines = [
    "# Projection Model Validation",
    "",
    "## Synthese",
    "",
    `- Workspace: \`${payload.workspace_id}\``,
    `- Projections catalogue: ${payload.summary.projection_catalog_count}`,
    `- Questions manager: ${payload.summary.manager_questions_count}`,
    `- Ajouts par patterns: ${payload.summary.analysis_lens_count}`,
    `- Scopes materialises: ${payload.summary.unique_materialized_scope_count}`,
    "",
    "## Projections catalogue",
    ""
  ];

  for (const item of byOrigin.projection_catalog ?? []) {
    lines.push(
      `### ${item.label}`,
      `- Question: ${item.business_question || item.description}`,
      `- Scope: \`${item.expected_scope}\``,
      `- artifact_kind: \`${item.suggested_artifact_kind}\``,
      `- Statut: \`${item.materialization_status}\``,
      `- Facettes requises: ${fmtFacetValues(item.required_facets || [])}`,
      `- Aretes requises: ${fmtFacetValues(item.required_edges || [])}`,
      ""
    );
  }

  const proposed = [...(byOrigin.analysis_lens ?? []), ...(byOrigin.llm_review ?? [])];
  if (proposed.length) {
    lines.push("## Questions manquantes proposees", "");
    for (const item of proposed) {
      lines.push(
        `### ${item.label}`,
        `- Categorie: \`${item.lens || item.origin}\``,
        `- Question: ${item.business_question || item.description}`,
        `- Facettes requises: ${fmtFacetValues(item.required_facets || [])}`,
        `- Aretes requises: ${fmtFacetValues(item.required_edges || [])}`,
        ""
      );
    }
  }

  lines.push(
    "## Dimensions et graphes a valider",
    "",
    "### Facettes nouvelles par rapport aux sources",
    "",
    fmtFacetValues(gaps.extension_facets || []),
    "",
    "### Aretes nouvelles par rapport aux sources",
    "",
    fmtFacetValues(gaps.extension_edges || []),
    ""
  );

  if (gaps.contract_checked) {
    lines.push(
      "## Gaps versus model_contract",
      "",
      `- Schemas inconnus: ${fmtFacetValues(gaps.unknown_schemas || [])}`,
      `- Facettes inconnues: ${fmtFacetValues(gaps.unknown_facets || [])}`,
      `- Aretes inconnues: ${fmtFacetValues(gaps.unknown_edges || [])}`,
      ""
    );
  }

  writeFileSync(path, lines.join("\n") + "\n", "utf8");
}

function writeCandidatesMarkdown(payload, path) {
  const lines = [
    "# Projection Candidate Review",
    "",
    `- Workspace: \`${payload.workspace_id}\``,
    `- Generated at: \`${payload.generated_at}\``,
    `- Candidate count: ${payload.summary.total_count}`,
    `- Materialized count: ${payload.summary.materialized_count}`,
    `- Active lenses: ${payload.active_lenses.join(", ") || "n/a"}`,
    ""
  ];

  for (const [ontology, items] of Object.entries(payload.by_ontology)) {
    lines.push(`## ${ontology}`, "");
    for (const item of items) {
      lines.push(
        `### ${item.label}`,
        `- Scope: \`${item.expected_scope}\``,
        `- Status: \`${item.materialization_status}\``,
        `- Origin: \`${item.origin}\``,
        `- artifact_kind: \`${item.suggested_artifact_kind}\``,
        `- Required facets: ${fmtFacetValues(item.required_facets || [])}`,
        `- Required edges: ${fmtFacetValues(item.required_edges || [])}`,
        ""
      );
    }
  }
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
}

function strictPlanFailed(gaps) {
  if (!gaps.contract_checked) return false;
  return (
    (gaps.unknown_schemas?.length ?? 0) > 0 ||
    (gaps.unknown_facets?.length ?? 0) > 0 ||
    (gaps.unknown_edges?.length ?? 0) > 0
  );
}

function main() {
  const lenses = selectedLenses();
  let candidates = appendUniqueCandidates(
    [],
    extractMarkdownCandidates(sourceDir, dbPath, workspaceId, recursiveMarkdown)
  );
  candidates = appendUniqueCandidates(candidates, extractProjectionCatalogCandidates(catalogPath, dbPath, workspaceId));
  if (managerQuestionsPath) {
    candidates = appendUniqueCandidates(
      candidates,
      extractManagerQuestionCandidates(resolve(managerQuestionsPath), dbPath, workspaceId)
    );
  }
  candidates = appendUniqueCandidates(
    candidates,
    extractLensCandidates(workspaceId, dbPath, lenses, role, candidates)
  );

  let modelContract = {};
  try {
    modelContract = JSON.parse(readFileSync(modelContractPath, "utf8"));
  } catch {
    modelContract = {};
  }

  const byOntology = {};
  const byArtifactKind = {};
  for (const candidate of candidates) {
    if (!byOntology[candidate.ontology]) byOntology[candidate.ontology] = [];
    byOntology[candidate.ontology].push(candidate);
    const kind = candidate.suggested_artifact_kind || "analysis_plan";
    byArtifactKind[kind] = (byArtifactKind[kind] || 0) + 1;
  }

  const validationGaps = collectValidationGaps(candidates, modelContract);
  const payload = {
    workspace_id: workspaceId,
    db_path: dbPath,
    generated_at: new Date().toISOString(),
    active_lenses: lenses,
    role,
    model_contract_path: modelContractPath,
    summary: {
      candidate_count: candidates.filter((c) => c.materialization_status === "candidate").length,
      materialized_count: candidates.filter((c) => c.materialization_status === "materialized").length,
      unique_materialized_scope_count: new Set(
        candidates.filter((c) => c.materialization_status === "materialized").map((c) => c.expected_scope)
      ).size,
      analysis_lens_count: candidates.filter((c) => c.origin === "analysis_lens").length,
      projection_catalog_count: candidates.filter((c) => c.origin === "projection_catalog").length,
      manager_questions_count: candidates.filter((c) => c.origin === "manager_questions").length,
      source_table_count: candidates.filter((c) => c.origin === "source_table").length,
      total_count: candidates.length,
      by_artifact_kind: Object.fromEntries(Object.entries(byArtifactKind).sort())
    },
    model_impacts: collectModelImpacts(candidates),
    validation_gaps: validationGaps,
    by_ontology: Object.fromEntries(Object.entries(byOntology).sort()),
    candidates
  };

  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, "projection_candidates.json");
  const mdPath = join(outputDir, "projection_candidates.md");
  const validationPath = join(outputDir, "projection_model_validation.md");
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  writeCandidatesMarkdown(payload, mdPath);
  writeValidationMarkdown(payload, validationPath);

  const output = {
    json: jsonPath,
    markdown: mdPath,
    validation_markdown: validationPath,
    summary: payload.summary,
    validation_gaps: validationGaps,
    ok: !strict || !strictPlanFailed(validationGaps)
  };
  console.log(JSON.stringify(output, null, 2));
  if (strict && strictPlanFailed(validationGaps)) process.exit(1);
}

main();
