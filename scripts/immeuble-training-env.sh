#!/usr/bin/env bash
# Shared paths and SQLite defaults for immeuble training scripts.
set -euo pipefail

IMMEUBLE_TRAINING_ENV_LOADED=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

EXAMPLES_DIR="${IMMEUBLE_TRAINING_EXAMPLES_DIR:-$PROJECT_ROOT/examples/immeuble/training}"
BUNDLE_DRAFT="${IMMEUBLE_BUNDLE_DRAFT:-$EXAMPLES_DIR/bundles/draft.json}"
BUNDLE_GOLDEN="${IMMEUBLE_BUNDLE_GOLDEN:-$EXAMPLES_DIR/bundles/resolved.json}"
MANIFEST="${IMMEUBLE_TRAINING_MANIFEST:-$EXAMPLES_DIR/training-manifest.json}"
WORKSPACE_DRAFT="${IMMEUBLE_WORKSPACE_DRAFT:-immeuble-training-draft}"
WORKSPACE_GOLDEN="${IMMEUBLE_WORKSPACE_GOLDEN:-immeuble-training-golden}"
ONTOLOGY_ID="${IMMEUBLE_TRAINING_ONTOLOGY_ID:-immeuble-training::core}"
RULES_DIR="${IMMEUBLE_TRAINING_RULES_DIR:-$EXAMPLES_DIR/gap-rules}"
SQLITE_PATH="${GHOSTCRAB_SQLITE_PATH:-$PROJECT_ROOT/data/immeuble-training.sqlite}"
GCP="${GCP:-node $PROJECT_ROOT/bin/gcp.mjs}"

resolve_standalone_tool() {
	local candidates=(
		"${MINDBRAIN_STANDALONE_TOOL:-}"
		"$PROJECT_ROOT/vendor/mindbrain/zig-out/bin/mindbrain-standalone-tool"
		"$PROJECT_ROOT/../mindbrain/zig-out/bin/mindbrain-standalone-tool"
	)
	for candidate in "${candidates[@]}"; do
		[[ -n "$candidate" && -x "$candidate" ]] || continue
		echo "$candidate"
		return 0
	done
	return 1
}

require_sqlite() {
	if [[ ! -f "$SQLITE_PATH" ]]; then
		echo "error: SQLite not found at $SQLITE_PATH" >&2
		echo "Run: bash scripts/load-immeuble-training.sh --both --force" >&2
		exit 1
	fi
}

require_tool() {
	STANDALONE_TOOL="$(resolve_standalone_tool)" || {
		echo "error: mindbrain-standalone-tool not found" >&2
		echo "Build vendor/mindbrain (zig build standalone-tool) or set MINDBRAIN_STANDALONE_TOOL" >&2
		exit 1
	}
}

import_rules_for_workspace() {
	local workspace_id="$1"
	local rules_file="$2"
	local ontology_id
	ontology_id="$(jq -r '.ontology_id // empty' "$rules_file")"
	if [[ -z "$ontology_id" || "$ontology_id" == "null" ]]; then
		ontology_id="$ONTOLOGY_ID"
	fi
	local payload
	payload="$(jq -c --arg ws "$workspace_id" --arg ont "$ontology_id" \
		'.workspace_id = $ws | .ontology_id = $ont' "$rules_file")"
	local tmp
	tmp="$(mktemp)"
	trap 'rm -f "$tmp"' RETURN
	printf '%s' "$payload" >"$tmp"
	"$STANDALONE_TOOL" graph-gap-rules-import --db "$SQLITE_PATH" --input "$tmp"
}

run_diagnostics() {
	local workspace_id="$1"
	"$STANDALONE_TOOL" graph-diagnostics \
		--db "$SQLITE_PATH" \
		--workspace-id "$workspace_id" \
		--limit 200 \
		--format json
}

count_graph_entities() {
	local workspace_id="$1"
	sqlite3 "$SQLITE_PATH" \
		"SELECT COUNT(*) FROM graph_entity WHERE workspace_id = '${workspace_id}';"
}
