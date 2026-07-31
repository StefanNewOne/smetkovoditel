# Staging deploy — GoDigital Finance OS

Staging tracks `origin/develop`. It must be deployed and verified **before** any production
release (CLAUDE.md Category 5, Gate 2).

> **Fill in at go-live:** `<staging-url>`, `<vps-ip>`. Placeholders remain until the VPS exists.

## Prerequisites (once per VPS)

1. Ubuntu VPS (≥ 2 vCPU / 4 GB), Docker + Docker Compose installed.
2. DNS `A` record `<staging-url>` → `<vps-ip>`.
3. A deploy user with SSH key access; the deploy machine's IP is allowed.
4. `.env.staging` on the VPS (never committed) — every variable from `.env.example` with real
   staging values: `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `GMAIL_*`, `NBRM_RATE_URL`,
   `S3_*`, `BACKUP_TARGET`, plus `POSTGRES_USER/PASSWORD/DB`, `VPS_IP`, `DEPLOY_SSH_USER`,
   `DEPLOY_SSH_PRIVATE_KEY`.

## HTTPS (Let's Encrypt / Certbot)

TLS terminates at the Nginx container (`deploy/nginx.conf`, `server_name <staging-url>`).

```bash
# One-time cert issue (webroot challenge served from ./deploy/certbot/www):
docker run --rm \
  -v "$PWD/deploy/certbot/conf:/etc/letsencrypt" \
  -v "$PWD/deploy/certbot/www:/var/www/certbot" \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d <staging-url> --email godigitaldrive@gmail.com --agree-tos --no-eff-email
# Renewal: a daily `certbot renew` cron on the VPS + `docker compose exec nginx nginx -s reload`.
```

## Deploy

From the trusted deploy machine (whose IP the VPS allows):

```bash
DEPLOY_EXECUTE=1 bash scripts/deploy.sh staging
```

The script: backup DB → capture HEAD → `git reset --hard origin/develop` →
`docker compose -f docker-compose.prod.yml up -d --build` → `prisma migrate deploy` →
health check `/api/health` → auto-rollback (git + DB restore) on failure.

## Verify

1. `https://<staging-url>/api/health` → `{"ok":true,"db":"up"}`.
2. Log in with a seeded user; run a W1 dry cycle; check the Import center.
3. Confirm no migration errors in `docker compose -f docker-compose.prod.yml logs web`.
