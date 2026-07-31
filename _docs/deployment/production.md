# Production deploy — GoDigital Finance OS

Production tracks `origin/main`. Deploy **only after** staging (`develop`) is verified stable
(CLAUDE.md Category 5, Gate 2). Every release is a human-reviewed Release PR + a manual run.

> **Fill in at go-live:** `<production-url>`, `<vps-ip>`. Placeholders remain until the VPS exists.

## Prerequisites

Same shape as staging, with a separate `.env.production` (never committed) and its own DB volume.
This system handles real money, VAT, and a legal fiscal trail — treat every step as auditable.

## HTTPS

Identical to staging but `server_name <production-url>` in `deploy/nginx.conf` and a cert for
`<production-url>`. Keep the daily `certbot renew` + `nginx -s reload`.

## Release checklist

1. Staging deployed from `develop` and verified (health + a manual W1→approve→PDF cycle).
2. Open a Release PR `develop → main`; bump `version` in `package.json`; summarise merged
   `feat`/`fix` in `CHANGELOG.md`. Human review + merge.
3. Tag the merge commit: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. Deploy:
   ```bash
   DEPLOY_EXECUTE=1 bash scripts/deploy.sh production
   ```

## Backup & rollback runbook

- **Every deploy** takes a `pg_dump` into `backups/production-<stamp>.sql` before touching code,
  and auto-rolls back (git reset to the previous HEAD + `psql` restore) if the health check fails.
- **Offsite backup:** a daily `pg_dump` + attachment sync to `BACKUP_TARGET`; retention ≥ 10 years
  (Master Plan §11). Verify restores quarterly.
- **Manual rollback:** `git reset --hard <prev-tag>` on the VPS, `docker compose -f
docker-compose.prod.yml up -d --build`, then restore the matching `backups/*.sql` if a migration
  must be undone (prefer a forward `CREDIT_NOTE`/storno over mutating posted history — B9).

## Post-deploy verification

1. `https://<production-url>/api/health` → `{"ok":true,"db":"up"}`.
2. Spot-check the current period indicator, an invoice PDF, and the Import center integrity line.
3. Watch `docker compose -f docker-compose.prod.yml logs -f web worker` for errors on the first cron ticks.
