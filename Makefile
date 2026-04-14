SHELL := /usr/bin/env bash

ZIG_OPTIMIZE ?= ReleaseFast
ZIG_TARGET ?=
GHOSTCRAB_BACKEND_ADDR ?= :8091
GHOSTCRAB_SQLITE_PATH ?= data/ghostcrab.sqlite
GHOSTCRAB_MINDBRAIN_URL ?= http://127.0.0.1:8091

ifeq ($(strip $(ZIG_TARGET)),)
ZIG_TARGET_FLAG :=
else
ZIG_TARGET_FLAG := -Dtarget=$(ZIG_TARGET)
endif

BACKEND_BIN := cmd/backend/zig-out/bin/ghostcrab-backend
SQLITE3_C   := cmd/backend/deps/sqlite3/sqlite3.c

# Cross-compile targets → npm prebuilds/ directory names
CROSS_TARGETS := \
  x86_64-linux-gnu:linux-x64 \
  aarch64-linux-gnu:linux-arm64 \
  x86_64-macos:darwin-x64 \
  aarch64-macos:darwin-arm64 \
  x86_64-windows-gnu:win32-x64

.PHONY: help backend-vendor sqlite3-download backend-build backend-build-debug \
        backend-dev backend-init prebuilds smoke-backend smoke clean

help:
	@echo "GhostCrab SQLite — Makefile targets"
	@echo ""
	@echo "Setup:"
	@echo "  make backend-vendor      # ensure vendor/mindbrain + vendor/ztoon symlinks"
	@echo "  make sqlite3-download    # download sqlite3 amalgamation to deps/sqlite3/"
	@echo ""
	@echo "Backend (Zig):"
	@echo "  make backend-build       # build ghostcrab-backend (ReleaseFast, host platform)"
	@echo "  make backend-build-debug # build ghostcrab-backend (Debug)"
	@echo "  make backend-init        # initialize the SQLite database and exit"
	@echo "  make backend-dev         # run the backend (GHOSTCRAB_SQLITE_PATH=$(GHOSTCRAB_SQLITE_PATH))"
	@echo ""
	@echo "Distribution:"
	@echo "  make prebuilds           # cross-compile all 5 platforms into prebuilds/"
	@echo ""
	@echo "Smoke:"
	@echo "  make smoke-backend       # quick curl smoke test (requires running backend)"
	@echo ""
	@echo "Other:"
	@echo "  make clean               # remove build artifacts"
	@echo ""
	@echo "Env overrides:"
	@echo "  GHOSTCRAB_BACKEND_ADDR=$(GHOSTCRAB_BACKEND_ADDR)"
	@echo "  GHOSTCRAB_SQLITE_PATH=$(GHOSTCRAB_SQLITE_PATH)"
	@echo "  GHOSTCRAB_MINDBRAIN_URL=$(GHOSTCRAB_MINDBRAIN_URL)"
	@echo ""
	@echo "Variables:"
	@echo "  ZIG_TARGET=<triple>      # e.g. aarch64-macos or x86_64-linux-gnu"
	@echo "  ZIG_OPTIMIZE=<mode>      # default: ReleaseFast"

backend-vendor:
	@scripts/ensure-vendor.sh

sqlite3-download: ## Download the sqlite3 amalgamation (pinned version)
	@scripts/download-sqlite3.sh

$(SQLITE3_C): sqlite3-download

backend-build: backend-vendor $(SQLITE3_C)
	@echo "Building ghostcrab-backend ($(ZIG_OPTIMIZE)) $(ZIG_TARGET_FLAG)"
	@cd cmd/backend && zig build $(ZIG_TARGET_FLAG) -Doptimize=$(ZIG_OPTIMIZE)

backend-build-debug: backend-vendor $(SQLITE3_C)
	@echo "Building ghostcrab-backend (Debug)"
	@cd cmd/backend && zig build

backend-init: $(BACKEND_BIN)
	@GHOSTCRAB_SQLITE_PATH=$(GHOSTCRAB_SQLITE_PATH) \
	  $(BACKEND_BIN) --addr $(GHOSTCRAB_BACKEND_ADDR) --db $(GHOSTCRAB_SQLITE_PATH) --init-only

backend-dev: $(BACKEND_BIN)
	@echo "Starting ghostcrab-backend on $(GHOSTCRAB_BACKEND_ADDR) → $(GHOSTCRAB_SQLITE_PATH)"
	@GHOSTCRAB_BACKEND_ADDR=$(GHOSTCRAB_BACKEND_ADDR) \
	  GHOSTCRAB_SQLITE_PATH=$(GHOSTCRAB_SQLITE_PATH) \
	  $(BACKEND_BIN)

$(BACKEND_BIN): backend-vendor $(SQLITE3_C)
	$(MAKE) backend-build

## Cross-compile all 5 platforms into prebuilds/ for npm distribution.
## Requires Zig in PATH. Run `make sqlite3-download backend-vendor` first.
prebuilds: backend-vendor $(SQLITE3_C)
	@mkdir -p \
	  prebuilds/linux-x64 prebuilds/linux-arm64 \
	  prebuilds/darwin-x64 prebuilds/darwin-arm64 \
	  prebuilds/win32-x64
	@scripts/cross-build-all.sh

smoke-backend:
	@scripts/smoke-backend.sh

smoke: smoke-backend

clean:
	@if [[ -d "cmd/backend/zig-out" ]]; then rm -rf cmd/backend/zig-out; fi
	@if [[ -d "cmd/backend/.zig-cache" ]]; then rm -rf cmd/backend/.zig-cache; fi
