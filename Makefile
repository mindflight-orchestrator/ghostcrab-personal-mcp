SHELL := /usr/bin/env bash

ZIG_OPTIMIZE ?= ReleaseFast
ZIG_TARGET ?=
COMPOSE_BIN ?= $(shell if command -v docker-compose >/dev/null 2>&1; then echo docker-compose; else echo docker compose; fi)
POSTGRES_SERVICE ?= postgres
POSTGRES_STACK ?= native
ifeq ($(POSTGRES_STACK),fallback)
DOCKER_COMPOSE ?= $(COMPOSE_BIN) --env-file .env -f docker/docker-compose.yml
POSTGRES_CONTAINER ?= ghostcrab_postgres
POSTGRES_VOLUME ?= ghostcrab-mcp_ghostcrab_postgres_data
else
DOCKER_COMPOSE ?= $(COMPOSE_BIN) --env-file .env -f docker/docker-compose.native.yml
POSTGRES_CONTAINER ?= ghostcrab_postgres_native
POSTGRES_VOLUME ?= ghostcrab-mcp_ghostcrab_postgres_native_data
endif
DATABASE_URL ?= $(shell sed -n 's/^DATABASE_URL=//p' .env | tail -n 1)

ifeq ($(strip $(ZIG_TARGET)),)
ZIG_TARGET_FLAG :=
else
ZIG_TARGET_FLAG := -Dtarget=$(ZIG_TARGET)
endif

ROARING_DIRS := \
	extensions/pg_facets/deps/pg_roaringbitmap \
	extensions/pg_dgraph/deps/pg_roaringbitmap

EXT_DIRS := \
	extensions/pg_facets \
	extensions/pg_dgraph

.PHONY: help submodules-init check-deps build-roaring build-pg_facets build-pg_dgraph build-extensions build-local build-linux-all test test-pg_facets test-pg_dgraph dev-up dev-down dev-restart dev-logs dev-ps dev-wait dev-migrate dev-bootstrap dev-db-reset clean

help:
	@echo "Targets:"
	@echo "  make submodules-init     # initialize all git submodules"
	@echo "  make build-roaring       # build/install pg_roaringbitmap in both extensions"
	@echo "  make build-pg_facets     # build pg_facets locally"
	@echo "  make build-pg_dgraph     # build pg_dgraph locally"
	@echo "  make build-extensions    # build both Zig extensions"
	@echo "  make build-local         # build roaringbitmap + both extensions"
	@echo "  make build-linux-all     # build Zig libs for linux amd64 + arm64"
	@echo "  make test-pg_facets      # run pg_facets tests (Docker: SQL + Go)"
	@echo "  make test-pg_dgraph     # run pg_dgraph tests (Docker)"
	@echo "  make test                # run tests for both extensions"
	@echo "  make dev-up              # build/start local PostgreSQL for MCP development"
	@echo "  make dev-down            # stop the local PostgreSQL compose stack"
	@echo "  make dev-restart         # restart the local PostgreSQL compose stack"
	@echo "  make dev-ps              # show compose service status"
	@echo "  make dev-logs            # follow PostgreSQL logs"
	@echo "  make dev-migrate         # run app migrations against DATABASE_URL"
	@echo "  make dev-bootstrap       # start PostgreSQL and run migrations"
	@echo "  make dev-db-reset        # rebuild a fresh local database volume and rerun migrations"
	@echo ""
	@echo "Variables:"
	@echo "  ZIG_TARGET=<triple>      # e.g. aarch64-macos or x86_64-linux-gnu"
	@echo "  ZIG_OPTIMIZE=<mode>      # default: ReleaseFast"
	@echo "  POSTGRES_PORT=<port>     # for test-pg_facets (default: 5433)"
	@echo "  POSTGRES_STACK=<mode>    # native (default) or fallback"

submodules-init:
	git submodule update --init --recursive

check-deps:
	@for d in $(ROARING_DIRS); do \
		if [[ ! -d "$$d" ]]; then \
			echo "Missing dependency: $$d"; \
			echo "Run: make submodules-init"; \
			exit 1; \
		fi; \
	done

build-roaring: check-deps
	@for d in $(ROARING_DIRS); do \
		echo "Building $$d"; \
		$(MAKE) -C "$$d" clean || true; \
		$(MAKE) -C "$$d"; \
		$(MAKE) -C "$$d" install; \
	done

build-pg_facets:
	@echo "Building extensions/pg_facets $(ZIG_TARGET_FLAG)"
	@cd extensions/pg_facets && zig build $(ZIG_TARGET_FLAG) -Doptimize=$(ZIG_OPTIMIZE)

build-pg_dgraph:
	@echo "Building extensions/pg_dgraph $(ZIG_TARGET_FLAG)"
	@cd extensions/pg_dgraph && zig build $(ZIG_TARGET_FLAG) -Doptimize=$(ZIG_OPTIMIZE)

build-extensions: build-pg_facets build-pg_dgraph

build-local: build-roaring build-extensions

# Cross-build Zig artifacts for common Linux processor targets.
# Note: pg_roaringbitmap is compiled with host toolchain when using build-roaring.
build-linux-all:
	@for t in x86_64-linux-gnu aarch64-linux-gnu; do \
		echo "Building Zig extensions for $$t"; \
		$(MAKE) build-extensions ZIG_TARGET="$$t" ZIG_OPTIMIZE="$(ZIG_OPTIMIZE)"; \
	done

test-pg_facets:
	@echo "Running pg_facets tests (Docker: SQL + Go)..."
	@./run_all_tests_docker.sh

test-pg_dgraph:
	@echo "Running pg_dgraph tests (Docker)..."
	@cd extensions/pg_dgraph && ./docker/run_tests.sh

test: test-pg_facets test-pg_dgraph

dev-up:
	@echo "Starting local PostgreSQL for GhostCrab MCP..."
	@$(DOCKER_COMPOSE) up -d --build $(POSTGRES_SERVICE)
	@$(MAKE) dev-wait

dev-down:
	@echo "Stopping local PostgreSQL compose stack..."
	@$(DOCKER_COMPOSE) down --remove-orphans

dev-restart: dev-down dev-up

dev-ps:
	@$(DOCKER_COMPOSE) ps

dev-logs:
	@$(DOCKER_COMPOSE) logs -f $(POSTGRES_SERVICE)

dev-wait:
	@echo "Waiting for PostgreSQL to become healthy..."
	@attempts=0; \
	until [[ "$$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $(POSTGRES_CONTAINER) 2>/dev/null)" == "healthy" ]]; do \
		attempts=$$((attempts + 1)); \
		if [[ $$attempts -ge 30 ]]; then \
			echo "PostgreSQL did not become healthy in time."; \
			$(DOCKER_COMPOSE) logs $(POSTGRES_SERVICE); \
			exit 1; \
		fi; \
		sleep 2; \
	done; \
	echo "PostgreSQL is healthy."

dev-migrate:
	@echo "Running migrations on $(DATABASE_URL)..."
	@DATABASE_URL="$(DATABASE_URL)" npm run migrate

dev-bootstrap: dev-up dev-migrate

dev-db-reset:
	@echo "Resetting local PostgreSQL volume and rebuilding the stack..."
	@$(DOCKER_COMPOSE) down -v --remove-orphans
	@docker volume rm $(POSTGRES_VOLUME) >/dev/null 2>&1 || true
	@$(MAKE) dev-up
	@$(MAKE) dev-migrate

clean:
	@for d in $(EXT_DIRS); do \
		if [[ -d "$$d/zig-out" ]]; then rm -rf "$$d/zig-out"; fi; \
		if [[ -d "$$d/.zig-cache" ]]; then rm -rf "$$d/.zig-cache"; fi; \
	done
