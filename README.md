# VibeFlow

A short-form video feed: upload clips, browse **Latest** and **Trending**, like and comment, with playback powered by [Mux](https://www.mux.com/). The stack is a TypeScript monorepo—**Express + Prisma + PostgreSQL + Redis** on the API, **React + Vite** on the web, and optional **Docker Compose** for a full local deployment.

## Features

- **Feed** with infinite scroll; **only the in-view video autoplays** (muted, loop), with viewport-based active clip selection.
- **Mux Player** with a minimal chrome by default; **tap the lower third of the video** to reveal the bottom control bar (auto-hides after a few seconds).
- **Auth**: sign up, log in, JWT access tokens with refresh sessions stored in Redis.
- **Uploads** via Mux direct upload; webhook or polling syncs asset status into Postgres.
- **Likes, comments, reports**; trending backed by Redis-cached counters.

## Tech stack

| Layer | Choice |
|--------|--------|
| API | Node.js, Express, Zod, Pino |
| Data | PostgreSQL (Prisma), Redis (sessions, trending, JWT denylist) |
| Video | Mux Video (upload, playback IDs, webhooks) |
| Web | React 19, React Router 7, Vite 8, `@mux/mux-player-react` |

## Repository layout

```
├── apps/
│   ├── api/          # REST API (Prisma schema, migrations, Mux integration)
│   └── web/          # SPA (feed, upload, auth UI)
├── docker-compose.yml
├── .env.example      # Copy to `.env` and fill in secrets
├── package.json      # npm workspaces + shared scripts
└── scripts/          # Utilities (e.g. ngrok webhook URL helper)
```

## Prerequisites

- **Node.js** 20+ (the Docker web image uses Node 22; match locally if you can).
- **npm** (workspaces).
- **Docker** (optional but recommended for Postgres + Redis + full stack).
- A **Mux** account with an environment, access token, and (for production) webhook signing secret.

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/<your-org>/VibeFlow.git
cd VibeFlow
npm install
```

### 2. Environment

Copy the example env and edit values (especially `JWT_SECRET`, Mux tokens, and signing keys).

```bash
cp .env.example .env
```

- **`JWT_SECRET`**: at least 16 characters (required by the API).
- **`MUX_ACCESS_TOKEN_ID` / `MUX_ACCESS_TOKEN_SECRET`**: from Mux → Access Tokens.
- **`MUX_SIGNING_KEY_SECRET`**: required by the API schema; use Mux signing keys or a placeholder for local dev only—see [Mux docs](https://docs.mux.com/).
- **`MUX_WEBHOOK_SECRET`**: signing secret from Mux → **Settings → Webhooks** (recommended for `POST /webhooks/mux`).
- **`WEB_ORIGIN`**: comma-separated browser origins allowed by CORS (e.g. `http://localhost:5173,http://127.0.0.1:5173`). `localhost` and `127.0.0.1` are different for CORS.
- **`VITE_API_URL`**: base URL the browser uses to call the API (e.g. `http://localhost:4000`). For Dockerized web, set the **build arg** `VITE_API_URL` to the URL users use in the browser to reach the API.

The API also loads `apps/api/.env` if you use a split setup; for Docker, Compose uses the root `.env` via `env_file`.

### 3. Database

With Postgres and Redis reachable (see ports below), generate the client and apply migrations:

```bash
npm run db:generate
npm run db:migrate
```

`DATABASE_URL` and `DATABASE_DIRECT_URL` must point at the same PostgreSQL instance (use a direct URL for migrations when using a pooled provider).

### 4. Run in development

**Option A — API + web on the host (Postgres + Redis via Docker)**

```bash
docker compose up -d postgres redis
npm run dev
```

- Web: [http://localhost:5173](http://localhost:5173) (Vite dev server).
- API: [http://localhost:4000](http://localhost:4000).

**Option B — Full stack in Docker**

```bash
docker compose up -d --build
```

- Web (nginx): [http://localhost:5173](http://localhost:5173) (maps host `5173` → container `80`).
- API: [http://localhost:4000](http://localhost:4000).

After changing the **web** frontend, rebuild the web image so the static bundle updates:

```bash
npm run docker:web
```

**Ports (default `.env.example`):**

| Service    | Host port |
|-----------|-----------|
| PostgreSQL | 5433 → 5432 |
| Redis      | 6380 → 6379 |
| API        | 4000 |
| Web (Docker) | 5173 → 80 |

## Mux webhooks

Mux should call your API’s webhook route (e.g. `POST /webhooks/mux`) with a **signed** payload. For local development, the repo includes a **ngrok** Compose profile so the tunnel targets the **API container** (not the host):

```bash
# Set NGROK_AUTHTOKEN in .env
docker compose --profile ngrok up -d
npm run webhook:url
```

Register the printed HTTPS URL + path in the Mux dashboard. Alternatively, run `npm run sync:mux` or rely on upload confirmation polling if webhooks are not configured.

## Useful npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | API + web in watch mode (requires DB/Redis) |
| `npm run build` | Production build for both apps |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:generate` | Prisma client generate |
| `npm run docker:up` | `docker compose up -d` |
| `npm run docker:web` | Rebuild and restart **only** the `web` service |
| `npm run docker:down` | Stop Compose stack |
| `npm run sync:mux` | Reconcile processing videos with Mux (uses `.env`) |

## Production notes

- Set `NODE_ENV=production`, strong `JWT_SECRET`, and HTTPS origins in `WEB_ORIGIN`.
- Rebuild the **web** Docker image with `VITE_API_URL` set to the **public** API URL browsers will call.
- Run Postgres and Redis with persistence and backups appropriate for your environment.
