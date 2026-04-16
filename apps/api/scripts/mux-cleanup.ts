/**
 * List / delete all Mux assets and cancel pending direct uploads in the configured
 * environment. Optionally clear Video rows in Postgres so you can re-upload via the app.
 *
 * From repo root:
 *   node --env-file=.env ./node_modules/.bin/tsx apps/api/scripts/mux-cleanup.ts
 *   node --env-file=.env ./node_modules/.bin/tsx apps/api/scripts/mux-cleanup.ts --execute
 *   node --env-file=.env ./node_modules/.bin/tsx apps/api/scripts/mux-cleanup.ts --execute --db-clear-videos
 * If Mux is already empty but DB needs wiping (e.g. DB was offline):
 *   node --env-file=.env ./node_modules/.bin/tsx apps/api/scripts/mux-cleanup.ts --db-only
 */
import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import Mux from "@mux/mux-node";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const TRENDING_KEY = "vibeflow:trending:scores";

function pageItems<TItem>(page: {
  getPaginatedItems?: () => unknown;
  data?: unknown;
}): TItem[] {
  const raw =
    typeof page.getPaginatedItems === "function"
      ? page.getPaginatedItems()
      : page.data;
  return Array.isArray(raw) ? (raw as TItem[]) : [];
}

async function listAllUploads(mux: Mux): Promise<
  Array<{ id: string; status: string; asset_id?: string }>
> {
  const out: Array<{ id: string; status: string; asset_id?: string }> = [];
  let page = await mux.video.uploads.list({ limit: 100 });
  for (;;) {
    out.push(
      ...pageItems<{ id: string; status: string; asset_id?: string }>(page),
    );
    if (!page.hasNextPage()) break;
    page = await page.getNextPage();
  }
  return out;
}

async function listAllAssets(mux: Mux): Promise<
  Array<{ id: string; passthrough?: string | null }>
> {
  const out: Array<{ id: string; passthrough?: string | null }> = [];
  let page = await mux.video.assets.list({ limit: 100 });
  for (;;) {
    out.push(...pageItems<{ id: string; passthrough?: string | null }>(page));
    if (!page.hasNextPage()) break;
    page = await page.getNextPage();
  }
  return out;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(__dirname, "..");
const repoRoot = join(__dirname, "../..");
config({ path: join(repoRoot, ".env") });
config({ path: join(apiRoot, ".env") });

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const dbClearVideos = args.has("--db-clear-videos");
const dbOnly = args.has("--db-only");

const tokenId = process.env.MUX_ACCESS_TOKEN_ID;
const tokenSecret = process.env.MUX_ACCESS_TOKEN_SECRET;

async function clearDbVideosAndTrending(): Promise<boolean> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    return false;
  }
  const prisma = new PrismaClient();
  try {
    const r = await prisma.video.deleteMany({});
    console.log(`Postgres: deleted ${r.count} Video row(s) (likes/comments cascade).`);
  } catch (e) {
    console.error(
      "Postgres: could not delete videos (check DATABASE_URL / network). Retry with --db-only when the DB is reachable.",
      e,
    );
    return false;
  } finally {
    await prisma.$disconnect();
  }
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: true });
    try {
      await redis.connect();
      const n = await redis.del(TRENDING_KEY);
      console.log(`Redis: removed trending key (${n} key(s)).`);
    } catch (e) {
      console.warn("Redis: could not clear trending key:", e);
    } finally {
      redis.disconnect();
    }
  }
  return true;
}

async function main(): Promise<void> {
  if (dbOnly) {
    await clearDbVideosAndTrending();
    return;
  }

  if (!tokenId || !tokenSecret) {
    console.error("Missing MUX_ACCESS_TOKEN_ID or MUX_ACCESS_TOKEN_SECRET.");
    process.exit(1);
  }

  const mux = new Mux({ tokenId, tokenSecret });

  const uploadRows = await listAllUploads(mux);
  const uploads = uploadRows.map((u) => ({
    id: u.id,
    status: u.status,
    asset_id: u.asset_id,
  }));

  const assetRows = await listAllAssets(mux);
  const assets = assetRows.map((a) => ({
    id: a.id,
    passthrough: a.passthrough ?? null,
  }));

  console.log(`Direct uploads: ${uploads.length}`);
  for (const u of uploads) {
    console.log(`  ${u.id}  status=${u.status}${u.asset_id ? `  asset_id=${u.asset_id}` : ""}`);
  }
  console.log(`Assets: ${assets.length}`);
  for (const a of assets) {
    console.log(`  ${a.id}${a.passthrough ? `  passthrough=${a.passthrough}` : ""}`);
  }

  if (!execute) {
    console.log("\nDry run. Pass --execute to cancel waiting uploads and delete all assets.");
    if (dbClearVideos) {
      console.log("Pass --execute together with --db-clear-videos to apply DB wipe.");
    }
    return;
  }

  let cancelled = 0;
  for (const u of uploads) {
    if (u.status === "waiting") {
      try {
        await mux.video.uploads.cancel(u.id);
        cancelled += 1;
        console.log(`Cancelled upload ${u.id}`);
      } catch (e) {
        console.warn(`Could not cancel ${u.id}:`, e);
      }
    }
  }
  if (cancelled) console.log(`Cancelled ${cancelled} waiting upload(s).`);

  let deleted = 0;
  for (const a of assets) {
    try {
      await mux.video.assets.delete(a.id);
      deleted += 1;
      console.log(`Deleted asset ${a.id}`);
    } catch (e) {
      console.warn(`Could not delete asset ${a.id}:`, e);
    }
  }
  console.log(`Deleted ${deleted} asset(s).`);

  if (dbClearVideos) {
    await clearDbVideosAndTrending();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
