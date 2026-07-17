#!/usr/bin/env bash
# Local-first deploy (CLAUDE.md Category 5). Run from a trusted machine that can reach the VPS.
# Usage: bash scripts/deploy.sh {staging|production}
#
# Skeleton for Phase 0 (SM-7). Fill in once the VPS exists (VPS_IP etc. come from .env.<tier>).
# Flow it will implement: backup DB -> capture HEAD -> git reset --hard origin/<ref>
#   -> docker compose -f docker-compose.prod.yml up -d --build -> reload nginx
#   -> prisma migrate deploy -> health check -> rollback (git + DB restore) on failure.
set -euo pipefail

TIER="${1:-}"
case "$TIER" in
  staging)    REF="origin/develop" ;;
  production) REF="origin/main" ;;
  *) echo "Usage: bash scripts/deploy.sh {staging|production}"; exit 1 ;;
esac

echo "==> Deploy target: $TIER ($REF)"
echo "!! Not yet implemented — VPS not provisioned. See _docs/deployment/${TIER}.md and SM-7."
echo "   Required env (from .env.$TIER, never committed): VPS_IP, DEPLOY_SSH_USER, DEPLOY_SSH_PRIVATE_KEY, BACKUP_TARGET"
exit 1
