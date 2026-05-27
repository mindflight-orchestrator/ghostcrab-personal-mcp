#!/usr/bin/env bash
# Verify a training module against training-manifest.json expectations.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/immeuble-training-env.sh"

MODULE=""
DO_LOAD=false

usage() {
	cat <<EOF
Usage: verify-training-module.sh --module MODULE [OPTIONS]

Check manifest expectations for a training module (A1, A2, A3, B1, B2, …).

Options:
  --module ID   Module id from training-manifest.json (required)
  --load        Run load-immeuble-training.sh --both --force first
  -h, --help    Show this help

Exit code 0 when expectations pass, 1 otherwise.
EOF
}

while (($#)); do
	case "$1" in
		--module)
			MODULE="${2:-}"
			shift
			;;
		--module=*)
			MODULE="${1#--module=}"
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

if [[ -z "$MODULE" ]]; then
	echo "error: --module is required" >&2
	usage >&2
	exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
	echo "error: manifest not found at $MANIFEST" >&2
	echo "Run: node scripts/generate-immeuble-demo.mjs --training --emit draft,resolved" >&2
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

WORKSPACE_KEY="$(jq -r --arg m "$MODULE" '.modules[$m].workspace // empty' "$MANIFEST")"
RULES_REL="$(jq -r --arg m "$MODULE" '.modules[$m].rules // empty' "$MANIFEST")"

if [[ -z "$WORKSPACE_KEY" || "$WORKSPACE_KEY" == "null" ]]; then
	echo "error: unknown module '$MODULE' in manifest" >&2
	exit 1
fi

case "$WORKSPACE_KEY" in
	draft) WORKSPACE_ID="$WORKSPACE_DRAFT" ;;
	golden) WORKSPACE_ID="$WORKSPACE_GOLDEN" ;;
	*)
		echo "error: unsupported workspace key '$WORKSPACE_KEY'" >&2
		exit 1
		;;
esac

RULES_FILE="$EXAMPLES_DIR/$RULES_REL"
if [[ ! -f "$RULES_FILE" ]]; then
	echo "error: rules file not found at $RULES_FILE" >&2
	exit 1
fi

ENTITY_COUNT="$(count_graph_entities "$WORKSPACE_ID")"
if [[ "$ENTITY_COUNT" -lt 100 ]]; then
	echo "error: workspace ${WORKSPACE_ID} is not loaded" >&2
	exit 1
fi

import_rules_for_workspace "$WORKSPACE_ID" "$RULES_FILE" >/dev/null
REPORT="$(run_diagnostics "$WORKSPACE_ID")"

FAIL=0

check_eq() {
	local field="$1"
	local expected="$2"
	local actual
	actual="$(echo "$REPORT" | jq -r --arg f "$field" '.summary[$f] // 0')"
	if [[ "$actual" != "$expected" ]]; then
		echo "FAIL module $MODULE: summary.$field expected $expected, got $actual"
		FAIL=1
	else
		echo "OK   module $MODULE: summary.$field = $expected"
	fi
}

check_min() {
	local field="$1"
	local min="$2"
	local actual
	actual="$(echo "$REPORT" | jq -r --arg f "$field" '.summary[$f] // 0')"
	if [[ "$actual" -lt "$min" ]]; then
		echo "FAIL module $MODULE: summary.$field expected >= $min, got $actual"
		FAIL=1
	else
		echo "OK   module $MODULE: summary.$field >= $min ($actual)"
	fi
}

EXPECT_MISSING="$(jq -r --arg m "$MODULE" '.modules[$m].expect_summary.missing_required_relations // empty' "$MANIFEST")"
EXPECT_MISSING_MIN="$(jq -r --arg m "$MODULE" '.modules[$m].expect_summary.missing_required_relations_min // empty' "$MANIFEST")"

if [[ -n "$EXPECT_MISSING" && "$EXPECT_MISSING" != "null" ]]; then
	check_eq missing_required_relations "$EXPECT_MISSING"
fi
if [[ -n "$EXPECT_MISSING_MIN" && "$EXPECT_MISSING_MIN" != "null" ]]; then
	check_min missing_required_relations "$EXPECT_MISSING_MIN"
fi

mapfile -t EXPECT_RULE_IDS < <(jq -r --arg m "$MODULE" '.modules[$m].expect_rule_ids[]? // empty' "$MANIFEST")
for rule_id in "${EXPECT_RULE_IDS[@]}"; do
	[[ -n "$rule_id" ]] || continue
	count="$(echo "$REPORT" | jq --arg r "$rule_id" '[.issues[]? | select(.rule_id == $r)] | length')"
	if [[ "$count" -lt 1 ]]; then
		echo "FAIL module $MODULE: expected issue with rule_id=$rule_id, found 0"
		FAIL=1
	else
		echo "OK   module $MODULE: rule_id=$rule_id issues=$count"
	fi
done

EXPECT_ENTITY="$(jq -r --arg m "$MODULE" '.modules[$m].expect_entity_name // empty' "$MANIFEST")"
if [[ -n "$EXPECT_ENTITY" && "$EXPECT_ENTITY" != "null" ]]; then
	if echo "$REPORT" | jq -e --arg n "$EXPECT_ENTITY" \
		'[.issues[]? | select(.entity_name == $n)] | length > 0' >/dev/null; then
		echo "OK   module $MODULE: issue on entity '$EXPECT_ENTITY'"
	else
		echo "FAIL module $MODULE: expected issue on entity '$EXPECT_ENTITY'"
		FAIL=1
	fi
fi

if [[ "$FAIL" -ne 0 ]]; then
	exit 1
fi

echo "==> Module $MODULE passed"
