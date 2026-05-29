#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = {
    format: "markdown",
    output: null
  };

  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write([
      "Usage:",
      "  node ghostcrab-projection-visual-report/scripts/render_projection_report.mjs --input projection-response.json [--format markdown|html|json] [--output report.html]",
      "",
      "Options:",
      "  --input    JSON response from ghostcrab_projection_get",
      "  --format   markdown, html, or json. Default: markdown",
      "  --output   Optional output file. Omit to print to stdout",
      ""
    ].join("\n"));
    process.exit(0);
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") out.input = argv[++index];
    else if (token === "--format") out.format = argv[++index];
    else if (token === "--output") out.output = argv[++index];
  }

  if (!out.input) {
    throw new Error("Missing --input projection-response.json");
  }

  if (!["markdown", "html", "json"].includes(out.format)) {
    throw new Error("--format must be markdown, html, or json");
  }

  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function statusBadge(value) {
  if (!value) return "unknown";
  return String(value);
}

function normalizePayload(payload) {
  const report = payload.report ?? {};
  const projectionResults = payload.projection_results ?? [];
  const deltas = report.deltas ?? (payload.deltas ?? []).map((item) => item.metadata ?? item);
  const linkedEvidence = payload.linked_evidence ?? [];
  const gscEvidence = payload.gsc_evidence ?? [];

  const timeline =
    report.timeline ??
    projectionResults.map((item) => {
      const meta = item.metadata ?? item;
      return {
        audit_run_id: meta.audit_run_id,
        audit_phase: meta.audit_phase,
        value: meta.value,
        unit: meta.unit,
        status: meta.status,
        severity: meta.severity,
        affected_count: meta.affected_count,
        summary: meta.summary
      };
    });

  const pageSnapshots = linkedEvidence
    .filter(
      (item) =>
        item.relation_type === "PROJECTION_RESULT_FOR" &&
        item.target?.type === "PageAuditSnapshot"
    )
    .map((item) => item.target.metadata ?? {});

  return {
    tool: payload.tool ?? "ghostcrab_projection_get",
    workspace_id: payload.workspace_id,
    projection_id: payload.projection_id,
    generated_at: payload.generated_at,
    title: report.title ?? `Projection ${payload.projection_id}`,
    executive_summary: report.executive_summary ?? "",
    timeline,
    deltas,
    pageSnapshots,
    gscEvidence: gscEvidence.map((item) => item.metadata ?? item),
    recommendations: report.recommended_actions ?? []
  };
}

function projectionKind(model) {
  const id = model.projection_id ?? "";
  if (id === "proj_performance_keyword_opportunities") return "performance_keyword";
  if (id.includes("hreflang")) return "hreflang";
  if (id.includes("content_authority")) return "content";
  if (id.includes("gsc")) return "gsc";
  if (id.includes("schema")) return "schema";
  if (id.includes("geo")) return "geo";
  if (id.includes("performance")) return "performance";
  if (id.includes("keyword")) return "keyword";
  return "generic";
}

function displayTitle(model) {
  const titles = {
    content: "Content authority gap",
    hreflang: "Hreflang crawl integrity",
    gsc: "GSC quick wins",
    schema: "Schema traffic opportunity",
    geo: "GEO blind spots",
    performance: "Performance conversion leak",
    performance_keyword: "Pages lentes associees a des keywords a potentiel",
    keyword: "Keyword opportunity"
  };
  return titles[projectionKind(model)] ?? model.title;
}

function recommendedActions(model) {
  const generic = [
    "Lire les entites liees a la projection.",
    "Comparer les DeltaFinding pour isoler le residuel.",
    "Prioriser les pages encore reliees au dernier AuditRun."
  ];
  const current = model.recommendations ?? [];
  const isGeneric =
    current.length === generic.length &&
    current.every((item, index) => item === generic[index]);

  if (!isGeneric && current.length > 0) return current;

  const byKind = {
    schema: [
      "Ajouter les schemas attendus sur les pages business et trafic prioritaire.",
      "Verifier le mapping page type -> SchemaType attendu.",
      "Traiter les pages secondaires restantes apres la phase 1.",
      "Valider que chaque page sort de la projection au run suivant."
    ],
    hreflang: [
      "Completer la matrice hreflang pour toutes les variantes locales.",
      "Corriger les alternates non crawlables ou non reciproques.",
      "Verifier x-default et auto-reference.",
      "Relancer la projection pour confirmer le residuel a zero."
    ],
    content: [
      "Enrichir les pages thin restantes.",
      "Ajouter H1 et structure editoriale claire.",
      "Ajouter le schema attendu selon le type de page.",
      "Faire sortir les pages residuelles de la projection au prochain run."
    ],
    gsc: [
      "Prioriser les requetes en position 4-10 avec impressions elevees.",
      "Verifier l'alignement intention de recherche -> page cible.",
      "Renforcer title, meta description, H1 et contenu sur les pages liees.",
      "Suivre le passage 4-10 -> top3 comme KPI de phase suivante."
    ],
    performance_keyword: [
      "Prioriser les pages keyword-opportunity dont performance_status est poor ou needs_improvement.",
      "Traiter LCP/INP mobile avant les optimisations editoriales fines.",
      "Verifier que chaque page sort du croisement au run suivant.",
      "En A2, basculer le suivi vers un monitoring preventif des pages a potentiel."
    ]
  };

  return byKind[projectionKind(model)] ?? current;
}

function markdownTable(headers, rows) {
  if (rows.length === 0) return "";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((cell) => cell ?? "").join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

function renderMermaid(model) {
  const nodes = model.timeline.map((item, index) => {
    const id = `A${index}`;
    const label = `${item.audit_run_id ?? `Run ${index + 1}`}<br/>${item.value ?? "?"} ${item.unit ?? ""}<br/>${item.severity ?? ""}`;
    return `  ${id}["${label}"]`;
  });
  const links = model.timeline.slice(1).map((_, index) => `  A${index} --> A${index + 1}`);
  return ["```mermaid", "flowchart LR", ...nodes, ...links, "```"].join("\n");
}

function renderEvidence(model) {
  const kind = projectionKind(model);

  if (kind === "gsc") {
    const rows = model.gscEvidence.slice(0, 12).map((item) => [
      item.audit_run_id,
      item.query_text,
      item.url,
      item.device,
      item.impressions,
      item.clicks,
      item.ctr === undefined ? "" : `${Math.round(Number(item.ctr) * 1000) / 10}%`,
      item.avg_position
    ]);
    return markdownTable(
      ["Run", "Query", "URL", "Device", "Impr.", "Clicks", "CTR", "Pos."],
      rows
    );
  }

  if (kind === "hreflang") {
    const rows = model.pageSnapshots.slice(0, 14).map((item) => [
      item.audit_run_id,
      item.url_path,
      item.page_health_score,
      item.hreflang_status,
      item.http_status,
      item.crawl_status,
      item.schema_coverage,
      item.content_density
    ]);
    return markdownTable(
      ["Run", "Page", "Health", "Hreflang", "HTTP", "Crawl", "Schema", "Content"],
      rows
    );
  }

  if (kind === "performance_keyword") {
    const rows = model.pageSnapshots.slice(0, 14).map((item) => [
      item.audit_run_id,
      item.url_path,
      item.page_health_score,
      item.performance_status,
      item.word_count,
      item.content_density,
      item.schema_coverage,
      item.h1_status
    ]);
    return markdownTable(
      ["Run", "Page", "Health", "Performance", "Words", "Content", "Schema", "H1"],
      rows
    );
  }

  const rows = model.pageSnapshots.slice(0, 14).map((item) => [
    item.audit_run_id,
    item.url_path,
    item.page_health_score,
    item.word_count,
    item.content_density,
    item.schema_coverage,
    item.title_status,
    item.h1_status
  ]);
  return markdownTable(
    ["Run", "Page", "Health", "Words", "Content", "Schema", "Title", "H1"],
    rows
  );
}

function renderMarkdown(model) {
  const latest = model.timeline.at(-1) ?? {};
  const timelineRows = model.timeline.map((item) => [
    item.audit_run_id,
    item.value,
    item.unit,
    statusBadge(item.status),
    item.severity,
    item.summary
  ]);
  const deltaRows = model.deltas.map((item) => [
    `${item.from_audit_run_id ?? "?"} -> ${item.to_audit_run_id ?? "?"}`,
    item.before_value,
    item.after_value,
    item.delta_pct === undefined ? "" : `${item.delta_pct}%`,
    item.residual,
    item.severity
  ]);
  const actionRows = recommendedActions(model).map((item, index) => [`${index + 1}`, item]);

  return [
    `# ${displayTitle(model)}`,
    "",
    model.executive_summary,
    "",
    `**Projection:** \`${model.projection_id}\`  `,
    `**Workspace:** \`${model.workspace_id}\`  `,
    `**Statut courant:** \`${latest.status ?? "unknown"}\` / \`${latest.severity ?? "unknown"}\``,
    "",
    "## Timeline",
    "",
    markdownTable(["Run", "Value", "Unit", "Status", "Severity", "Summary"], timelineRows),
    "",
    renderMermaid(model),
    "",
    "## Deltas",
    "",
    markdownTable(["Comparison", "Before", "After", "Delta", "Residual", "Severity"], deltaRows),
    "",
    "## Evidence",
    "",
    renderEvidence(model) || "_No linked evidence returned._",
    "",
    "## Recommended Actions",
    "",
    markdownTable(["#", "Action"], actionRows),
    "",
    "## Provenance",
    "",
    markdownTable(
      ["Field", "Value"],
      [
        ["Tool", model.tool],
        ["Workspace", model.workspace_id],
        ["Projection", model.projection_id],
        ["Generated at", model.generated_at ?? ""]
      ]
    ),
    ""
  ].join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderHtml(model) {
  const skillDir = path.resolve(new URL("..", import.meta.url).pathname);
  const template = fs.readFileSync(path.join(skillDir, "assets", "report-template.html"), "utf8");
  const latest = model.timeline.at(-1) ?? {};
  const title = displayTitle(model);
  const kpis = [
    ["Projection", model.projection_id],
    ["Current value", `${latest.value ?? "?"} ${latest.unit ?? ""}`],
    ["Status", latest.status ?? "unknown"],
    ["Severity", latest.severity ?? "unknown"]
  ];
  const body = `
    <h1>${escapeHtml(title)}</h1>
    <p class="summary">${escapeHtml(model.executive_summary)}</p>
    <section class="kpis">
      ${kpis.map(([label, value]) => `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`).join("")}
    </section>
    <h2>Timeline</h2>
    <section class="timeline">
      ${model.timeline.map((item) => `<div class="card"><div class="label">${escapeHtml(item.audit_run_id)}</div><div class="value">${escapeHtml(item.value)} ${escapeHtml(item.unit)}</div><p>${escapeHtml(item.summary)}</p><span class="badge ${escapeHtml(item.status ?? "blue")}">${escapeHtml(item.severity)}</span></div>`).join("")}
    </section>
    <h2>Evidence</h2>
    <pre>${escapeHtml(renderEvidence(model))}</pre>
    <h2>Recommended Actions</h2>
    <section class="actions">
      ${recommendedActions(model).map((item, index) => `<div class="card"><div class="label">Action ${index + 1}</div>${escapeHtml(item)}</div>`).join("")}
    </section>
  `;

  return template
    .replaceAll("{{title}}", escapeHtml(title))
    .replaceAll("{{body}}", body);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = readJson(args.input);
  const model = normalizePayload(payload);
  const rendered =
    args.format === "json"
      ? JSON.stringify(model, null, 2)
      : args.format === "html"
        ? renderHtml(model)
        : renderMarkdown(model);

  if (args.output) {
    fs.writeFileSync(args.output, rendered);
  } else {
    process.stdout.write(rendered);
  }
}

main();
