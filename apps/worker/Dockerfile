# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS development
COPY . .
CMD ["pnpm", "--filter", "@havona/worker", "dev"]

FROM dependencies AS build
COPY . .
RUN pnpm --filter @havona/config build && pnpm --filter @havona/shared build && pnpm --filter @havona/worker build

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S havona && adduser -S havona -G havona
COPY --from=build --chown=havona:havona /app /app
USER havona
CMD ["node", "apps/worker/dist/main.js"]
