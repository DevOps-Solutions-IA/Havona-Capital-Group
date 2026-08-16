# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
FROM base AS dependencies
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
FROM dependencies AS development
CMD ["pnpm", "--filter", "@havona/web", "dev"]
FROM dependencies AS build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG APP_DOMAIN
ARG PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV APP_DOMAIN=$APP_DOMAIN
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
RUN pnpm --filter @havona/web... build
FROM node:22-alpine AS production
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
WORKDIR /app
RUN corepack enable && addgroup -S havona && adduser -S havona -G havona
COPY --from=build --chown=havona:havona /app /app
USER havona
CMD ["pnpm", "--filter", "@havona/web", "start"]
