#!/usr/bin/env sh
set -eu
REPO="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INSTALL="${GHOSTCRAB_INSTALL:-/home/dlamotte/Documents/ghostcrab-personal-mcp}"
DB="$INSTALL/data/ghostcrab.sqlite"
WS=test-immo-mcp3
COL=test-immo-mcp3::docs
ONTO=test-immo-mcp3::core
CORPUS="$REPO/examples/immeuble/sources/documents"
LOG_DIR="$INSTALL/reports/test-immo-mcp3"
GCP="node $INSTALL/node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs"

export GHOSTCRAB_SQLITE_PATH="$DB"
export GHOSTCRAB_EMBEDDINGS_MODE=disabled
export MB_DOCUMENTS_LLM_BASE_URL=https://api.openai.com/v1
export MB_DOCUMENTS_LLM_MODEL=gpt-5-nano
export MB_DOCUMENTS_LLM_API_KEY="$(grep '^MB_DOCUMENTS_LLM_API_KEY=' "$INSTALL/.env" | cut -d= -f2-)"
export OPENAI_API_KEY="$MB_DOCUMENTS_LLM_API_KEY"

mkdir -p "$LOG_DIR"

echo "=== reset process workspace ==="
sqlite3 "$DB" <<SQL
DELETE FROM facet_assignments_raw WHERE workspace_id='$WS';
DELETE FROM entity_chunks_raw WHERE workspace_id='$WS';
DELETE FROM entity_documents_raw WHERE workspace_id='$WS';
DELETE FROM entity_aliases_raw WHERE workspace_id='$WS';
DELETE FROM relation_properties_raw WHERE workspace_id='$WS';
DELETE FROM relations_raw WHERE workspace_id='$WS';
DELETE FROM entities_raw WHERE workspace_id='$WS';
DELETE FROM chunks_raw WHERE workspace_id='$WS';
DELETE FROM documents_raw WHERE workspace_id='$WS';
DELETE FROM graph_entity WHERE workspace_id='$WS';
DELETE FROM graph_relation WHERE workspace_id='$WS';
SQL

echo "=== phase 2: ontology compile --profile syndic ==="
 $GCP brain ontology compile \
  --workspace-id "$WS" --ontology-id "$ONTO" \
  --input "$REPO/ontologies/immeuble/core.yaml" \
  --profile syndic --import-db --force

echo "=== phase 3: gap rules ==="
node --input-type=module <<EOF
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const WS = "$WS";
for (const file of [
  "$REPO/examples/immeuble/gap-rules/L1-syndic-naive.json",
  "$REPO/examples/immeuble/gap-rules/L2-syndic-filtered.json",
]) {
  const payload = JSON.parse(readFileSync(file, "utf8"));
  payload.workspace_id = WS;
  payload.ontology_id = \`\${WS}::core\`;
  payload.replace = false;
  const r = spawnSync("node", ["$REPO/scripts/invoke-mcp-tool.mjs", "ghostcrab_graph_gap_rules_import", "--stdin-json"], {
    input: JSON.stringify(payload), encoding: "utf8",
  });
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
  console.log("imported", file.split("/").pop());
}
EOF

$GCP brain document collection-create --workspace-id "$WS" --collection-id "$COL" --name docs --force >/dev/null 2>&1 || true
$GCP brain document ontology-attach --workspace-id "$WS" --collection-id "$COL" --ontology-id "$ONTO" --role primary --force >/dev/null 2>&1 || true

echo "=== phase 4: ingest + profile + qualify ==="
for pair in \
  "1:statuts-tilleuls.md" "2:statuts-erables.md" "3:registre-coproprietaires.md" \
  "4:composition-occupants.md" "5:baux-locatifs.md" "6:pv-ag-budget-2026.md" \
  "7:coda-janvier-2026.md" "8:annexes-caves-garages-jardins.md" "9:groupes-facturation.md"; do
  doc_id="${pair%%:*}"; file="${pair#*:}"
$GCP brain document document-ingest --workspace-id "$WS" --collection-id "$COL" \
    --doc-id "$doc_id" --source-ref "$CORPUS/$file" --language fr --strategy paragraph \
    --content-file "$CORPUS/$file" --force >/dev/null
  echo "ingested $doc_id"
done

$GCP brain document document-profile-worker --limit 9 --force 2>&1 | tail -2

$GCP brain document document-qualify \
  --workspace-id "$WS" --collection-id "$COL" --taxonomies "$ONTO" \
  --facets domain.building,domain.decision,domain.role,domain.scenario,domain.unit,finance.payment_status,source.document_type \
  --limit 9 --force 2>&1 | tee "$LOG_DIR/qualify.log"

echo "=== phase 5: business extract + reindex ==="
$GCP brain document document-business-extract \
  --workspace-id "$WS" --collection-id "$COL" --ontology-id "$ONTO" \
  --expected-coverage-json "$REPO/examples/immeuble/sources/documents/expected-coverage.json" \
  --output "$LOG_DIR/business-extraction.parsed.json" \
  --raw-output "$LOG_DIR/business-extraction.raw.json" \
  --reindex graph --limit 9 --batch-size 1 --llm-parallel 2 --force 2>&1 | tee "$LOG_DIR/extract.log"

echo "=== counts ==="
sqlite3 "$DB" <<SQL
.mode line
SELECT default_ontology_id FROM workspace_settings WHERE workspace_id='$WS';
SELECT count(*) AS syndic_dims FROM ontology_dimensions WHERE ontology_id='$ONTO' AND namespace IN ('domain','source','finance');
SELECT count(*) AS docs FROM documents_raw WHERE workspace_id='$WS';
SELECT count(*) AS facets FROM facet_assignments_raw WHERE workspace_id='$WS';
SELECT count(*) AS entities_raw FROM entities_raw WHERE workspace_id='$WS';
SELECT count(*) AS graph_entity FROM graph_entity WHERE workspace_id='$WS';
SELECT count(*) AS graph_relation FROM graph_relation WHERE workspace_id='$WS';
SQL
