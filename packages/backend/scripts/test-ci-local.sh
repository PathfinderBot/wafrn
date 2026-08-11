set -euo pipefail

PG_CONTAINER=wafrn-test-pg
REDIS_CONTAINER=wafrn-test-redis
PG_PORT=5433
REDIS_PORT=6380

cleanup() {
  docker rm -f "$PG_CONTAINER" "$REDIS_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup # in case a previous run was interrupted before cleanup

docker run -d --name "$PG_CONTAINER" \
  -e POSTGRES_USER=root -e POSTGRES_PASSWORD=root -e POSTGRES_DB=wafrn \
  -p "$PG_PORT:5432" postgres:17 >/dev/null

docker run -d --name "$REDIS_CONTAINER" -p "$REDIS_PORT:6379" redis:8.4 >/dev/null

echo "Waiting for postgres..."
until docker exec "$PG_CONTAINER" pg_isready -U root >/dev/null 2>&1; do sleep 1; done

export TEST_DATABASE_URL="postgresql://root:root@localhost:$PG_PORT/wafrn"
export REDIS_HOST=localhost
export REDIS_PORT="$REDIS_PORT"

npx tsx migrate.ts init-container
npx vitest run "$@"
