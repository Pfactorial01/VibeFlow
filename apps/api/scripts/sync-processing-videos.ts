/**
 * Poll Mux for direct uploads stuck in `processing` in Postgres and mark videos `ready`
 * when the asset exists (workaround if webhooks did not fire or verification failed).
 *
 * Usage (Docker DB on host port 5433):
 *   DATABASE_URL=postgresql://vibeflow:vibeflow@localhost:5433/vibeflow?schema=public \
 *     npx tsx apps/api/scripts/sync-processing-videos.ts
 */
import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import Mux from "@mux/mux-node";
import { bumpTrendingScore } from "../src/services/trending.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const savedDatabaseUrl = process.env.DATABASE_URL;
// `override: true` so empty/wrong Mux vars from the shell do not win over `.env`.
config({ path: resolve(repoRoot, ".env"), override: true });
// Allow `DATABASE_URL=... docker ...` to target Docker Postgres (root `.env` often points at a hosted DB).
if (savedDatabaseUrl) {
  process.env.DATABASE_URL = savedDatabaseUrl;
}

function thumb(playbackId: string): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg`;
}

async function main(): Promise<void> {
  const tokenId = process.env.MUX_ACCESS_TOKEN_ID;
  const tokenSecret = process.env.MUX_ACCESS_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    console.error("Missing MUX_ACCESS_TOKEN_ID / MUX_ACCESS_TOKEN_SECRET");
    process.exit(1);
  }
  const mux = new Mux({ tokenId, tokenSecret });
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.video.findMany({
      where: { status: "processing", muxUploadId: { not: null } },
    });
    if (rows.length === 0) {
      console.log("No processing videos with muxUploadId.");
      return;
    }
    for (const v of rows) {
      const upload = await mux.video.uploads.retrieve(v.muxUploadId!);
      if (upload.status !== "asset_created" || !upload.asset_id) {
        console.log(`${v.id}: upload status=${upload.status} (waiting for asset)`);
        continue;
      }
      const asset = await mux.video.assets.retrieve(upload.asset_id);
      const playbackId =
        asset.playback_ids?.find((p) => p.policy === "public")?.id ?? null;
      if (!playbackId) {
        console.log(`${v.id}: no public playback id yet`);
        continue;
      }
      await prisma.video.update({
        where: { id: v.id },
        data: {
          status: "ready",
          muxAssetId: asset.id,
          muxPlaybackId: playbackId,
          thumbnail: thumb(playbackId),
        },
      });
      const likes = await prisma.video.findUnique({
        where: { id: v.id },
        select: { likesCount: true },
      });
      if (likes) await bumpTrendingScore(v.id, likes.likesCount);
      console.log(`${v.id}: -> ready (playback ${playbackId})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
