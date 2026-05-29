#!/usr/bin/env node
import fs from "node:fs";

function parseArgs(argv) {
  const out = { output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") out.input = argv[++index];
    else if (token === "--output") out.output = argv[++index];
  }
  if (!out.input) throw new Error("Missing --input mindcli-query-response.json");
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function groupedRows(rows) {
  const layers = new Map();
  for (const row of rows) {
    const layer = row.layer_name ?? "unknown";
    if (!layers.has(layer)) layers.set(layer, new Map());
    const entities = layers.get(layer);
    const entity = row.entity_type ?? "unknown";
    if (!entities.has(entity)) {
      entities.set(entity, {
        count: row.entity_count ?? 0,
        facets: new Map()
      });
    }
    if (row.facet_name) {
      const entry = entities.get(entity);
      if (!entry.facets.has(row.facet_name)) entry.facets.set(row.facet_name, []);
      entry.facets.get(row.facet_name).push({
        value: row.facet_value,
        count: row.facet_count
      });
    }
  }
  return layers;
}

function layerLabel(value) {
  return String(value)
    .replace(/^\d+_/, "")
    .replaceAll("_", " ");
}

function render(rows) {
  const layers = groupedRows(rows);
  const totalEntities = [...layers.values()].reduce((sum, entities) => {
    return sum + [...entities.values()].reduce((entitySum, item) => entitySum + Number(item.count ?? 0), 0);
  }, 0);

  const lines = [
    "# Structure des dimensions",
    "",
    `Workspace: \`mindbrain-seo-audit\`  `,
    `Source: \`mindCLI pg query template run -> graph.entity.metadata\`  `,
    `Entites comptees: \`${totalEntities}\`  `,
    `Lignes de facettes: \`${rows.length}\``,
    "",
    "```text"
  ];

  for (const [layer, entities] of layers) {
    lines.push(`${layerLabel(layer)}`);
    for (const [entity, item] of entities) {
      lines.push(`  ${entity}: ${item.count}`);
      for (const [facet, values] of item.facets) {
        lines.push(`    ${facet}`);
        for (const value of values) {
          lines.push(`      ${value.value}: ${value.count}`);
        }
      }
    }
  }

  lines.push("```", "");
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = readJson(args.input);
  const markdown = render(payload.rows ?? []);
  if (args.output) fs.writeFileSync(args.output, markdown);
  else process.stdout.write(markdown);
}

main();
