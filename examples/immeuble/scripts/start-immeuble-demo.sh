#!/usr/bin/env bash
# Start the Immeuble demo pipeline end-to-end.
set -eu

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)"
IMMEUBLE_ROOT="$REPO_ROOT/examples/immeuble"
LIVE_LAB_SCRIPT="$IMMEUBLE_ROOT/scripts/run-immeuble-live-lab.sh"

usage() {
  cat <<EOF
Usage: examples/immeuble/scripts/start-immeuble-demo.sh [run-immeuble-live-lab args...]

Start the Immeuble backend and run the full live lab flow.

If --with-live-verify is not provided, this wrapper enables it automatically so
the run includes artifact seed + live verification by default.

Examples:
  ./examples/immeuble/scripts/start-immeuble-demo.sh --db /tmp/immeuble-lab-complete.sqlite --engine both
  ./examples/immeuble/scripts/start-immeuble-demo.sh --db /tmp/immeuble-lab-complete.sqlite --engine both --stop-after live_verify
  ./examples/immeuble/scripts/start-immeuble-demo.sh --help
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ ! -x "$LIVE_LAB_SCRIPT" ]]; then
  echo "[immeuble-demo] unable to run live-lab script: $LIVE_LAB_SCRIPT" >&2
  exit 1
fi

LIVE_ARGS=()
HAS_LIVE_VERIFY=0

for arg in "$@"; do
  if [[ "$arg" == "--with-live-verify" ]]; then
    HAS_LIVE_VERIFY=1
    break
  fi
done

if (( HAS_LIVE_VERIFY == 0 )); then
  LIVE_ARGS+=("--with-live-verify")
fi

LIVE_ARGS+=("$@")

echo "[immeuble-demo] running: $LIVE_LAB_SCRIPT ${LIVE_ARGS[*]}"
exec "$LIVE_LAB_SCRIPT" "${LIVE_ARGS[@]}"
