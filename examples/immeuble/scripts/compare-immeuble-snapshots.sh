#!/usr/bin/env bash
set -eu

FROM_DB=""
TO_DB=""
WORKSPACE_ID="immeuble"
FROM_LABEL=""
TO_LABEL=""
CUSTOM_TABLES=""
JSON_OUTPUT=0
OUTPUT_FILE=""

usage() {
  cat <<EOF
Usage: examples/immeuble/scripts/compare-immeuble-snapshots.sh [options]

Compare two SQLite snapshots from Immeuble and show row-count deltas.

Options:
  --from <path>            Snapshot A path (required)
  --to <path>              Snapshot B path (required)
  --label-a <text>         Optional label for snapshot A
  --label-b <text>         Optional label for snapshot B
  --workspace <id>         Workspace filter for workspace-scoped tables (default: immeuble)
  --tables <t1,t2,...>     Override the default table set
  --json                   Emit JSON output
  --out <path>             Write output to a file (human or JSON)
  -h, --help               Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      FROM_DB="${2:?--from requires a value}"
      shift 2
      ;;
    --to)
      TO_DB="${2:?--to requires a value}"
      shift 2
      ;;
    --label-a)
      FROM_LABEL="${2:?--label-a requires a value}"
      shift 2
      ;;
    --label-b)
      TO_LABEL="${2:?--label-b requires a value}"
      shift 2
      ;;
    --workspace)
      WORKSPACE_ID="${2:?--workspace requires a value}"
      shift 2
      ;;
    --tables)
      CUSTOM_TABLES="${2:?--tables requires a value}"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=1
      shift
      ;;
    --out)
      OUTPUT_FILE="${2:?--out requires a value}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[immeuble-compare] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$FROM_DB" || -z "$TO_DB" ]]; then
  echo "[immeuble-compare] --from and --to are required" >&2
  usage
  exit 1
fi

if [[ ! -f "$FROM_DB" ]]; then
  echo "[immeuble-compare] snapshot does not exist: $FROM_DB" >&2
  exit 1
fi

if [[ ! -f "$TO_DB" ]]; then
  echo "[immeuble-compare] snapshot does not exist: $TO_DB" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "[immeuble-compare] sqlite3 is required in PATH" >&2
  exit 1
fi

if [[ -z "$FROM_LABEL" ]]; then
  FROM_LABEL="$(basename "$FROM_DB")"
fi
if [[ -z "$TO_LABEL" ]]; then
  TO_LABEL="$(basename "$TO_DB")"
fi

DEFAULT_TABLES="agent_facts graph_entity graph_relation entities_raw relations_raw documents_raw facet_assignments_raw facet_assignments_lookup_raw"
if [[ -n "$CUSTOM_TABLES" ]]; then
  IFS=',' read -r -a TABLES <<< "$CUSTOM_TABLES"
else
  read -r -a TABLES <<< "$DEFAULT_TABLES"
fi

workspacesql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}
WORKSPACE_SQL_SAFE="$(workspacesql_escape "$WORKSPACE_ID")"

table_exists() {
  local db="$1"
  local table="$2"
  sqlite3 "$db" "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='$table';" | tr -d '[:space:]'
}

has_workspace_column() {
  local db="$1"
  local table="$2"
  sqlite3 "$db" "PRAGMA table_info('$table');" | awk -F'|' 'BEGIN{RS="\n"}{print $2}' | grep -qx "workspace_id" && echo yes
}

count_rows() {
  local db="$1"
  local table="$2"
  local sql="SELECT COUNT(1) FROM \"$table\";"
  if [[ "$WORKSPACE_ID" != "all" ]] && [[ "$(has_workspace_column "$db" "$table")" == "yes" ]]; then
    sql="SELECT COUNT(1) FROM \"$table\" WHERE workspace_id='$WORKSPACE_SQL_SAFE';"
  fi
  sqlite3 "$db" "$sql"
}

collect_line() {
  local db="$1"
  local table="$2"
  if [[ "$(table_exists "$db" "$table")" != "1" ]]; then
    echo "missing"
    return
  fi
  local cnt
  cnt="$(count_rows "$db" "$table" | tr -d '[:space:]')"
  if [[ -z "$cnt" ]]; then
    echo "0"
    return
  fi
  echo "$cnt"
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

declare -a DIFF_LINES=()
declare -a JSON_TABLES=()

for table in "${TABLES[@]}"; do
  table="${table#"${table%%[![:space:]]*}"}"
  table="${table%"${table##*[![:space:]]}"}"
  if [[ -z "$table" ]]; then
    continue
  fi
  c1="$(collect_line "$FROM_DB" "$table")"
  c2="$(collect_line "$TO_DB" "$table")"
  if [[ "$c1" == "missing" || "$c2" == "missing" ]]; then
    if [[ "$c1" == "missing" && "$c2" == "missing" ]]; then
      delta="-"
    else
      delta="new_table"
    fi
  else
    delta="$((c2 - c1))"
  fi
  from_json="$(json_escape "$c1")"
  to_json="$(json_escape "$c2")"
  delta_json="$(json_escape "$delta")"
  DIFF_LINES+=("$table|$c1|$c2|$delta")
  JSON_TABLES+=("{\"table\":\"$table\",\"from\":\"$from_json\",\"to\":\"$to_json\",\"delta\":\"$delta_json\"}")
done

rows_changed=0
for line in "${DIFF_LINES[@]}"; do
  IFS='|' read -r table from to delta <<< "$line"
  if [[ "$delta" != "-" && "$delta" != "0" && "$delta" != "new_table" ]]; then
    rows_changed=1
  fi
  if [[ "$delta" == "new_table" ]]; then
    rows_changed=1
  fi
done

if (( JSON_OUTPUT == 1 )); then
  if [[ ${#JSON_TABLES[@]} -eq 0 ]]; then
    json="[{\"table\":\"(none)\",\"from\":\"missing\",\"to\":\"missing\",\"delta\":\"-\"}]"
  else
    json="$(printf '%s\n' "${JSON_TABLES[@]}" | awk 'BEGIN{printf "["} {printf "%s%s", sep, $0; sep=","} END{printf "]"}')"
  fi

  payload="{\"from\":\"$FROM_LABEL\",\"to\":\"$TO_LABEL\",\"from_db\":\"$FROM_DB\",\"to_db\":\"$TO_DB\",\"workspace\":\"$WORKSPACE_ID\",\"rows_changed\":$rows_changed,\"tables\":$json}"
else
  payload="$(printf 'Comparing snapshots\\nFrom: %s (%s)\\nTo:   %s (%s)\\nWorkspace filter: %s\\n\\n' "$FROM_DB" "$FROM_LABEL" "$TO_DB" "$TO_LABEL" "$WORKSPACE_ID")"
  payload="$payload$(printf '%-26s %-14s %-14s %-14s\\n' 'table' "from:$FROM_LABEL" "to:$TO_LABEL" "delta")"
  payload="$payload$(printf '%-26s %-14s %-14s %-14s\\n' '-----' '-------------' '-----------' '-----')"
  for line in "${DIFF_LINES[@]}"; do
    IFS='|' read -r table from to delta <<< "$line"
    payload="$payload$(printf '%-26s %-14s %-14s %-14s\\n' "$table" "$from" "$to" "$delta")"
  done
  payload="$payload\\n"
  if [[ "$rows_changed" -eq 0 ]]; then
    payload="${payload}No row-change on the selected tables."
  else
    payload="${payload}Diff detected on at least one table."
  fi
fi

if [[ -n "$OUTPUT_FILE" ]]; then
  printf '%b' "$payload" > "$OUTPUT_FILE"
  echo "[immeuble-compare] wrote: $OUTPUT_FILE"
else
  printf '%b' "$payload"
fi
