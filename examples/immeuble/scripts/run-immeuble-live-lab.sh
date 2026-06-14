#!/usr/bin/env bash
# Run a complete Immeuble pipeline against a fresh SQLite DB with a managed backend.
# Backend launch is standalone (`ghostcrab-backend`), and gcp steps talk to its HTTP
# endpoint via `GHOSTCRAB_MINDBRAIN_URL`.
set -eu

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
IMMEUBLE_ROOT="$REPO_ROOT/examples/immeuble"
BACKEND_SCRIPT="$IMMEUBLE_ROOT/scripts/run-immeuble-backend.sh"
NODE_BIN="${NODE:-node}"
BACKEND_BIN="${GHOSTCRAB_BACKEND_BIN:-$REPO_ROOT/cmd/backend/zig-out/bin/ghostcrab-backend}"
BACKEND_ADDR="${GHOSTCRAB_BACKEND_ADDR:-:8091}"
BACKEND_HOST="127.0.0.1"
BACKEND_PORT="${BACKEND_ADDR##*:}"
BACKEND_URL="http://$BACKEND_HOST:${BACKEND_PORT}"
DB_PATH="$REPO_ROOT/data/immeuble-lab.sqlite"
WORKSPACE_ID="immeuble"
ENGINE="legacy"
REPORTS_DIR="$IMMEUBLE_ROOT/reports"
BACKUP_DIR="$REPO_ROOT/data/immeuble-lab-backups"
RUN_BUNDLE=0
RUN_ARTIFACT_SEED=0
RUN_LIVE_VERIFY=0
RUN_PROJECTION_PLAN=0
RUN_LEGACY_AUDIT=0
PROJECTION_STRICT=0
AUTO_ARTIFACT_SEED=0
STOP_AFTER=""
SKIP_PREFLIGHT=1
SKIP_PROVENANCE=1
SKIP_IF_NO_DB=0
REQUIRE_HYBRID=0

usage() {
  cat <<EOF
Usage: examples/immeuble/scripts/run-immeuble-live-lab.sh [options]

Run the Immeuble pipeline and snapshot the SQLite DB after each executed stage.

Options:
  --db <path>                 SQLite file to use (default: $DB_PATH)
  --workspace-id <id>         Workspace id (default: immeuble)
  --engine <legacy|both>      Import engine for structured import (default: legacy)
  --backend-bin <path>        ghostcrab-backend binary path
  --backend-addr <:port>      backend listen address (default: :8091)
  --backup-dir <path>         directory where sqlite snapshots are stored
  --with-bundle-load           load examples/immeuble/bundle/immeuble.bundle.json after import
  --with-artifact-seed         load answer artifact seed after import
  --with-live-verify           run live refresh verification (requires running backend, and enables answer artifact seed)
  --with-projection-plan       run StarterKit projection candidate analysis before import
  --with-legacy-audit          run legacy audit-immeuble-projections.mjs smoke (optional)
  --projection-strict          fail on projection plan/audit gaps (facets, edges, schemas, missing scopes)
  --stop-after <stage>         stop after one stage: build|projection_plan|import|verify|bundle|artifact_seed|audit|live_verify
  --preflight                 force preflight checks during import
  --validate-provenance        force provenance validation during import
  --require-hybrid             require hybrid deltas to be 0 after import
  --keep-existing-db           keep existing DB file (do not delete before run)
  -h, --help                  show this help

Note:
  The script starts a local MindBrain backend process (standalone HTTP server, default 127.0.0.1:8091)
  and runs commands through gcp and other Immeuble scripts.
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
  esac
done

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      DB_PATH="${2:?--db requires a value}"
      shift 2
      ;;
    --workspace-id)
      WORKSPACE_ID="${2:?--workspace-id requires a value}"
      shift 2
      ;;
    --engine)
      ENGINE="${2:?--engine requires a value}"
      if [[ "$ENGINE" != "legacy" && "$ENGINE" != "both" ]]; then
        echo "[immeuble-lab] --engine must be legacy or both" >&2
        exit 1
      fi
      shift 2
      ;;
    --backend-bin)
      BACKEND_BIN="${2:?--backend-bin requires a value}"
      shift 2
      ;;
    --backend-addr)
      BACKEND_ADDR="${2:?--backend-addr requires a value}"
      BACKEND_PORT="${BACKEND_ADDR##*:}"
      BACKEND_URL="http://$BACKEND_HOST:${BACKEND_PORT}"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="${2:?--backup-dir requires a value}"
      shift 2
      ;;
    --with-bundle-load)
      RUN_BUNDLE=1
      shift
      ;;
    --with-artifact-seed)
      RUN_ARTIFACT_SEED=1
      shift
      ;;
    --with-live-verify)
      RUN_LIVE_VERIFY=1
      shift
      ;;
    --with-projection-plan)
      RUN_PROJECTION_PLAN=1
      shift
      ;;
    --with-legacy-audit)
      RUN_LEGACY_AUDIT=1
      shift
      ;;
    --projection-strict)
      PROJECTION_STRICT=1
      shift
      ;;
    --stop-after)
      STOP_AFTER="${2:?--stop-after requires a stage}"
      case "$STOP_AFTER" in
        build|projection_plan|import|verify|bundle|artifact_seed|audit|live_verify)
          ;;
        *)
          echo "[immeuble-lab] invalid stage for --stop-after: $STOP_AFTER" >&2
          exit 1
          ;;
      esac
      shift 2
      ;;
    --preflight)
      SKIP_PREFLIGHT=0
      shift
      ;;
    --validate-provenance)
      SKIP_PROVENANCE=0
      shift
      ;;
    --require-hybrid)
      REQUIRE_HYBRID=1
      shift
      ;;
    --keep-existing-db)
      SKIP_IF_NO_DB=1
      shift
      ;;
    *)
      echo "[immeuble-lab] unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if (( RUN_LIVE_VERIFY == 1 && RUN_ARTIFACT_SEED == 0 )); then
  AUTO_ARTIFACT_SEED=1
  RUN_ARTIFACT_SEED=1
  echo "[immeuble-lab] auto-enabling artifact seed because --with-live-verify was requested"
fi

mkdir -p "$BACKUP_DIR"
mkdir -p "$REPORTS_DIR"
mkdir -p "$(dirname "$DB_PATH")"

if (( SKIP_IF_NO_DB == 0 )); then
  rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
fi

if [[ ! -x "$BACKEND_BIN" ]]; then
  echo "[immeuble-lab] backend binary not found: $BACKEND_BIN" >&2
  echo "            build it with: ZIG=zig-0.16 pnpm run backend:build" >&2
  exit 1
fi

if [[ ! -x "$BACKEND_SCRIPT" ]]; then
  echo "[immeuble-lab] backend wrapper not found: $BACKEND_SCRIPT" >&2
  exit 1
fi

BACKEND_PID=""
BACKEND_LOG_FILE="${BACKEND_LOG_FILE:-$IMMEUBLE_ROOT/.tmp-backend-lab.log}"

cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
    BACKEND_PID=""
  fi
}
trap cleanup EXIT

backend_flags=(
  --db "$DB_PATH"
  --backend-bin "$BACKEND_BIN"
  --backend-addr "$BACKEND_ADDR"
  --workspace-name "$WORKSPACE_ID"
  --log-file "$BACKEND_LOG_FILE"
  --ready-timeout 30
)

echo "[immeuble-lab] starting backend via $BACKEND_SCRIPT"
backend_output="$("$BACKEND_SCRIPT" "${backend_flags[@]}")" || {
  echo "[immeuble-lab] backend wrapper failed" >&2
  exit 1
}

BACKEND_PID="$(printf '%s\n' "$backend_output" | sed -n 's/^\[immeuble-backend\] BACKEND_PID=//p' | tail -1)"
parsed_backend_url="$(printf '%s\n' "$backend_output" | sed -n 's/^\[immeuble-backend\] BACKEND_URL=//p' | tail -1)"

if [[ -z "$BACKEND_PID" ]]; then
  echo "[immeuble-lab] could not parse BACKEND_PID from backend wrapper output" >&2
  printf '%s\n' "$backend_output" >&2
  exit 1
fi

if [[ -n "$parsed_backend_url" ]]; then
  BACKEND_URL="$parsed_backend_url"
fi

echo "[immeuble-lab] backend pid=$BACKEND_PID log=$BACKEND_LOG_FILE url=$BACKEND_URL"

export GHOSTCRAB_MINDBRAIN_URL="$BACKEND_URL"
export GHOSTCRAB_MINDBRAIN_HTTP_TIMEOUT_MS="${GHOSTCRAB_MINDBRAIN_HTTP_TIMEOUT_MS:-30000}"

run_step() {
  local name="$1"
  shift

  echo "[immeuble-lab] step: $name"
  if ! "$@"; then
    echo "[immeuble-lab] step failed: $name" >&2
    return 1
  fi
  take_snapshot "$name"
  if [[ -n "$STOP_AFTER" && "$STOP_AFTER" == "$name" ]]; then
    echo "[immeuble-lab] stopping after $name (requested by --stop-after)"
    exit 0
  fi
}

take_snapshot() {
  local stage="$1"
  local ts
  ts="$(date +%Y%m%d-%H%M%S)"
  local suffix="${ts}-${stage}.sqlite"
  local dst="$BACKUP_DIR/$suffix"

  if [[ ! -f "$DB_PATH" ]]; then
    echo "[immeuble-lab] snapshot skipped (missing db): $dst"
    return 0
  fi

  if command -v sqlite3 >/dev/null 2>&1; then
    if ! sqlite3 "$DB_PATH" ".backup '$dst'"; then
      echo "[immeuble-lab] sqlite backup failed with sqlite3, fallback to cp: $dst" >&2
      cp -f "$DB_PATH" "$dst"
    fi
  else
    cp -f "$DB_PATH" "$dst"
  fi
  for suffix_ext in -wal -shm; do
    if [[ -f "$DB_PATH$suffix_ext" ]]; then
      cp -f "$DB_PATH$suffix_ext" "$dst$suffix_ext"
    fi
  done

  echo "[immeuble-lab] snapshot: $dst"
}

build_step() {
  "$NODE_BIN" "$IMMEUBLE_ROOT/scripts/build-immeuble-model.mjs"
}

import_step() {
  local flags=(
    "--apply"
    "--workspace-id" "$WORKSPACE_ID"
    "--db" "$DB_PATH"
    "--engine" "$ENGINE"
  )

  if [[ "$SKIP_PREFLIGHT" -eq 1 ]]; then
    flags+=("--skip-preflight")
  fi
  if [[ "$SKIP_PROVENANCE" -eq 1 ]]; then
    flags+=("--skip-provenance-validation")
  fi
  if [[ "$ENGINE" == "both" ]]; then
    flags+=(
      "--compare-output" "$REPORTS_DIR/hybrid-compare.json"
    )
  fi
  flags+=("--force")
  "$NODE_BIN" "$IMMEUBLE_ROOT/scripts/run-immeuble-import.mjs" "${flags[@]}"
}

verify_step() {
  local flags=("--db" "$DB_PATH")
  if [[ "$REQUIRE_HYBRID" -eq 1 ]]; then
    flags+=("--require-hybrid")
  fi
  if [[ "$PROJECTION_STRICT" -eq 1 ]]; then
    flags+=("--projection-strict")
  fi
  "$NODE_BIN" "$IMMEUBLE_ROOT/scripts/verify-immeuble-acceptance.mjs" "${flags[@]}"
}

artifact_seed_step() {
  "$NODE_BIN" "$REPO_ROOT/bin/gcp.mjs" \
    load "$IMMEUBLE_ROOT/contracts/answer_artifacts.seed.jsonl" \
    --workspace "$WORKSPACE_ID"
}

bundle_step() {
  "$NODE_BIN" "$REPO_ROOT/bin/gcp.mjs" \
    load "$IMMEUBLE_ROOT/bundle/immeuble.bundle.json" \
    --workspace "$WORKSPACE_ID" \
    --reindex all \
    --force
}

STARTERKIT_DIR="$IMMEUBLE_ROOT/scripts/starterkit"
MODEL_CONTRACT="$IMMEUBLE_ROOT/contracts/model_contract.json"
PROJECTION_CATALOG="$IMMEUBLE_ROOT/contracts/projection_catalog.yaml"
ARTIFACT_SEED="$IMMEUBLE_ROOT/contracts/answer_artifacts.seed.jsonl"

projection_plan_step() {
  local flags=(
    "--db" "$DB_PATH"
    "--workspace" "$WORKSPACE_ID"
    "--projection-catalog" "$PROJECTION_CATALOG"
    "--model-contract" "$MODEL_CONTRACT"
    "--output-dir" "$REPORTS_DIR"
    "--include-blind-spots"
    "--include-jtbd"
  )
  if [[ "$PROJECTION_STRICT" -eq 1 ]]; then
    flags+=("--strict")
  fi
  "$NODE_BIN" "$STARTERKIT_DIR/analyze-projection-candidates.mjs" "${flags[@]}"
}

audit_step() {
  local flags=(
    "--db" "$DB_PATH"
    "--workspace" "$WORKSPACE_ID"
    "--model" "$MODEL_CONTRACT"
    "--answer-artifacts-seed" "$ARTIFACT_SEED"
    "--output-dir" "$REPORTS_DIR"
  )
  if [[ "$PROJECTION_STRICT" -eq 1 ]]; then
    flags+=("--strict")
  fi
  "$NODE_BIN" "$STARTERKIT_DIR/audit-ghostcrab-projections.mjs" "${flags[@]}"
}

legacy_audit_step() {
  "$NODE_BIN" "$IMMEUBLE_ROOT/scripts/audit-immeuble-projections.mjs" \
    --workspace-id "$WORKSPACE_ID"
}

live_verify_step() {
  "$NODE_BIN" "$IMMEUBLE_ROOT/scripts/verify-immeuble-live-artifacts.mjs" \
    --workspace-id "$WORKSPACE_ID" \
    --url "$BACKEND_URL"
}

# Snapshot before first step.
take_snapshot "00-start"

run_step "build" build_step

if [[ "$RUN_PROJECTION_PLAN" -eq 1 ]]; then
  run_step "projection_plan" projection_plan_step
fi

run_step "import" import_step

if [[ "$RUN_ARTIFACT_SEED" -eq 1 ]]; then
  if (( AUTO_ARTIFACT_SEED == 1 )); then
    echo "[immeuble-lab] loading artifact seed for live verification preconditions"
  fi
  run_step "artifact_seed" artifact_seed_step
fi

if [[ "$RUN_BUNDLE" -eq 1 ]]; then
  run_step "bundle" bundle_step
fi

run_step "audit" audit_step
run_step "verify" verify_step

if [[ "$RUN_LEGACY_AUDIT" -eq 1 ]]; then
  echo "[immeuble-lab] running legacy projection smoke audit"
  legacy_audit_step || {
    if [[ "$PROJECTION_STRICT" -eq 1 ]]; then
      echo "[immeuble-lab] legacy audit failed in strict mode" >&2
      exit 1
    fi
    echo "[immeuble-lab] legacy audit failed (informational, non-blocking)"
  }
fi

if [[ "$RUN_LIVE_VERIFY" -eq 1 ]]; then
  run_step "live_verify" live_verify_step
fi

echo "[immeuble-lab] completed"
