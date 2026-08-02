#!/usr/bin/env bash
#
# Runs the RLS suite against a disposable Postgres container, matching CI.
#
# Deliberately NOT the local Supabase stack: this suite drops the auth schema,
# which would break GoTrue and force a full `supabase stop && supabase start`.
set -euo pipefail

CONTAINER=att-rls-postgres
PORT=55444
IMAGE=postgres:16

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
echo "Starting disposable ${IMAGE} on port ${PORT}..."
docker run --rm -d \
  --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -p "${PORT}:5432" \
  "$IMAGE" >/dev/null

printf 'Waiting for Postgres to accept connections'
for _ in $(seq 1 45); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    echo ' ready.'
    break
  fi
  printf '.'
  sleep 1
done

DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${PORT}/postgres" pnpm test:rls
