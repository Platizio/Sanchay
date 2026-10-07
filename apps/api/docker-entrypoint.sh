#!/bin/sh
set -eu

# R-15: dev/prod always connect with sslmode=verify-full against the baked-in RDS CA bundle.
# SANCHAY_DB_* pieces come from plain container env (host/port/name/user) plus one ECS secret
# (SANCHAY_DB_PASSWORD) — see E25's deviation note (CDK cannot compose one Secrets Manager
# value from a generated secret field and plain strings without a custom resource).
if [ -z "${DATABASE_URL:-}" ] && [ -n "${SANCHAY_DB_HOST:-}" ]; then
  export DATABASE_URL="postgres://${SANCHAY_DB_USER}:${SANCHAY_DB_PASSWORD}@${SANCHAY_DB_HOST}:${SANCHAY_DB_PORT}/${SANCHAY_DB_NAME}?sslmode=verify-full"
fi

exec "$@"
