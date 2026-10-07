# syntax=docker/dockerfile:1.7
# Same Node as .node-version (engineStrict: jsdom 30 in the lockfile needs ^24.15.0); arm64 variant used by the Fargate task.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

FROM ${NODE_IMAGE} AS base
RUN corepack enable && corepack prepare pnpm@11.27.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages ./packages
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter=@sanchay/web...

FROM deps AS build
COPY tsconfig.json ./
COPY apps/web apps/web
# /site is prerendered here (C10/C11): its DSC-02 line needs the ARN and its validity date, and
# its links need the hosts. Build arguments are visible to RUN as environment variables.
ARG SANCHAY_PLATFORM_ARN
ARG SANCHAY_PLATFORM_ARN_VALID_TILL
ARG SANCHAY_APP_ORIGIN
ARG SANCHAY_WWW_ORIGIN
# The web app and the workspace packages it imports (api-client and tokens export dist/).
RUN pnpm --filter=@sanchay/web... build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
# The (app) and (auth) layouts read the DSC-02 ARN and its validity date on every request (site-config.ts), so the
# runtime needs them as well as the build; deploy.yml passes both as build arguments.
ARG SANCHAY_PLATFORM_ARN
ARG SANCHAY_PLATFORM_ARN_VALID_TILL
ENV SANCHAY_PLATFORM_ARN=${SANCHAY_PLATFORM_ARN}
ENV SANCHAY_PLATFORM_ARN_VALID_TILL=${SANCHAY_PLATFORM_ARN_VALID_TILL}
ENV NODE_ENV=production
# Next.js standalone reads PORT and HOSTNAME; 3000 is the api's port in the shared task network.
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
