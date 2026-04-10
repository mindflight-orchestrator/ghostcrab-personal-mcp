#!/bin/sh
set -eu

pg_isready -U "${POSTGRES_USER:-ghostcrab}" -d "${POSTGRES_DB:-ghostcrab}" -q

psql \
  -U "${POSTGRES_USER:-ghostcrab}" \
  -d "${POSTGRES_DB:-ghostcrab}" \
  -tAc "SELECT 1" \
  > /dev/null
