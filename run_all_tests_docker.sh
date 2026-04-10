#!/bin/bash
# Run all tests (Zig/SQL tests and Go tests) in Docker containers
#
# Works on Linux x86_64, arm64, and Apple Silicon (M1/M2/M3).
#
# This script:
# 1. Builds and starts the pg_facets Docker container (no submodule required)
# 2. Runs SQL/Zig tests
# 3. Stops pg_facets, starts pg_facets_test, runs Go tests
# 4. Cleans up
#
# If port 5433 is in use: POSTGRES_PORT=5434 ./run_all_tests_docker.sh
# See README_MACOSX.md for M1-specific details.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Port for PostgreSQL (override if 5433 is in use: POSTGRES_PORT=5434 ./run_all_tests_docker.sh)
export POSTGRES_PORT="${POSTGRES_PORT:-5433}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  pg_facets Test Runner (Docker)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up Docker containers...${NC}"
    cd "$SCRIPT_DIR/extensions/pg_facets/examples/golang"
    docker-compose -f docker-compose.test.yml down -v --remove-orphans 2>/dev/null || true
    cd "$SCRIPT_DIR/extensions/pg_facets/docker"
    docker-compose down -v 2>/dev/null || true
}

# Set trap to cleanup on exit
trap cleanup EXIT

# =============================================================================
# Step 1: Build and start Docker container for SQL/Zig tests
# =============================================================================
echo -e "${YELLOW}Step 1: Building and starting PostgreSQL with pg_facets for SQL/Zig tests...${NC}"
cd "$SCRIPT_DIR/extensions/pg_facets/docker"

# Build and start
docker-compose build
POSTGRES_PORT="$POSTGRES_PORT" docker-compose up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker-compose exec -T pg_facets pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}PostgreSQL is ready!${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for PostgreSQL... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}ERROR: PostgreSQL did not become ready in time${NC}"
    docker-compose logs pg_facets
    exit 1
fi

# Allow PostgreSQL to stabilize (avoids "database system is shutting down" race)
sleep 3

# Verify extensions are installed (with retries for startup race)
echo -e "${YELLOW}Verifying extensions...${NC}"
VERIFY_RETRIES=5
VERIFY_RETRY=0
while [ $VERIFY_RETRY -lt $VERIFY_RETRIES ]; do
    if docker-compose exec -T pg_facets psql -U postgres -c "SELECT 1" > /dev/null 2>&1; then
        break
    fi
    VERIFY_RETRY=$((VERIFY_RETRY + 1))
    echo "Verification attempt $VERIFY_RETRY/$VERIFY_RETRIES failed, retrying in 3s..."
    sleep 3
done
if [ $VERIFY_RETRY -eq $VERIFY_RETRIES ]; then
    echo -e "${RED}ERROR: Could not connect to PostgreSQL after $VERIFY_RETRIES attempts${NC}"
    docker-compose logs pg_facets
    exit 1
fi
docker-compose exec -T pg_facets psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker-compose exec -T pg_facets psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS roaringbitmap;"
docker-compose exec -T pg_facets psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS pg_facets;"
docker-compose exec -T pg_facets psql -U postgres -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'roaringbitmap', 'pg_facets');"

# =============================================================================
# Step 2: Run SQL/Zig tests
# =============================================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Running SQL/Zig Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$SCRIPT_DIR/extensions/pg_facets/test"

# Set database connection for tests
export PGHOST=localhost
export PGPORT="$POSTGRES_PORT"
export PGUSER=postgres
export PGDATABASE=postgres
export PGPASSWORD=postgres

# Run all SQL tests
FAILED_SQL=0
CONTAINER_NAME="pg_facets"

echo -e "${YELLOW}Running Complete Test Suite...${NC}"
if docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -f /usr/share/postgresql/17/extension/pg_facets_test.sql 2>&1; then
    echo -e "${GREEN}✓ Complete test suite passed${NC}"
else
    echo -e "${RED}✗ Complete test suite failed${NC}"
    FAILED_SQL=1
fi

# Run individual test files
TEST_FILES=(
    "sql/version_0.4.1_test.sql"
    "sql/bm25_search_test.sql"
    "sql/bitmap_optimization_test.sql"
    "sql/complete_test.sql"
)

for test_file in "${TEST_FILES[@]}"; do
    if [ -f "$test_file" ]; then
        test_name=$(basename "$test_file" .sql)
        echo -e "${YELLOW}Running $test_name...${NC}"
        # Copy test file to container and run it
        if docker cp "$test_file" "$CONTAINER_NAME:/tmp/" 2>/dev/null; then
            if docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -f "/tmp/$(basename $test_file)" 2>&1; then
                echo -e "${GREEN}✓ $test_name passed${NC}"
            else
                echo -e "${RED}✗ $test_name failed${NC}"
                FAILED_SQL=1
            fi
        else
            # Alternative: use psql from host with password
            export PGPASSWORD=postgres
            if psql -h localhost -p "$POSTGRES_PORT" -U postgres -d postgres -f "$test_file" 2>&1; then
                echo -e "${GREEN}✓ $test_name passed${NC}"
            else
                echo -e "${RED}✗ $test_name failed${NC}"
                FAILED_SQL=1
            fi
        fi
    fi
done

# =============================================================================
# Step 3: Run Go tests
# =============================================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Running Go Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

cd "$SCRIPT_DIR/extensions/pg_facets/examples/golang"

# Stop pg_facets to free the port for pg_facets_test (both use the same port)
echo -e "${YELLOW}Stopping pg_facets to free port $POSTGRES_PORT for Go tests...${NC}"
cd "$SCRIPT_DIR/extensions/pg_facets/docker"
docker-compose down 2>/dev/null || true
cd "$SCRIPT_DIR/extensions/pg_facets/examples/golang"

# Build and start test container
echo -e "${YELLOW}Building and starting Go test container...${NC}"
POSTGRES_PORT="$POSTGRES_PORT" docker-compose -f docker-compose.test.yml build --no-cache
POSTGRES_PORT="$POSTGRES_PORT" docker-compose -f docker-compose.test.yml up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker-compose -f docker-compose.test.yml exec -T pg_facets_test pg_isready -U postgres > /dev/null 2>&1; then
        echo -e "${GREEN}PostgreSQL is ready!${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for PostgreSQL... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}ERROR: PostgreSQL did not become ready in time${NC}"
    docker-compose -f docker-compose.test.yml logs pg_facets_test
    exit 1
fi

# Verify extensions
echo -e "${YELLOW}Verifying extensions...${NC}"
docker-compose -f docker-compose.test.yml exec -T pg_facets_test psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker-compose -f docker-compose.test.yml exec -T pg_facets_test psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS roaringbitmap;"
docker-compose -f docker-compose.test.yml exec -T pg_facets_test psql -U postgres -c "CREATE EXTENSION IF NOT EXISTS pg_facets;"

# Run Go tests
echo -e "${YELLOW}Running Go tests...${NC}"
export TEST_DATABASE_URL="postgres://postgres:postgres@localhost:${POSTGRES_PORT}/postgres?sslmode=disable"
export PGFACETS_TEST_FAIL_ON_NO_DB=true

FAILED_GO=0
if go test -v -race -timeout 5m ./...; then
    echo -e "${GREEN}✓ All Go tests passed${NC}"
else
    echo -e "${RED}✗ Some Go tests failed${NC}"
    FAILED_GO=1
fi

# =============================================================================
# Step 4: Summary
# =============================================================================
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ $FAILED_SQL -eq 0 ] && [ $FAILED_GO -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo -e "${GREEN}  - SQL/Zig tests: PASSED${NC}"
    echo -e "${GREEN}  - Go tests: PASSED${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    if [ $FAILED_SQL -ne 0 ]; then
        echo -e "${RED}  - SQL/Zig tests: FAILED${NC}"
    fi
    if [ $FAILED_GO -ne 0 ]; then
        echo -e "${RED}  - Go tests: FAILED${NC}"
    fi
    EXIT_CODE=1
fi

echo -e "${BLUE}========================================${NC}"

exit $EXIT_CODE
