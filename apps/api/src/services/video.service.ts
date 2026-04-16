import type { UnwrapWebhookEvent } from "@mux/mux-node/resources/webhooks.js";
import { prisma } from "../lib/prisma.js";
import { getMux } from "../lib/mux.js";
import { env } from "../config/env.js";
import { bumpTrendingScore } from "./trending.service.js";
import {
  encodeCursor,
  decodeCursor,
  videoPublicSelect,
  type FeedCursor,
} from "../lib/feed.js";
import { attachViewerLikes } from "../lib/viewer-likes.js";

export type { FeedCursor };
export { encodeCursor, decodeCursor };

function muxThumbnailUrl(playbackId: string): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg`;
}

export async function createDirectUpload(
  authorId: string,
  title: string | undefined,
  browserOrigin?: string | null,
) {
  const e = env();
  const corsOrigin =
    browserOrigin && e.WEB_ORIGINS.includes(browserOrigin)
      ? browserOrigin
      : e.WEB_ORIGINS[0];
  const video = await prisma.video.create({
    data: {
      authorId,
      status: "processing",
      title: title ?? null,
    },
  });

  const mux = getMux();
  const upload = await mux.video.uploads.create({
    cors_origin: corsOrigin,
    new_asset_settings: {
      playback_policy: ["public"],
      passthrough: video.id,
    },
  });

  await prisma.video.update({
    where: { id: video.id },
    data: { muxUploadId: upload.id },
  });

  return {
    videoId: video.id,
    uploadUrl: upload.url,
    muxUploadId: upload.id,
  };
}

export async function getVideoById(id: string, viewerId?: string) {
  const v = await prisma.video.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true } },
    },
  });
  if (!v) return null;
  if (v.status !== "ready") {
    if (!viewerId || viewerId !== v.authorId) {
      return null;
    }
  }
  let viewerHasLiked = false;
  if (viewerId && v.status === "ready") {
    const like = await prisma.like.findFirst({
      where: { userId: viewerId, videoId: v.id },
    });
    viewerHasLiked = !!like;
  }
  return { ...v, viewerHasLiked };
}

export async function listFeed(
  cursor: FeedCursor | null,
  limit: number,
  viewerId?: string,
) {
  const take = Math.min(Math.max(limit, 1), 50);
  const items = await prisma.video.findMany({
    where: {
      status: "ready",
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              {
                AND: [
                  { createdAt: new Date(cursor.createdAt) },
                  { id: { lt: cursor.id } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: videoPublicSelect,
  });

  let nextCursor: string | null = null;
  const page = items.slice(0, take);
  const withLikes = await attachViewerLikes(viewerId, page);
  if (items.length > take) {
    const last = items[take - 1];
    if (last) {
      nextCursor = encodeCursor({
        createdAt: last.createdAt.toISOString(),
        id: last.id,
      });
    }
  }

  return { items: withLikes, nextCursor };
}

/**
 * After the browser finishes PUT to Mux, call this so we mark the video `ready` from the Mux API
 * if the asset exists — does not depend on webhooks (ngrok, signing secret, etc.).
 */
export async function confirmMuxUploadAfterBrowserPut(
  videoId: string,
  authorId: string,
): Promise<Awaited<ReturnType<typeof getVideoById>>> {
  const v = await prisma.video.findUnique({ where: { id: videoId } });
  if (!v || v.authorId !== authorId) {
    return null;
  }
  if (v.status === "ready" && v.muxPlaybackId) {
    return getVideoById(videoId, authorId);
  }
  if (!v.muxUploadId) {
    return getVideoById(videoId, authorId);
  }

  const mux = getMux();
  const upload = await mux.video.uploads.retrieve(v.muxUploadId);
  if (upload.status === "errored") {
    await prisma.video.updateMany({
      where: { id: videoId },
      data: { status: "error" },
    });
    return getVideoById(videoId, authorId);
  }
  if (upload.status !== "asset_created" || !upload.asset_id) {
    return getVideoById(videoId, authorId);
  }

  const asset = await mux.video.assets.retrieve(upload.asset_id);
  const playbackId =
    asset.playback_ids?.find((p) => p.policy === "public")?.id ?? null;
  if (!playbackId) {
    return getVideoById(videoId, authorId);
  }

  const thumb = muxThumbnailUrl(playbackId);
  await prisma.video.update({
    where: { id: videoId },
    data: {
      status: "ready",
      muxAssetId: asset.id,
      muxPlaybackId: playbackId,
      thumbnail: thumb,
    },
  });
  const likesRow = await prisma.video.findUnique({
    where: { id: videoId },
    select: { likesCount: true },
  });
  if (likesRow) {
    await bumpTrendingScore(videoId, likesRow.likesCount);
  }
  return getVideoById(videoId, authorId);
}

export async function processMuxWebhookEvent(event: UnwrapWebhookEvent): Promise<void> {
  switch (event.type) {
    case "video.asset.ready": {
      const asset = event.data;
      const passthrough =
        typeof asset.passthrough === "string" ? asset.passthrough : null;
      const playbackId =
        asset.playback_ids?.find((p) => p.policy === "public")?.id ?? null;
      const assetId = asset.id;
      if (!playbackId || !assetId) {
        return;
      }

      let videoId = passthrough;
      if (!videoId) {
        const byAsset = await prisma.video.findFirst({
          where: { muxAssetId: assetId },
        });
        videoId = byAsset?.id ?? null;
      }

      const thumb = muxThumbnailUrl(playbackId);

      if (videoId) {
        await prisma.video.updateMany({
          where: { id: videoId },
          data: {
            status: "ready",
            muxAssetId: assetId,
            muxPlaybackId: playbackId,
            thumbnail: thumb,
          },
        });
        const updated = await prisma.video.findUnique({
          where: { id: videoId },
          select: { likesCount: true },
        });
        if (updated) {
          await bumpTrendingScore(videoId, updated.likesCount);
        }
      } else {
        await prisma.video.updateMany({
          where: { muxAssetId: assetId },
          data: {
            status: "ready",
            muxPlaybackId: playbackId,
            thumbnail: thumb,
          },
        });
      }
      break;
    }
    case "video.asset.errored": {
      const asset = event.data;
      const passthrough =
        typeof asset.passthrough === "string" ? asset.passthrough : null;
      if (passthrough) {
        await prisma.video.updateMany({
          where: { id: passthrough },
          data: { status: "error" },
        });
      } else if (asset.id) {
        await prisma.video.updateMany({
          where: { muxAssetId: asset.id },
          data: { status: "error" },
        });
      }
      break;
    }
    default:
      break;
  }
}
