# MyGuru: Next.js standalone server + SQLite, replicated to Cloud Storage by Litestream.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compiles from source when no prebuilt binary matches this Node.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/myguru.db \
    MIGRATIONS_DIR=/app/drizzle
ARG LITESTREAM_VERSION=0.3.13
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz" | tar -xz -C /usr/local/bin \
 && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /entrypoint.sh
RUN mkdir -p /data && chmod +x /entrypoint.sh
EXPOSE 8080
CMD ["/entrypoint.sh"]
