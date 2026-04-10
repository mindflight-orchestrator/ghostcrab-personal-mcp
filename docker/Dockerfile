# syntax=docker/dockerfile:1.7

ARG PGVECTOR_IMAGE=pgvector/pgvector:pg17
FROM ${PGVECTOR_IMAGE}

ARG PG_MAJOR=17

ENV DEBIAN_FRONTEND=noninteractive \
    MFO_NATIVE_EXTENSIONS=auto \
    POSTGRES_DB=ghostcrab \
    POSTGRES_USER=ghostcrab \
    POSTGRES_PASSWORD=ghostcrab

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        postgresql-contrib-${PG_MAJOR} && \
    rm -rf /var/lib/apt/lists/*

COPY docker/postgresql.conf /etc/postgresql/postgresql.conf
COPY docker/init/00_extensions.sql /docker-entrypoint-initdb.d/00_extensions.sql
COPY docker/healthcheck.sh /usr/local/bin/healthcheck.sh

RUN chmod +x /usr/local/bin/healthcheck.sh

HEALTHCHECK --interval=5s --timeout=5s --retries=12 \
  CMD /usr/local/bin/healthcheck.sh

CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
