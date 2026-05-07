# GhostCrab personal — local SQLite install
#
# Supported environments for this Makefile:
#   - macOS: yes (clang/Xcode tools not required; only make + npm + shell)
#   - Linux: yes
#   - Windows: use WSL (Linux), or Git Bash / MSYS2 with GNU Make + bash-like
#     utilities (uname, test, cp, rm, grep, head). Plain PowerShell/cmd without
#     those tools: use  node install-beta.mjs  instead, or  make PLATFORM=win32-x64
#     from a shell where GNU make runs recipe lines through sh.

# Usage:  make                        (auto-detect platform, full setup)
#         make PLATFORM=darwin-arm64  (force a specific platform binary)
#         make VERSION=0.2.15        (match tarball filenames)
#         make BUNDLE_DIR=.          (default: tarballs in cwd — e.g. flat unzip)
#         make BUNDLE_DIR=subdir     (tarballs under subdir/)
#         make install               (npm packages only)
#         make env                   (copy .env.example → .env if missing)
#         make check                 (smoke-test the CLI)
#         make mcp                   (print/verify Cursor mcp.json snippet)
#
# PLATFORM keys (must match tarball names):
#   darwin-arm64   macOS Apple Silicon
#   darwin-x64     macOS Intel
#   linux-arm64    Linux ARM64 (incl. Linux on WSL/arm64)
#   linux-x64      Linux x64 (incl. WSL2 on Intel/AMD)
#   win32-x64      Windows x64 (prebuild in bundle)

VERSION    ?= 0.2.15
BUNDLE_DIR ?= .
NODE       := $(shell command -v node 2>/dev/null)
GCP_MJS    := ./node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs
MCP_JSON   := $(HOME)/.cursor/mcp.json
INSTALL_DONE := node_modules/@mindflight/ghostcrab-personal-mcp/bin/gcp.mjs
ENV_EXAMPLE := $(abspath $(dir $(GCP_MJS))../.env.example)

# Auto-detect host for PLATFORM tarball. Git Bash / MSYS report MINGW* / MSYS* — map to win32.
_RAW_OS := $(shell uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]')
_ARCH   := $(shell uname -m 2>/dev/null)
ifneq (,$(findstring mingw,$(_RAW_OS)))
  _OS := win32
else ifneq (,$(findstring msys,$(_RAW_OS)))
  _OS := win32
else ifneq (,$(findstring cygwin,$(_RAW_OS)))
  _OS := win32
else
  _OS := $(_RAW_OS)
endif
ifeq ($(_ARCH),arm64)
  _ARCH := arm64
else ifeq ($(_ARCH),x86_64)
  _ARCH := x64
else ifeq ($(_ARCH),amd64)
  _ARCH := x64
endif
PLATFORM ?= $(_OS)-$(_ARCH)

ROOT_TGZ     := $(BUNDLE_DIR)/mindflight-ghostcrab-personal-mcp-$(VERSION).tgz
PLATFORM_TGZ := $(BUNDLE_DIR)/mindflight-ghostcrab-personal-mcp-$(PLATFORM)-$(VERSION).tgz

.DEFAULT_GOAL := all

.PHONY: all
all: install authorize env check
	@echo ""
	@echo "✓ GhostCrab ready.  Next: make mcp  (to review Cursor config)"

.PHONY: install
install: $(INSTALL_DONE)

$(INSTALL_DONE): $(ROOT_TGZ) $(PLATFORM_TGZ)
	@echo "→ Platform detected: $(PLATFORM)"
	@test -f "$(PLATFORM_TGZ)" || \
		(echo "ERROR: $(PLATFORM_TGZ) not found — check .tgz in $(BUNDLE_DIR)/ (set VERSION=, BUNDLE_DIR=, or PLATFORM=)" && exit 1)
	@echo "→ Installing root package…"
	npm install "$(ROOT_TGZ)"
	@echo "→ Installing platform binary ($(PLATFORM))…"
	npm install "$(PLATFORM_TGZ)" --no-package-lock
	@echo "✓ npm install done ($(PLATFORM))"

.PHONY: authorize
authorize:
	@echo "→ Authorizing native backend (removes quarantine, sets +x)…"
	@test -f "$(GCP_MJS)" || (echo "ERROR: run 'make install' first" && exit 1)
	node "$(GCP_MJS)" authorize || true
	@echo "✓ authorize done"

.PHONY: env
env:
	@test -f "$(GCP_MJS)" || (echo "ERROR: run 'make install' first" && exit 1)
	@test -f "$(ENV_EXAMPLE)" || (echo "ERROR: missing $(ENV_EXAMPLE)" && exit 1)
	@if [ -f .env ]; then \
		echo "✓ .env already present — not overwritten (edit for API keys / embeddings)"; \
	else \
		cp "$(ENV_EXAMPLE)" .env && \
		echo "✓ created .env from package .env.example — edit if you use embeddings / external LLM APIs"; \
	fi

.PHONY: check
check:
	@echo "→ Smoke test: gcp --help"
	@test -f "$(GCP_MJS)" || (echo "ERROR: run 'make install' first" && exit 1)
	@node "$(GCP_MJS)" --help | head -6
	@echo "✓ CLI ok"

.PHONY: mcp
mcp:
	@echo ""
	@echo "── Cursor MCP entry (add to ~/.cursor/mcp.json or .cursor/mcp.json) ──"
	@echo ""
	@echo '{'
	@echo '  "mcpServers": {'
	@echo '    "ghostcrab perso": {'
	@echo '      "command": "$(NODE)",'
	@echo '      "args": ['
	@echo '        "$(abspath $(GCP_MJS))",'
	@echo '        "brain", "up"'
	@echo '      ],'
	@echo '      "env": {'
	@echo '        "PATH": "$(dir $(NODE)):$$PATH",'
	@echo '        "GHOSTCRAB_DATABASE_KIND": "sqlite",'
	@echo '        "GHOSTCRAB_EMBEDDINGS_MODE": "disabled"'
	@echo '      }'
	@echo '    }'
	@echo '  }'
	@echo '}'
	@echo ""
	@echo "Current config: $(MCP_JSON)"
	@grep -q "ghostcrab perso" "$(MCP_JSON)" 2>/dev/null \
		&& echo "✓ Entry 'ghostcrab perso' already present in $(MCP_JSON)" \
		|| echo "⚠ Entry missing — copy the block above into $(MCP_JSON)"

.PHONY: clean
clean:
	rm -rf node_modules package-lock.json
	@echo "✓ node_modules removed (tarballs kept)"
