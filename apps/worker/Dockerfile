# Worker (Gmail poll + cron scheduler) — build context is the REPO ROOT.
#   docker build -f apps/worker/Dockerfile -t smetko-worker .
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
RUN npm ci

FROM node:22-alpine AS run
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# Prisma client is used by workflows the worker triggers; generate it into node_modules.
RUN npm run db:generate
USER node
# tsx runs the TS entry directly (see apps/worker/package.json "start").
CMD ["npm", "run", "start", "--workspace=@smetko/worker"]
