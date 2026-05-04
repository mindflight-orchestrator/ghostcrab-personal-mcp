#!/usr/bin/env sh
# Download the sqlite3 amalgamation into cmd/backend/deps/sqlite3/.
# Required before building the Zig backend.
# Version is pinned for reproducible builds; bump here + in publish.yml together.
set -eu

SQLITE_VERSION="${SQLITE_VERSION:-3490100}"   # 3.49.1
SQLITE_YEAR="${SQLITE_YEAR:-2025}"

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DEST="$ROOT/cmd/backend/deps/sqlite3"

mkdir -p "$DEST"

if [ -f "$DEST/sqlite3.c" ] && [ -f "$DEST/sqlite3.h" ]; then
    echo "[sqlite3] amalgamation already present in $DEST" >&2
    exit 0
fi

ZIP="$DEST/sqlite-amalgamation.zip"
URL="https://www.sqlite.org/${SQLITE_YEAR}/sqlite-amalgamation-${SQLITE_VERSION}.zip"

echo "[sqlite3] downloading amalgamation ${SQLITE_VERSION} from ${URL}" >&2
curl -fsSL "$URL" -o "$ZIP"

# Extract only the two files we need
if command -v unzip >/dev/null 2>&1; then
    unzip -j "$ZIP" "*/sqlite3.c" "*/sqlite3.h" -d "$DEST"
else
    # fallback via python (available on all CI runners)
    python3 -c "
import zipfile, sys, os
dest = sys.argv[1]
with zipfile.ZipFile(sys.argv[2]) as z:
    for name in z.namelist():
        basename = os.path.basename(name)
        if basename in ('sqlite3.c', 'sqlite3.h'):
            with open(os.path.join(dest, basename), 'wb') as f:
                f.write(z.read(name))
" "$DEST" "$ZIP"
fi

rm -f "$ZIP"
echo "[sqlite3] ready: $DEST/sqlite3.{c,h}" >&2
