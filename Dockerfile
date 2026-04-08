# ─── Base ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

# ─── Dependencies ────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/www/package.json apps/www/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/validators/package.json packages/validators/
RUN pnpm install --frozen-lockfile

# ─── Build API ───────────────────────────────────────────────────────────────
FROM base AS api-builder
WORKDIR /app
COPY --from=deps /app ./
COPY . .
RUN pnpm turbo build --filter=@runq/api

# ─── Build Frontend (web + www) ─────────────────────────────────────────────
FROM base AS frontend-builder
WORKDIR /app
COPY --from=deps /app ./
COPY . .
RUN pnpm turbo build --filter=@runq/web --filter=@runq/www

# ─── API Runner ──────────────────────────────────────────────────────────────
FROM base AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-builder /app ./
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3003
ENTRYPOINT ["/app/docker-entrypoint.sh"]

# ─── Frontend Server (Caddy) ────────────────────────────────────────────────
FROM caddy:2-alpine AS frontend
COPY --from=frontend-builder /app/apps/web/dist /srv/web
COPY --from=frontend-builder /app/apps/www/dist /srv/www
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
