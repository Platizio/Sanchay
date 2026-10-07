# syntax=docker/dockerfile:1.7
# Same Node as .node-version (engineStrict: jsdom 30 in the lockfile needs ^24.15.0); arm64 variant used by the Fargate task.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

FROM ${NODE_IMAGE} AS base
RUN corepack enable && corepack prepare pnpm@11.27.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter=@sanchay/api...

FROM deps AS build
COPY tsconfig.json ./
COPY apps/api apps/api
# The api and the workspace packages it imports, whose package.json exports point at dist/.
RUN pnpm --filter=@sanchay/api... build

FROM base AS prod-deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --prod --filter=@sanchay/api...

FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
# Keep the monorepo layout: nodeLinker is hoisted (dependencies live in /repo/node_modules), the
# workspace links in apps/api/node_modules point at /repo/packages, and dist/db/migrate.js reads
# the migrations from ../../drizzle.
WORKDIR /repo/apps/api
COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=build /repo/packages /repo/packages
COPY --from=prod-deps /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
# data/ at /repo/data, where dist/ resolves it as src/ does from the repo root: D8's catalogue CSVs and,
# from Plan 03, E6/E7's reference CSVs and E9's risk questionnaire, which risk-profile.service.ts
# imports when its module loads (without it api and worker exit at boot with ERR_MODULE_NOT_FOUND).
COPY data /repo/data
# docs/legal/ is copied here by F1 (Plan 04), whose migrate task seeds it; E3 (Plan 03) creates it.
COPY infra/certs/rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
