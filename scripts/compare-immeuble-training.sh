#!/usr/bin/env bash
# Run gap diagnostics on draft and golden training workspaces and emit a JSON diff.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/immeuble-training-env.sh"

RULES_FILE=""
DO_LOAD=false

usage() {
	cat <<EOF
Usage: compare-immeuble-training.sh [OPTIONS]

Load gap rules on both training workspaces, run diagnostics, and print a JSON report.

Options:
  --rules PATH   Gap rules JSON under examples/immeuble/training (required)
  --load         Run load-immeuble-training.sh --both --force first
  -h, --help     Show this help

Example:
  bash scripts/compare-immeuble-training.sh --rules gap-rules/L2-syndic-filtered.json
EOF
}

while (($#)); do
	case "$1" in
		--rules)
			RULES_FILE="${2:-}"
			shift
			;;
		--rules=*)
			RULES_FILE="${1#--rules=}"
			;;
		--load) DO_LOAD=true ;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			echo "Unknown argument: $1" >&2
			usage >&2
			exit 1
			;;
	esac
	shift
done

if [[ -z "$RULES_FILE" ]]; then
	echo "error: --rules is required" >&2
	usage >&2
	exit 1
fi

if [[ "$RULES_FILE" != /* ]]; then
	RULES_FILE="$EXAMPLES_DIR/$RULES_FILE"
fi

if [[ ! -f "$RULES_FILE" ]]; then
	echo "error: rules file not found at $RULES_FILE" >&2
	exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
	echo "error: jq is required" >&2
	exit 1
fi

if [[ "$DO_LOAD" == true ]]; then
	bash "$SCRIPT_DIR/load-immeuble-training.sh" --both --force
fi

require_sqlite
require_tool

ensure_workspace_loaded() {
	local ws="$1"
	local count
	count="$(count_graph_entities "$ws")"
	if [[ "$count" -lt 100 ]]; then
		echo "error: workspace ${ws} is not loaded (${count} graph_entity rows)" >&2
		echo "Run: bash scripts/load-immeuble-training.sh --both --force" >&2
		exit 1
	fi
}

run_diagnostics_for() {
	local ws="$1"
	import_rules_for_workspace "$ws" "$RULES_FILE" >/dev/null
	run_diagnostics "$ws"
}

ensure_workspace_loaded "$WORKSPACE_DRAFT"
ensure_workspace_loaded "$WORKSPACE_GOLDEN"

DRAFT_REPORT="$(run_diagnostics_for "$WORKSPACE_DRAFT")"
GOLDEN_REPORT="$(run_diagnostics_for "$WORKSPACE_GOLDEN")"

DRAFT_SUMMARY="$(echo "$DRAFT_REPORT" | jq '.summary')"
GOLDEN_SUMMARY="$(echo "$GOLDEN_REPORT" | jq '.summary')"

issue_kind_counts() {
	echo "$1" | jq '[.issues[]?.kind // empty] | group_by(.) | map({kind: .[0], count: length})'
}

rule_issue_sample() {
	echo "$1" | jq '[.issues[]? | select(.rule_id != null) | {rule_id, entity_name, kind}] | .[0:12]'
}

jq -n \
	--arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
	--arg rules "$RULES_FILE" \
	--arg draft_ws "$WORKSPACE_DRAFT" \
	--arg golden_ws "$WORKSPACE_GOLDEN" \
	--argjson draft_summary "$DRAFT_SUMMARY" \
	--argjson golden_summary "$GOLDEN_SUMMARY" \
	--argjson draft_kinds "$(issue_kind_counts "$DRAFT_REPORT")" \
	--argjson golden_kinds "$(issue_kind_counts "$GOLDEN_REPORT")" \
	--argjson draft_rules "$(rule_issue_sample "$DRAFT_REPORT")" \
	--argjson golden_rules "$(rule_issue_sample "$GOLDEN_REPORT")" \
	'{
	  generated_at: $generated_at,
	  rules_file: $rules,
	  draft: {
	    workspace_id: $draft_ws,
	    summary: $draft_summary,
	    issue_kinds: $draft_kinds,
	    rule_issues: $draft_rules
	  },
	  golden: {
	    workspace_id: $golden_ws,
	    summary: $golden_summary,
	    issue_kinds: $golden_kinds,
	    rule_issues: $golden_rules
	  },
	  delta: {
	    missing_required_relations: (
	      ($draft_summary.missing_required_relations // 0) -
	      ($golden_summary.missing_required_relations // 0)
	    )
	  }
	}'
