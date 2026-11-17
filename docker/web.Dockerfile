# Job Radar web app (design D10): Next.js standalone server on Node 22.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /app

FROM base AS build
# Toolchain only for the native SQLite module if no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm install --frozen-lockfile --filter "@job-radar/web..."
RUN BUILD_STANDALONE=1 pnpm --filter @job-radar/web build

FROM node:22-bookworm-slim AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 \
    JOB_RADAR_DATA_DIR=/app/data JOB_RADAR_MIGRATIONS_DIR=/app/migrations WORKER_URL=http://worker:4000
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/packages/db/drizzle ./migrations
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
