#!/bin/bash
set -e

# Custom entrypoint script for PostgreSQL
# This script ensures postgresql.conf is copied to PGDATA after initialization
# and then delegates to the original PostgreSQL entrypoint

# Find the original entrypoint script
# pgvector/pgvector image inherits from official postgres image
ORIGINAL_ENTRYPOINT="/usr/local/bin/docker-entrypoint.sh"
if [ ! -f "$ORIGINAL_ENTRYPOINT" ]; then
    # Try alternative location
    ORIGINAL_ENTRYPOINT="/docker-entrypoint.sh"
fi

# Function to copy config file when PGDATA is ready
copy_config_if_needed() {
    if [ -f /etc/postgresql/postgresql.conf ] && [ -d "$PGDATA" ] && [ -s "$PGDATA/PG_VERSION" ] 2>/dev/null; then
        echo "Copying custom postgresql.conf to PGDATA..."
        cp /etc/postgresql/postgresql.conf "$PGDATA/postgresql.conf"
        echo "Custom postgresql.conf applied to $PGDATA/postgresql.conf"
    fi
}

# If PGDATA is set and initialized, copy config before proceeding
if [ -n "$PGDATA" ]; then
    copy_config_if_needed
fi

# Execute the original PostgreSQL entrypoint with all arguments
exec "$ORIGINAL_ENTRYPOINT" "$@"
