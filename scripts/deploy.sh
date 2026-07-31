#!/usr/bin/env bash
# Local-first deploy (CLAUDE.md Category 5). Run from a trusted machine that can reach the VPS.
# Usage: bash scripts/deploy.sh {staging|production}
#
# Flow: backup DB -> capture HEAD -> git reset --hard origin/<ref> -> build+up prod stack
#   -> prisma migrate deploy -> health check -> rollback (git + DB restore) on failure.
#
# Values come from .env.<tier> on the deploy machine (never committed):
#   VPS_IP, DEPLOY_SSH_USER, DEPLOY_SSH_PRIVATE_KEY, BACKUP_TARGET,
#   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
# Replace the <placeholder> values at go-live (SM-7); until the VPS exists this is a dry-run
# unless DEPLOY_EXECUTE=1 is set.
set -euo pipefail

TIER="${1:-}"
case "$TIER" in
  staging)    REF="origin/develop" ;;
  production) REF="origin/main" ;;
  *) echo "Usage: bash scripts/deploy.sh {staging|production}"; exit 1 ;;
esac

ENV_FILE=".env.${TIER}"
COMPOSE="docker-compose.prod.yml"
HEALTH_URL="http://localhost:3000/api/health"

echo "==> Deploy target: $TIER ($REF)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "!! Missing $ENV_FILE — provide it on the deploy machine (see _docs/deployment/${TIER}.md)."
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"
BACKUP_DIR="backups"; mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${TIER}-${STAMP}.sql"

if [[ "${DEPLOY_EXECUTE:-0}" != "1" ]]; then
  echo "-- DRY RUN (set DEPLOY_EXECUTE=1 to apply). Planned steps:"
  echo "   1) pg_dump -> $BACKUP_FILE"
  echo "   2) capture HEAD, git fetch && git reset --hard $REF"
  echo "   3) docker compose -f $COMPOSE up -d --build"
  echo "   4) prisma migrate deploy"
  echo "   5) health check $HEALTH_URL; rollback (git + DB restore) on failure"
  exit 0
fi

PREV_HEAD="$(git rev-parse HEAD)"

rollback() {
  echo "!! Deploy failed — rolling back to ${PREV_HEAD}."
  git reset --hard "$PREV_HEAD" || true
  docker compose -f "$COMPOSE" up -d --build || true
  if [[ -f "$BACKUP_FILE" ]]; then
    docker compose -f "$COMPOSE" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$BACKUP_FILE" || true
  fi
  exit 1
}
trap rollback ERR

echo "==> 1/5 Backing up DB -> $BACKUP_FILE"
docker compose -f "$COMPOSE" exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_FILE"

echo "==> 2/5 Fetching + resetting to $REF"
git fetch --all --prune
git reset --hard "$REF"

echo "==> 3/5 Building + starting prod stack"
docker compose -f "$COMPOSE" up -d --build

echo "==> 4/5 Applying migrations"
docker compose -f "$COMPOSE" exec -T web npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

echo "==> 5/5 Health check"
for i in $(seq 1 10); do
  if docker compose -f "$COMPOSE" exec -T web wget -qO- "$HEALTH_URL" | grep -q '"ok":true'; then
    echo "==> Healthy. Deploy complete ($TIER @ $(git rev-parse --short HEAD))."
    trap - ERR
    exit 0
  fi
  echo "   ...waiting for health ($i/10)"; sleep 5
done
echo "!! Health check never passed."; rollback
