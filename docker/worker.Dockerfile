# Job Radar worker (design D10): official Playwright image (Ubuntu noble, Node 26, browsers
# matching playwright 1.65.1), Claude Code CLI, and Xvfb + x11vnc + noVNC for manual logins.
FROM mcr.microsoft.com/playwright:v1.65.1-noble
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1 \
    DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1 DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@12.5.1 @anthropic-ai/claude-code@2.1.325
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@job-radar/worker..." \
 && chmod -R a+rX /app
ENV NODE_ENV=production WORKER_HOST=0.0.0.0 WORKER_PORT=4000 \
    JOB_RADAR_DATA_DIR=/app/data JOB_RADAR_SECRETS_DIR=/run/job-radar-secrets \
    JOB_RADAR_LOGIN_VIEWER=novnc WEB_BASE_URL=http://127.0.0.1:3000 HOME=/tmp
EXPOSE 4000 6080
WORKDIR /app/apps/worker
CMD ["node_modules/.bin/tsx", "src/main.ts"]
