import { prisma } from "../lib/prisma.js";
import { getRedis, TRENDING_KEY } from "../lib/redis.js";
import { videoPublicSelect } from "../lib/feed.js";
import { attachViewerLikes } from "../lib/viewer-likes.js";

export async function bumpTrendingScore(videoId: string, likes: number): Promise<void> {
  const redis = getRedis();
  await redis.connect().catch(() => undefined);
  const score = likes + Date.now() / 1e15;
  await redis.zadd(TRENDING_KEY, score, videoId);
}

export async function listTrending(
  limit: number,
  cursorStr: string | undefined,
  viewerId?: string,
) {
  const redis = getRedis();
  await redis.connect().catch(() => undefined);

  const take = Math.min(Math.max(limit, 1), 50);
  const offset = cursorStr ? parseInt(cursorStr, 10) || 0 : 0;

  const keyCount = await redis.exists(TRENDING_KEY);
  if (keyCount === 0) {
    await seedTrendingFromDb();
  }

  const ids = await redis.zrevrange(TRENDING_KEY, offset, offset + take);

  if (ids.length === 0) {
    return { items: [], nextCursor: null as string | null };
  }

  const slice = ids.slice(0, take + 1);
  const videos = await prisma.video.findMany({
    where: {
      id: { in: slice },
      status: "ready",
    },
    select: videoPublicSelect,
  });

  const order = new Map<string, number>(slice.map((id: string, i: number) => [id, i]));
  const sorted = [...videos].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
  const page = sorted.slice(0, take);
  const withLikes = await attachViewerLikes(viewerId, page);

  let nextCursor: string | null = null;
  if (ids.length > take) {
    nextCursor = String(offset + take);
  }

  return { items: withLikes, nextCursor };
}

async function seedTrendingFromDb(): Promise<void> {
  const redis = getRedis();
  const rows = await prisma.video.findMany({
    where: { status: "ready" },
    select: { id: true, likesCount: true, createdAt: true },
    orderBy: { likesCount: "desc" },
    take: 500,
  });
  if (rows.length === 0) return;
  const args: (string | number)[] = [];
  for (const r of rows) {
    const score = r.likesCount + r.createdAt.getTime() / 1e15;
    args.push(score, r.id);
  }
  if (args.length) {
    await redis.zadd(TRENDING_KEY, ...args);
  }
}
