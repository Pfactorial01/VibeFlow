# docker build -f apps/api/Dockerfile .
# Pin versions: refresh openssl/ca-certificates when Debian security updates (apt-cache madison).

FROM node:22-bookworm-slim AS builder
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl=3.0.19-1~deb12u2 \
    ca-certificates=20230311+deb12u1 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @vibeflow/api
COPY apps/api apps/api
WORKDIR /repo/apps/api
RUN npx prisma generate && npm run build
WORKDIR /repo
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl=3.0.19-1~deb12u2 \
    ca-certificates=20230311+deb12u1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo/apps/api
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=builder --chown=node:node /repo/apps/api/dist ./dist
COPY --from=builder --chown=node:node /repo/apps/api/prisma ./prisma

COPY --chown=node:node apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
