# Build from repo root: docker build -f apps/web/Dockerfile .
FROM node:22-bookworm-slim AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @vibeflow/web
COPY apps/web apps/web
WORKDIR /repo/apps/web
# Browser calls this URL (host port mapped to api:4000). Override at build: --build-arg VITE_API_URL=...
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
