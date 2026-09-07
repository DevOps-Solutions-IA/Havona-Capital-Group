# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
FROM base AS dependencies
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
FROM dependencies AS development
CMD ["pnpm", "--filter", "@havona/api", "dev"]
FROM dependencies AS build
RUN pnpm --filter @havona/api... build
FROM node:22-alpine AS production
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
WORKDIR /app
RUN apk add --no-cache font-dejavu poppler-utils tesseract-ocr tesseract-ocr-data-spa tesseract-ocr-data-eng \
    && corepack enable && addgroup -S havona && adduser -S havona -G havona
COPY --from=build --chown=havona:havona /app /app
USER havona
CMD ["pnpm", "--filter", "@havona/api", "start"]
