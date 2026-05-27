#!/usr/bin/env bash
# Load immeuble training draft and/or golden bundles into SQLite.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/immeuble-training-env.sh"

LOAD_DRAFT=false
LOAD_GOLDEN=false
DRY_RUN=false
FORCE=false

usage() {
	cat <<EOF
Usage: load-immeuble-training.sh [OPTIONS]

Load immeuble training bundles (draft and/or golden) into SQLite.

Options:
  --draft     Load bundles/draft.json ($WORKSPACE_DRAFT)
  --golden    Load bundles/resolved.json ($WORKSPACE_GOLDEN)
  --both      Load draft then golden (default when no variant given)
  --dry-run   Validate bundle(s) without writing
  --force     Pass --force to gcp load
  -h, --help  Show this help

Environment:
  GHOSTCRAB_SQLITE_PATH   SQLite file (default: data/immeuble-training.sqlite)
EOF
}

for arg in "$@"; do
	case "$arg" in
		--draft) LOAD_DRAFT=true ;;
		--golden) LOAD_GOLDEN=true ;;
		--both)
			LOAD_DRAFT=true
			LOAD_GOLDEN=true
			;;
		--dry-run) DRY_RUN=true ;;
		--force) FORCE=true ;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			echo "Unknown argument: $arg" >&2
			usage >&2
			exit 1
			;;
	esac
done

if [[ "$LOAD_DRAFT" == false && "$LOAD_GOLDEN" == false ]]; then
	LOAD_DRAFT=true
	LOAD_GOLDEN=true
fi

load_one() {
	local bundle="$1"
	local workspace_id="$2"
	local label="$3"

	if [[ ! -f "$bundle" ]]; then
		echo "error: bundle not found at $bundle" >&2
		echo "Run: node scripts/generate-immeuble-demo.mjs --training --emit draft,resolved" >&2
		exit 1
	fi

	mkdir -p "$(dirname "$SQLITE_PATH")"

	local args=(load "$bundle" --workspace "$workspace_id" --reindex all)
	if [[ "$DRY_RUN" == true ]]; then
		args+=(--dry-run)
	elif [[ "$FORCE" == true ]]; then
		args+=(--force)
	fi

	echo "==> ${DRY_RUN:+Dry-run }Importing $label ($workspace_id)"
	$GCP "${args[@]}"

	if [[ "$DRY_RUN" == true ]]; then
		return 0
	fi

	local count
	count="$(count_graph_entities "$workspace_id")"
	echo "graph_entity rows for ${workspace_id}: ${count}"
	if [[ "$count" -lt 100 ]]; then
		echo "error: expected at least 100 graph_entity rows after reindex" >&2
		exit 1
	fi
}

if [[ "$LOAD_DRAFT" == true ]]; then
	load_one "$BUNDLE_DRAFT" "$WORKSPACE_DRAFT" "draft"
fi

if [[ "$LOAD_GOLDEN" == true ]]; then
	load_one "$BUNDLE_GOLDEN" "$WORKSPACE_GOLDEN" "golden"
fi

if [[ "$DRY_RUN" == false ]]; then
	echo "==> Done. Compare:"
	echo "    bash scripts/compare-immeuble-training.sh --rules gap-rules/L2-syndic-filtered.json"
fi
