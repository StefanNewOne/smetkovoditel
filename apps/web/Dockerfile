# Web app (Next.js standalone) — build context is the REPO ROOT (monorepo workspaces).
#   docker build -f apps/web/Dockerfile -t smetko-web .
FROM node:22-alpine AS deps
WORKDIR /repo
# Install workspace deps from lockfile (cache-friendly: manifests first).
COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
# Generate the Prisma client, then build the Next standalone bundle.
RUN npm run db:generate && npm run build --workspace=@smetko/web

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Run as a non-root user.
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
# Standalone server entry for the web workspace.
CMD ["node", "apps/web/server.js"]
